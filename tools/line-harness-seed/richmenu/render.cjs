// リッチメニューPNG書き出し（2500x843）。puppeteer は banner-assets のものを流用。
// 実行: node render.cjs
const path = require("path");
const { createRequire } = require("module");
const bannerRequire = createRequire(
  path.resolve(__dirname, "../../../../banner-assets/package.json"),
);
const puppeteer = bannerRequire("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 2500, height: 843, deviceScaleFactor: 1 });
  const file = "file:///" + path.resolve(__dirname, "richmenu.html").replace(/\\/g, "/");
  await page.goto(file, { waitUntil: "networkidle0" });
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await new Promise((r) => setTimeout(r, 400));
  const el = await page.$(".menu");
  await el.screenshot({ path: path.resolve(__dirname, "richmenu.png") });
  await browser.close();
  const { statSync } = require("fs");
  const kb = Math.round(statSync(path.resolve(__dirname, "richmenu.png")).size / 1024);
  console.log(`done: richmenu.png (${kb} KB / 上限1024KB)`);
})();
