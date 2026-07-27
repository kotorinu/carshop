// 毎朝6:00の「朝ルーティン便」をLINE予約配信で投入する（Cloudflare実行なのでPC電源不要）
// 使い方: node morning-routine-push.mjs --this-week  … 明日〜今度の日曜分を予約
//         node morning-routine-push.mjs --next-week  … 翌月曜〜日曜の7本を予約（毎週金曜に自動実行）
// 配信先: st:運営タグ（琴音さんのみ。しろちゃんには送らない）
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const WORKER = env.HARNESS_WORKER_URL;
const KEY = env.HARNESS_API_KEY;
const KOTONE_LINE_ID = "U37ed0c5998756890b76d78cc97c7dced";

async function api(method, path, body) {
  const res = await fetch(`${WORKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

// st:運営タグを確保して琴音さんに付与
const tags = await api("GET", "/api/tags");
let opTag = tags.find((t) => t.name === "st:運営");
if (!opTag) {
  opTag = await api("POST", "/api/tags", { name: "st:運営", color: "#6b7280" });
  console.log("タグ st:運営 作成");
}
const friends = (await api("/api/friends".startsWith("/") ? "GET" : "GET", "/api/friends")) ?? {};
const koto = (friends.items ?? []).find((f) => f.lineUserId === KOTONE_LINE_ID);
if (koto) {
  await api("POST", `/api/friends/${koto.id}/tags`, { tagId: opTag.id }).catch(() => {});
}

// 曜日別メニュー（0=日〜6=土）
const MENU = [
  "きょうは休み🧘 ストレッチ5分だけ（習慣の糸を切らない）＋体重計に乗る",
  "脚の日🦵 スクワット15回×3→前ランジ左右10回×3→カーフレイズ20回×3→足踏み有酸素5分",
  "胸・腕の日💪 腕立て10回×3(膝つきOK)→パイクプッシュ8回×3→足踏み有酸素5分",
  "ランの日🏃 会話できるペースで20分",
  "背中の日🔥 タオルローイング12回×3→スーパーマン15回×3→スノーエンジェル12回×3→足踏み5分",
  "腹・体幹の日⚡ プランク40秒×3→レッグレイズ12回×3→バイシクルクランチ左右15回×3→足踏み5分",
  "ランの日🏃 30分（週末はゆっくり6:30起きでもOK）",
];
const DAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

function buildMessage(date) {
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const eveningWed = dow === 3 ? "→20:30に投稿(今日は前倒し)" : "→21:00投稿＋返信30分";
  const evening = isWeekend
    ? (dow === 0
        ? "🌙 10:00車タイム(PCでClaudeを開いて新チャットに「今日の分」と送る)→10:30資格勉強→【夜は何もしない日。休みは継続の部品】"
        : "🌙 10:00車タイム(PCでClaudeを開いて新チャットに「今日の分」と送る)→10:30資格勉強/スクール→夜はゆっくり")
    : `🌙 18:00 PCでClaude(黒い画面のアプリ)を開く→新チャットに「今日の分」と送る→出てきた動画を確認して投稿予約(20分)→18:30スクール講座・資格・自己分析(※9/5からここが応募タイムに変わる)→20:00日報${eveningWed}`;
  const friday = dow === 5 ? "\n📊 きょうは金曜: KPI通知が来たらNotionに成約・来店を追記(30秒)" : "";
  return (
    `🌅 おはようございます！${DAY_LABEL[dow]}曜日のルーティン\n\n` +
    `□ カーテン全開＋水1杯\n` +
    `□ 考える前に運動着に着替える\n` +
    `□ ${MENU[dow]}\n` +
    `□ シャワー→朝食はプロテイン＋バナナ1本\n` +
    (isWeekend ? "" : `□ 6:20-7:10 AWS勉強50分（スマホはカバンの中）\n□ 7:30出発（電車でLINE返信→AWS暗記）\n`) +
    `\n🍽 昼: タンパク質多めの定食＋講座1本\n` +
    `${evening}${friday}\n` +
    `🍚 夜はごはん半分・21時以降食べない・22:00スマホOFF・22:30就寝\n\n` +
    `Never miss twice💪 昨日サボってても今日やれば無傷です`
  );
}

// 予約対象の日付リスト
const mode = process.argv.includes("--next-week") ? "next" : "this";
const now = new Date(Date.now() + 9 * 3600_000); // JST
const dates = [];
if (mode === "this") {
  // 明日〜今度の日曜
  for (let d = 1; d <= 7; d++) {
    const dt = new Date(now.getTime() + d * 86400_000);
    dates.push(dt);
    if (dt.getDay() === 0) break; // 日曜まで
  }
} else {
  // 翌月曜〜日曜の7本
  let dt = new Date(now.getTime() + 86400_000);
  while (dt.getDay() !== 1) dt = new Date(dt.getTime() + 86400_000);
  for (let i = 0; i < 7; i++) dates.push(new Date(dt.getTime() + i * 86400_000));
}

for (const d of dates) {
  const ymd = d.toISOString().slice(0, 10);
  const scheduledAt = `${ymd}T05:30:00+09:00`;
  await api("POST", "/api/broadcasts", {
    title: `朝ルーティン便 ${ymd}(${DAY_LABEL[d.getDay()]})`,
    messageType: "text",
    messageContent: buildMessage(d),
    targetType: "tag",
    targetTagId: opTag.id,
    scheduledAt,
  });
  console.log(`予約: ${ymd}(${DAY_LABEL[d.getDay()]}) 5:30`);
}
console.log("\n完了（Cloudflareが送信するのでPCの電源は不要）");
