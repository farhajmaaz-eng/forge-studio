import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
const dir = mkdtempSync(resolve(tmpdir(), "forge-runtime-audit-"));
process.env.FORGE_DATA_DIR = dir;
const controls = vi.hoisted(() => ({
  mode: "hold",
  started: [] as string[],
  resolvers: new Map<string, () => void>(),
}));
vi.mock("../worker/model", () => ({
  completion: vi.fn(
    async (
      a: any,
      t: any,
      m: any[],
      tools: any,
      onText: any,
      signal: AbortSignal,
    ) => {
      controls.started.push(t.id);
      const { OperationError } = await import("../worker/errors");
      if (controls.mode === "permanent")
        throw new OperationError("Invalid key; configure OpenRouter");
      if (controls.mode === "transient")
        throw new OperationError("Temporary local read failure", true);
      if (controls.mode === "delegate") {
        if (m.some((x) => x.role === "tool"))
          return { role: "assistant", content: "Plan delegated" };
        return {
          role: "assistant",
          content: null,
          tool_calls: ["a", "b"].map((id) => ({
            id,
            type: "function",
            function: {
              name: "delegate",
              arguments: JSON.stringify({
                agent: "Architect",
                title: "Inspect architecture",
                instructions:
                  "Inspect the project structure and report findings",
                dependencies: [],
                acceptance: "Relevant paths identified",
              }),
            },
          })),
        };
      }
      if (controls.mode === "hold")
        await new Promise<void>((resolve, reject) => {
          controls.resolvers.set(t.id, resolve);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          if (signal.aborted) reject(signal.reason);
        });
      return { role: "assistant", content: "Analysis complete" };
    },
  ),
  refreshModels: vi.fn(),
}));
const store = await import("../worker/store");
const runtime = await import("../worker/runtime");
const { featureAction } = await import("../worker/features");
const { completion } = await import("../worker/model");
async function idle() {
  await vi.waitFor(() => expect(runtime.active.size).toBe(0), {
    interval: 5,
    timeout: 2500,
  });
}
async function started(n: number) {
  await vi.waitFor(() => expect(controls.resolvers.size).toBe(n), {
    interval: 5,
    timeout: 2500,
  });
}
function run(agent = "Architect") {
  const id = randomUUID();
  store.db
    .prepare("INSERT INTO runs(id,request,studio_id) VALUES (?,?,?)")
    .run(id, "Audit planning", "test-studio");
  return store.addTask(id, agent, "Inspect", "Inspect the current project");
}
beforeEach(async () => {
  runtime.abortAll();
  await idle();
  for (const table of [
    "approvals",
    "attention_requests",
    "agent_messages",
    "tool_calls",
    "memories",
    "tasks",
    "runs",
    "usage",
  ])
    store.db.prepare(`DELETE FROM ${table}`).run();
  controls.mode = "hold";
  controls.started = [];
  controls.resolvers.clear();
  vi.mocked(completion).mockClear();
  store.set("paused", false);
  store.set("concurrency", 3);
  store.set("taskTimeoutMs", 10000);
  store.set("maxTasksPerRun", 50);
});
afterAll(async () => {
  runtime.abortAll();
  await idle();
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("runs up to three independent agents and never two tasks for the same agent", async () => {
  const ids = [
    run("Architect"),
    run("Architect"),
    run("Builder"),
    run("Frame"),
    run("Balance"),
  ];
  await runtime.tick();
  await started(3);
  expect(runtime.active.size).toBe(3);
  expect(
    [...runtime.active].filter((id) => store.task(id).agent === "Architect"),
  ).toHaveLength(1);
  controls.mode = "done";
  for (const resolve of controls.resolvers.values()) resolve();
  await idle();
  expect(store.task(ids[1]).status).toBe("queued");
  expect(store.task(ids[4]).status).toBe("queued");
});
it("enforces configurable lower concurrency", async () => {
  store.set("concurrency", 1);
  run("Architect");
  run("Builder");
  await runtime.tick();
  await started(1);
  expect(runtime.active.size).toBe(1);
  controls.resolvers.values().next().value!();
  await idle();
});
it("aborts cancelled inference, clears pending approvals, preserves done evidence and releases the agent", async () => {
  const id = run();
  store.db
    .prepare(
      "INSERT INTO tool_calls(id,task_id,tool,status,result) VALUES (?,?,'script_read','done','confirmed')",
    )
    .run("read", id);
  store.db
    .prepare(
      "INSERT INTO approvals(id,task_id,call_id,tool,args) VALUES (?,?,'c','multi_edit','{}')",
    )
    .run("approval", id);
  await runtime.tick();
  await started(1);
  featureAction("tasks/control", { id, action: "cancel" }, runtime.active);
  runtime.interruptStopped();
  await idle();
  expect(store.task(id).status).toBe("cancelled");
  expect(
    store.db.prepare("SELECT status FROM approvals WHERE id='approval'").get(),
  ).toEqual({ status: "cancelled" });
  expect(
    store.db.prepare("SELECT status FROM tool_calls WHERE id='read'").get(),
  ).toEqual({ status: "done" });
});
it("times out stalled inference and reports failure without a retry loop", async () => {
  store.set("taskTimeoutMs", 25);
  const id = run();
  await runtime.tick();
  await idle();
  expect(store.task(id)).toMatchObject({ status: "failed", attempts: 1 });
  expect(store.task(id).error).toContain("timed out");
});
it("does not retry permanent errors and bounds retryable failures to three attempts", async () => {
  controls.mode = "permanent";
  const id = run();
  await runtime.tick();
  await idle();
  expect(store.task(id).status).toBe("failed");
  expect(controls.started).toHaveLength(1);
  controls.mode = "transient";
  const retry = run("Builder");
  for (let i = 0; i < 3; i++) {
    store.db.prepare("UPDATE tasks SET next_at=0 WHERE id=?").run(retry);
    await runtime.tick();
    await idle();
  }
  expect(store.task(retry)).toMatchObject({ status: "failed", attempts: 3 });
});
it("deduplicates repeated delegation calls while retaining both tool responses", async () => {
  controls.mode = "delegate";
  const id = run("Lead");
  await runtime.tick();
  await idle();
  await runtime.tick();
  await idle();
  const t = store.task(id);
  expect(
    store.db
      .prepare(
        "SELECT count(*) AS n FROM tasks WHERE run_id=? AND agent='Architect'",
      )
      .get(t.run_id),
  ).toEqual({ n: 1 });
  expect(
    JSON.parse(t.messages).filter((m: any) => m.role === "tool"),
  ).toHaveLength(2);
  const child: any = store.db
    .prepare("SELECT * FROM tasks WHERE run_id=? AND agent='Architect'")
    .get(t.run_id);
  expect(child.parent_task_id).toBe(id);
  expect(child.acceptance).toBe("Relevant paths identified");
});
it("blocks orphan tasks, cross-run dependencies and unbounded delegation", () => {
  const id = run();
  const t = store.task(id);
  expect(() => store.addTask("missing", "Builder", "x", "x")).toThrow(
    "does not exist",
  );
  const other = run("Builder");
  expect(() => store.addTask(t.run_id, "Frame", "x", "x", [other])).toThrow(
    "same run",
  );
  store.set("maxTasksPerRun", 1);
  expect(() => store.addTask(t.run_id, "Frame", "x", "x")).toThrow(
    "task limit",
  );
});
it("recovers interrupted writes as failed without executing them and preserves cancellation across restart", async () => {
  const id = run();
  store.db.prepare("UPDATE tasks SET status='running' WHERE id=?").run(id);
  store.db
    .prepare(
      "INSERT INTO tool_calls(id,task_id,tool,status) VALUES (?,?,'multi_edit','running')",
    )
    .run("write", id);
  const cancelled = run("Builder");
  store.db
    .prepare(
      "UPDATE tasks SET status='running',stop_requested='cancel' WHERE id=?",
    )
    .run(cancelled);
  const interruptedProvider = run("Frame");
  store.db
    .prepare("UPDATE tasks SET status='running' WHERE id=?")
    .run(interruptedProvider);
  store.reserve(interruptedProvider, "Frame", "test/model", 0.01);
  runtime.recover();
  expect(store.task(interruptedProvider).status).toBe("failed");
  expect(store.task(interruptedProvider).error).toContain("uncertain usage");
  expect(store.task(id).status).toBe("failed");
  expect(store.task(cancelled).status).toBe("cancelled");
  await runtime.tick();
  await idle();
  expect(completion).not.toHaveBeenCalled();
});
it("persists new configuration through repeatable migrations and an independent SQLite connection", async () => {
  const { migrateFeatures } = await import("../worker/migrations");
  store.db
    .prepare(
      "UPDATE agents SET parameters=?,provider_options=?,spending_limit=1.25 WHERE name='Architect'",
    )
    .run('{"top_p":0.8}', '{"allow_fallbacks":false}');
  migrateFeatures(store.db);
  migrateFeatures(store.db);
  const second = new Database(resolve(dir, "forge.sqlite"), { readonly: true });
  try {
    expect(
      second
        .prepare(
          "SELECT parameters,spending_limit FROM agents WHERE name='Architect'",
        )
        .get(),
    ).toEqual({ parameters: '{"top_p":0.8}', spending_limit: 1.25 });
  } finally {
    second.close();
  }
});
it("rejects a second worker before it can touch SQLite or recover another worker queue", async () => {
  const { existsSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const locked = mkdtempSync(resolve(tmpdir(), "forge-lock-audit-"));
  const previous = process.env.FORGE_DATA_DIR;
  let release: undefined | (() => void);
  try {
    process.env.FORGE_DATA_DIR = locked;
    release = (await import("../worker/instance-lock")).releaseWorkerLock;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "worker/instance-lock.ts"],
      {
        env: { ...process.env, FORGE_DATA_DIR: locked },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain("Another Forge worker");
    expect(existsSync(resolve(locked, "forge.sqlite"))).toBe(false);
  } finally {
    release?.();
    process.env.FORGE_DATA_DIR = previous;
    rmSync(locked, { recursive: true, force: true });
  }
});
