import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { db, get, set, event, snapshot, secret, addTask, task } from "./store";
import { studio } from "./mcp";
import { active, recover, tick } from "./runtime";
import { refreshModels } from "./model";
import { roles } from "../src/lib/roles";
import { librarySearch, libraryRead, libraryAction } from "./library";
import { providerAction } from "./provider-actions";
import { providerStatus } from "./provider";
import { nvidiaFreeModelIds } from "../src/lib/model-presets";
import {
  featureAction,
  featureRead,
  assetFile,
  decideApproval,
  decideRun,
} from "./features";
let connecting = false;
async function reconnect() {
  if (connecting) throw new Error("Connection already in progress");
  if (active.size)
    throw new Error("Pause and wait for active tasks before reconnecting");
  connecting = true;
  try {
    await studio.connect();
  } finally {
    connecting = false;
  }
}
async function action(path: string, b: any) {
  if (path.startsWith("library/")) return libraryAction(path.slice(8), b);
  const providerResult = await providerAction(path, b, active);
  if (providerResult !== undefined) return providerResult;
  const featureResult = featureAction(path, b, active);
  if (featureResult !== undefined) return featureResult;
  if (path === "settings") {
    const a = z
      .object({
        cap: z.number().min(0).max(1000),
        paused: z.boolean(),
        approvalRequired: z.boolean(),
        mcpCommand: z.string().max(2000),
        mcpArgs: z.array(z.string()).max(30),
        maxSteps: z.number().int().min(5).max(100),
      })
      .parse(b);
    if (active.size)
      throw new Error(
        "Pause the runtime and wait for active tasks before changing settings.",
      );
    for (const [k, v] of Object.entries(a)) set(k, v);
    event("Settings saved");
    return { ok: true };
  }
  if (path === "pause") {
    set("paused", z.boolean().parse(b.paused));
    return { ok: true };
  }
  if (path === "agents") {
    const a = z
      .object({
        name: z.enum(Object.keys(roles) as [string, ...string[]]),
        model: z.string().min(1).max(200),
        temperature: z.number().min(0).max(2),
        max_tokens: z.number().int().min(256).max(16000),
        enabled: z.boolean(),
        prompt: z.string().min(10).max(20000),
      })
      .parse(b);
    if (
      providerStatus().id === "nvidia" &&
      !nvidiaFreeModelIds.includes(a.model)
    )
      throw new Error("Choose a model from the NVIDIA free-endpoint allowlist");
    if ([...active].some((id) => task(id).agent === a.name))
      throw new Error("Agent is active; pause before editing.");
    db.prepare(
      "UPDATE agents SET model=?,temperature=?,max_tokens=?,enabled=?,prompt=? WHERE name=?",
    ).run(
      a.model,
      a.temperature,
      a.max_tokens,
      Number(a.enabled),
      a.prompt,
      a.name,
    );
    return { ok: true };
  }
  if (path === "connect") {
    await reconnect();
    return { status: get("studioStatus") };
  }
  if (path === "studios") {
    return await studio.call(
      "Lead",
      "list_roblox_studios",
      {},
      "",
      randomUUID(),
    );
  }
  if (path === "models") {
    await refreshModels();
    return { ok: true };
  }
  if (path === "games") {
    const a = z
      .object({
        name: z.string().min(1).max(200),
        studioId: z.string().max(200).default(""),
      })
      .parse(b);
    db.prepare(
      "INSERT INTO games(id,name,studio_id,stage) VALUES (?,?,?,?)",
    ).run(
      randomUUID(),
      a.name,
      a.studioId,
      a.studioId ? "prototype" : "concept",
    );
    return { ok: true };
  }
  if (path === "approve") return decideApproval(b);
  if (path === "resolve") {
    const a = z
      .object({
        id: z.string(),
        executed: z.boolean(),
        evidence: z.string().min(10),
      })
      .parse(b);
    const c: any = db
      .prepare("SELECT * FROM tool_calls WHERE id=? AND status='uncertain'")
      .get(a.id);
    if (!c) throw new Error("Uncertain call not found");
    db.prepare("UPDATE tool_calls SET status=?,result=? WHERE id=?").run(
      a.executed ? "done" : "retry",
      JSON.stringify({ userResolved: true, evidence: a.evidence }),
      c.id,
    );
    event(`User reconciled ${c.tool}: ${a.evidence}`, "User");
    return { ok: true };
  }
  if (path === "retry") {
    const a = z.object({ id: z.string() }).parse(b);
    const t = task(a.id);
    const run: any = t
      ? db.prepare("SELECT status FROM runs WHERE id=?").get(t.run_id)
      : null;
    if (run?.status === "cancelled")
      throw new Error("Create new work for a cancelled run");
    if (
      db
        .prepare(
          "SELECT id FROM attention_requests WHERE task_id=? AND status='pending' LIMIT 1",
        )
        .get(a.id)
    )
      throw new Error("Answer the pending question on Home before retrying");
    if (!t || !["failed", "blocked"].includes(t.status))
      throw new Error("Task cannot be retried");
    if (
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM tool_calls WHERE task_id=? AND status='uncertain'",
          )
          .get(t.id) as any
      ).n
    )
      throw new Error("Resolve uncertain operations in Reviews first");
    db.prepare(
      "UPDATE tasks SET status='queued',attempts=0,next_at=0,steps=0,error=NULL WHERE id=?",
    ).run(t.id);
    db.prepare(
      "UPDATE tasks SET status='queued',error=NULL WHERE run_id=? AND status='blocked'",
    ).run(t.run_id);
    return { ok: true };
  }
  if (path === "review") return decideRun(b);
  throw new Error("Unknown action");
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.writeHead(401).end('{"error":"Unauthorized"}');
    return;
  }
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname.slice(1);
    if (req.method === "GET" && path === "assets/file") {
      const file = assetFile(url.searchParams.get("id") || "");
      res.setHeader("Content-Type", file.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `${file.inline ? "inline" : "attachment"}; filename="${file.filename}"`,
      );
      res.end(file.bytes);
      return;
    }
    if (req.method === "GET") {
      const result = featureRead(path, url.searchParams);
      if (result !== undefined) {
        res.end(JSON.stringify(result));
        return;
      }
    }
    if (req.method === "GET" && path === "library") {
      res.end(
        JSON.stringify(
          url.searchParams.has("id")
            ? libraryRead(url.searchParams.get("id")!)
            : librarySearch(
                url.searchParams.get("q") || "",
                url.searchParams.get("category") || "",
                url.searchParams.get("starred") === "true",
              ),
        ),
      );
      return;
    }
    if (req.method === "GET" && path === "snapshot") {
      res.end(
        JSON.stringify({
          ...snapshot(),
          uncertain: db
            .prepare("SELECT * FROM tool_calls WHERE status='uncertain'")
            .all(),
        }),
      );
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404).end("{}");
      return;
    }
    let raw = "";
    for await (const c of req) {
      raw += c;
      if (
        raw.length >
        (path === "assets/save"
          ? 3000000
          : ["market/import", "telemetry/import"].includes(path)
            ? 1000000
            : 128000)
      )
        throw new Error("Request too large");
    }
    const result = await action(path, JSON.parse(raw || "{}"));
    res.end(JSON.stringify(result));
  } catch (e) {
    res
      .writeHead(400)
      .end(
        JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      );
  }
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  // Browser WebSocket is an invalidation signal only; it exposes no data or authority.
  const origin = req.headers.origin;
  if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
const port = Number(process.env.WORKER_PORT || 4318);
set("workerPort", port);
server.listen(port, "127.0.0.1", () => {
  console.log(`Forge worker listening on 127.0.0.1:${port}`);
  recover();
  void studio.connect();
  void refreshModels().catch((e) => event(String(e), "System", "error"));
});
let ticking = false;
const timer = setInterval(() => {
  for (const c of wss.clients)
    if (c.readyState === 1) c.send('{"type":"refresh"}');
  if (!ticking && !connecting) {
    ticking = true;
    void tick()
      .catch((e) => event(String(e), "System", "error"))
      .finally(() => (ticking = false));
  }
}, 1200);
async function shutdown() {
  set("paused", true);
  clearInterval(timer);
  while (active.size) await new Promise((r) => setTimeout(r, 200));
  await studio.close();
  wss.close();
  server.close();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
