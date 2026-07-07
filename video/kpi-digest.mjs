// 数字チェッカー: 在庫スナップショットの保存と日次ダイジェストの生成。
//
//   node video/kpi-digest.mjs           # スナップショット保存 + ダイジェスト出力
//
// やること:
//  1. ライブ在庫(カーセンサー同期済み公開JSON)を取得して content/kpi/snapshots/YYYY-MM-DD.json に保存
//  2. 前回スナップショットと比較 → 新入庫 / 売約 / 値下げ を検知
//  3. 在庫日数の警告(listedAtから60日超)
//  4. 今月の売約ペース vs 目標(月4台)
//  5. LINE botの管理API(/admin/leads)から直近の要対応メッセージ・リードを取得
//  6. すべてを1本のMarkdownダイジェストとして標準出力に出す
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// .env はスクリプト位置基準で読む(どのcwdから実行しても効くように。scheduled-task対策)
dotenv.config({ path: path.join(ROOT, ".env") });
const SNAP_DIR = path.join(ROOT, "content", "kpi", "snapshots");
const INVENTORY_URL = process.env.INVENTORY_URL ?? "https://kotokoto-company-site.vercel.app/data/cars.json";
const BOT_URL = process.env.BOT_URL ?? "https://carshop-line-bot-production.up.railway.app";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const MONTHLY_TARGET = Number(process.env.MONTHLY_SALES_TARGET ?? 4);

const today = new Date();
const dateKey = (d) => d.toISOString().slice(0, 10);
const jpDate = (iso) => (iso ? iso.slice(0, 10) : "不明");
const daysSince = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null);

function label(c) {
  return `${c.maker} ${c.name}${c.grade ? " " + c.grade : ""}(${c.price}万円)`;
}

async function main() {
  // 1. ライブ在庫取得 + スナップショット保存
  const res = await fetch(INVENTORY_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`在庫取得失敗: ${res.status}`);
  const cars = await res.json();
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const todayFile = path.join(SNAP_DIR, `${dateKey(today)}.json`);
  fs.writeFileSync(todayFile, JSON.stringify(cars, null, 2) + "\n");

  // 2. 前回スナップショットとの差分
  const snaps = fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith(".json")).sort();
  const prevFile = snaps.filter((f) => f < `${dateKey(today)}.json`).pop();
  const prev = prevFile ? JSON.parse(fs.readFileSync(path.join(SNAP_DIR, prevFile), "utf8")) : null;

  const byId = (list) => new Map(list.map((c) => [c.csId ?? c.id, c]));
  const cur = byId(cars);
  const old = prev ? byId(prev) : new Map();

  const added = [...cur.values()].filter((c) => !c.sold && !old.has(c.csId ?? c.id));
  const newlySold = [...cur.values()].filter((c) => {
    const o = old.get(c.csId ?? c.id);
    return c.sold && o && !o.sold;
  });
  const priceChanged = [...cur.values()].filter((c) => {
    const o = old.get(c.csId ?? c.id);
    return o && !c.sold && o.price !== c.price;
  });
  const removed = prev ? [...old.values()].filter((c) => !c.sold && !cur.has(c.csId ?? c.id)) : [];

  // 3. 在庫日数の警告
  const onSale = cars.filter((c) => !c.sold);
  const stale = onSale
    .map((c) => ({ c, days: daysSince(c.listedAt) }))
    .filter((x) => x.days != null && x.days >= 60)
    .sort((a, b) => b.days - a.days);

  // 4. 今月の売約ペース
  const monthStart = `${today.toISOString().slice(0, 7)}-01`;
  const soldThisMonth = cars.filter((c) => c.sold && c.soldAt && c.soldAt.slice(0, 10) >= monthStart);
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const pace = soldThisMonth.length / (dayOfMonth / daysInMonth);

  // 5. LINE botの要対応リスト
  let leadsBlock = "(ADMIN_TOKEN未設定のため取得スキップ)";
  if (ADMIN_TOKEN) {
    try {
      const r = await fetch(`${BOT_URL}/admin/leads?token=${ADMIN_TOKEN}&days=2`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const { leads, recentMessages } = await r.json();
        const bookings = recentMessages.filter((m) => m.kind === "booking");
        const texts = recentMessages.filter((m) => m.kind === "text");
        leadsBlock = [
          `- 友だち登録(累計): ${leads.length}人 / うち来店リクエスト段階: ${leads.filter((l) => l.stage === "booking_requested").length}人`,
          bookings.length
            ? `- 🔔 **直近48時間の来店リクエスト ${bookings.length}件(要・確定連絡!):**\n` + bookings.map((m) => `    - ${m.at.slice(5, 16).replace("T", " ")} 「${m.text}」`).join("\n")
            : "- 直近48時間の来店リクエスト: なし",
          texts.length
            ? `- 💬 **直近48時間のお客様メッセージ ${texts.length}件(返信済みか確認!):**\n` + texts.map((m) => `    - ${m.at.slice(5, 16).replace("T", " ")} 「${m.text.slice(0, 40)}」`).join("\n")
            : "- 直近48時間のお客様メッセージ: なし",
        ].join("\n");
      } else {
        leadsBlock = `(bot管理API応答エラー: ${r.status})`;
      }
    } catch (e) {
      leadsBlock = `(bot管理API接続失敗: ${e.message})`;
    }
  }

  // 6. ダイジェスト出力
  const fmtList = (list, fn) => (list.length ? list.map(fn).join("\n") : "  なし");
  console.log(`# 📊 Jupiter Coring 数字チェッカー ${dateKey(today)}

## 在庫サマリー
- 販売中: ${onSale.length}台 / 総額${onSale.reduce((s, c) => s + (c.price ?? 0), 0).toFixed(1)}万円分
- 今月の売約: ${soldThisMonth.length}台(目標${MONTHLY_TARGET}台 / 月末着地ペース ${pace.toFixed(1)}台 ${pace >= MONTHLY_TARGET ? "✅ 順調" : "⚠️ 要テコ入れ"})

## 昨日からの変化${prev ? `(前回: ${prevFile.replace(".json", "")})` : "(初回実行のため差分なし)"}
- 🆕 新入庫:
${fmtList(added, (c) => `  - ${label(c)} → 出品文・動画の作成対象!`)}
- 🎉 売約:
${fmtList(newlySold, (c) => `  - ${label(c)} → 全媒体の掲載削除 + 「売約済み!」投稿を`)}
- 💴 価格変更:
${fmtList(priceChanged, (c) => `  - ${label(c)}: ${old.get(c.csId ?? c.id).price}万 → ${c.price}万`)}
- 📤 掲載終了(売約フラグなしで消えた車):
${fmtList(removed, (c) => `  - ${label(c)} ※カーセンサー側の状態を確認`)}

## ⏳ 長期在庫アラート(60日超)
${stale.length ? stale.map((x) => `- ${label(x.c)}: **${x.days}日経過**(掲載 ${jpDate(x.c.listedAt)}) → 値下げ判定推奨`).join("\n") : "- なし"}

## 📱 LINE要対応リスト
${leadsBlock}
`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
