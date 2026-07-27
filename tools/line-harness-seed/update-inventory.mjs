// 在庫カルーセル更新: kotokoto-company-siteのcars.jsonからFlexカルーセルを生成し、
// 自動応答「在庫」をPUT/POSTする。在庫が変わったら再実行するだけ（冪等）。
// 使い方: WORKER_URL=... API_KEY=... node update-inventory.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARS_JSON = join(__dirname, "..", "..", "..", "kotokoto-company-site", "data", "cars.json");
// 環境変数が無ければ carshop/.env から読む（タスクスケジューラからの自動実行対応）
const envFile = {};
try {
  for (const line of readFileSync(join(__dirname, "..", "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) envFile[m[1]] = m[2];
  }
} catch {}
const WORKER = (process.env.WORKER_URL || envFile.HARNESS_WORKER_URL || "https://carshop-line-harness.jupitercoring.workers.dev").replace(/\/$/, "");
const KEY = process.env.API_KEY || envFile.HARNESS_API_KEY;
const NAVY = "#122a52";
const MAX_CARS = 12; // LINE Flexカルーセル上限

async function api(method, path, body) {
  const res = await fetch(`${WORKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 250)}`);
  }
  return json.data;
}

const cars = JSON.parse(readFileSync(CARS_JSON, "utf8"))
  .filter((c) => c.published && !c.sold)
  .sort((a, b) => a.price - b.price)
  .slice(0, MAX_CARS);

if (cars.length === 0) {
  console.error("公開中の在庫が0台です。カルーセルは更新しません。");
  process.exit(1);
}

const bubble = (c) => {
  const title = `${c.maker} ${c.name}`.trim();
  const specs = [
    `${c.year}年式`,
    c.mileage != null ? `走行${c.mileage}万km` : null,
    c.inspection ? `車検 ${String(c.inspection).replace(/ /g, "")}` : null,
  ].filter(Boolean).join("・");
  const csUrl = `https://www.carsensor.net/usedcar/detail/${c.csId}/index.html`;
  return {
    type: "bubble",
    size: "kilo",
    hero: { type: "image", url: c.carsensorMainPhoto, size: "full", aspectRatio: "4:3", aspectMode: "cover" },
    body: {
      type: "box", layout: "vertical", spacing: "xs",
      contents: [
        { type: "text", text: title, weight: "bold", size: "md", wrap: true },
        ...(c.grade ? [{ type: "text", text: c.grade, size: "xxs", color: "#888888", wrap: true }] : []),
        { type: "text", text: specs, size: "xxs", color: "#888888", wrap: true, margin: "sm" },
        {
          type: "box", layout: "baseline", margin: "sm",
          contents: [
            { type: "text", text: "支払総額", size: "xs", color: "#b08d3f", flex: 0 },
            { type: "text", text: `${c.price}万円`, size: "xl", weight: "bold", color: "#b08d3f", margin: "sm" },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        {
          type: "button", style: "primary", color: NAVY, height: "sm",
          action: { type: "message", label: "この車について聞く", text: `${title}について聞きたい` },
        },
        {
          type: "button", style: "link", height: "sm",
          action: { type: "uri", label: "詳細を見る（カーセンサー）", uri: csUrl },
        },
      ],
    },
  };
};

const carousel = { type: "carousel", contents: cars.map(bubble) };

const replies = await api("GET", "/api/auto-replies");
const existing = (replies ?? []).find((r) => r.keyword === "在庫");
const payload = {
  keyword: "在庫",
  matchType: "contains",
  responseType: "flex",
  responseContent: JSON.stringify(carousel),
};
if (existing) {
  await api("PUT", `/api/auto-replies/${existing.id}`, payload);
  console.log(`自動応答「在庫」カルーセル更新（${cars.length}台・安い順）`);
} else {
  await api("POST", "/api/auto-replies", payload);
  console.log(`自動応答「在庫」カルーセル新規作成（${cars.length}台・安い順）`);
}
for (const c of cars) console.log(`  ${c.maker} ${c.name} ${c.price}万円`);
