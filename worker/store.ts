import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { roles } from "../src/lib/roles";
import { migrateFeatures } from "./migrations";
import { nvidiaAgentModels } from "../src/lib/model-presets";
import { redact, publicData, OperationError } from "./errors";
import { defaultAgentModel, providerStatus } from "./provider";
export const dataDir = resolve(process.env.FORGE_DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const secretPath = resolve(dataDir, "worker.secret");
if (!existsSync(secretPath))
  writeFileSync(secretPath, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
export const secret = readFileSync(secretPath, "utf8");
export const db = new Database(resolve(dataDir, "forge.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agents (name TEXT PRIMARY KEY,model TEXT NOT NULL,temperature REAL DEFAULT 0.3,max_tokens INTEGER DEFAULT 4096,enabled INTEGER DEFAULT 1,prompt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY,name TEXT NOT NULL,studio_id TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY,request TEXT NOT NULL,game_id TEXT,studio_id TEXT,status TEXT DEFAULT 'active',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),agent TEXT NOT NULL,title TEXT NOT NULL,instructions TEXT NOT NULL,status TEXT DEFAULT 'queued',deps TEXT DEFAULT '[]',messages TEXT DEFAULT '[]',result TEXT DEFAULT '',attempts INTEGER DEFAULT 0,steps INTEGER DEFAULT 0,next_at INTEGER DEFAULT 0,error TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY,agent TEXT NOT NULL,task_id TEXT,content TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat (id TEXT PRIMARY KEY,role TEXT NOT NULL,content TEXT NOT NULL,run_id TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT,level TEXT,agent TEXT,message TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY,task_id TEXT NOT NULL,call_id TEXT NOT NULL,tool TEXT NOT NULL,args TEXT NOT NULL,status TEXT DEFAULT 'pending',result TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(task_id,call_id));
CREATE TABLE IF NOT EXISTS tool_calls (id TEXT PRIMARY KEY,task_id TEXT,tool TEXT,args TEXT,status TEXT,result TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY,task_id TEXT,agent TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,cost REAL,reserved REAL DEFAULT 0,status TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY,owner TEXT NOT NULL);
`);
migrateFeatures(db);
const defaults: Record<string, unknown> = {
  cap: 9,
  concurrency: 3,
  taskTimeoutMs: 600000,
  maxTasksPerRun: 50,
  paused: false,
  approvalRequired: true,
  mcpCommand: process.env.ROBLOX_MCP_COMMAND || "",
  mcpArgs: JSON.parse(process.env.ROBLOX_MCP_ARGS || "[]"),
  workerHeartbeat: 0,
  studioStatus: "disconnected",
  studioTools: [],
  pricing: {},
  maxSteps: 30,
};
for (const [key, value] of Object.entries(defaults))
  db.prepare("INSERT OR IGNORE INTO settings VALUES (?,?)").run(
    key,
    JSON.stringify(value),
  );
for (const [name, r] of Object.entries(roles))
  db.prepare(
    "INSERT OR IGNORE INTO agents (name,model,prompt) VALUES (?,?,?)",
  ).run(name, defaultAgentModel(name), r.brief);
// Migrate only the old built-in NVIDIA assignments. User prompts and custom
// assignments survive; no running conversation is rewritten.
if (!get("openRouterMigrationV2") && providerStatus().id === "openrouter") {
  db.transaction(() => {
    for (const [name, preset] of Object.entries(nvidiaAgentModels))
      db.prepare("UPDATE agents SET model=? WHERE name=? AND model=?").run(
        defaultAgentModel(name),
        name,
        preset.model,
      );
    set("openRouterMigrationV2", true);
  })();
}
export function get<T = any>(key: string): T {
  return JSON.parse(
    (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as any)
      ?.value ?? "null",
  );
}
export function set(key: string, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
    key,
    JSON.stringify(value),
  );
}
export function event(message: string, agent = "System", level = "info") {
  db.prepare("INSERT INTO events(level,agent,message) VALUES (?,?,?)").run(
    level,
    agent,
    redact(message),
  );
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level,
      agent,
      message: redact(message),
    }),
  );
}
export function task(id: string): any {
  return db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
}
export function addTask(
  run_id: string,
  agent: string,
  title: string,
  instructions: string,
  deps: string[] = [],
) {
  if (!Object.hasOwn(roles, agent))
    throw new OperationError("Unknown task agent");
  const run: any = db
    .prepare("SELECT id,game_id FROM runs WHERE id=?")
    .get(run_id);
  if (!run) throw new OperationError("Task run does not exist");
  for (const dep of deps) {
    const dependency = task(dep);
    const dependencyRun: any =
      dependency &&
      db.prepare("SELECT game_id FROM runs WHERE id=?").get(dependency.run_id);
    if (
      !dependency ||
      (dependency.run_id !== run_id &&
        (!run.game_id || dependencyRun?.game_id !== run.game_id))
    )
      throw new OperationError(
        "Dependencies must belong to the same run or project",
      );
  }
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE run_id=?")
    .get(run_id) as any;
  const limit = Math.max(2, get<number>("maxTasksPerRun") || 50);
  const pendingTester = db
    .prepare(
      "SELECT id FROM tasks WHERE run_id=? AND agent='Tester' AND status NOT IN ('completed','cancelled','failed') LIMIT 1",
    )
    .get(run_id);
  if (
    count.n >= limit ||
    (agent !== "Tester" && !pendingTester && count.n >= limit - 1)
  )
    throw new OperationError(
      "Run task limit reached; review the delegation plan",
    );
  const id = randomUUID();
  db.prepare(
    "INSERT INTO tasks(id,run_id,agent,title,instructions,deps) VALUES (?,?,?,?,?,?)",
  ).run(id, run_id, agent, title, instructions, JSON.stringify(deps));
  event(`Queued: ${title}`, agent);
  return id;
}
export function spent() {
  const totals = db
    .prepare(
      "SELECT COALESCE(SUM(cost),0) AS cost,COALESCE(SUM(reserved),0) AS reserved,SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) AS unpriced,COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,COALESCE(SUM(CASE WHEN provider='nvidia' THEN input_tokens ELSE 0 END),0) AS nimInputTokens,COALESCE(SUM(CASE WHEN provider='nvidia' THEN output_tokens ELSE 0 END),0) AS nimOutputTokens FROM usage",
    )
    .get() as any;
  return {
    ...totals,
    byAgent: db
      .prepare(
        "SELECT agent,COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,COALESCE(SUM(cost),0) AS cost,COALESCE(SUM(reserved),0) AS reserved FROM usage GROUP BY agent",
      )
      .all(),
  };
}
export function reserve(
  taskId: string,
  agent: string,
  model: string,
  amount: number,
) {
  return db.transaction(() => {
    const s = spent();
    if (!Number.isFinite(amount) || amount < 0)
      throw new OperationError("Invalid cost reservation");
    const agentSettings: any = db
      .prepare("SELECT spending_limit FROM agents WHERE name=?")
      .get(agent);
    const agentSpend: any = db
      .prepare(
        "SELECT COALESCE(SUM(cost),0)+COALESCE(SUM(reserved),0) AS total FROM usage WHERE agent=?",
      )
      .get(agent);
    if (
      agentSettings?.spending_limit > 0 &&
      agentSpend.total + amount > agentSettings.spending_limit
    )
      throw new OperationError(
        "Agent spending limit reached; adjust it in Team settings",
      );
    if (s.cost + s.reserved + amount > get<number>("cap"))
      throw new OperationError(
        "Spending cap reached; increase cap in Settings to continue.",
      );
    const id = randomUUID();
    db.prepare(
      "INSERT INTO usage(id,task_id,agent,model,cost,reserved,status) VALUES (?,?,?,?,0,?,'reserved')",
    ).run(id, taskId, agent, model, amount);
    return id;
  })();
}
export function snapshot() {
  const settings = Object.fromEntries(
    (
      db.prepare("SELECT * FROM settings WHERE key != 'pricing'").all() as any[]
    ).map((x) => [x.key, JSON.parse(x.value)]),
  );
  return publicData({
    agents: db.prepare("SELECT * FROM agents").all(),
    tasks: db
      .prepare(
        "SELECT id,run_id,agent,title,instructions,status,deps,result,attempts,steps,next_at,error,created,updated,priority,acceptance,parent_task_id,stop_requested,requester FROM tasks ORDER BY created DESC",
      )
      .all(),
    runs: db.prepare("SELECT * FROM runs ORDER BY created DESC").all(),
    games: db.prepare("SELECT * FROM games ORDER BY created DESC").all(),
    chat: db.prepare("SELECT * FROM chat ORDER BY rowid").all(),
    events: db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 150").all(),
    approvals: db
      .prepare("SELECT * FROM approvals ORDER BY created DESC")
      .all(),
    usage: db
      .prepare("SELECT * FROM usage ORDER BY created DESC LIMIT 300")
      .all(),
    attention: db
      .prepare("SELECT * FROM attention_requests ORDER BY rowid DESC LIMIT 200")
      .all(),
    assetReviews: (
      db
        .prepare("SELECT COUNT(*) AS count FROM assets WHERE status='pending'")
        .get() as any
    ).count,
    pitches: db
      .prepare(
        "SELECT id,title,hook,game_id,status,version FROM pitches ORDER BY updated DESC",
      )
      .all(),
    reviewEvents: db
      .prepare("SELECT * FROM review_events ORDER BY rowid DESC LIMIT 100")
      .all(),
    agentUpdates: db
      .prepare(
        "SELECT * FROM agent_messages WHERE rowid IN (SELECT MAX(rowid) FROM agent_messages GROUP BY task_id) ORDER BY rowid DESC LIMIT 50",
      )
      .all(),
    memories: db
      .prepare("SELECT * FROM memories ORDER BY created DESC LIMIT 100")
      .all(),
    spend: spent(),
    settings,
    keyConfigured: providerStatus().configured,
    provider: providerStatus(),
  });
}
