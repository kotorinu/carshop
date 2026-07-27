#!/usr/bin/env node
/**
 * 週次KPIサマリ — 友だち数・タグ別内訳・流入元・フォーム回答数を1画面で。
 * car-sales-marketing スキルの週次レビュー（kpi-weekly）にそのまま貼れる形式で出力する。
 *
 * 使い方: node kpi.mjs
 */
import { loadConfig, makeApi } from "./_lib.mjs";

const cfg = loadConfig();
const api = makeApi(cfg);

const today = new Date().toLocaleDateString("ja-JP");
console.log(`■ LINE CRM KPIサマリ（${today}）\n`);

// 友だち総数
const count = await api("GET", "/api/friends/count");
console.log(`友だち総数: ${count?.count ?? count}人`);

// タグ別
const tags = await api("GET", "/api/tags");
const groups = { "src:": "流入元", "int:": "興味", "st:": "状態" };
for (const [prefix, label] of Object.entries(groups)) {
  const group = (tags ?? []).filter((t) => t.name.startsWith(prefix));
  if (group.length === 0) continue;
  console.log(`\n【${label}】`);
  for (const tag of group) {
    const page = await api("GET", `/api/friends?tagId=${encodeURIComponent(tag.id)}&limit=1`);
    const n = page?.total ?? 0;
    if (n > 0) console.log(`  ${tag.name.slice(prefix.length)}: ${n}人`);
  }
}

// 流入元（refベース: 入口リンク経由の友だち追加）
try {
  const refs = await api("GET", "/api/analytics/ref-summary");
  const items = refs?.items ?? refs ?? [];
  if (Array.isArray(items) && items.length > 0) {
    console.log("\n【入口リンク経由の友だち追加】");
    for (const r of items) {
      console.log(`  ${r.routeName ?? r.refCode}: ${r.friendCount ?? r.count}人`);
    }
  }
} catch {
  /* ref-summary未対応バージョンならスキップ */
}

// フォーム回答数
const forms = await api("GET", "/api/forms");
if ((forms ?? []).length > 0) {
  console.log("\n【フォーム回答】");
  for (const form of forms) {
    console.log(`  ${form.name}: ${form.submitCount ?? 0}件`);
  }
}

// 未対応チャット
try {
  const chats = await api("GET", "/api/chats?status=unread");
  const unread = Array.isArray(chats) ? chats.length : (chats?.items?.length ?? 0);
  console.log(`\n未対応チャット: ${unread}件${unread > 0 ? " ←【要対応・30分以内返信ルール】" : ""}`);
} catch {
  /* skip */
}
