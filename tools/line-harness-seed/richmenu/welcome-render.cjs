// ウェルカムhero PNG書き出し（1040x676）。puppeteer は banner-assets のものを流用。
// 実行: node welcome-render.cjs
const path = require("path");
const { createRequire } = require("module");
const bannerRequire = createRequire(
  path.resolve(__dirname, "../../../../banner-assets/package.json"),
);
const puppeteer = bannerRequire("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1040, height: 676, deviceScaleFactor: 1 });
  const file = "file:///" + path.resolve(__dirname, "welcome-hero.html").replace(/\\/g, "/");
  await page.goto(file, { waitUntil: "networkidle0" });
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await new Promise((r) => setTimeout(r, 400));
  const el = await page.$(".hero");
  await el.screenshot({ path: path.resolve(__dirname, "welcome-hero.png") });
  await browser.close();
  const { statSync } = require("fs");
  const kb = Math.round(statSync(path.resolve(__dirname, "welcome-hero.png")).size / 1024);
  console.log(`done: welcome-hero.png (${kb} KB)`);
})();
