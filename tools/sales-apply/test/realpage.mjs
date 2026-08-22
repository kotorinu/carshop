#!/usr/bin/env node
/**
 * 実サイトから保存したHTMLに対して、本番と同じ読み取り・判定を回す。
 *
 * 開発側は実サイトに接続できない（組織のネットワークポリシーで遮断）。
 * そこで「ブラウザで保存したページ」を受け取って、そこに対して本物の
 * dom.js / scoring.js / requirements.js / compose.js をそのまま動かす。
 * 拡張機能が実際にやることと同じ処理なので、これが実質の実機テストになる。
 *
 *   node tools/sales-apply/test/realpage.mjs 保存したページ.html [--site lancers] [--url <元のURL>] [--draft]
 *
 *   --site   媒体を指定（lancers / indeed / anotherworks / crowdworks）。省略時はURLから推定
 *   --url    保存元のURL（詳細ページのid判定に使う）
 *   --draft  条件を満たしていたら応募文まで作って表示する
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

if (!file || !existsSync(file)) {
  console.error('\n使い方: node tools/sales-apply/test/realpage.mjs 保存したページ.html [--site lancers] [--url <元のURL>] [--draft]\n');
  process.exit(1);
}

const html = readFileSync(file, 'utf8');
const pageUrl = flag('url') || guessUrlFromHtml(html) || 'https://example.com/';

/* ---------- ブラウザと同じ環境をつくる ---------- */
const dom = new JSDOM(html, { url: pageUrl });
for (const k of ['window', 'document', 'DOMParser', 'Element', 'HTMLElement', 'HTMLInputElement',
  'HTMLTextAreaElement', 'HTMLSelectElement', 'Event', 'KeyboardEvent', 'getComputedStyle', 'location']) {
  const v = k === 'window' ? dom.window : dom.window[k];
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}

const domMod = await import('../extension/content/dom.js');
const adapters = await import('../extension/content/adapters/index.js');
const scoring = await import('../extension/core/scoring.js');
const requirements = await import('../extension/core/requirements.js');
const compose = await import('../extension/core/compose.js');

const profile = loadProfile();
const ad = pickAdapter();
const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };

console.log('\n' + '='.repeat(64));
console.log(`実ページの読み取りテスト: ${path.basename(file)}`);
console.log(`URL: ${pageUrl}`);
console.log(`媒体: ${ad.name}（${ad.id}）`);
console.log('='.repeat(64));

/* ---------- 一覧として読めるか ---------- */
const links = [...document.querySelectorAll('a[href]')];
const jobLinks = links.filter((a) => { try { return ad.detailPattern.test(a.href); } catch { return false; } });
console.log(`\n■ 一覧の読み取り`);
console.log(`  ページ内のリンク: ${links.length}本 / 案件らしいリンク: ${jobLinks.length}本`);

const cards = domMod.scrapeListGeneric(ad.detailPattern);
console.log(`  読み取れた案件: ${cards.length}件`);

const problems = [];
if (jobLinks.length && !cards.length) problems.push('リンクはあるのに案件を組み立てられていない（カードの切り出しに失敗）');
if (cards.length) {
  const titles = new Set(cards.map((c) => c.title));
  if (titles.size < cards.length) problems.push(`タイトルが重複（${cards.length}件中${titles.size}種類）→ カードの切り出しに失敗`);
  const avg = Math.round(cards.reduce((n, c) => n + (c.description || '').length, 0) / cards.length);
  console.log(`  カード本文の平均: ${avg}字`);
  if (avg > 1000) problems.push('カード本文が長すぎる（一覧全体を掴んでいる疑い）');
  console.log(`  報酬を拾えた: ${cards.filter((c) => c.budget).length}件 / 応募数を拾えた: ${cards.filter((c) => c.applicants != null).length}件`);
  console.log('  --- 読み取れた案件（先頭10件）---');
  for (const c of cards.slice(0, 10)) {
    console.log(`  ・[${c.id}] ${String(c.title).replace(/\s+/g, ' ').slice(0, 50)}`);
    console.log(`      報酬:${c.budget || '取れず'} / 応募:${c.applicants ?? '取れず'} / 本文${(c.description || '').length}字`);
  }
}

/* ---------- 詳細として読めるか ---------- */
const detail = domMod.scrapeDetailGeneric(ad.hints || {});
const looksLikeDetail = (detail.description || '').length > 200 && cards.length <= 2;
console.log(`\n■ 詳細として読んだ場合`);
console.log(`  タイトル: ${String(detail.title).replace(/\s+/g, ' ').slice(0, 60) || '取れず'}`);
console.log(`  本文: ${(detail.description || '').length}字`);
console.log(`  報酬: ${detail.budget || '取れず'}`);
console.log(`  本文の先頭: ${String(detail.description || '').replace(/\s+/g, ' ').slice(0, 140)}`);

