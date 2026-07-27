// ストーリー画像PNG書き出し（1080x1920）。puppeteer は banner-assets のものを流用。
// 使い方: node render-story.cjs [htmlファイル名]  （省略時 story-line-qr.html）
const path = require("path");
const { createRequire } = require("module");
const bannerRequire = createRequire(
  path.resolve(__dirname, "../../../../banner-assets/package.json"),
);
const puppeteer = bannerRequire("puppeteer");

const htmlFile = process.argv[2] || "story-line-qr.html";
const outFile = htmlFile.replace(/\.html$/, ".png");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const file = "file:///" + path.resolve(__dirname, htmlFile).replace(/\\/g, "/");
  await page.goto(file, { waitUntil: "networkidle0" });
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await new Promise((r) => setTimeout(r, 400));
  const el = await page.$(".story");
  await el.screenshot({ path: path.resolve(__dirname, outFile) });
  await browser.close();
  const { statSync } = require("fs");
  const kb = Math.round(statSync(path.resolve(__dirname, outFile)).size / 1024);
  console.log(`done: ${outFile} (${kb} KB)`);
})();
