import { afterAll, beforeEach, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 });
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const dir = mkdtempSync(resolve(tmpdir(), "forge-mcp-audit-"));
process.env.FORGE_DATA_DIR = dir;
const { db, set, get } = await import("../worker/store");
const { Studio, expandEnvironment } = await import("../worker/mcp");
const studio = new Studio(),
  file = resolve(dir, "calls.json");
beforeEach(async () => {
  await studio.close();
  db.prepare("DELETE FROM locks").run();
  set("paused", false);
  set("mcpCommand", process.execPath);
  set("mcpArgs", [resolve("tests/mcp-fixture.mjs"), file]);
  set("mcpCallTimeoutMs", 1000);
});
afterAll(async () => {
  await studio.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("expands Windows variables case-insensitively and preserves compound cmd arguments", () => {
  expect(
    expandEnvironment("cd /d %LOCALAPPDATA%\\Roblox && .\\mcp.bat", {
      LocalAppData: "C:\\Users\\A Person\\AppData\\Local",
    }),
  ).toBe("cd /d C:\\Users\\A Person\\AppData\\Local\\Roblox && .\\mcp.bat");
  expect(expandEnvironment("${APP}/server", { APP: "/tmp/test" })).toBe(
    "/tmp/test/server",
  );
  expect(() => expandEnvironment("%MISSING%", {})).toThrow("MISSING");
});
it("reports startup failures and clears stale advertised tools", async () => {
  set("mcpCommand", "/nonexistent/forge-mcp");
  await studio.connect();
  expect(studio.client).toBeNull();
  expect(studio.tools).toEqual([]);
  expect(get("studioStatus")).toBe("error");
  expect(get("studioError")).toContain("Check MCP executable");
});
it("rejects unsupported names, invalid arguments and changed target IDs before execution", async () => {
  await studio.connect();
  await expect(
    studio.call("Builder", "script_search", {}, "test-studio", "owner"),
  ).rejects.toThrow("not advertised");
  await expect(
    studio.call(
      "Builder",
      "multi_edit",
      { source: "bad" },
      "test-studio",
      "owner",
    ),
  ).rejects.toThrow("Invalid arguments");
  await expect(
    studio.call(
      "Builder",
      "multi_edit",
      { studio_id: "wrong", path: "x", source: "bad" },
      "test-studio",
      "owner",
    ),
  ).rejects.toThrow("pinned");
  expect(db.prepare("SELECT count(*) AS n FROM locks").get()).toEqual({ n: 0 });
});
it("serializes simultaneous Studio writes with real SDK responses", async () => {
  await studio.connect();
  await Promise.all(
    [1, 2, 3].map((i) =>
      studio.call(
        "Builder",
        "multi_edit",
        { path: "game.ServerScriptService.Test", source: String(i) },
        "test-studio",
        `owner-${i}`,
      ),
    ),
  );
  expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
    count: 3,
    maxActive: 1,
  });
  expect(db.prepare("SELECT count(*) AS n FROM locks").get()).toEqual({ n: 0 });
});
it("detects a restarted Studio ID instead of redirecting existing runs", async () => {
  set("mcpArgs", [resolve("tests/mcp-fixture.mjs"), file, "stale"]);
  await studio.connect();
  await expect(
    studio.call(
      "Builder",
      "multi_edit",
      { path: "x", source: "x" },
      "test-studio",
      "owner",
    ),
  ).rejects.toThrow("no longer available");
});
it("rediscovers supported read alternatives after reconnect without inventing a script_read fallback", async () => {
  await studio.connect();
  expect(
    studio.available("Builder").some((t) => t.name === "script_read"),
  ).toBe(true);
  await studio.close();
  expect(studio.available("Builder")).toEqual([]);
  set("mcpArgs", [resolve("tests/mcp-fixture.mjs"), file, "alias"]);
  await studio.connect();
  expect(
    studio.available("Builder").some((t) => t.name === "script_read"),
  ).toBe(false);
  expect(
    studio.available("Builder").some((t) => t.name === "read_script"),
  ).toBe(true);
  await expect(
    studio.call("Builder", "script_read", { path: "x" }, "test-studio", "o"),
  ).rejects.toThrow("read_script");
  const result: any = await studio.call(
    "Builder",
    "read_script",
    { path: "x" },
    "test-studio",
    "o",
  );
  expect(result.isError).not.toBe(true);
});
it("retains the lock on timed-out writes and never automatically executes them twice", async () => {
  await studio.connect();
  set("mcpCallTimeoutMs", 40);
  await expect(
    studio.call(
      "Builder",
      "multi_edit",
      { path: "x", source: "once", delay: 200 },
      "test-studio",
      "uncertain",
    ),
  ).rejects.toMatchObject({ uncertain: true });
  expect(JSON.parse(readFileSync(file, "utf8")).count).toBe(1);
  expect(db.prepare("SELECT owner FROM locks").get()).toEqual({
    owner: "uncertain",
  });
});
it("detects transport loss, clears tools and reconnects safely", async () => {
  await studio.connect();
  await expect(
    studio.call(
      "Lead",
      "get_studio_state",
      { disconnect: true },
      "test-studio",
      "owner",
    ),
  ).rejects.toThrow();
  expect(studio.client).toBeNull();
  expect(get("studioStatus")).toBe("disconnected");
  expect(studio.tools).toEqual([]);
  await studio.connect();
  expect(get("studioStatus")).toBe("connected");
});

it("rejects stale agent edits after another agent changes the same Studio until it is inspected again", async () => {
  await studio.connect();
  db.prepare(
    "INSERT OR IGNORE INTO runs(id,request,studio_id) VALUES ('shared','Concurrent edits','test-studio')",
  ).run();
  const { addTask } = await import("../worker/store");
  const builder = addTask(
    "shared",
    "Builder",
    "Builder change",
    "Inspect and change script",
  );
  const frame = addTask(
    "shared",
    "Frame",
    "Frame change",
    "Inspect and change UI",
  );
  await studio.call(
    "Builder",
    "script_read",
    { path: "x" },
    "test-studio",
    `${builder}:read`,
  );
  await studio.call(
    "Frame",
    "script_read",
    { path: "x" },
    "test-studio",
    `${frame}:read`,
  );
  await studio.call(
    "Builder",
    "multi_edit",
    { path: "x", source: "builder" },
    "test-studio",
    `${builder}:write`,
  );
  await expect(
    studio.call(
      "Frame",
      "multi_edit",
      { path: "x", source: "stale" },
      "test-studio",
      `${frame}:write`,
    ),
  ).rejects.toThrow("changed after");
  expect(JSON.parse(readFileSync(file, "utf8")).source).toBe("builder");
  await studio.call(
    "Frame",
    "script_read",
    { path: "x" },
    "test-studio",
    `${frame}:read-again`,
  );
  await studio.call(
    "Frame",
    "multi_edit",
    { path: "x", source: "fresh" },
    "test-studio",
    `${frame}:fresh-write`,
  );
  expect(JSON.parse(readFileSync(file, "utf8")).source).toBe("fresh");
});
