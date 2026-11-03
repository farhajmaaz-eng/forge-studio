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
    "test/model": {
      prompt: 0.00001,
      completion: 0.00002,
      context: 4096,
      parameters: ["tools", "temperature"],
    },
  });
  set("cap", 9);
  set("pricingUpdated", Date.now());
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

it.each([401, 402, 400, 404])(
  "reports HTTP %s without repeating a permanent failure",
  async (status) => {
    const fetch = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(completion(agent, { id: "t" }, [], [])).rejects.toThrow(
      `HTTP ${status}`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (db.prepare("SELECT reserved FROM usage").get() as any).reserved,
    ).toBe(0);
  },
);
it("retries rate limits with bounded exponential backoff and no provider/model fallback", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { role: "assistant", content: "Ready" } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const pending = completion(agent, { id: "t" }, [], []);
    await vi.runAllTimersAsync();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(options.body);
      expect(body.model).toBe("test/model");
      expect(body.provider.allow_fallbacks).toBe(false);
      expect(body).not.toHaveProperty("models");
    }
    expect(db.prepare("SELECT status FROM usage ORDER BY rowid").all()).toEqual(
      [{ status: "uncertain" }, { status: "estimated" }],
    );
    expect(
      (
        db
          .prepare("SELECT reserved FROM usage WHERE status='uncertain'")
          .get() as any
      ).reserved,
    ).toBeGreaterThan(0);
  } finally {
    vi.useRealTimers();
  }
});
it("does not repeat unknown network outcomes and redacts credentials in diagnostics", async () => {
  const fetch = vi.fn(async () => {
    throw new Error(`Bearer ${process.env.OPENROUTER_API_KEY}`);
  });
  vi.stubGlobal("fetch", fetch);
  await expect(completion(agent, { id: "t" }, [], [])).rejects.toThrow(
    "reservation retained",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    (db.prepare("SELECT reserved FROM usage").get() as any).reserved,
  ).toBeGreaterThan(0);
  const { event, snapshot } = await import("../worker/store");
  event(`bad ${process.env.OPENROUTER_API_KEY}`, "System", "error");
  expect(JSON.stringify(snapshot())).not.toContain(
    process.env.OPENROUTER_API_KEY,
  );
});
it("passes multi-tool results and opaque reasoning details across turns without exposing reasoning", async () => {
  const calls = [
    {
      id: "one",
      type: "function",
      function: { name: "remember", arguments: '{"content":"one"}' },
    },
    {
      id: "two",
      type: "function",
      function: { name: "remember", arguments: '{"content":"two"}' },
    },
  ];
  const detail = {
    type: "reasoning.encrypted",
    data: "opaque-state",
    id: "r1",
    index: 0,
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: calls,
              reasoning_details: [detail],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 6, cost: 0.0001 },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { role: "assistant", content: "Complete" } }],
        usage: { prompt_tokens: 20, completion_tokens: 3, cost: 0.0001 },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const first = await completion(agent, { id: "t" }, [], []);
  const messages = [
    first,
    ...calls.map((c) => ({
      role: "tool",
      tool_call_id: c.id,
      content: '{"saved":true}',
    })),
  ];
  await completion(agent, { id: "t" }, messages, []);
  const payload = JSON.parse(fetch.mock.calls[1][1].body);
  expect(payload.messages).toEqual(messages);
  expect(first.reasoning_details).toEqual([detail]);
});
it("rejects unsupported tools, context/output limits and secret-shaped parameters before networking", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  set("pricing", {
    "test/model": {
      prompt: 0,
      completion: 0,
      context: 4096,
      maxOutput: 512,
      parameters: ["temperature"],
    },
  });
  await expect(
    completion(agent, { id: "t" }, [], [{ type: "function" }]),
  ).rejects.toThrow("tool calling");
  await expect(
    completion({ ...agent, max_tokens: 513 }, { id: "t" }, [], []),
  ).rejects.toThrow("output tokens");
  await expect(
    completion(
      agent,
      { id: "t" },
      [{ role: "user", content: "x".repeat(5000) }],
      [],
    ),
  ).rejects.toThrow("context limit");
  await expect(
    completion(
      { ...agent, parameters: { api_key: "no" } },
      { id: "t" },
      [],
      [],
    ),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("accepts genuinely zero-priced models and enforces per-agent spending reservations", async () => {
  set("pricing", {
    "test/model": {
      prompt: 0,
      completion: 0,
      context: 4096,
      parameters: ["tools", "temperature"],
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [{ message: { role: "assistant", content: "Free" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1, cost: 0 },
      }),
    ),
  );
  await completion(agent, { id: "t" }, [], []);
  expect(db.prepare("SELECT cost,status FROM usage").get() as any).toEqual({
    cost: 0,
    status: "reported",
  });
  db.prepare("UPDATE agents SET spending_limit=0.001 WHERE name=?").run("Lead");
  set("pricing", {
    "test/model": {
      prompt: 0.00001,
      completion: 0.00002,
      context: 4096,
      parameters: ["tools", "temperature"],
    },
  });
  await expect(completion(agent, { id: "t" }, [], [])).rejects.toThrow(
    "Agent spending limit",
  );
  db.prepare("UPDATE agents SET spending_limit=0 WHERE name=?").run("Lead");
});
it("records billing but refuses truncated, duplicate or empty model outputs before executing tools", async () => {
  for (const choice of [
    {
      finish_reason: "length",
      message: { role: "assistant", content: "partial" },
    },
    { message: { role: "assistant", content: null } },
    {
      message: {
        role: "assistant",
        tool_calls: [
          { id: "same", function: { name: "remember", arguments: "{}" } },
          { id: "same", function: { name: "remember", arguments: "{}" } },
        ],
      },
    },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [choice],
          usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.001 },
        }),
      ),
    );
    await expect(completion(agent, { id: "t" }, [], [])).rejects.toThrow();
  }
  expect(
    db.prepare("SELECT count(*) AS n FROM usage WHERE status='reported'").get(),
  ).toEqual({ n: 3 });
});
