// Browser-only fixtures exercise reviews without submitting work to the worker.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const origin = "http://127.0.0.1:3000";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1540, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const original = await (
    await page.request.get(`${origin}/api/snapshot`)
  ).json();
  const fixture = structuredClone(original);
  fixture.games = [
    { id: "test-game", name: "Review test game", studio_id: "fixture" },
  ];
  fixture.runs = [
    {
      id: "active",
      game_id: "test-game",
      request: "Build the checkpoint",
      status: "active",
    },
    {
      id: "finished",
      game_id: "test-game",
      request: "Verified checkpoint",
      status: "review",
      created: "2026-11-02 08:00:00",
    },
  ];
  const task = (id, agent, run_id, result = "") => ({
    id,
    agent,
    run_id,
    title: `${agent} deliverable`,
    instructions: "Inspect this test deliverable in Studio.",
    status: run_id === "finished" ? "completed" : "approval",
    deps: "[]",
    result,
    steps: 2,
    attempts: 1,
    created: "2026-11-02 08:00:00",
  });
  fixture.tasks = [
    task("builder", "Builder", "active"),
    task("frame", "Frame", "active"),
    task("scenic", "Scenic", "active"),
    task(
      "tester",
      "Tester",
      "finished",
      "Checkpoint verified using Studio evidence.\n![Screenshot](/library/workflow.svg)",
    ),
  ];
  fixture.approvals = [
    ...[1, 2, 3, 4, 5, 6].map((i) => ({
      id: `asset-${i}`,
      task_id: i <= 2 ? "frame" : "scenic",
      tool: "upload_image",
      args: JSON.stringify({
        image_url: [
          "/library/workflow.svg",
          "/library/security.svg",
          "/library/performance.svg",
        ][(i - 1) % 3],
      }),
      status: "pending",
      created: "2026-11-02 08:00:00",
    })),
    ...[1, 2, 3].map((i) => ({
      id: `code-${i}`,
      task_id: "builder",
      tool: "multi_edit",
      args: JSON.stringify({
        source: `-- Review fixture ${i}\nprint("Checkpoint ready")`,
      }),
      status: "pending",
      created: "2026-11-02 08:00:00",
    })),
  ];
  fixture.uncertain = [
    {
      id: "uncertain",
      tool: "execute_luau",
      args: '{"source":"-- inspect this operation"}',
    },
  ];
  let failId = "code-2";
  const decisions = [];
  const reviews = [];
  const resolutions = [];
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route("**/api/approve", async (route) => {
    const body = route.request().postDataJSON();
    decisions.push(body);
    const approval = fixture.approvals.find((a) => a.id === body.id);
    if (body.id === failId || approval?.status !== "pending")
      return route.fulfill({
        status: 409,
        json: { error: "Approval is no longer pending" },
      });
    approval.status = body.approved ? "approved" : "rejected";
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/review", async (route) => {
    const body = route.request().postDataJSON();
    reviews.push(body);
    fixture.runs.find((r) => r.id === body.id).status = body.accepted
      ? "accepted"
      : "active";
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/resolve", async (route) => {
    const body = route.request().postDataJSON();
    resolutions.push(body);
    fixture.uncertain = fixture.uncertain.filter((c) => c.id !== body.id);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`${origin}/reviews`);
  await expect(page.locator(".review-card")).toHaveCount(10);
  await expect(
    page.getByRole("heading", { name: "Asset changes", exact: true }).first(),
  ).toBeVisible();
  for (const width of [1540, 1440, 1024, 900, 768, 540, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error(`Review overflow at ${width}`);
  }
  await mkdir("artifacts", { recursive: true });
  await page.setViewportSize({ width: 1540, height: 960 });
  await page.screenshot({ path: "artifacts/review-populated-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/review-populated-mobile.png" });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const mobile = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(mobile).toBeVisible();
  await mobile.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(mobile).not.toBeVisible();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goto(`${origin}/reviews`);
  await page.setViewportSize({ width: 1540, height: 960 });
  const studio = page.locator(".review-group").filter({
    has: page.getByRole("heading", { name: "Studio changes", exact: true }),
  });
  await studio
    .getByRole("button", { name: "Approve all 3", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Approve 3 changes?" })
    .getByRole("button", { name: "Approve changes", exact: true })
    .click();
  await expect(page.locator(".alert.error")).toContainText(
    "Approval is no longer pending",
  );
  await expect(page.locator(".batch-notice")).toHaveText(
    "1 of 3 approvals recorded. Remaining items still need review.",
  );
  expect(decisions.map((d) => d.id)).toEqual(["code-1", "code-2"]);
  failId = "";
  await studio.getByRole("button", { name: "Reject all", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Reject 2 changes?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(decisions).toHaveLength(2);
  await studio.getByRole("button", { name: "Reject all", exact: true }).click();
  await confirm
    .getByRole("button", { name: "Reject changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(decisions.slice(2)).toEqual([
    { id: "code-2", approved: false },
    { id: "code-3", approved: false },
  ]);
  console.log(
    "PASS group boundaries, partial batch failure, rejection confirmation and cancellation",
  );

  await page
    .getByRole("button", { name: "Review Frame deliverable", exact: true })
    .first()
    .click();
  let drawer = page.getByRole("dialog", { name: "Frame deliverable" });
  await expect(drawer.locator(".drawer-media img")).toHaveCount(1);
  await expect(drawer).toContainText("upload_image · exact arguments");
  await expect(drawer).toContainText(
    "Inspect this test deliverable in Studio.",
  );
  await page.screenshot({ path: "artifacts/review-detail-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await drawer.evaluate((element) => element.scrollWidth > innerWidth))
    throw new Error("Mobile drawer overflow");
  await page.screenshot({ path: "artifacts/review-detail-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Review Frame deliverable", exact: true })
      .first(),
  ).toBeFocused();
  await page.setViewportSize({ width: 1540, height: 960 });
  await page
    .getByRole("button", { name: "Review Frame deliverable", exact: true })
    .first()
    .click();
  drawer = page.getByRole("dialog", { name: "Frame deliverable" });
  await drawer
    .getByRole("button", { name: "Approve change", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  expect(decisions.at(-1)).toMatchObject({ id: "asset-1", approved: true });
  console.log(
    "PASS asset preview, task context, exact arguments, Escape and individual approval",
  );

  await page
    .getByRole("button", { name: "Review Verified checkpoint", exact: true })
    .click();
  drawer = page.getByRole("dialog", { name: "Verified checkpoint" });
  await drawer
    .getByRole("textbox", { name: "Request revisions" })
    .fill("Add a second checkpoint and verify respawning.");
  await drawer
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  expect(reviews.at(-1)).toEqual({
    id: "finished",
    accepted: false,
    feedback: "Add a second checkpoint and verify respawning.",
  });
  fixture.runs.find((r) => r.id === "finished").status = "review";
  await page.getByRole("button", { name: "Refresh workspace" }).click();
  await page
    .getByRole("button", { name: "Review Verified checkpoint", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Accept work", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Accepted work", exact: true }),
  ).toBeVisible();
  expect(reviews.at(-1)).toEqual({ id: "finished", accepted: true });
  await page
    .getByRole("textbox", { name: "Inspection evidence", exact: true })
    .fill("Inspected Studio; this change was already applied.");
  await page
    .getByRole("button", { name: "Record outcome", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Needs inspection", exact: true }),
  ).toHaveCount(0);
  expect(resolutions.at(-1)).toEqual({
    id: "uncertain",
    executed: true,
    evidence: "Inspected Studio; this change was already applied.",
  });
  console.log(
    "PASS revision feedback, acceptance, review history and uncertain-operation recovery",
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS responsive populated reviews, mobile navigation, modal focus and browser errors",
  );
} finally {
  await browser.close();
}