if (looksLikeDetail || has('draft')) {
  const job = { ...detail, site: ad.id };
  const scored = scoring.scoreJob(job, profile);
  const must = scoring.checkMust(scored, scoring.DEFAULT_MUST);
  console.log(`\n■ 条件の判定`);
  console.log(`  ${scored.checklist.map((c) => `${c.label}${icon[c.status]}`).join(' ')}`);
  for (const c of scored.checklist) console.log(`   ・${c.label}: ${c.detail}`);
  console.log(`  判定: ${must.passed ? '✅ 届ける' : '⛔ 届けない'}`);
  if (must.reasons.length) console.log(`   条件に反する: ${must.reasons.join(' / ')}`);
  if (must.unconfirmed.length) console.log(`   募集文で確認できず: ${must.unconfirmed.join(' / ')}`);

  const posting = requirements.readPosting(job, profile);
  console.log(`\n■ 募集要項から読み取れたこと`);
  console.log(`  会社名: ${posting.company || '取れず'}`);
  console.log(`  大切にしている言葉: ${posting.philosophy || '取れず'}`);
  console.log(`  合言葉: ${posting.magicWord || 'なし'}`);
  console.log(`  字数制限: ${posting.maxLength || 'なし'}`);
  console.log(`  指定項目: ${posting.requirements.length ? posting.requirements.map((r) => r.label).join('・') : 'なし'}`);
  if (posting.unanswered.length) console.log(`  ⚠ 答えられない項目: ${posting.unanswered.join('・')}`);

  if (has('draft')) {
    const out = compose.composeApplication(job, profile);
    console.log(`\n■ 生成される応募文（${out.categoryLabel}）\n`);
    console.log(out.text.split('\n').map((l) => `  ${l}`).join('\n'));
    if (out.warnings.length) console.log(`\n  注意: ${out.warnings.join(' / ')}`);
  }
}

/* ---------- フォームとして読めるか ---------- */
const field = domMod.findMessageField((ad.hints && ad.hints.message) || []);
if (field || document.querySelector('textarea')) {
  console.log(`\n■ 応募フォームとして読んだ場合`);
  console.log(`  応募文の入力欄: ${field ? `見つかった（${describe(field)}）` : '見つからない'}`);
  for (const [label, words] of [
    ['氏名', ['氏名', 'お名前', 'name', '担当者']],
    ['フリガナ', ['フリガナ', 'ふりがな', 'かな', 'kana']],
    ['メール', ['メール', 'mail', 'e-mail']],
    ['電話', ['電話', 'tel', 'phone', '携帯']],
    ['住所', ['住所', 'address', '所在地']],
  ]) {
    const el = domMod.findFieldByWords(words);
    console.log(`  ${label}の欄: ${el ? `見つかった（${describe(el)}）` : '見つからない'}`);
  }
  const submit = domMod.findSubmitButton((ad.hints && ad.hints.submit) || []);
  console.log(`  送信ボタン: ${submit ? `見つかった「${domMod.text(submit).slice(0, 20)}」` : '見つからない'}`);
}

console.log(`\n${'='.repeat(64)}`);
if (problems.length) {
  console.log('⚠ 直すべき点');
  problems.forEach((p) => console.log(`  ・${p}`));
} else {
  console.log('✅ 読み取りに明らかな異常はありません');
}
console.log('='.repeat(64) + '\n');

/* ---------- 小道具 ---------- */
function describe(el) {
  const name = el.getAttribute('name'); const id = el.getAttribute('id');
  return [el.tagName.toLowerCase(), name && `name=${name}`, !name && id && `id=${id}`].filter(Boolean).join(' ');
}

function pickAdapter() {
  const want = flag('site');
  if (want) {
    const hit = adapters.adapters.find((a) => a.id === want);
    if (hit) return hit;
    console.error(`⚠ 媒体「${want}」は未対応です。使えるのは: ${adapters.adapters.map((a) => a.id).join(', ')}`);
  }
  try { return adapters.pickAdapter(new URL(pageUrl)); } catch { return adapters.adapters[adapters.adapters.length - 1]; }
}

/** ブラウザで保存したHTMLには、元のURLがコメントで残ることがある */
function guessUrlFromHtml(h) {
  const m = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/.exec(h) || /<base href="([^"]+)"/.exec(h);
  return m ? m[1] : null;
}

function loadProfile() {
  const base = new URL('../profile/profile.json', import.meta.url);
  const p = JSON.parse(readFileSync(base, 'utf8'));
  const priv = new URL('../profile/private.json', import.meta.url);
  try { Object.assign(p, JSON.parse(readFileSync(priv, 'utf8'))); } catch { /* 無ければ無しで動く */ }
  return p;
}
