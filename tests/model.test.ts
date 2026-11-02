import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(resolve(tmpdir(), "forge-stream-billing-"));
process.env.FORGE_DATA_DIR = dir;
process.env.MODEL_PROVIDER = "openrouter";
process.env.OPENROUTER_API_KEY = "test-only-never-sent-to-network";
const { db, set } = await import("../worker/store");
const { completion } = await import("../worker/model");
const agent = {
  name: "Lead",
  model: "test/model",
  temperature: 0.3,
  max_tokens: 256,
};
beforeEach(() => {
  db.prepare("DELETE FROM usage").run();
  set("pricing", {
    "test/model": { prompt: 0.00001, completion: 0.00002, context: 100 },
  });
  set("cap", 9);
});
afterAll(() => {
  vi.unstubAllGlobals();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("accounts streamed usage and publishes only user-facing text", async () => {
  const frames =
    [
      {
        choices: [
          { delta: { content: "Visible summary", reasoning: "Keep private" } },
        ],
      },
      {
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 },
      },
    ]
      .map((v) => `data: ${JSON.stringify(v)}\n\n`)
      .join("") + "data: [DONE]\n\n";
  const fetch = vi.fn(
    async () =>
      new Response(frames, {
        headers: { "content-type": "text/event-stream" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const text: string[] = [];
  await completion(agent, { id: "test-task" }, [], [], (value) =>
    text.push(value),
  );
  expect(JSON.parse((fetch.mock.calls[0] as any)[1].body).stream).toBe(true);
  expect(db.prepare("SELECT cost,reserved,status FROM usage").get()).toEqual({
    cost: 0.001,
    reserved: 0,
    status: "reported",
  });
  expect(text.at(-1)).toBe("Visible summary");
  expect(text.join(" ")).not.toContain("Keep private");
});
it("retains the reservation for interrupted streams and invalid usage accounting", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    ),
  );
  await expect(completion(agent, { id: "test-task" }, [], [])).rejects.toThrow(
    "reservation retained",
  );
  expect(db.prepare("SELECT status FROM usage").get()).toEqual({
    status: "uncertain",
  });
  db.prepare("DELETE FROM usage").run();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [{ message: { role: "assistant", content: "Done" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: -1 },
      }),
    ),
  );
  await expect(completion(agent, { id: "test-task" }, [], [])).rejects.toThrow(
    "reservation retained",
  );
  const row: any = db.prepare("SELECT * FROM usage").get();
  expect(row.status).toBe("uncertain");
  expect(row.reserved).toBeGreaterThan(0);
  expect(row.cost).toBe(0);
});
