// 毎週金曜: HarnessのKPIを集計してNotion「週次KPI記録簿」に1行自動追加＋LINEで記入依頼を通知
// 自動で埋まる: 日付・週・問い合わせ件数（フォーム回答+未対応チャット）・メモ（友だち数/タグ内訳）
// 人間が追記する: 成約数・来店数・今月の粗利万円
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const WORKER = env.HARNESS_WORKER_URL;
const KEY = env.HARNESS_API_KEY;
const NOTION = env.NOTION_TOKEN;
const LINE_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;
const OWNERS = (env.OWNER_LINE_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const KPI_DB_ID = "150bd8a6-a77f-4e9f-b0b6-1c2bb37c4fbe";

async function harness(path) {
  const res = await fetch(`${WORKER}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  return (await res.json()).data;
}

// KPI収集
const friends = await harness("/api/friends?limit=1");
const friendTotal = friends?.total ?? 0;
const tags = (await harness("/api/tags")) ?? [];
const tagSummary = tags
  .filter((t) => (t.friendCount ?? t.friend_count ?? 0) > 0)
  .map((t) => `${t.name}:${t.friendCount ?? t.friend_count}`)
  .join(" / ") || "タグ付きなし";
const forms = (await harness("/api/forms")) ?? [];
let formCount = 0;
for (const f of forms) {
  const subs = (await harness(`/api/forms/${f.id}/submissions`)) ?? [];
  formCount += subs.length;
}
const inbox = await harness("/api/inbox/unanswered/count");
const unanswered = inbox?.total ?? 0;

// Notionに1行追加
const now = new Date(Date.now() + 9 * 3600_000);
const dateStr = now.toISOString().slice(0, 10);
const weekNum = Math.ceil(now.getUTCDate() / 7);
const weekLabel = `${now.getUTCMonth() + 1}月第${weekNum}週`;

const res = await fetch("https://api.notion.com/v1/pages", {
  method: "POST",
  headers: { Authorization: `Bearer ${NOTION}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    parent: { database_id: KPI_DB_ID },
    properties: {
      週: { title: [{ type: "text", text: { content: weekLabel } }] },
      日付: { date: { start: dateStr } },
      問い合わせ件数: { number: formCount + unanswered },
      メモ: {
        rich_text: [{ type: "text", text: { content: `LINE友だち${friendTotal}人 / フォーム累計${formCount}件 / 未対応${unanswered}件 / ${tagSummary}（自動記録。成約数・来店数・粗利は手動追記を）` } }],
      },
    },
  }),
});
console.log(res.ok ? "Notion KPI記録簿に1行追加OK" : `Notion追加失敗: ${res.status} ${await res.text()}`);

// LINEで追記依頼（琴音さん向けは秘書AIチャネルから＝一元管理原則）
if (res.ok) {
  const secEnv = {};
  try {
    for (const line of readFileSync("C:/Users/jupit/workspace/line-fastapi-bot/.env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) secEnv[m[1]] = m[2];
    }
  } catch {}
  const kpiText = `【金曜KPI】\nNotionの週次KPI記録簿に今週の行を自動追加しました📊\n\n・LINE友だち: ${friendTotal}人\n・フォーム累計: ${formCount}件\n・未対応チャット: ${unanswered}件\n\n「成約数」「来店数」だけNotionに追記してください（30秒）。\nClaudeに「今週のKPIこれ」+数字を送ると値下げ判定まで出ます`;
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${secEnv.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: secEnv.OWNER_LINE_USER_ID, messages: [{ type: "text", text: `🔔秘書AIより\n${kpiText}` }] }),
  });
  console.log(r.ok ? "LINE通知OK(秘書AI経由)" : `秘書AI送信失敗: ${r.status}`);
}
