import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const path of [
  "/",
  "/chat",
  "/team",
  "/tasks",
  "/games",
  "/reviews",
  "/logs",
  "/settings",
]) {
  const response = await page.goto("http://127.0.0.1:3000" + path);
  if (response.status() !== 200)
    throw new Error(`${path}: ${response.status()}`);
  await page.waitForSelector(".footer");
  await page.waitForTimeout(350);
  if (await page.locator(".alert.error").count())
    throw new Error(await page.locator(".alert.error").innerText());
  console.log(`PASS ${path}`);
}
await page.goto("http://127.0.0.1:3000");
await page.waitForSelector(".stats");
await page.screenshot({
  path: "artifacts/overview-desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "artifacts/overview-mobile.png",
  fullPage: true,
});
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw new Error("Mobile horizontal overflow");
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
console.log("PASS browser console and mobile layout");
