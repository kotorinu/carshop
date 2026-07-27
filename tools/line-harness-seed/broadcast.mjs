#!/usr/bin/env node
/**
 * セグメント配信CLI — 「TikTok経由の人に在庫案内を送って」を1コマンドに。
 *
 * 使い方:
 *   node broadcast.mjs --list-tags                                    # タグ一覧と人数
 *   node broadcast.mjs --tag src:tiktok --title 在庫案内 --text "本文"   # 下書き作成のみ（安全側デフォルト）
 *   node broadcast.mjs --all --title お知らせ --text "本文"             # 全員向け下書き
 *   ...上記に --send を足すと即時送信 / --schedule "2026-07-20T10:00:00+09:00" で予約
 *
 * 注意: LINE公式のコミュニケーションプランは月200通まで。送信前に人数×1通を確認すること。
 */
import { loadConfig, makeApi, parseArgs } from "./_lib.mjs";

const cfg = loadConfig();
const api = makeApi(cfg);
const args = parseArgs(process.argv.slice(2));

async function tagWithCount(tag) {
  const page = await api("GET", `/api/friends?tagId=${encodeURIComponent(tag.id)}&limit=1`);
  return { ...tag, friendCount: page?.total ?? "?" };
}

if (args["list-tags"]) {
  const tags = await api("GET", "/api/tags");
  const total = await api("GET", "/api/friends/count");
  console.log(`友だち総数: ${total?.count ?? total}`);
  for (const tag of tags ?? []) {
    const t = await tagWithCount(tag);
    console.log(`  ${t.name}: ${t.friendCount}人`);
  }
  process.exit(0);
}

const { title, text } = args;
if (!title || !text || (!args.tag && !args.all)) {
  console.error(
    "使い方: node broadcast.mjs --tag <タグ名> --title <題名> --text <本文> [--send | --schedule <ISO日時>]\n" +
      "        node broadcast.mjs --all --title <題名> --text <本文> [--send | --schedule <ISO日時>]\n" +
      "        node broadcast.mjs --list-tags",
  );
  process.exit(1);
}

let targetTagId;
let audience = "全員";
if (args.tag) {
  const tags = await api("GET", "/api/tags");
  const tag = (tags ?? []).find((t) => t.name === args.tag);
  if (!tag) {
    console.error(`エラー: タグ「${args.tag}」が見つかりません。--list-tags で確認してください`);
    process.exit(1);
  }
  const t = await tagWithCount(tag);
  targetTagId = tag.id;
  audience = `タグ ${t.name}（${t.friendCount}人）`;
}

const broadcast = await api("POST", "/api/broadcasts", {
  title,
  messageType: "text",
  messageContent: text,
  targetType: args.tag ? "tag" : "all",
  ...(targetTagId ? { targetTagId } : {}),
  ...(args.schedule ? { scheduledAt: args.schedule } : {}),
});

console.log(`配信を作成しました: 「${title}」→ ${audience}`);
console.log(`  id: ${broadcast.id}`);

if (args.schedule) {
  console.log(`  予約日時: ${args.schedule}`);
} else if (args.send) {
  await api("POST", `/api/broadcasts/${broadcast.id}/send`, {});
  console.log("  即時送信しました！");
} else {
  console.log("  ※下書きのままです。送信するには --send を付けるか管理画面から実行してください");
}
