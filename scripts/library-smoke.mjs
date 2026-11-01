import { chromium, expect } from "@playwright/test";
const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto("http://127.0.0.1:3000/library");
  await expect(p.locator(".reference-card")).toHaveCount(31);
  await p.getByRole("textbox", { name: "Search library" }).fill("RemoteEvent");
  await expect(p.locator(".reference-card").first()).toBeVisible();
  await p.locator(".reference-card .reference-open").first().click();
  await expect(p.locator(".reference-markdown")).toBeVisible();
  await expect(p.locator(".reference-advice")).toBeVisible();
  await p.screenshot({
    path: "artifacts/library-guide-desktop.png",
    fullPage: true,
  });
  await p
    .locator(".reader-toolbar")
    .getByRole("button", { name: "All references", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Add reference", exact: true })
    .first()
    .click();
  await p.getByLabel("Title", { exact: true }).fill("Library smoke test guide");
  await p
    .getByLabel("Guide or notes (Markdown)")
    .fill("# Example\nA stellarquartz reference for testing persistence.");
  await p.getByRole("button", { name: "Save reference", exact: true }).click();
  await expect(p.locator(".reference-reader h2")).toHaveText(
    "Library smoke test guide",
  );
  await p.reload();
  await p
    .getByRole("textbox", { name: "Search library" })
    .fill("stellarquartz");
  await expect(p.locator(".reference-card")).toHaveCount(1);
  await p.locator(".reference-open").click();
  await p.getByRole("button", { name: "Save reference", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Unsave reference", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Edit reference", exact: true }).click();
  await p.getByLabel("Title", { exact: true }).fill("Edited smoke guide");
  await p.getByRole("button", { name: "Save reference", exact: true }).click();
  await expect(p.locator(".reference-reader h2")).toHaveText(
    "Edited smoke guide",
  );
  p.once("dialog", (d) => d.accept());
  await p
    .getByRole("button", { name: "Delete reference", exact: true })
    .click();
  await expect(p.locator(".reference-reader")).toHaveCount(0);
  await p.getByRole("textbox", { name: "Search library" }).fill("");
  await expect(p.locator(".reference-card")).toHaveCount(31);
  await p.screenshot({ path: "artifacts/library-desktop.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error("Mobile overflow");
  await p.screenshot({ path: "artifacts/library-mobile.png", fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS official search/read, personal create/reload/edit/delete, bookmark and mobile layout",
  );
} finally {
  await b.close();
}
