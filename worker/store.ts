import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { roles } from "../src/lib/roles";
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
const defaults: Record<string, unknown> = {
  cap: 9,
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
  ).run(
    name,
    process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4.1-flash",
    r.brief,
  );
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
    message,
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
  const id = randomUUID();
  db.prepare(
    "INSERT INTO tasks(id,run_id,agent,title,instructions,deps) VALUES (?,?,?,?,?,?)",
  ).run(id, run_id, agent, title, instructions, JSON.stringify(deps));
  event(`Queued: ${title}`, agent);
  return id;
}
export function spent() {
  return db
    .prepare(
      "SELECT COALESCE(SUM(cost),0) AS cost,COALESCE(SUM(reserved),0) AS reserved FROM usage",
    )
    .get() as any;
}
export function reserve(
  taskId: string,
  agent: string,
  model: string,
  amount: number,
) {
  return db.transaction(() => {
    const s = spent();
    if (s.cost + s.reserved + amount > get<number>("cap"))
      throw new Error(
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
    (db.prepare("SELECT * FROM settings").all() as any[]).map((x) => [
      x.key,
      JSON.parse(x.value),
    ]),
  );
  return {
    agents: db.prepare("SELECT * FROM agents").all(),
    tasks: db.prepare("SELECT * FROM tasks ORDER BY created DESC").all(),
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
    memories: db
      .prepare("SELECT * FROM memories ORDER BY created DESC LIMIT 100")
      .all(),
    spend: spent(),
    settings,
    keyConfigured: !!process.env.OPENROUTER_API_KEY,
  };
}
