import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { db, get, set, task, addTask, event, dataDir } from "./store";
import { roles } from "../src/lib/roles";
import {
  assetKinds,
  gameStages,
  marketSchema,
  telemetrySchema,
  pitchSchema,
  webUrl,
  operationRisk,
} from "../src/lib/feature-contracts";
const role = z.enum(Object.keys(roles) as [string, ...string[]]);
const identifier = z.string().min(1).max(200);
function changed() {
  set("featureRevision", (get<number>("featureRevision") || 0) + 1);
}
function game(id: string) {
  const g: any = db.prepare("SELECT * FROM games WHERE id=?").get(id);
  if (!g) throw new Error("Game not found");
  return g;
}
function runForTask(id: string) {
  const t = task(id);
  if (!t) throw new Error("Task not found");
  return {
    t,
    run: db.prepare("SELECT * FROM runs WHERE id=?").get(t.run_id) as any,
  };
}
export function publicMessage(
  taskId: string,
  actor: string,
  kind: string,
  content: string,
  status = "complete",
  id: string = randomUUID(),
) {
  db.prepare(
    "INSERT INTO agent_messages(id,task_id,actor,kind,content,status) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,status=excluded.status,updated=CURRENT_TIMESTAMP",
  ).run(id, taskId, actor, kind, content.slice(0, 60000), status);
  return id;
}
function audit(
  kind: string,
  id: string,
  verdict: string,
  note = "",
  revisionTaskId: string | null = null,
) {
  db.prepare(
    "INSERT INTO review_events(id,target_kind,target_id,verdict,note,revision_task_id) VALUES (?,?,?,?,?,?)",
  ).run(randomUUID(), kind, id, verdict, note, revisionTaskId);
  changed();
}
export function createRequest(body: unknown) {
  const a = z
    .object({
      gameId: identifier,
      objective: z.string().trim().min(1).max(20000),
      agent: role.default("Lead"),
      priority: z.number().int().min(0).max(3).default(1),
      acceptance: z.string().max(12000).default(""),
      dependencies: z.array(identifier).max(100).default([]),
      reviewPlan: z.boolean().default(false),
      requestKey: z.string().max(100).optional(),
    })
    .parse(body);
  return db.transaction(() => {
    if (a.requestKey) {
      const existing: any = db
        .prepare("SELECT * FROM runs WHERE request_key=?")
        .get(a.requestKey);
      if (existing) {
        if (existing.game_id !== a.gameId || existing.request !== a.objective)
          throw new Error(
            "This request key was already used for a different request",
          );
        return {
          id: existing.id,
          taskId: (
            db
              .prepare(
                "SELECT id FROM tasks WHERE run_id=? ORDER BY rowid LIMIT 1",
              )
              .get(existing.id) as any
          )?.id,
        };
      }
    }
    const g = game(a.gameId);
    if (g.stage === "archived")
      throw new Error("Restore this project before creating work");
    if (!g.studio_id && a.agent !== "Lead")
      throw new Error(
        "Connect a Studio instance first, or assign Lead to prepare a plan",
      );
    for (const id of a.dependencies)
      if (runForTask(id).run.game_id !== g.id)
        throw new Error("Dependencies must belong to the selected game");
    const agent: any = db
      .prepare("SELECT enabled FROM agents WHERE name=?")
      .get(a.agent);
    if (!agent?.enabled)
      throw new Error("Enable this agent in Team before assigning work");
    const id = randomUUID();
    db.prepare(
      "INSERT INTO runs(id,request,game_id,studio_id,request_key,plan_status) VALUES (?,?,?,?,?,?)",
    ).run(
      id,
      a.objective,
      g.id,
      g.studio_id,
      a.requestKey || null,
      a.agent === "Lead" && (a.reviewPlan || !g.studio_id)
        ? "pending"
        : "automatic",
    );
    const taskId = addTask(
      id,
      a.agent,
      a.agent === "Lead"
        ? `Plan: ${a.objective.slice(0, 70)}`
        : a.objective.slice(0, 200),
      a.objective,
      a.dependencies,
    );
    db.prepare(
      "UPDATE tasks SET priority=?,acceptance=?,requester='User' WHERE id=?",
    ).run(a.priority, a.acceptance, taskId);
    db.prepare(
      "INSERT INTO chat(id,role,content,run_id) VALUES (?,'user',?,?)",
    ).run(randomUUID(), a.objective, id);
    publicMessage(taskId, "User", "request", a.objective);
    event("New request received", a.agent);
    return { id, taskId };
  })();
}
export function taskDetail(id: string) {
  const { t, run } = runForTask(id);
  const { messages: _privateMessages, ...summary } = t;
  return {
    task: summary,
    run,
    messages: db
      .prepare("SELECT * FROM agent_messages WHERE task_id=? ORDER BY rowid")
      .all(id),
    tools: db
      .prepare(
        "SELECT id,task_id,tool,args,status,result,created FROM tool_calls WHERE task_id=? ORDER BY rowid",
      )
      .all(id),
    approvals: db
      .prepare("SELECT * FROM approvals WHERE task_id=? ORDER BY rowid")
      .all(id),
    assets: (
      db
        .prepare("SELECT * FROM assets WHERE task_id=? ORDER BY rowid DESC")
        .all(id) as any[]
    ).map(publicAsset),
  };
}
export function decideApproval(body: unknown) {
  const a = z
    .object({
      id: identifier,
      approved: z.boolean(),
      note: z.string().max(12000).default(""),
      authorized: z.boolean().default(false),
      requestChanges: z.boolean().default(false),
    })
    .parse(body);
  return db.transaction(() => {
    const approval: any = db
      .prepare("SELECT * FROM approvals WHERE id=?")
      .get(a.id);
    if (!approval) throw new Error("Approval not found");
    const status = a.approved ? "approved" : "rejected";
    if (approval.status === status) return { ok: true, duplicate: true };
    if (approval.status !== "pending")
      throw new Error("Approval is no longer pending");
    const { t, run } = runForTask(approval.task_id);
    if (run.status === "cancelled" || t.status === "cancelled")
      throw new Error("This work has been cancelled");
    if (a.approved && operationRisk(approval.tool) && !a.authorized)
      throw new Error(
        `Explicit authorization is required for this ${operationRisk(approval.tool)}`,
      );
    if (a.requestChanges && (a.approved || a.note.trim().length < 5))
      throw new Error("Describe the requested changes before sending feedback");
    db.prepare(
      "UPDATE approvals SET status=?,note=?,reviewer='User',decided_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(status, a.note, a.id);
    db.prepare(
      "UPDATE tasks SET status='queued',updated=CURRENT_TIMESTAMP WHERE id=? AND status='approval'",
    ).run(approval.task_id);
    audit(
      "approval",
      a.id,
      a.requestChanges ? "changes_requested" : status,
      a.note,
      !a.approved && a.note ? t.id : null,
    );
    publicMessage(
      t.id,
      "User",
      "decision",
      `${status}: ${approval.tool}${a.note ? `\n${a.note}` : ""}`,
    );
    event(
      a.approved ? "Studio change approved" : "Studio change rejected",
      "User",
    );
    return { ok: true };
  })();
}
export function decideRun(body: unknown) {
  const a = z
    .object({
      id: identifier,
      accepted: z.boolean(),
      feedback: z.string().max(12000).default(""),
    })
    .parse(body);
  return db.transaction(() => {
    const r: any = db.prepare("SELECT * FROM runs WHERE id=?").get(a.id);
    if (r?.status === "accepted" && a.accepted)
      return { ok: true, duplicate: true };
    if (r?.status !== "review") throw new Error("Run is not ready for review");
    let revision: string | null = null;
    if (a.accepted)
      db.prepare("UPDATE runs SET status='accepted' WHERE id=?").run(a.id);
    else {
      if (a.feedback.trim().length < 5)
        throw new Error("Describe the requested changes");
      db.prepare("UPDATE runs SET status='active' WHERE id=?").run(a.id);
      revision = addTask(a.id, "Lead", "Revise after review", a.feedback);
      db.prepare("UPDATE tasks SET requester='User' WHERE id=?").run(revision);
      publicMessage(revision, "User", "revision", a.feedback);
    }
    audit(
      "run",
      a.id,
      a.accepted ? "accepted" : "changes_requested",
      a.feedback,
      revision,
    );
    event(
      a.accepted ? "Request accepted" : `Revision requested: ${a.feedback}`,
      "User",
    );
    return { ok: true, revisionTaskId: revision };
  })();
}
const mimeExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "text/plain": "txt",
  "application/json": "json",
};
function validateFile(data: Buffer, mime: string) {
  if (!data.length || data.length > 2 * 1024 * 1024)
    throw new Error(
      "Files must be between 1 byte and 2 MB; use a source URL for larger media",
    );
  const head = data.subarray(0, 16);
  const valid =
    mime === "image/png"
      ? head
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? head[0] === 255 && head[1] === 216 && head[2] === 255
        : mime === "image/gif"
          ? /^GIF8[79]a/.test(head.toString("ascii"))
          : mime === "image/webp"
            ? head.toString("ascii", 0, 4) === "RIFF" &&
              head.toString("ascii", 8, 12) === "WEBP"
            : mime === "video/mp4"
              ? head.toString("ascii", 4, 8) === "ftyp"
              : mime === "video/webm"
                ? head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
                : mime === "audio/wav"
                  ? head.toString("ascii", 0, 4) === "RIFF" &&
                    head.toString("ascii", 8, 12) === "WAVE"
                  : mime === "audio/ogg"
                    ? head.toString("ascii", 0, 4) === "OggS"
                    : mime === "audio/mpeg"
                      ? head.toString("ascii", 0, 3) === "ID3" ||
                        (head[0] === 255 && (head[1] & 224) === 224)
                      : ["text/plain", "application/json"].includes(mime) &&
                        !data.includes(0) &&
                        !data.toString("utf8").includes("\ufffd");
  if (!valid)
    throw new Error(
      "File contents do not match the selected supported media type",
    );
  if (mime === "application/json") JSON.parse(data.toString("utf8"));
}
function publicAsset(asset: any) {
  const { file, content, ...item } = asset;
  return {
    ...item,
    url: file
      ? `/api/assets/file?id=${encodeURIComponent(asset.id)}`
      : asset.url,
    tags: JSON.parse(asset.tags),
    dependencies: JSON.parse(asset.dependencies),
    hasContent: !!content,
  };
}
export function saveAsset(body: unknown, producingTask?: string) {
  const a = z
    .object({
      name: z.string().trim().min(1).max(200),
      kind: z.enum(assetKinds),
      gameId: z.string().optional(),
      taskId: z.string().optional(),
      mime: z.string().max(100).default(""),
      url: webUrl.default(""),
      source: z.string().max(2000).default(""),
      license: z.string().max(1000).default(""),
      tags: z.array(z.string().max(40)).max(20).default([]),
      dependencies: z.array(identifier).max(50).default([]),
      compatibility: z.string().max(2000).default(""),
      content: z.string().max(60000).default(""),
      robloxId: z.string().regex(/^\d*$/).max(30).default(""),
      data: z.string().max(2900000).optional(),
      filename: z.string().max(200).default(""),
      revisionOf: z.string().optional(),
    })
    .parse(body);
  let gameId = a.gameId || null;
  const taskId = producingTask || a.taskId || null;
  if (gameId) game(gameId);
  if (taskId) {
    const { run } = runForTask(taskId);
    if (gameId && gameId !== run.game_id)
      throw new Error("Asset and producing task must belong to the same game");
    gameId = run.game_id;
  }
  for (const id of a.dependencies)
    if (!db.prepare("SELECT id FROM assets WHERE id=?").get(id))
      throw new Error("Asset dependency not found");
  if (a.revisionOf) {
    const previous: any = db
      .prepare("SELECT * FROM assets WHERE id=?")
      .get(a.revisionOf);
    if (!previous || previous.game_id !== gameId)
      throw new Error("Original asset must belong to this project");
  }
  if (!a.url && !a.data && !a.content.trim() && !a.robloxId)
    throw new Error(
      "Provide a file, source URL, content, or real Roblox asset ID",
    );
  const id = randomUUID();
  let file = "";
  if (a.data) {
    if (!mimeExtensions[a.mime] || !/^[a-z0-9+/=\r\n]+$/i.test(a.data))
      throw new Error("Unsupported file or invalid base64 data");
    const bytes = Buffer.from(a.data, "base64");
    validateFile(bytes, a.mime);
    file = `${id}.${mimeExtensions[a.mime]}`;
    mkdirSync(resolve(dataDir, "assets"), { recursive: true, mode: 0o700 });
    writeFileSync(resolve(dataDir, "assets", file), bytes, {
      mode: 0o600,
      flag: "wx",
    });
  }
  db.prepare(
    "INSERT INTO assets(id,game_id,task_id,name,kind,mime,url,file,filename,source,license,tags,dependencies,compatibility,content,roblox_id,status,revision_of) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    gameId,
    taskId,
    a.name,
    a.kind,
    a.mime,
    a.url,
    file,
    a.filename.replace(/[^a-zA-Z0-9_. -]/g, "_") ||
      `${a.name.replace(/[^a-zA-Z0-9_. -]/g, "_").slice(0, 80)}.${mimeExtensions[a.mime] || "txt"}`,
    a.source,
    a.license,
    JSON.stringify(a.tags),
    JSON.stringify(a.dependencies),
    a.compatibility,
    a.content,
    a.robloxId,
    producingTask ? "pending" : "catalogued",
    a.revisionOf || null,
  );
  changed();
  return { id };
}
export function assetFile(id: string) {
  const asset: any = db.prepare("SELECT * FROM assets WHERE id=?").get(id);
  if (!asset?.file || !/^[a-f0-9-]+\.[a-z0-9]+$/.test(asset.file))
    throw new Error("Stored asset not found");
  return {
    bytes: readFileSync(resolve(dataDir, "assets", asset.file)),
    mime: asset.mime,
    filename: asset.filename,
    inline: /^(image|video|audio)\//.test(asset.mime),
  };
}
export function featureRead(path: string, query: URLSearchParams): unknown {
  if (path === "tasks/detail")
    return taskDetail(identifier.parse(query.get("id")));
  if (path === "assets") {
    if (query.has("id")) {
      const asset: any = db
        .prepare("SELECT * FROM assets WHERE id=?")
        .get(query.get("id"));
      if (!asset) throw new Error("Asset not found");
      return {
        ...publicAsset(asset),
        content: asset.content,
        usedBy: db
          .prepare(
            "SELECT id,name,kind FROM assets WHERE EXISTS (SELECT 1 FROM json_each(assets.dependencies) WHERE value=?)",
          )
          .all(asset.id),
        history: db
          .prepare(
            "SELECT * FROM review_events WHERE target_kind='asset' AND target_id=? ORDER BY rowid DESC",
          )
          .all(asset.id),
        revisions: (
          db
            .prepare(
              "SELECT * FROM assets WHERE revision_of=? OR id=? ORDER BY rowid",
            )
            .all(
              asset.revision_of || asset.id,
              asset.revision_of || asset.id,
            ) as any[]
        ).map(publicAsset),
      };
    }
    return (
      db
        .prepare("SELECT * FROM assets ORDER BY rowid DESC LIMIT 500")
        .all() as any[]
    ).map(publicAsset);
  }
  if (path === "market") {
    const snapshots: any[] = db
      .prepare(
        "SELECT id,source,fetched_at,quality,category FROM market_snapshots ORDER BY fetched_at DESC LIMIT 100",
      )
      .all();
    const id = query.get("id") || snapshots[0]?.id;
    const current: any = id
      ? db.prepare("SELECT * FROM market_snapshots WHERE id=?").get(id)
      : null;
    const previous: any = current
      ? db
          .prepare(
            "SELECT * FROM market_snapshots WHERE source=? AND category=? AND fetched_at<? ORDER BY fetched_at DESC LIMIT 1",
          )
          .get(current.source, current.category, current.fetched_at)
      : null;
    return {
      snapshots,
      current: current
        ? { ...JSON.parse(current.payload), id: current.id }
        : null,
      previous: previous
        ? { ...JSON.parse(previous.payload), id: previous.id }
        : null,
      integration: {
        status: "import-only",
        message:
          "No live market feed is connected. Import an authorized export with its original source and collection time.",
      },
    };
  }
  if (path === "telemetry") {
    const gameId = identifier.parse(query.get("gameId"));
    game(gameId);
    const rows: any[] = db
      .prepare(
        "SELECT * FROM telemetry_snapshots WHERE game_id=? ORDER BY fetched_at DESC LIMIT 100",
      )
      .all(gameId);
    return {
      snapshots: rows.map((r) => ({ id: r.id, ...JSON.parse(r.payload) })),
      integration: {
        status: "import-only",
        message:
          "Import authorized Roblox analytics exports. Forge does not have access to player, revenue or retention telemetry.",
      },
    };
  }
  if (path === "pitches") {
    const rows: any[] = db
      .prepare("SELECT * FROM pitches ORDER BY updated DESC,rowid DESC")
      .all();
    return rows.map((p) => ({
      ...JSON.parse(p.payload),
      id: p.id,
      gameId: p.game_id,
      status: p.status,
      version: p.version,
      created: p.created,
      updated: p.updated,
      versions: db
        .prepare(
          "SELECT * FROM pitch_versions WHERE pitch_id=? ORDER BY version DESC",
        )
        .all(p.id),
    }));
  }
}
export function savePitch(body: unknown, fromAgent = false) {
  const a = pitchSchema.parse(body);
  if (a.gameId) game(a.gameId);
  for (const evidence of a.evidence) {
    const snapshot: any = db
      .prepare("SELECT payload FROM market_snapshots WHERE id=?")
      .get(evidence.snapshotId);
    if (
      !snapshot ||
      !JSON.parse(snapshot.payload).games.some(
        (g: any) => g.universeId === evidence.universeId,
      )
    )
      throw new Error(
        "Pitch evidence must reference an imported market observation",
      );
  }
  return db.transaction(() => {
    const old: any = a.id
      ? db.prepare("SELECT * FROM pitches WHERE id=?").get(a.id)
      : null;
    if (a.id && !old) throw new Error("Pitch not found");
    if (old && old.version !== a.expectedVersion)
      throw new Error("This pitch changed. Reload before saving a new version");
    const id = old?.id || randomUUID();
    const version = (old?.version || 0) + 1;
    const payload = JSON.stringify({
      ...a,
      confidence: fromAgent ? "unvalidated" : a.confidence,
      origin: fromAgent
        ? "agent"
        : old
          ? JSON.parse(old.payload).origin
          : "user",
    });
    if (old)
      db.prepare(
        "UPDATE pitches SET title=?,hook=?,payload=?,version=?,status='draft',updated=CURRENT_TIMESTAMP WHERE id=?",
      ).run(a.title, a.hook, payload, version, id);
    else
      db.prepare(
        "INSERT INTO pitches(id,game_id,title,hook,payload) VALUES (?,?,?,?,?)",
      ).run(id, a.gameId || null, a.title, a.hook, payload);
    db.prepare(
      "INSERT INTO pitch_versions(pitch_id,version,payload) VALUES (?,?,?)",
    ).run(id, version, payload);
    changed();
    return { id, version };
  })();
}
export function featureAction(
  path: string,
  body: any,
  active: Set<string> = new Set(),
): unknown {
  if (path === "attention/reply") {
    const a = z
      .object({ id: identifier, reply: z.string().trim().min(1).max(12000) })
      .parse(body);
    return db.transaction(() => {
      const q: any = db
        .prepare("SELECT * FROM attention_requests WHERE id=?")
        .get(a.id);
      if (!q || q.status !== "pending")
        throw new Error("This question is no longer waiting for a reply");
      const { t, run } = runForTask(q.task_id);
      if (t.status === "cancelled" || run.status === "cancelled")
        throw new Error("This work was cancelled");
      db.prepare(
        "UPDATE attention_requests SET status='resolved',reply=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(a.reply, a.id);
      db.prepare(
        "UPDATE tasks SET status='queued',error=NULL,updated=CURRENT_TIMESTAMP WHERE id=? AND status='blocked'",
      ).run(t.id);
      db.prepare(
        "UPDATE tasks SET status='queued',error=NULL WHERE run_id=? AND status='blocked' AND error='A dependency failed; retry it first.'",
      ).run(run.id);
      publicMessage(t.id, "User", "answer", a.reply);
      event("Human question answered", t.agent);
      return { ok: true };
    })();
  }
  if (path === "chat") {
    const a = z
      .object({
        content: z.string().min(1).max(20000),
        gameId: identifier,
        reviewPlan: z.boolean().optional(),
        requestKey: z.string().optional(),
      })
      .parse(body);
    return createRequest({ ...a, objective: a.content });
  }
  if (path === "tasks/create") return createRequest(body);
  if (path === "tasks/update") {
    const a = z
      .object({
        id: identifier,
        priority: z.number().int().min(0).max(3).optional(),
        agent: role.optional(),
      })
      .parse(body);
    const { t, run } = runForTask(a.id);
    if (
      a.agent &&
      a.agent !== "Lead" &&
      t.agent === "Lead" &&
      run.plan_status === "pending"
    )
      throw new Error(
        "Lead must finish this pending plan before specialists can be assigned",
      );
    if (
      !["queued", "paused", "failed", "blocked"].includes(t.status) ||
      active.has(t.id)
    )
      throw new Error("Pause this task at a safe boundary before changing it");
    if (
      a.agent &&
      (t.steps ||
        db
          .prepare("SELECT id FROM tool_calls WHERE task_id=? LIMIT 1")
          .get(t.id))
    )
      throw new Error(
        "Only unstarted tasks can be reassigned; create a follow-up for work already begun",
      );
    db.prepare(
      "UPDATE tasks SET priority=?,agent=?,updated=CURRENT_TIMESTAMP WHERE id=?",
    ).run(a.priority ?? t.priority, a.agent || t.agent, t.id);
    event(`Updated task: ${t.title}`, "User");
    return { ok: true };
  }
  if (path === "tasks/control" || path === "runs/control") {
    const a = z
      .object({ id: identifier, action: z.enum(["pause", "resume", "cancel"]) })
      .parse(body);
    return db.transaction(() => {
      let ts: any[];
      if (path === "runs/control") {
        const r: any = db.prepare("SELECT * FROM runs WHERE id=?").get(a.id);
        if (!r || !["active", "paused"].includes(r.status))
          throw new Error("This run cannot be controlled in its current state");
        db.prepare("UPDATE runs SET status=? WHERE id=?").run(
          a.action === "cancel"
            ? "cancelled"
            : a.action === "pause"
              ? "paused"
              : "active",
          r.id,
        );
        ts = db
          .prepare("SELECT * FROM tasks WHERE run_id=?")
          .all(r.id) as any[];
      } else ts = [runForTask(a.id).t];
      let affected = 0;
      for (const t of ts) {
        if (["completed", "cancelled"].includes(t.status)) continue;
        if (a.action === "cancel")
          db.prepare(
            "UPDATE attention_requests SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE task_id=? AND status='pending'",
          ).run(t.id);
        if (a.action === "resume") {
          if (t.status !== "paused") continue;
          const pending = db
            .prepare(
              "SELECT id FROM approvals WHERE task_id=? AND status='pending' LIMIT 1",
            )
            .get(t.id);
          db.prepare(
            "UPDATE tasks SET status=?,stop_requested=NULL,updated=CURRENT_TIMESTAMP WHERE id=?",
          ).run(pending ? "approval" : "queued", t.id);
        } else if (active.has(t.id))
          db.prepare(
            "UPDATE tasks SET stop_requested=?,updated=CURRENT_TIMESTAMP WHERE id=?",
          ).run(a.action, t.id);
        else {
          if (
            a.action === "pause" &&
            !["queued", "approval", "paused"].includes(t.status)
          )
            continue;
          db.prepare(
            "UPDATE tasks SET status=?,stop_requested=NULL,updated=CURRENT_TIMESTAMP WHERE id=?",
          ).run(a.action === "cancel" ? "cancelled" : "paused", t.id);
          if (a.action === "cancel")
            db.prepare(
              "UPDATE approvals SET status='cancelled',decided_at=CURRENT_TIMESTAMP WHERE task_id=? AND status='pending'",
            ).run(t.id);
        }
        affected++;
        publicMessage(
          t.id,
          "User",
          "control",
          `${a.action} requested. In-flight operations finish before the next execution boundary.`,
        );
      }
      event(`${a.action}: ${affected} tasks`, "User");
      return { ok: true, affected };
    })();
  }
  if (path === "agents/message") {
    const a = z
      .object({
        agent: role,
        gameId: identifier,
        content: z.string().trim().min(5).max(20000),
        taskId: z.string().optional(),
        requestKey: z.string().optional(),
      })
      .parse(body);
    if (a.taskId) {
      const { t, run } = runForTask(a.taskId);
      if (run.game_id !== a.gameId || t.agent !== a.agent)
        throw new Error(
          "Agent context must match the selected project and agent",
        );
    }
    const request = createRequest({
      gameId: a.gameId,
      objective: a.content,
      agent: a.agent,
      requestKey: a.requestKey,
    });
    if (a.taskId)
      db.prepare("UPDATE tasks SET parent_task_id=? WHERE id=?").run(
        a.taskId,
        request.taskId,
      );
    return request;
  }
  if (path === "plans/approve") {
    const a = z
      .object({
        id: identifier,
        adjustments: z
          .array(
            z.object({
              id: identifier,
              instructions: z.string().trim().min(1).max(20000),
              acceptance: z.string().max(12000).default(""),
            }),
          )
          .max(100)
          .default([]),
      })
      .parse(body);
    return db.transaction(() => {
      const r: any = db.prepare("SELECT * FROM runs WHERE id=?").get(a.id);
      if (!r || r.plan_status !== "pending" || r.status !== "active")
        throw new Error("This plan is not waiting for approval");
      const pendingLead = db
        .prepare(
          "SELECT id FROM tasks WHERE run_id=? AND agent='Lead' AND status!='completed' LIMIT 1",
        )
        .get(r.id);
      if (pendingLead) throw new Error("Wait for Lead to finish the plan");
      const g = game(r.game_id);
      if (!r.studio_id && !g.studio_id)
        throw new Error(
          "Connect this game to Studio before approving execution",
        );
      for (const change of a.adjustments) {
        const t = task(change.id);
        if (!t || t.run_id !== r.id || t.steps || t.status !== "queued")
          throw new Error(
            "Only unstarted tasks from this plan can be adjusted",
          );
        db.prepare(
          "UPDATE tasks SET instructions=?,acceptance=?,updated=CURRENT_TIMESTAMP WHERE id=?",
        ).run(change.instructions, change.acceptance, t.id);
      }
      db.prepare(
        "UPDATE runs SET plan_status='approved',studio_id=? WHERE id=?",
      ).run(r.studio_id || g.studio_id, r.id);
      audit("plan", r.id, "approved", "Execution plan approved by user");
      return { ok: true };
    })();
  }
  if (path === "games/update") {
    const a = z
      .object({
        id: identifier,
        name: z.string().trim().min(1).max(200),
        studioId: z.string().max(200),
        stage: z.enum(gameStages),
        universeId: z.string().regex(/^\d*$/).max(30),
        placeId: z.string().regex(/^\d*$/).max(30),
      })
      .parse(body);
    game(a.id);
    db.prepare(
      "UPDATE games SET name=?,studio_id=?,stage=?,universe_id=?,place_id=?,updated=CURRENT_TIMESTAMP WHERE id=?",
    ).run(a.name, a.studioId, a.stage, a.universeId, a.placeId, a.id);
    return { ok: true };
  }
  if (path === "assets/save") return saveAsset(body);
  if (path === "assets/archive") {
    const { id } = z.object({ id: identifier }).parse(body);
    if (!db.prepare("SELECT id FROM assets WHERE id=?").get(id))
      throw new Error("Asset not found");
    db.prepare(
      "UPDATE assets SET status='archived',updated=CURRENT_TIMESTAMP WHERE id=?",
    ).run(id);
    audit("asset", id, "archived");
    return { ok: true };
  }
  if (path === "assets/verdict") {
    const a = z
      .object({
        id: identifier,
        verdict: z.enum(["approved", "rejected", "changes_requested"]),
        note: z.string().max(12000).default(""),
      })
      .parse(body);
    return db.transaction(() => {
      const asset: any = db
        .prepare("SELECT * FROM assets WHERE id=?")
        .get(a.id);
      if (!asset) throw new Error("Asset not found");
      if (asset.status === a.verdict) return { ok: true, duplicate: true };
      if (asset.status !== "pending")
        throw new Error("This asset already has a verdict");
      let revision: string | null = null;
      if (a.verdict === "changes_requested") {
        if (a.note.trim().length < 5 || !asset.task_id)
          throw new Error(
            "Describe the requested changes and use an agent-produced asset",
          );
        const { t, run } = runForTask(asset.task_id);
        if (run.status === "cancelled")
          throw new Error("Create new work for a cancelled project run");
        db.prepare("UPDATE runs SET status='active' WHERE id=?").run(run.id);
        revision = addTask(
          run.id,
          t.agent,
          `Revise: ${asset.name}`,
          `Revise asset ${asset.id} (${asset.name}). User feedback: ${a.note}\nRegister the revised deliverable with save_artifact and revisionOf=${asset.id}.`,
          t.status === "completed" ? [t.id] : [],
        );
        db.prepare(
          "UPDATE tasks SET parent_task_id=?,requester='User' WHERE id=?",
        ).run(t.id, revision);
        publicMessage(revision, "User", "revision", a.note);
      }
      db.prepare(
        "UPDATE assets SET status=?,updated=CURRENT_TIMESTAMP WHERE id=?",
      ).run(a.verdict, a.id);
      audit("asset", a.id, a.verdict, a.note, revision);
      return { ok: true, revisionTaskId: revision };
    })();
  }
  if (path === "market/import" || path === "telemetry/import") {
    const a =
      path === "market/import"
        ? marketSchema.parse(body)
        : telemetrySchema.parse(body);
    const id = randomUUID();
    const payload = JSON.stringify(a);
    if ("games" in a) {
      const old: any = db
        .prepare(
          "SELECT id,payload FROM market_snapshots WHERE source=? AND fetched_at=? AND category=?",
        )
        .get(a.source, a.fetchedAt, a.category);
      if (old) {
        if (old.payload !== payload)
          throw new Error(
            "A different snapshot already exists for this source and time",
          );
        return { id: old.id, duplicate: true };
      }
      db.prepare("INSERT INTO market_snapshots VALUES (?,?,?,?,?,?)").run(
        id,
        a.source,
        a.fetchedAt,
        a.quality,
        a.category,
        payload,
      );
    } else {
      game(a.gameId);
      const old: any = db
        .prepare(
          "SELECT id,payload FROM telemetry_snapshots WHERE game_id=? AND source=? AND fetched_at=?",
        )
        .get(a.gameId, a.source, a.fetchedAt);
      if (old) {
        if (old.payload !== payload)
          throw new Error(
            "A different export already exists for this game, source and time",
          );
        return { id: old.id, duplicate: true };
      }
      db.prepare("INSERT INTO telemetry_snapshots VALUES (?,?,?,?,?,?)").run(
        id,
        a.gameId,
        a.source,
        a.fetchedAt,
        a.quality,
        payload,
      );
    }
    changed();
    return { id };
  }
  if (path === "pitches/save") return savePitch(body);
  if (path === "pitches/decision") {
    const a = z
      .object({
        id: identifier,
        verdict: z.enum(["accepted", "revision_requested", "archived"]),
        note: z.string().max(12000).default(""),
      })
      .parse(body);
    if (!db.prepare("SELECT id FROM pitches WHERE id=?").get(a.id))
      throw new Error("Pitch not found");
    if (a.verdict === "revision_requested" && a.note.trim().length < 5)
      throw new Error("Describe the requested pitch changes");
    db.prepare(
      "UPDATE pitches SET status=?,updated=CURRENT_TIMESTAMP WHERE id=?",
    ).run(a.verdict, a.id);
    audit("pitch", a.id, a.verdict, a.note);
    return { ok: true };
  }
  if (path === "pitches/convert") {
    const a = z
      .object({
        id: identifier,
        studioId: z.string().max(200).default(""),
        createTasks: z.boolean().default(false),
        requestKey: z.string().max(100).optional(),
      })
      .parse(body);
    return db.transaction(() => {
      const pitch: any = db
        .prepare("SELECT * FROM pitches WHERE id=?")
        .get(a.id);
      if (!pitch || pitch.status !== "accepted")
        throw new Error("Accept the pitch before converting it");
      let gameId = pitch.game_id;
      if (!gameId) {
        gameId = randomUUID();
        db.prepare(
          "INSERT INTO games(id,name,studio_id,stage,pitch_id) VALUES (?,?,?,'concept',?)",
        ).run(gameId, pitch.title, a.studioId, pitch.id);
        db.prepare("UPDATE pitches SET game_id=? WHERE id=?").run(
          gameId,
          pitch.id,
        );
      }
      let request: any = null;
      if (a.createTasks)
        request = createRequest({
          gameId,
          objective: `Plan the MVP for ${pitch.title}. ${pitch.hook}\nDesign document: ${JSON.stringify(JSON.parse(pitch.payload).sections)}`,
          reviewPlan: true,
          requestKey: a.requestKey || `pitch:${pitch.id}:v${pitch.version}`,
        });
      changed();
      return { ok: true, gameId, taskId: request?.taskId };
    })();
  }
}
