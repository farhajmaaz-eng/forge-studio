import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const tmp = mkdtempSync(resolve(tmpdir(), "forge-test-"));
process.env.FORGE_DATA_DIR = tmp;
process.env.FIXTURE_PLACE = resolve(tmp, "place.luau");
let serial = 0;
const call = (name: string, args: any) => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: `call-${++serial}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
vi.mock("../worker/model", () => ({
  completion: vi.fn(async (a: any, t: any, m: any[]) => {
    const outputs = m.filter((x) => x.role === "tool");
    if (a.name === "Lead") {
      if (!outputs.length) return call("library_search", { query: "security" });
      if (outputs.length === 1)
        return call("library_read", {
          id: JSON.parse(outputs[0].content)[0].id,
        });

      if (outputs.length === 2)
        return call("delegate", {
          agent: "Builder",
          title: "Build checkpoint",
          instructions: "Create Checkpoint script",
          dependencies: [],
        });
      return {
        role: "assistant",
        content: "Builder delegated; independent verification follows.",
      };
    }
    if (a.name === "Builder")
      return !outputs.length
        ? call("multi_edit", {
            source: '-- Checkpoint\nprint("Checkpoint ready")',
          })
        : {
            role: "assistant",
            content: "Created checkpoint script in Studio.",
          };
    if (a.name === "Tester") {
      if (outputs.length === 0) return call("script_read", {});
      if (outputs.length === 1) return call("start_stop_play", { start: true });
      if (outputs.length === 2) return call("get_console_output", {});
      if (outputs.length === 3)
        return call("start_stop_play", { start: false });
      if (outputs.length === 4)
        return call("verify", {
          passed: true,
          evidence:
            "Read back Checkpoint script, started playtest, observed PASS Checkpoint exists in console, stopped playtest.",
        });
      return {
        role: "assistant",
        content: "Checkpoint verified with Studio evidence.",
      };
    }
    throw new Error("Unexpected role");
  }),
  refreshModels: vi.fn(),
}));
const store = await import("../worker/store");
const { studio } = await import("../worker/mcp");
const runtime = await import("../worker/runtime");
afterAll(async () => {
  await studio.close();
  store.db.close();
  rmSync(tmp, { recursive: true, force: true });
});
describe("Persistent local workflow", () => {
  it("plans, delegates, gates a real SDK write, verifies evidence and reaches review", async () => {
    store.set("mcpCommand", process.execPath);
    store.set("mcpArgs", [
      resolve("tests/studio-fixture.mjs"),
      process.env.FIXTURE_PLACE,
    ]);
    await studio.connect();
    expect(studio.tools.length).toBe(5);
    store.db
      .prepare(
        "INSERT INTO runs(id,request,studio_id) VALUES ('run','Build a checkpoint','test-studio')",
      )
      .run();
    store.addTask("run", "Lead", "Plan checkpoint", "Plan, delegate, test.");
    let approvals = 0;
    for (let i = 0; i < 60; i++) {
      await runtime.tick();
      while (runtime.active.size) await new Promise((r) => setTimeout(r, 5));
      const pending = store.db
        .prepare("SELECT * FROM approvals WHERE status='pending'")
        .all() as any[];
      for (const ap of pending) {
        expect(ap.args).toContain("test-studio");
        if (ap.tool === "multi_edit") {
          expect(() => readFileSync(process.env.FIXTURE_PLACE!)).toThrow();
        }
        store.db
          .prepare("UPDATE approvals SET status='approved' WHERE id=?")
          .run(ap.id);
        store.db
          .prepare("UPDATE tasks SET status='queued' WHERE id=?")
          .run(ap.task_id);
        approvals++;
      }
      if (
        (
          store.db
            .prepare("SELECT status FROM runs WHERE id='run'")
            .get() as any
        ).status === "review"
      )
        break;
    }
    expect(
      (
        store.db
          .prepare(
            "SELECT count(*) AS n FROM tool_calls WHERE tool='library_read' AND status='done'",
          )
          .get() as any
      ).n,
    ).toBe(1);
    expect(approvals).toBe(3);
    expect(readFileSync(process.env.FIXTURE_PLACE!, "utf8")).toContain(
      "Checkpoint",
    );
    expect(
      (store.db.prepare("SELECT status FROM runs WHERE id='run'").get() as any)
        .status,
    ).toBe("review");
    expect(
      (
        store.db
          .prepare("SELECT result FROM tasks WHERE agent='Tester'")
          .get() as any
      ).result,
    ).toContain("VERIFIED:");
    expect(
      (
        store.db
          .prepare("SELECT count(DISTINCT agent) AS n FROM memories")
          .get() as any
      ).n,
    ).toBe(3);
    expect(
      (store.db.prepare("SELECT count(*) AS n FROM locks").get() as any).n,
    ).toBe(0);
  }, 20000);
  it("reserves atomically against cap and includes unknown outcomes", () => {
    store.set("cap", 1);
    store.reserve("t", "Lead", "m", 0.7);
    expect(() => store.reserve("t", "Builder", "m", 0.4)).toThrow(
      "Spending cap",
    );
    expect(store.spent().reserved).toBe(0.7);
  });
  it("rejects unauthorized MCP tools before running them", async () => {
    await expect(
      studio.call(
        "Lead",
        "multi_edit",
        { source: "bad" },
        "test-studio",
        "owner",
      ),
    ).rejects.toThrow("cannot use");
    expect(readFileSync(process.env.FIXTURE_PLACE!, "utf8")).not.toBe("bad");
  });
  it("restores queued work and flags interrupted writes after restart", () => {
    const id = store.addTask(
      "run",
      "Builder",
      "Interrupted",
      "Inspect outcome",
    );
    store.db.prepare("UPDATE tasks SET status='running' WHERE id=?").run(id);
    store.db
      .prepare(
        "INSERT INTO tool_calls(id,task_id,tool,args,status) VALUES ('interrupted',?,'multi_edit','{}','running')",
      )
      .run(id);
    runtime.recover();
    expect(store.task(id).status).toBe("queued");
    expect(
      (
        store.db
          .prepare("SELECT status FROM tool_calls WHERE id='interrupted'")
          .get() as any
      ).status,
    ).toBe("uncertain");
  });
});
