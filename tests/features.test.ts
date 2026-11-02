import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const dir = mkdtempSync(resolve(tmpdir(), "forge-v2-test-"));
process.env.FORGE_DATA_DIR = dir;
vi.mock("../worker/model", () => ({
  completion: vi.fn(async (_agent: any, t: any, messages: any[]) => {
    if (
      t.title === "Human decision" &&
      !messages.some((m) => m.role === "tool")
    )
      return {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "human-call",
            type: "function",
            function: {
              name: "ask_human",
              arguments: JSON.stringify({
                question: "Which checkpoint should be the starting point?",
                priority: 2,
              }),
            },
          },
        ],
      };
    return { role: "assistant", content: "User-facing deliverable" };
  }),
  refreshModels: vi.fn(),
}));
const store = await import("../worker/store");
const features = await import("../worker/features");
const runtime = await import("../worker/runtime");
const { completion } = await import("../worker/model");
const { migrateFeatures } = await import("../worker/migrations");
const { db } = store;
function g(id = "game", studio = "test-studio") {
  db.prepare("INSERT INTO games(id,name,studio_id) VALUES (?,?,?)").run(
    id,
    `Test ${id}`,
    studio,
  );
  return id;
}
function request(agent = "Builder", extra: Record<string, unknown> = {}) {
  return features.createRequest({
    gameId: "game",
    objective: "Build a verified checkpoint",
    agent,
    ...extra,
  });
}
async function settle() {
  while (runtime.active.size) await new Promise((r) => setTimeout(r, 5));
}
beforeEach(async () => {
  await settle();
  runtime.active.clear();
  vi.mocked(completion).mockClear();
  for (const table of [
    "review_events",
    "assets",
    "pitch_versions",
    "pitches",
    "attention_requests",
    "agent_messages",
    "approvals",
    "tool_calls",
    "usage",
    "memories",
    "telemetry_snapshots",
    "tasks",
    "runs",
    "games",
    "events",
    "market_snapshots",
  ])
    db.prepare(`DELETE FROM ${table}`).run();
  store.set("paused", false);
  g();
});
afterAll(async () => {
  await settle();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
describe("Additive V2 persistence and execution", () => {
  it("repeats migrations without replacing games, settings, or agent prompts", () => {
    store.set("private-setting", "preserve me");
    const before = db.prepare("SELECT * FROM agents").all();
    migrateFeatures(db);
    migrateFeatures(db);
    expect(db.prepare("SELECT * FROM agents").all()).toEqual(before);
    expect(store.get("private-setting")).toBe("preserve me");
    expect(db.prepare("SELECT id FROM games").all()).toEqual([{ id: "game" }]);
  });
  it("creates tracked tasks idempotently and rejects cross-project dependencies", () => {
    const first = request("Builder", {
      requestKey: "same-request",
      priority: 3,
      acceptance: "Verify respawn in Studio",
    });
    expect(request("Builder", { requestKey: "same-request" })).toEqual(first);
    expect(store.task(first.taskId)).toMatchObject({
      priority: 3,
      acceptance: "Verify respawn in Studio",
      requester: "User",
    });
    expect(() =>
      request("Builder", {
        requestKey: "same-request",
        objective: "Different request",
      }),
    ).toThrow("different request");
    g("other");
    expect(() =>
      features.createRequest({
        gameId: "other",
        objective: "Invalid dependency",
        dependencies: [first.taskId],
      }),
    ).toThrow("selected game");
  });
  it("gates specialists until a completed Lead plan is explicitly approved and adjusted", async () => {
    const r = request("Lead", { reviewPlan: true });
    db.prepare("UPDATE tasks SET status='completed' WHERE id=?").run(r.taskId);
    const child = store.addTask(
      r.id,
      "Builder",
      "Delegated checkpoint",
      "Original instructions",
      [r.taskId],
    );
    await runtime.tick();
    await settle();
    expect(completion).not.toHaveBeenCalled();
    features.featureAction("plans/approve", {
      id: r.id,
      adjustments: [
        {
          id: child,
          instructions: "Revised measurable scope",
          acceptance: "Respawn must reach Checkpoint",
        },
      ],
    });
    await runtime.tick();
    await settle();
    expect(completion).toHaveBeenCalledOnce();
    expect(store.task(child)).toMatchObject({
      status: "completed",
      instructions: "Revised measurable scope",
      acceptance: "Respawn must reach Checkpoint",
    });
    expect(
      (
        db
          .prepare("SELECT * FROM review_events WHERE target_kind='plan'")
          .get() as any
      ).verdict,
    ).toBe("approved");
  });
  it("pauses and cancels at a safe boundary while preserving completed tool evidence", () => {
    const r = request();
    db.prepare("UPDATE tasks SET status='running' WHERE id=?").run(r.taskId);
    runtime.active.add(r.taskId);
    db.prepare(
      "INSERT INTO tool_calls(id,task_id,tool,args,status,result) VALUES ('call',?,'multi_edit','{}','done','{\"modified\":true}')",
    ).run(r.taskId);
    features.featureAction(
      "tasks/control",
      { id: r.taskId, action: "pause" },
      runtime.active,
    );
    expect(store.task(r.taskId)).toMatchObject({
      status: "running",
      stop_requested: "pause",
    });
    expect(runtime.stopAtBoundary(r.taskId)).toBe(true);
    expect(store.task(r.taskId).status).toBe("paused");
    runtime.active.delete(r.taskId);
    features.featureAction("tasks/control", { id: r.taskId, action: "resume" });
    expect(store.task(r.taskId).status).toBe("queued");
    features.featureAction("runs/control", { id: r.id, action: "cancel" });
    expect(store.task(r.taskId).status).toBe("cancelled");
    expect(
      (db.prepare("SELECT status FROM tool_calls WHERE id='call'").get() as any)
        .status,
    ).toBe("done");
    expect(() =>
      features.featureAction("tasks/update", { id: r.taskId, agent: "Frame" }),
    ).toThrow("safe boundary");
  });
  it("waits for human decisions and resumes with the real answer", async () => {
    const r = request();
    db.prepare("UPDATE tasks SET title='Human decision' WHERE id=?").run(
      r.taskId,
    );
    await runtime.tick();
    await settle();
    expect(store.task(r.taskId).status).toBe("blocked");
    const q: any = db.prepare("SELECT * FROM attention_requests").get();
    expect(q.question).toContain("checkpoint");
    features.featureAction("attention/reply", {
      id: q.id,
      reply: "Use the spawn checkpoint",
    });
    await runtime.tick();
    await settle();
    await runtime.tick();
    await settle();
    expect(store.task(r.taskId).status).toBe("completed");
    expect(
      features
        .taskDetail(r.taskId)
        .messages.some(
          (m: any) =>
            m.actor === "User" && m.content === "Use the spawn checkpoint",
        ),
    ).toBe(true);
    expect(features.taskDetail(r.taskId).task).not.toHaveProperty("messages");
  });
});
describe("Traceable media review and asset storage", () => {
  it("validates file content, stores nonexecutable text safely, and binds artifacts to the producing project", () => {
    const r = request();
    expect(() =>
      features.saveAsset({
        name: "Spoof",
        kind: "image",
        mime: "image/png",
        data: Buffer.from("<script>bad</script>").toString("base64"),
      }),
    ).toThrow("contents");
    const asset = features.saveAsset(
      {
        name: "Module source",
        kind: "script",
        mime: "text/plain",
        filename: "../../module.luau",
        data: Buffer.from('print("stored, never executed")').toString("base64"),
      },
      r.taskId,
    );
    const file = features.assetFile(asset.id);
    expect(file.inline).toBe(false);
    expect(file.filename).not.toContain("/");
    expect(file.bytes.toString()).toContain("never executed");
    const record: any = features.featureRead(
      "assets",
      new URLSearchParams({ id: asset.id }),
    );
    expect(record).toMatchObject({
      status: "pending",
      game_id: "game",
      task_id: r.taskId,
    });
    g("other");
    expect(() =>
      features.saveAsset({
        name: "Wrong project",
        kind: "document",
        content: "test",
        gameId: "other",
        taskId: r.taskId,
      }),
    ).toThrow("same game");
  });
  it("creates one linked revision for artifact changes and keeps verdicts idempotent", () => {
    const r = request();
    db.prepare("UPDATE tasks SET status='completed' WHERE id=?").run(r.taskId);
    const asset = features.saveAsset(
      {
        name: "Screenshot",
        kind: "image",
        url: "https://example.test/result.png",
      },
      r.taskId,
    );
    const verdict = {
      id: asset.id,
      verdict: "changes_requested",
      note: "Improve checkpoint visibility",
    };
    const result: any = features.featureAction("assets/verdict", verdict);
    expect(store.task(result.revisionTaskId)).toMatchObject({
      agent: "Builder",
      parent_task_id: r.taskId,
      status: "queued",
    });
    expect(features.featureAction("assets/verdict", verdict)).toMatchObject({
      duplicate: true,
    });
    expect(
      db.prepare("SELECT * FROM review_events WHERE target_kind='asset'").all(),
    ).toHaveLength(1);
    expect(() =>
      features.featureAction("assets/verdict", {
        id: asset.id,
        verdict: "approved",
      }),
    ).toThrow("already has a verdict");
  });
  it("requires explicit authorization for paid tools and records revision notes", () => {
    const r = request();
    db.prepare("UPDATE tasks SET status='approval' WHERE id=?").run(r.taskId);
    db.prepare(
      "INSERT INTO approvals(id,task_id,call_id,tool,args) VALUES ('approval',?,'tool','generate_mesh','{}')",
    ).run(r.taskId);
    expect(() =>
      features.decideApproval({ id: "approval", approved: true }),
    ).toThrow("Explicit authorization");
    expect(() =>
      features.decideApproval({
        id: "approval",
        approved: false,
        requestChanges: true,
        note: "",
      }),
    ).toThrow("Describe");
    features.decideApproval({
      id: "approval",
      approved: false,
      requestChanges: true,
      note: "Use the approved mesh specification",
    });
    expect(store.task(r.taskId).status).toBe("queued");
    expect(
      db.prepare("SELECT * FROM review_events").get() as any,
    ).toMatchObject({
      verdict: "changes_requested",
      revision_task_id: r.taskId,
    });
    expect(
      features.decideApproval({ id: "approval", approved: false }),
    ).toMatchObject({ duplicate: true });
  });
});
describe("Sourced studio intelligence", () => {
  const market = {
    source: "https://example.test/authorized-export",
    fetchedAt: "2026-10-30T08:00:00+08:00",
    quality: "exported",
    category: "Source category",
    games: [
      { universeId: "123", title: "Observed game", players: 100, rank: 2 },
    ],
  };
  it("retains provenance, normalizes timestamps, rejects fake/duplicate observations and deduplicates imports", () => {
    const one: any = features.featureAction("market/import", market);
    expect(features.featureAction("market/import", market)).toMatchObject({
      id: one.id,
      duplicate: true,
    });
    const read: any = features.featureRead("market", new URLSearchParams());
    expect(read.current.fetchedAt).toBe("2026-10-30T00:00:00.000Z");
    expect(read.current.games[0]).not.toHaveProperty("visits");
    expect(read.previous).toBeNull();
    expect(() =>
      features.featureAction("market/import", {
        ...market,
        games: [...market.games, ...market.games],
      }),
    ).toThrow("Duplicate");
    expect(() =>
      features.featureAction("telemetry/import", {
        gameId: "game",
        source: market.source,
        fetchedAt: market.fetchedAt,
        quality: "exported",
        metrics: [
          {
            metric: "first_minute",
            points: [{ at: "2026-10-29T00:00:00Z", value: 120 }],
          },
        ],
      }),
    ).toThrow("percentage");
    features.featureAction("telemetry/import", {
      gameId: "game",
      source: market.source,
      fetchedAt: market.fetchedAt,
      quality: "sampled",
      metrics: [
        { metric: "dau", points: [{ at: "2026-10-29T00:00:00Z", value: 42 }] },
      ],
    });
    expect(
      (
        features.featureRead(
          "telemetry",
          new URLSearchParams({ gameId: "game" }),
        ) as any
      ).snapshots[0].quality,
    ).toBe("sampled");
  });
  it("versions evidence-backed pitches and converts an accepted concept only once", () => {
    const m: any = features.featureAction("market/import", market);
    const draft = {
      title: "Checkpoint concept",
      hook: "A testable cooperative checkpoint loop",
      sections: { mvp: "One verified level" },
      evidence: [{ snapshotId: m.id, universeId: "123" }],
    };
    const p = features.savePitch(draft);
    expect(() =>
      features.savePitch({ ...draft, id: p.id, expectedVersion: 99 }),
    ).toThrow("changed");
    features.savePitch({
      ...draft,
      id: p.id,
      expectedVersion: 1,
      gameId: null,
      hook: "An updated cooperative checkpoint loop",
    });
    expect(() =>
      features.featureAction("pitches/convert", { id: p.id }),
    ).toThrow("Accept the pitch");
    features.featureAction("pitches/decision", {
      id: p.id,
      verdict: "accepted",
    });
    const a: any = features.featureAction("pitches/convert", {
      id: p.id,
      createTasks: true,
    });
    const b: any = features.featureAction("pitches/convert", {
      id: p.id,
      createTasks: true,
    });
    expect(a.gameId).toBe(b.gameId);
    expect(a.taskId).toBe(b.taskId);
    expect(
      (db.prepare("SELECT * FROM games WHERE id=?").get(a.gameId) as any).stage,
    ).toBe("concept");
    expect(
      db.prepare("SELECT * FROM pitch_versions WHERE pitch_id=?").all(p.id),
    ).toHaveLength(2);
    expect(
      (
        db
          .prepare(
            "SELECT * FROM runs WHERE id=(SELECT run_id FROM tasks WHERE id=?)",
          )
          .get(a.taskId) as any
      ).plan_status,
    ).toBe("pending");
  });
});
