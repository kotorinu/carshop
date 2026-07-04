// リッチメニュー: 画像生成(banner-assetsのPuppeteer流用) → API登録 → 全ユーザー既定に設定
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const puppeteer = require("C:/Users/jupit/workspace/banner-assets/node_modules/puppeteer");

const TOKEN = process.env.LINE_TOKEN;
if (!TOKEN) { console.error("LINE_TOKEN required"); process.exit(1); }

const OUT = path.join(process.cwd(), "richmenu.png");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{width:2500px;height:843px;font-family:"Yu Gothic UI","Meiryo",sans-serif;
    background:linear-gradient(135deg,#0E2A47 0%,#0A1E33 100%);display:flex;color:#fff;}
  .cell{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:28px;position:relative;}
  .cell+.cell::before{content:"";position:absolute;left:0;top:120px;bottom:120px;width:2px;background:rgba(232,184,75,0.35);}
  .icon{font-size:170px;line-height:1;}
  .label{font-size:88px;font-weight:900;letter-spacing:0.04em;}
  .sub{font-size:40px;color:#E8B84B;font-weight:700;}
  .bar{width:180px;height:10px;background:#E8B84B;border-radius:5px;}
</style></head><body>
  <div class="cell"><div class="icon">🚙</div><div class="label">在庫をみる</div><div class="bar"></div><div class="sub">支払総額表示</div></div>
  <div class="cell"><div class="icon">💰</div><div class="label">無料査定</div><div class="bar"></div><div class="sub">写真3枚でOK</div></div>
  <div class="cell"><div class="icon">📅</div><div class="label">来店予約</div><div class="bar"></div><div class="sub">現車確認歓迎</div></div>
</body></html>`;

console.log("1) 画像生成中...");
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 2500, height: 843 });
await page.setContent(html, { waitUntil: "networkidle0" });
await page.screenshot({ path: OUT });
await browser.close();
console.log("   " + OUT, fs.statSync(OUT).size, "bytes");

const menu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: `main-menu-${new Date().toISOString().slice(0, 10)}`,
  chatBarText: "メニュー",
  areas: [
    { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "postback", data: "menu=inventory", displayText: "在庫を見たい" } },
    { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "postback", data: "menu=appraisal", displayText: "無料査定をしたい" } },
    { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "postback", data: "menu=booking", displayText: "来店予約したい" } },
  ],
};

const H = { Authorization: `Bearer ${TOKEN}` };
console.log("2) リッチメニュー作成...");
let r = await fetch("https://api.line.me/v2/bot/richmenu", {
  method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(menu),
});
if (!r.ok) { console.error("create failed:", r.status, await r.text()); process.exit(1); }
const { richMenuId } = await r.json();
console.log("   id:", richMenuId);

console.log("3) 画像アップロード...");
r = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: "POST", headers: { ...H, "Content-Type": "image/png" }, body: fs.readFileSync(OUT),
});
if (!r.ok) { console.error("upload failed:", r.status, await r.text()); process.exit(1); }

console.log("4) 全ユーザーの既定メニューに設定...");
r = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST", headers: H });
if (!r.ok) { console.error("set default failed:", r.status, await r.text()); process.exit(1); }
console.log("✅ リッチメニュー公開完了:", richMenuId);
