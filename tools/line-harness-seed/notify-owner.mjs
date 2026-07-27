// オーナー通知の番人: フォーム新着回答・未対応チャット増加を検知して琴音さんのLINEへpush。
// Harnessの通知ルール機能は廃止済み（inbox化）のため外付けで実現。15分毎のタスクスケジューラで実行。
// 使い方: node notify-owner.mjs   （設定はcarshop/.envから読む）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, ".notify-state.json");

// .env 自前パース（依存ゼロ）
const env = {};
for (const line of readFileSync(join(__dirname, "..", "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const WORKER = (env.HARNESS_WORKER_URL || "").replace(/\/$/, "");
const KEY = env.HARNESS_API_KEY;
const LINE_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;
// カンマ区切りで複数人に対応（全員このLINE公式アカウントの友だちである必要あり）
const OWNERS = (env.OWNER_LINE_USER_IDS || env.OWNER_LINE_USER_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!WORKER || !KEY || !LINE_TOKEN || OWNERS.length === 0) {
  console.error("必要な環境変数が .env にありません（HARNESS_WORKER_URL / HARNESS_API_KEY / LINE_CHANNEL_ACCESS_TOKEN / OWNER_LINE_USER_IDS）");
  process.exit(1);
}

// 一元管理原則: 琴音さん向け通知は秘書AI（line-fastapi-bot）チャネルから送る。
// しろちゃん等その他の管理者はカーショップチャネル（従来どおり）。
const secEnv = {};
try {
  for (const line of readFileSync("C:/Users/jupit/workspace/line-fastapi-bot/.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) secEnv[m[1]] = m[2];
  }
} catch {}
const SECRETARY_TOKEN = secEnv.LINE_CHANNEL_ACCESS_TOKEN;
const KOTONE_SECRETARY_ID = secEnv.OWNER_LINE_USER_ID;
const KOTONE_CARSHOP_ID = "U37ed0c5998756890b76d78cc97c7dced";

async function api(path) {
  const res = await fetch(`${WORKER}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return json.data;
}

const state = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : { knownSubmissions: [], lastUnansweredTotal: 0 };

const lines = [];

// 1) フォーム新着回答
const forms = (await api("/api/forms")) ?? [];
for (const form of forms) {
  const subs = (await api(`/api/forms/${form.id}/submissions`)) ?? [];
  for (const s of subs) {
    if (state.knownSubmissions.includes(s.id)) continue;
    const d = s.data ?? {};
    const detail = [d.car_model, d.year && `${d.year}年式`, d.mileage && `走行${d.mileage}km`, d.accident && `事故歴:${d.accident}`]
      .filter(Boolean).join("・");
    lines.push(`📋 ${form.name}の新着回答！\n${d.name ?? s.friendName ?? "名前なし"}様${d.phone ? `（📞${d.phone}）` : ""}\n${detail}${d.note ? `\n備考: ${d.note}` : ""}`);
    state.knownSubmissions.push(s.id);
  }
}

// 2) 未対応チャット（増えた時だけ通知）
const inbox = await api("/api/inbox/unanswered/count");
const total = inbox?.total ?? 0;
if (total > (state.lastUnansweredTotal ?? 0)) {
  lines.push(`💬 未対応チャットが${total}件あります。LINE公式アカウントアプリで確認してください`);
}
state.lastUnansweredTotal = total;

// 3) push（新着があった時だけ・1通にまとめて無料枠節約）
if (lines.length > 0) {
  const text = `【運営通知】\n\n${lines.join("\n\n")}`;
  // 琴音さん→秘書AIチャネルから（秘書AIが使えないときはカーショップにフォールバック）
  let kotoOk = false;
  if (SECRETARY_TOKEN && KOTONE_SECRETARY_ID) {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRETARY_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: KOTONE_SECRETARY_ID, messages: [{ type: "text", text: `🔔秘書AIより\n${text}` }] }),
    });
    kotoOk = r.ok;
    console.log(kotoOk ? "琴音さん宛(秘書AI経由)OK" : `秘書AI送信失敗${r.status}→カーショップにフォールバック`);
  }
  const carshopTargets = OWNERS.filter((id) => kotoOk ? id !== KOTONE_CARSHOP_ID : true);
  const res = carshopTargets.length
    ? await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: carshopTargets, messages: [{ type: "text", text }] }),
      })
    : { ok: true, status: 200, text: async () => "" };
  console.log(res.ok ? `通知送信OK（${lines.length}件）` : `通知送信失敗: ${res.status} ${await res.text()}`);
  if (!res.ok) process.exit(1); // 送信失敗時はstateを保存せず次回リトライ
} else {
  console.log("新着なし");
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
