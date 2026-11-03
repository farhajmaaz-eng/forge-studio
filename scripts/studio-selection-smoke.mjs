// Uses an isolated real worker + production UI with an explicit SDK protocol peer.
// Never contacts a real game or inference provider.
import { chromium, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(process.env.FORGE_DATA_DIR || ".data");
if (!dir.startsWith("/tmp/forge-pin-"))
  throw new Error(
    "Use the same isolated /tmp/forge-pin-* directory for worker, Next and this check.",
  );
const oldId = "f6a42404-67b3-4ade-b58b-c6b30f3e2753",
  newId = "6465ed97-8651-49fb-8de5-853936ddf645";
const base = "http://127.0.0.1:3000";
const peerArgs = [
  resolve("tests/mcp-fixture.mjs"),
  resolve(dir, "fixture-calls.json"),
  "default",
  newId,
  "123",
];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function snapshot() {
  const r = await page.request.get(`${base}/api/snapshot`);
  expect(r.ok()).toBe(true);
  return r.json();
}
async function api(path, data) {
  const r = await page.request.post(`${base}/api/${path}`, { data });
  const out = await r.json();
  expect(r.ok(), JSON.stringify(out)).toBe(true);
  return out;
}
async function confirmSwitch() {
  const dialog = page.getByRole("dialog", { name: "Confirm Studio switch" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /I verified this is the same game/ })
    .check();
  await dialog
    .getByLabel("Type the project name to confirm")
    .fill("Recovery game");
  await dialog
    .getByRole("button", { name: "Confirm switch", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
let db;
try {
  // Verify the live worker is using this directory before any mutation.
  const secret = readFileSync(resolve(dir, "worker.secret"), "utf8");
  const direct = await page.request.get("http://127.0.0.1:4318/snapshot", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(direct.ok()).toBe(true);
  let data, game, run, dialog;
  if (process.env.FORGE_SMOKE_RESUME === "connection-reset") {
    data = await snapshot();
    expect(data.games).toHaveLength(1);
    game = data.games[0];
    expect(game.name).toBe("Recovery game");
    expect(game.studio_id).toBe("");
    expect(data.settings.mcpCommand).toBe("");
    expect(data.settings.paused).toBe(true);
    run = data.runs.find((r) => r.game_id === game.id);
    expect(run).toBeTruthy();
    expect(run.studio_id).toBe("");
    await page.goto(`${base}/settings`);
    console.log("RESUME after already verified switch and connection reset");
  } else {
    expect((await snapshot()).games).toHaveLength(0);
    await api("pause", { paused: true });
    await page.goto(`${base}/games`);
    await page
      .getByRole("button", { name: "Add project", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Add a project" });
    await dialog.getByLabel("Game name", { exact: true }).fill("Recovery game");
    await dialog.getByLabel("Studio instance ID", { exact: true }).fill(oldId);
    await dialog.getByLabel("Roblox place ID", { exact: true }).fill("123");
    await dialog
      .getByRole("button", { name: "Add project", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    data = await snapshot();
    game = data.games[0];
    expect(game.place_id).toBe("123");
    run = await api("tasks/create", {
      gameId: game.id,
      agent: "Builder",
      objective: "Repair after Studio restart",
    });
    db = new Database(resolve(dir, "forge.sqlite"));
    const messages = [
      {
        role: "user",
        content: JSON.stringify({ request: "Repair script", studio_id: oldId }),
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "old-pending",
            type: "function",
            function: {
              name: "multi_edit",
              arguments: JSON.stringify({
                studio_id: oldId,
                path: "Main",
                source: "must never execute",
              }),
            },
          },
        ],
      },
    ];
    db.prepare("UPDATE tasks SET status='approval',messages=? WHERE id=?").run(
      JSON.stringify(messages),
      run.taskId,
    );
    db.prepare(
      "INSERT INTO approvals(id,task_id,call_id,tool,args,status) VALUES ('old-approval',?,'old-pending','multi_edit',?,'approved')",
    ).run(run.taskId, JSON.stringify({ studio_id: oldId }));
    await page
      .getByRole("button", { name: "Connect / refresh Studios", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await snapshot()).settings.studioDiscovery?.instances[0]?.id,
        { timeout: 20000 },
      )
      .toBe(newId);
    await page
      .getByLabel("New Roblox Studio instance ID", { exact: true })
      .fill(newId);
    await page
      .getByRole("button", { name: "Review Studio switch", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Confirm Studio switch" });
    await expect(dialog).toContainText(newId);
    await expect(
      dialog.getByRole("button", { name: "Confirm switch", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Close details", exact: true })
      .click();
    expect((await snapshot()).runs.find((r) => r.id === run.id).studio_id).toBe(
      oldId,
    );
    await page
      .getByRole("button", { name: "Review Studio switch", exact: true })
      .click();
    await confirmSwitch();
    data = await snapshot();
    expect(data.runs.find((r) => r.id === run.id).studio_id).toBe(newId);
    expect(data.settings.paused).toBe(true);
    expect(data.approvals.find((a) => a.id === "old-approval").status).toBe(
      "cancelled",
    );
    expect(data.tasks.find((t) => t.id === run.taskId).status).toBe("queued");
    expect(
      JSON.parse(
        db.prepare("SELECT messages FROM tasks WHERE id=?").get(run.taskId)
          .messages,
      )[0].content,
    ).toContain(newId);
    expect(existsSync(resolve(dir, "fixture-calls.json"))).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(
      "PASS manual project IDs, discovered replacement, cancel/confirm switch, queued pins and old-approval withdrawal",
    );
    const retainedTaskIds = data.tasks.map((t) => t.id).sort();
    await page.goto(`${base}/settings`);
    await page
      .getByRole("button", { name: "Review reset", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Reset Studio connection?" });
    await expect(
      dialog.getByRole("button", { name: "Confirm reset", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Type RESET STUDIO to confirm")
      .fill("RESET STUDIO");
    await dialog
      .getByRole("button", { name: "Confirm reset", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    data = await snapshot();
    expect(data.games[0].studio_id).toBe("");
    expect(data.runs.find((r) => r.id === run.id).studio_id).toBe("");
    expect(data.tasks.map((t) => t.id).sort()).toEqual(retainedTaskIds);
  }
  await expect(page.getByLabel("MCP executable", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("MCP executable", { exact: true })
    .fill(process.execPath);
  await page
    .getByLabel("Arguments (JSON array)")
    .fill(JSON.stringify(peerArgs));
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).settings.mcpCommand)
    .toBe(process.execPath);
  await page
    .getByRole("button", { name: "Connect / reconnect", exact: true })
    .click();
  await expect
    .poll(
      async () => (await snapshot()).settings.studioDiscovery?.instances[0]?.id,
      { timeout: 20000 },
    )
    .toBe(newId);
  await page.goto(`${base}/games`);
  await page
    .getByLabel("New Roblox Studio instance ID", { exact: true })
    .fill(newId);
  await page
    .getByRole("button", { name: "Review Studio switch", exact: true })
    .click();
  await confirmSwitch();
  expect((await snapshot()).runs.find((r) => r.id === run.id).studio_id).toBe(
    newId,
  );
  console.log(
    "PASS backed-up connection reset and manual MCP/instance setup for existing queued work",
  );
  await api("provider/save", {
    provider: "openrouter",
    apiKey: "test-synthetic-key-never-used-for-inference",
  });
  await page.goto(`${base}/settings`);
  await page
    .getByLabel("Reset scope", { exact: true })
    .selectOption("everything");
  await page.getByRole("button", { name: "Review reset", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Reset everything in Forge?" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Type RESET FORGE to confirm").fill("RESET FORGE");
  await page.evaluate(() => {
    localStorage.setItem("forge-game", "test");
    localStorage.setItem("unrelated-preference", "keep");
  });
  await dialog
    .getByRole("button", { name: "Confirm reset", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/`);
  data = await snapshot();
  expect(data.games).toHaveLength(0);
  expect(data.tasks).toHaveLength(0);
  expect(data.agents).toHaveLength(7);
  expect(data.provider.configured).toBe(false);
  expect(data.settings.paused).toBe(true);
  expect(data.settings.mcpCommand).toBe("");
  expect(
    existsSync(resolve(dir, data.settings.lastResetBackup, "forge.sqlite")),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("forge-game")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-preference")),
  ).toBe("keep");
  expect(errors).toEqual([]);
  console.log(
    "PASS full workspace reset, private recovery backup, removed credentials, paused clean state and browser console",
  );
} finally {
  db?.close();
  await browser.close();
}
