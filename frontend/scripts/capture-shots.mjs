/**
 * Capture presentable phone-framed screenshots from /shots/*.
 *   cd frontend && npx playwright install chromium
 *   pnpm dev   # in another terminal
 *   node scripts/capture-shots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const screens = [
  ["signin", "01-signin"],
  ["home", "02-home"],
  ["confirm", "03-confirm"],
  ["jars", "04-jars"],
  ["buy-review", "05-buy-review"],
  ["buy-done", "06-buy-done"],
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "screenshots");
const base = process.env.SHOTS_URL || "http://localhost:3000";

mkdirSync(root, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome", // system Chrome — skip Playwright browser download
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 520, height: 980 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
page.setDefaultTimeout(60_000);

for (const [slug, file] of screens) {
  await page.goto(`${base}/shots/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-shot="${slug}"]`, { timeout: 60_000 });
  await page.waitForSelector('[data-shot-ready="1"]', { timeout: 60_000 });
  await page.waitForTimeout(500);
  const phone = page.locator(`[data-shot="${slug}"]`);
  const out = join(root, `${file}.png`);
  await phone.screenshot({ path: out, type: "png" });
  console.log("wrote", out);
}

await browser.close();
console.log("done →", root);
