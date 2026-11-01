import { chromium, expect } from "@playwright/test";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  for (const width of [1440, 768, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/",
      "/chat",
      "/team",
      "/tasks",
      "/games",
      "/reviews",
      "/logs",
      "/settings",
    ]) {
      await p.goto("http://127.0.0.1:3000" + route);
      await p.locator(".footer").waitFor();
      await p.waitForTimeout(250);
      await expect(p.locator(".alert.error")).toHaveCount(0);
      if (
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`Horizontal overflow: ${route} at ${width}`);
    }
    console.log(`PASS all eight pages at ${width}px`);
  }
  await p.setViewportSize({ width: 1440, height: 1100 });
  await p.goto("http://127.0.0.1:3000");
  await p.locator(".overview-stats").waitFor();
  await p.getByRole("button", { name: "Design a cozy village" }).click();
  await expect(p.getByRole("textbox", { name: "Request to Lead" })).toHaveValue(
    "Design a cozy village",
  );
  await p.keyboard.press("Control+k");
  const dialog = p.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Tester");
  await dialog.getByRole("link", { name: "Tester Agents" }).click();
  await expect(
    p.getByRole("heading", { name: "Tester configuration" }),
  ).toBeVisible();
  await p
    .locator(".team-card")
    .filter({ has: p.getByRole("heading", { name: "Builder", exact: true }) })
    .click();
  await p.waitForTimeout(1800);
  await expect(
    p.getByRole("heading", { name: "Builder configuration" }),
  ).toBeVisible();
  await p.getByRole("link", { name: "Open Frame agent" }).click();
  await p.waitForTimeout(1600);
  await expect(
    p.getByRole("heading", { name: "Frame configuration" }),
  ).toBeVisible();
  await p.keyboard.press("Control+k");
  await expect(p.getByRole("dialog")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.getByRole("dialog")).toHaveCount(0);
  console.log(
    "PASS quick prompts, keyboard search, Escape, and persistent agent selection",
  );
  // Test the populated branch in the browser only; no sample data enters SQLite.
  const real = await (
    await p.request.get("http://127.0.0.1:3000/api/snapshot")
  ).json();
  const fixture = structuredClone(real);
  fixture.keyConfigured = true;
  fixture.settings.studioStatus = "connected";
  fixture.games = [{ id: "ui-test-game", name: "UI test game" }];
  fixture.runs = [
    { id: "ui-test-run", game_id: "ui-test-game", status: "active" },
  ];
  fixture.tasks = [
    {
      id: "ui-test-task",
      run_id: "ui-test-run",
      agent: "Builder",
      title: "UI test pending change",
      status: "approval",
      steps: 2,
    },
  ];
  fixture.approvals = [
    {
      id: "ui-test-approval",
      task_id: "ui-test-task",
      tool: "multi_edit",
      status: "pending",
    },
  ];
  await p.route("**/api/snapshot", (r) => r.fulfill({ json: fixture }));
  await p.goto("http://127.0.0.1:3000");
  await expect(
    p.getByRole("heading", { name: "UI test pending change" }),
  ).toBeVisible();
  await expect(p.getByRole("link", { name: "Review change" })).toHaveAttribute(
    "href",
    "/reviews",
  );
  await expect(p.locator(".setup-panel")).toHaveCount(0);
  console.log("PASS populated approval surface (browser-only test fixture)");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS no browser page errors");
} finally {
  await b.close();
}
