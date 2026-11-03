import { randomUUID, createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { db, get, set, defaults, dataDir, event } from "./store";
import { saveProvider, defaultAgentModel } from "./provider";
import { roles } from "../src/lib/roles";
import { resetLibrary } from "./library";
import { requireIdle, invalidateStudioIntents } from "./studio-selection";
const previews = new Map<
  string,
  { scope: "connection" | "everything"; expires: number; fingerprint: string }
>();
function counts() {
  return Object.fromEntries(
    [
      "games",
      "runs",
      "tasks",
      "approvals",
      "assets",
      "memories",
      "usage",
      "studio_pin_changes",
    ].map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any).n,
    ]),
  );
}
function fingerprint() {
  // Heartbeats, discovery and pricing refreshes are safe background metadata.
  const data = Object.fromEntries(
    [
      "games",
      "runs",
      "tasks",
      "approvals",
      "tool_calls",
      "assets",
      "memories",
      "usage",
      "attention_requests",
      "agents",
      "chat",
      "pitches",
      "pitch_versions",
      "market_snapshots",
      "telemetry_snapshots",
      "review_events",
      "library_entries",
      "studio_pin_changes",
    ].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
  const config = db
    .prepare(
      "SELECT * FROM settings WHERE key NOT IN ('workerHeartbeat','studioDiscovery','studioKnownInstances','studioDiscoveryError','studioStatus','studioTools','studioError','pricing','pricingUpdated','modelCatalog') ORDER BY key",
    )
    .all();
  const keyPath = resolve(dataDir, "provider-credentials.json");
  const credentials = existsSync(keyPath)
    ? createHash("sha256").update(readFileSync(keyPath)).digest("hex")
    : "";
  return createHash("sha256")
    .update(JSON.stringify({ data, config, credentials }))
    .digest("hex");
}
export function previewWorkspaceReset(body: unknown, active: Set<string>) {
  requireIdle(active);
  const { scope } = z
    .object({ scope: z.enum(["connection", "everything"]) })
    .strict()
    .parse(body);
  if (
    scope === "connection" &&
    db
      .prepare(
        "SELECT id FROM tool_calls WHERE status IN ('running','uncertain') LIMIT 1",
      )
      .get()
  )
    throw new Error(
      "Resolve uncertain Studio operations in Reviews before resetting connections; their targets must remain auditable.",
    );
  previews.clear();
  const token = randomUUID();
  previews.set(token, {
    scope,
    expires: Date.now() + 300000,
    fingerprint: fingerprint(),
  });
  return {
    token,
    scope,
    counts: counts(),
    phrase: scope === "everything" ? "RESET FORGE" : "RESET STUDIO",
    uncertainOperations: (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM tool_calls WHERE status='uncertain'",
        )
        .get() as any
    ).n,
  };
}
export async function confirmWorkspaceReset(
  body: unknown,
  active: Set<string>,
  hooks: {
    closeStudio: () => Promise<void>;
    backupCheckpoints: (path: string) => Promise<void>;
    clearCheckpoints: () => void;
  },
) {
  const a = z
    .object({ token: z.string(), confirmation: z.string() })
    .strict()
    .parse(body);
  requireIdle(active);
  const p = previews.get(a.token);
  if (!p || p.expires < Date.now())
    throw new Error("Reset preview expired. Review it again.");
  if (
    a.confirmation !==
    (p.scope === "everything" ? "RESET FORGE" : "RESET STUDIO")
  )
    throw new Error("Type the reset confirmation phrase exactly");
  if (p.fingerprint !== fingerprint())
    throw new Error(
      "Workspace changed since reset preview. Review the reset again.",
    );
  const id = `reset-${randomUUID()}`,
    backup = resolve(dataDir, "backups", id);
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  await db.backup(resolve(backup, "forge.sqlite"));
  chmodSync(resolve(backup, "forge.sqlite"), 0o600);
  await hooks.backupCheckpoints(resolve(backup, "checkpoints.sqlite"));
  chmodSync(resolve(backup, "checkpoints.sqlite"), 0o600);
  for (const name of ["provider-credentials.json", "assets"])
    if (existsSync(resolve(dataDir, name)))
      cpSync(resolve(dataDir, name), resolve(backup, name), {
        recursive: true,
      });
  writeFileSync(
    resolve(backup, "restore.txt"),
    "Stop worker and dashboard before restoring. Move the current database/checkpoint files and their -wal/-shm/-journal sidecars aside first; never mix old journals with a restored backup. Restore these private database, checkpoint, credential and asset files to the data directory, then restart. This backup may contain API keys and private project data. Never commit or share it.",
    { mode: 0o600 },
  );
  requireIdle(active);
  if (p.fingerprint !== fingerprint())
    throw new Error(
      "Workspace changed during backup. Reset cancelled; review it again.",
    );
  if (
    p.scope === "connection" &&
    db
      .prepare(
        "SELECT id FROM tool_calls WHERE status IN ('running','uncertain') LIMIT 1",
      )
      .get()
  )
    throw new Error(
      "Resolve uncertain Studio operations before resetting connections",
    );
  set("lastResetBackup", `backups/${id}`);
  await hooks.closeStudio();
  if (p.scope === "connection") {
    db.transaction(() => {
      const runs: any[] = db
        .prepare(
          "SELECT * FROM runs WHERE status NOT IN ('accepted','cancelled')",
        )
        .all();
      for (const r of runs) {
        const tasks: any[] = db
          .prepare(
            "SELECT * FROM tasks WHERE run_id=? AND status NOT IN ('completed','cancelled')",
          )
          .all(r.id);
        for (const t of tasks) invalidateStudioIntents(t, r.studio_id, "");
      }
      db.prepare(
        "UPDATE runs SET studio_id='',studio_pin_revision=studio_pin_revision+1 WHERE status NOT IN ('accepted','cancelled')",
      ).run();
      db.prepare(
        "UPDATE games SET studio_id='',updated=CURRENT_TIMESTAMP",
      ).run();
      db.prepare("DELETE FROM studio_inspections").run();
      for (const key of [
        "studioDiscovery",
        "studioKnownInstances",
        "studioDiscoveryError",
        "studioError",
      ])
        set(key, key === "studioKnownInstances" ? {} : null);
      set("mcpCommand", "");
      set("mcpArgs", []);
      set("studioTools", []);
      set("studioStatus", "not configured");
      set("paused", true);
    })();
  } else {
    // Backups are complete before any destructive change. A failed step leaves
    // the runtime paused with the backup location available for recovery.
    saveProvider({ provider: "nvidia", removeKey: true });
    saveProvider({ provider: "openrouter", removeKey: true });
    hooks.clearCheckpoints();
    db.transaction(() => {
      // Break self references, then delete in foreign-key dependency order.
      db.prepare("UPDATE assets SET revision_of=NULL").run();
      for (const table of [
        "pitch_versions",
        "assets",
        "telemetry_snapshots",
        "pitches",
        "market_snapshots",
        "attention_requests",
        "agent_messages",
        "approvals",
        "tool_calls",
        "memories",
        "chat",
        "review_events",
        "tasks",
        "runs",
        "games",
        "usage",
        "locks",
        "studio_inspections",
        "studio_revisions",
        "studio_pin_changes",
        "events",
        "agents",
        "settings",
      ])
        db.exec(`DELETE FROM ${table}`);
      resetLibrary();
      for (const [key, value] of Object.entries(defaults)) set(key, value);
      set("mcpCommand", "");
      set("mcpArgs", []);
      set("paused", true);
      set("workerPort", Number(process.env.WORKER_PORT || 4318));
      set("openRouterMigrationV2", true);
      for (const [name, role] of Object.entries(roles))
        db.prepare("INSERT INTO agents(name,model,prompt) VALUES (?,?,?)").run(
          name,
          defaultAgentModel(name),
          role.brief,
        );
      set("lastResetBackup", `backups/${id}`);
    })();
    rmSync(resolve(dataDir, "assets"), { recursive: true, force: true });
  }
  set("resetRevision", randomUUID());
  set("lastResetBackup", `backups/${id}`);
  previews.delete(a.token);
  event(
    `User confirmed ${p.scope === "everything" ? "full workspace" : "Studio connection"} reset. Private backup: backups/${id}`,
    "User",
  );
  return { ok: true, scope: p.scope, backup: `backups/${id}`, paused: true };
}
