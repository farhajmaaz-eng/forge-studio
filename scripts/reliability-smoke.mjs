// Focused production-UI integration against an explicitly isolated real backend.
// Never enters an actual credential or makes an inference request.
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
if (
  !resolve(process.env.FORGE_DATA_DIR || ".data").startsWith(
    "/tmp/forge-audit-",
  )
)
  throw new Error(
    "Use the same isolated /tmp/forge-audit-* data directory for worker, dashboard and this check.",
  );
const base = "http://127.0.0.1:3000";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function api(path, body) {
  const r = await page.request.post(`${base}/api/${path}`, { data: body });
  const out = await r.json();
  expect(r.ok(), JSON.stringify(out)).toBe(true);
  return out;
}
async function snapshot() {
  return (await page.request.get(`${base}/api/snapshot`)).json();
}
try {
  await api("pause", { paused: true });
  await page.goto(`${base}/settings`);
  const key = page.getByRole("textbox", { name: "Provider API key" });
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute("type", "password");
  await page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="openrouter"]') })
    .selectOption("openrouter");
  const fake = "test-openrouter-key-never-used-for-inference";
  await key.fill(fake);
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Provider saved." }),
  ).toBeVisible();
  await expect(key).toHaveValue("");
  let data = await snapshot();
  expect(data.provider.id).toBe("openrouter");
  expect(data.provider.configured).toBe(true);
  expect(JSON.stringify(data)).not.toContain(fake);
  for (const a of data.agents)
    expect(a.model).toBe("deepseek/deepseek-v4.1-flash");
  await page.reload();
  await expect(key).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Remove key", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Concurrent agents (1–3)").fill("2");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).settings.concurrency)
    .toBe(2);
  await page.getByRole("button", { name: "Remove key", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Remove this provider key?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove key", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await snapshot()).provider.configured).toBe(false);
  console.log(
    "PASS provider selection, private masked key persistence, recommended assignments and concurrency settings",
  );
  // The scheduler can safely exercise the missing-key failure: no request can be sent.
  await api("games", {
    name: "Reliability browser check",
    studioId: "test-studio",
  });
  const project = (await snapshot()).games.find(
    (g) => g.name === "Reliability browser check",
  );
  const request = await api("tasks/create", {
    gameId: project.id,
    agent: "Architect",
    objective: "Verify missing-key progress reporting",
    acceptance: "A missing key produces an actionable failure",
  });
  await page.goto(`${base}/tasks?task=${request.taskId}`);
  await expect(page.locator(`#task-${request.taskId}`)).toContainText("queued");
  await api("pause", { paused: false });
  await expect
    .poll(
      async () =>
        (await snapshot()).tasks.find((t) => t.id === request.taskId).status,
      { timeout: 15000 },
    )
    .toBe("failed");
  const task = page.locator(`#task-${request.taskId}`);
  await expect(task).toContainText("failed", { timeout: 10000 });
  await expect(task).toContainText("API key is missing");
  await expect(
    task.getByRole("button", { name: "Retry task", exact: true }),
  ).toBeVisible();
  expect(
    (await snapshot()).tasks.find((t) => t.id === request.taskId).attempts,
  ).toBe(1);
  await api("pause", { paused: true });
  console.log(
    "PASS real queued-to-failed task progress, actionable errors and no permanent-error retry loop",
  );
  await page.goto(`${base}/team?agent=Architect`);
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveValue(
    "deepseek/deepseek-v4.1-flash",
  );
  await page
    .getByText("Model routing, limits & parameters", { exact: true })
    .click();
  await expect(page.getByLabel("Request timeout (milliseconds)")).toBeVisible();
  await expect(
    page.getByLabel("OpenRouter provider routing (JSON)"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["/settings", "/tasks"]) {
    await page.goto(base + route);
    await expect(page.locator(".topbar")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS model configuration, focused mobile layouts and browser console",
  );
} finally {
  await api("pause", { paused: true }).catch(() => {});
  await browser.close();
}
