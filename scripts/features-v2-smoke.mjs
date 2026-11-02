// Integration tests run against an explicitly isolated worker database only.
import { chromium, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const dataDir = process.env.FORGE_DATA_DIR;
if (!dataDir || !resolve(dataDir).startsWith("/tmp/forge-v2-"))
  throw new Error(
    "Use an isolated /tmp/forge-v2-* FORGE_DATA_DIR for both worker and Next.js, then run this script with the same variable.",
  );
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://127.0.0.1:3000";
async function api(path, body) {
  const r = await page.request.post(`${base}/api/${path}`, { data: body });
  const value = await r.json();
  if (!r.ok()) throw new Error(`${path}: ${JSON.stringify(value)}`);
  return value;
}
async function snapshot() {
  return (await page.request.get(`${base}/api/snapshot`)).json();
}
try {
  await page.goto(base);
  await page.locator(".overview-stats").waitFor();
  if (!(await snapshot()).settings.paused) {
    await page.getByRole("button", { name: "Pause team", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Pause all agents?" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect((await snapshot()).settings.paused).toBe(false);
  }
  await api("pause", { paused: true });
  await page.goto(`${base}/games`);
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add a project" });
  await dialog
    .getByLabel("Game name", { exact: true })
    .fill("Browser verification project");
  await dialog
    .getByLabel("Studio instance ID", { exact: true })
    .fill("test-only-studio");
  await dialog
    .getByRole("button", { name: "Add project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const project = (await snapshot()).games.find(
    (g) => g.name === "Browser verification project",
  );
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit project" });
  await dialog.getByLabel("Lifecycle stage").selectOption("testing");
  await dialog.getByLabel("Roblox universe ID").fill("123456");
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .locator(".topbar")
    .getByRole("button", { name: "New task", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "New task" });
  await dialog
    .getByLabel("Objective", { exact: true })
    .fill("Browser verification checkpoint");
  await dialog.getByLabel("Assign to").selectOption("Builder");
  await dialog.getByLabel("Priority", { exact: true }).selectOption("2");
  await dialog
    .getByLabel("Acceptance criteria", { exact: true })
    .fill("Verify that checkpoint respawning works in Studio.");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  let real = await snapshot();
  const task = real.tasks.find(
    (t) => t.title === "Browser verification checkpoint",
  );
  expect(task.priority).toBe(2);
  await page.goto(`${base}/tasks?task=${task.id}`);
  await expect(page.locator(`#task-${task.id}`)).toHaveAttribute("open", "");
  let details = page.locator(`#task-${task.id}`);
  await expect(details).toContainText(
    "Verify that checkpoint respawning works in Studio.",
  );
  await details.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(details.locator(".badge").first()).toHaveText("paused");
  await details.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(details.locator(".badge").first()).toHaveText("queued");
  await details
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cancel this task?" })
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await expect(details.locator(".badge").first()).toHaveText("cancelled");
  console.log(
    "PASS real project creation, metadata, structured task creation, priority, deep links and safe task controls",
  );

  await page.goto(`${base}/games`);
  await page.getByRole("button", { name: "Charts", exact: true }).click();
  await page
    .getByRole("button", { name: "Import analytics", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Import analytics" });
  const telemetry = {
    gameId: project.id,
    source: "https://example.test/authorized-analytics-export",
    fetchedAt: "2026-10-31T00:00:00Z",
    quality: "sampled",
    metrics: [
      {
        metric: "dau",
        points: [
          { at: "2026-10-29T00:00:00Z", value: 42 },
          { at: "2026-10-30T00:00:00Z", value: 52 },
        ],
      },
      {
        metric: "session",
        points: [
          { at: "2026-10-29T00:00:00Z", value: 8 },
          { at: "2026-10-30T00:00:00Z", value: 9 },
        ],
      },
    ],
  };
  await dialog
    .getByLabel("Export JSON", { exact: true })
    .fill(JSON.stringify(telemetry));
  await dialog
    .getByRole("button", { name: "Import export", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Daily active users, 2 observations" }),
  ).toBeVisible();
  await expect(page.locator(".v2-source-banner")).toContainText("sampled");
  const source = "https://example.test/permitted-market-export";
  for (const [date, players] of [
    ["2026-10-29T00:00:00Z", 100],
    ["2026-10-30T00:00:00Z", 125],
  ]) {
    await page.goto(`${base}/market`);
    await page
      .getByRole("button", { name: "Import market snapshot", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Import market snapshot" });
    await dialog.getByLabel("Export JSON", { exact: true }).fill(
      JSON.stringify({
        source,
        fetchedAt: date,
        quality: "exported",
        category: "Browser verification cohort",
        games: [
          {
            universeId: "123",
            title: "Browser evidence game",
            players,
            rank: 3,
            likes: 75,
            votes: 100,
            visits: 5000,
            genre: "Adventure",
          },
        ],
      }),
    );
    await dialog
      .getByRole("button", { name: "Import export", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Opportunities", exact: true })
    .click();
  await expect(page.locator(".v2-market-table")).toContainText("+25");
  await page.getByRole("link", { name: "Use in a pitch", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "New pitch" });
  await dialog
    .getByLabel("Concept title", { exact: true })
    .fill("Browser verification pitch");
  await dialog
    .getByLabel("One-sentence hook", { exact: true })
    .fill("A cooperative checkpoint game with a testable first-minute loop.");
  await dialog
    .getByLabel("MVP scope", { exact: true })
    .fill("One checkpoint, one verified playtest.");
  await dialog
    .getByRole("button", { name: "Save pitch version", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit / new version", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Revise pitch" });
  await dialog
    .getByLabel("One-sentence hook", { exact: true })
    .fill(
      "A revised cooperative checkpoint game with an explicit validation goal.",
    );
  await dialog
    .getByRole("button", { name: "Save pitch version", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".v2-pitch-hero")).toContainText("Version 2");
  await page.getByRole("button", { name: "Accept pitch", exact: true }).click();
  await page
    .getByRole("button", { name: "Convert to project", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Convert accepted pitch" });
  await dialog
    .getByLabel("Queue Lead to plan the MVP, with approval before execution")
    .check();
  await dialog
    .getByRole("button", { name: "Create / update project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  real = await snapshot();
  const converted = real.games.find((g) => g.pitch_id);
  expect(converted.stage).toBe("concept");
  expect(
    real.tasks.some(
      (t) =>
        real.runs.find((r) => r.id === t.run_id)?.game_id === converted.id &&
        t.agent === "Lead",
    ),
  ).toBe(true);
  console.log(
    "PASS imported chart data and quality, sourced market comparison, evidence-linked pitch editing/versioning and project/task conversion",
  );

  // This database is explicitly isolated above. Seed a producing task's artifact
  // to exercise real review mutations without making a paid model call.
  const db = new Database(resolve(dataDir, "forge.sqlite"));
  const artifactId = `browser-review-artifact-${Date.now()}`;
  db.prepare(
    "INSERT INTO assets(id,game_id,task_id,name,kind,mime,url,status,source) VALUES (?,?,?,?,?,?,?,'pending',?)",
  ).run(
    artifactId,
    project.id,
    task.id,
    "Browser review artifact",
    "image",
    "image/svg+xml",
    "/library/workflow.svg",
    "Browser-only verification fixture",
  );
  db.prepare("UPDATE tasks SET status='completed' WHERE id=?").run(task.id);
  db.close();
  await page.goto(`${base}/reviews`);
  await page.getByRole("button", { name: "artifacts", exact: true }).click();
  await page.getByRole("button", { name: /Browser review artifact/ }).click();
  dialog = page.getByRole("dialog", { name: "Browser review artifact" });
  await expect(
    dialog.getByRole("button", { name: "Fullscreen preview" }),
  ).toBeVisible();
  await dialog.getByRole("slider", { name: "Image zoom" }).fill("1.5");
  await dialog
    .getByLabel("Review note", { exact: true })
    .fill("Make the checkpoint marker more visible.");
  await dialog
    .getByRole("button", { name: "Ask for changes", exact: true })
    .click();
  await expect(dialog.locator(".badge").first()).toHaveText(
    "changes requested",
  );
  await expect(
    dialog.getByRole("link", { name: "Open revision task", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`${base}/library?tab=assets`);
  await page.getByRole("button", { name: "Import asset", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Import an asset" });
  await dialog.getByLabel("Name", { exact: true }).fill("Browser local PNG");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVuoAAAAASUVORK5CYII=",
    "base64",
  );
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await dialog
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  dialog = page.getByRole("dialog", { name: "Browser local PNG" });
  await expect(
    dialog.getByRole("link", { name: "Download file", exact: true }),
  ).toBeVisible();
  const href = await dialog
    .getByRole("link", { name: "Download file", exact: true })
    .getAttribute("href");
  const binary = await page.request.get(`${base}${href}`);
  expect(binary.headers()["content-type"]).toBe("image/png");
  expect(Buffer.compare(await binary.body(), png)).toBe(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "systems", exact: true }).click();
  await page.getByRole("button", { name: "Add system", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add reusable system" });
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("Browser reusable system");
  await dialog
    .getByLabel("Script, module, or system documentation", { exact: true })
    .fill('print("stored as text, never executed")');
  await dialog
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  dialog = page.getByRole("dialog", { name: "Browser reusable system" });
  await expect(dialog.locator("pre")).toContainText("never executed");
  await dialog
    .getByRole("button", { name: "Archive from library", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Archive this asset?" })
    .getByRole("button", { name: "Archive asset", exact: true })
    .click();
  await expect(dialog.locator(".badge").first()).toHaveText("archived");
  await page.keyboard.press("Escape");
  console.log(
    "PASS artifact media controls and linked revision, validated binary upload/download, reusable systems and archive history",
  );

  await mkdir("artifacts/v2", { recursive: true });
  const full = process.argv.includes("--full");
  for (const width of full ? [1440, 768, 390] : [390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of full
      ? [
          "/",
          "/chat",
          "/team",
          "/tasks",
          "/games",
          "/reviews",
          "/market",
          "/pitches",
          "/library",
          "/library?tab=assets",
          "/library?tab=systems",
          "/logs",
          "/settings",
        ]
      : [
          "/chat",
          "/team",
          "/tasks",
          "/games",
          "/reviews",
          "/market",
          "/pitches",
          "/library?tab=assets",
        ]) {
      await page.goto(base + route);
      await page.locator(".footer").waitFor();
      await page.waitForTimeout(250);
      await expect(page.locator(".alert.error")).toHaveCount(0);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`Overflow ${route} at ${width}`);
    }
    console.log(`PASS all existing and new views at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of [
    "/",
    "/team",
    "/tasks",
    "/market",
    "/pitches",
    "/library?tab=assets",
  ]) {
    await page.goto(base + route);
    await page.locator(".footer").waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `artifacts/v2/${route === "/" ? "home" : route.slice(1).replace(/[^a-z]/g, "-")}-desktop.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/market`);
  await page.locator(".v2-source-banner").waitFor();
  await page.screenshot({ path: "artifacts/v2/market-mobile.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS no browser page errors; V2 screenshots captured using the isolated test database",
  );
} finally {
  await browser.close();
}
