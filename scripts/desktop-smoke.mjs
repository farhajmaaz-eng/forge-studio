import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto("http://127.0.0.1:3000/settings");
  await p.locator(".appearance-panel").waitFor();
  await p.getByRole("button", { name: "Graphite", exact: true }).click();
  await expect(p.locator("html")).toHaveAttribute("data-theme", "graphite");
  await p.getByLabel("Interface density").selectOption("comfortable");
  await p.reload();
  await expect(p.locator("html")).toHaveAttribute("data-theme", "graphite");
  await expect(p.locator("html")).toHaveAttribute(
    "data-density",
    "comfortable",
  );
  await p.getByRole("button", { name: "Hide navigation", exact: true }).click();
  await expect(p.locator(".sidebar")).toBeHidden();
  await p.reload();
  await expect(p.locator(".sidebar")).toBeHidden();
  await p.getByRole("button", { name: "Show navigation", exact: true }).click();
  await expect(p.locator(".sidebar")).toBeVisible();
  await p.locator("h1").click();
  await p.keyboard.press("Alt+f");
  await expect(p.locator(".sidebar")).toBeHidden();
  await p.keyboard.press("Alt+f");
  await expect(p.locator(".sidebar")).toBeVisible();
  await p.keyboard.press("Alt+7");
  await expect(p).toHaveURL(/\/library$/);
  await p.locator("h1").click();
  await p.keyboard.press("?");
  await expect(
    p.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.getByRole("dialog")).toHaveCount(0);
  const downloadPromise = p.waitForEvent("download");
  await p
    .getByRole("button", { name: "Download diagnostics", exact: true })
    .click();
  const download = await downloadPromise;
  const report = JSON.parse(await readFile(await download.path(), "utf8"));
  if (
    report.app !== "Forge Studio" ||
    "chat" in report ||
    "settings" in report ||
    "memories" in report ||
    "content" in report
  )
    throw new Error("Invalid diagnostics export");
  if (!("keyConfigured" in report.provider) || !("cap" in report.budget))
    throw new Error("Missing diagnostic metadata");
  console.log(
    "PASS persisted appearance, density, focus mode, workspace keys, shortcuts and diagnostic export",
  );
  // Browser-only task fixture exercises direct links without creating real work.
  const original = await (
    await p.request.get("http://127.0.0.1:3000/api/snapshot")
  ).json();
  const fixture = structuredClone(original);
  fixture.tasks = [
    {
      id: "desktop-test",
      agent: "Builder",
      title: "Inspect this task",
      instructions: "Private task prompt excluded from diagnostic export",
      status: "failed",
      deps: "[]",
      messages: "[]",
      attempts: 1,
      steps: 2,
      error: "Test failure",
      created: "2026-11-01 12:00:00",
    },
  ];
  await p.route("**/api/snapshot", (r) => r.fulfill({ json: fixture }));
  await p.goto("http://127.0.0.1:3000/tasks?task=desktop-test");
  await expect(p.locator("#task-desktop-test")).toHaveAttribute("open", "");
  await p.keyboard.press("Control+k");
  await p.getByRole("dialog").getByRole("textbox").fill("Inspect this task");
  await p.getByRole("dialog").getByRole("link").click();
  await expect(p.locator("#task-desktop-test")).toHaveAttribute("open", "");
  console.log("PASS task deep links and launcher task results");
  await p.unroute("**/api/snapshot");
  await p.goto("http://127.0.0.1:3000/settings");
  await p.getByRole("button", { name: "Nord", exact: true }).click();
  await p.getByLabel("Interface density").selectOption("compact");
  await p.goto("http://127.0.0.1:3000");
  await p.locator(".overview-stats").waitFor();
  for (const width of [1440, 1024, 768, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    if (
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    )
      throw new Error("Horizontal overflow at " + width);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS desktop workspace responsive widths and browser errors");
} finally {
  await b.close();
}
