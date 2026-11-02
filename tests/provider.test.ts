import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(resolve(tmpdir(), "forge-provider-test-"));
process.env.FORGE_DATA_DIR = dir;
process.env.MODEL_PROVIDER = "nvidia";
delete process.env.NVIDIA_API_KEY;
const { saveProvider, providerStatus, providerKey } =
  await import("../worker/provider");
const { providerAction } = await import("../worker/provider-actions");
const { completion } = await import("../worker/model");
const { db, snapshot } = await import("../worker/store");
const { nvidiaFreeModelIds, nvidiaAgentModels } =
  await import("../src/lib/model-presets");
const fakeKey = "test-nvidia-key-never-used-on-network";
const agent = {
  name: "Builder",
  model: nvidiaAgentModels.Builder.model,
  temperature: 0.3,
  max_tokens: 256,
};
beforeEach(() => {
  vi.unstubAllGlobals();
  db.prepare("DELETE FROM usage").run();
  saveProvider({ provider: "nvidia", apiKey: fakeKey, allowUnpricedNim: true });
});
afterAll(() => {
  vi.unstubAllGlobals();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("keeps manually entered keys private, supports retention/rotation/removal and protects local file permissions", () => {
  expect(providerKey()).toBe(fakeKey);
  expect(providerStatus().configured).toBe(true);
  expect(JSON.stringify(snapshot())).not.toContain(fakeKey);
  expect(statSync(resolve(dir, "provider-credentials.json")).mode & 0o777).toBe(
    0o600,
  );
  saveProvider({ provider: "nvidia", apiKey: "" });
  expect(providerKey()).toBe(fakeKey);
  saveProvider({
    provider: "nvidia",
    apiKey: "rotated-test-key-not-a-credential",
  });
  expect(providerKey()).toBe("rotated-test-key-not-a-credential");
  process.env.NVIDIA_API_KEY = "environment-test-key-not-a-credential";
  saveProvider({ provider: "nvidia", removeKey: true });
  expect(providerKey()).toBe("");
  expect(providerStatus().configured).toBe(false);
  delete process.env.NVIDIA_API_KEY;
});
it("only configures NVIDIA free endpoints and preserves prompts while applying agent models", async () => {
  expect(() =>
    saveProvider({ provider: "openrouter", apiKey: fakeKey }),
  ).toThrow();
  const prompts = db
    .prepare("SELECT name,prompt FROM agents ORDER BY name")
    .all();
  await providerAction(
    "provider/save",
    { provider: "nvidia", applyRecommended: true, apiKey: "" },
    new Set(),
  );
  expect(
    db.prepare("SELECT name,prompt FROM agents ORDER BY name").all(),
  ).toEqual(prompts);
  for (const row of db.prepare("SELECT model FROM agents").all() as any[])
    expect(nvidiaFreeModelIds).toContain(row.model);
  await expect(
    providerAction(
      "provider/save",
      { provider: "nvidia", apiKey: "" },
      new Set(["active-task"]),
    ),
  ).rejects.toThrow("Pause the team");
});
it("blocks non-allowlisted models before any request and never falls back to paid providers", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    completion({ ...agent, model: "paid/model" }, { id: "test" }, [], []),
  ).rejects.toThrow("free-endpoint allowlist");
  expect(fetch).not.toHaveBeenCalled();
  await expect(completion(agent, { id: "test" }, [], [])).rejects.toThrow(
    "HTTP 429",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String((fetch.mock.calls[0] as any)[0])).toBe(
    "https://integrate.api.nvidia.com/v1/chat/completions",
  );
});
it("supports NVIDIA streaming without inventing a zero price or missing token counts", async () => {
  const stream =
    'data: {"choices":[{"delta":{"content":"Verified response"}}]}\n\ndata: [DONE]\n\n';
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
    ),
  );
  const message = await completion(agent, { id: "test" }, [], []);
  expect(message.content).toBe("Verified response");
  expect(
    db
      .prepare(
        "SELECT cost,input_tokens,output_tokens,status,provider FROM usage",
      )
      .get(),
  ).toEqual({
    cost: null,
    input_tokens: null,
    output_tokens: null,
    status: "usage_unavailable",
    provider: "nvidia",
  });
});
