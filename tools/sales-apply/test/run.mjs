/**
 * 出荷前テスト。実物のChromiumに拡張機能を読み込んで、最後まで通す。
 *   ①サービスワーカーが起動するか（前回の不具合はここで落ちていた）
 *   ②巡回 → 詳細取得 → マスト判定 → 合格だけタブで開く
 *   ③応募文の生成（【要記入】が残らない・AI臭が出ない）
 *   ④フォーム自動入力（本文・氏名・メール・電話・住所）
 *   ⑤送信ボタンを絶対に押していないこと
 */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('\n⚠️  playwright が入っていないため、通しテストは実行できません。');
  console.log('   npm i -D playwright  を実行してから、もう一度お試しください。');
  console.log('   （単体テストだけなら npm run apply:test で動きます）\n');
  process.exit(0);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestExtension } from './build-testext.mjs';
import { start } from './fixtures/server.mjs';
import { JOBS, EXPECT_PASS } from './fixtures/jobs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.EXT_SRC || path.join(HERE, '..', 'extension');
const PORT = 8787;

let pass = 0; let fail = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await start(PORT);
const extDir = buildTestExtension(SRC, path.join(HERE, '.testext'), { port: PORT });
const userDir = mkdtempSync(path.join(tmpdir(), 'sa-'));

// 環境変数で上書き可能。Playwright同梱のChromiumがあればそれを使う
const CHROME = process.env.CHROME_PATH || undefined;
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: CHROME,
  headless: true,
  chromiumSandbox: false,
  args: [
    '--headless=new',           // 拡張機能は新しいヘッドレスでないと動かない
    '--no-sandbox',
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
  ],
});

const swErrors = [];
const pageErrors = [];
ctx.on('weberror', (e) => pageErrors.push(String(e.error())));

console.log('\n=== ① 拡張機能の起動 ===');
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
check('サービスワーカーが起動する', !!sw, sw ? '' : '起動しませんでした（manifest か import の問題）');
if (!sw) { await finish(); }

const extId = new URL(sw.url()).host;
console.log(`     拡張機能ID: ${extId}`);

// サービスワーカーの中で例外が出ていないか
const swId = await sw.evaluate(() => chrome.runtime.id).catch((e) => `例外: ${e}`);
check('サービスワーカーの中でコードが動く', typeof swId === 'string' && swId.length > 10, String(swId));

const popup = await ctx.newPage();
popup.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(800);

console.log('\n=== ② ポップアップの表示 ===');
check('マスト条件のチェックが並ぶ', (await popup.locator('#mustBox input').count()) === 6,
  `${await popup.locator('#mustBox input').count()}個（6個が期待値）`);
check('初期のマスト条件が4つ入っている', (await popup.locator('#mustBox input:checked').count()) === 4,
  `${await popup.locator('#mustBox input:checked').count()}個`);
check('探すボタンが押せる状態', !(await popup.locator('#auto').isDisabled()));

console.log('\n=== ③ 巡回（一覧→詳細→判定→合格だけ開く）===');
await popup.click('#auto');

// 「巡回を始めています…」で固まらないこと
await popup.waitForTimeout(4000);
const stuck = (await popup.locator('#auto').textContent()).includes('始めています');
check('ボタンが「始めています…」で固まらない', !stuck, stuck ? '4秒経っても開始しませんでした' : '');

// 巡回の完了を待つ
let crawl = null;
for (let i = 0; i < 90; i++) {
  crawl = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ crawl: {} }, (o) => r(o.crawl))));
  if (crawl && !crawl.running && crawl.finishedAt) break;
  await sleep(1000);
}
check('巡回が最後まで終わる', !!(crawl && crawl.finishedAt), JSON.stringify(crawl));
check('巡回中にエラーが出ていない', !(crawl && crawl.error), crawl && crawl.error ? crawl.error : '');
console.log(`     ログ: ${(crawl.log || []).join(' / ')}`);

const lastError = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ lastError: null }, (o) => r(o.lastError))));
check('内部エラーが記録されていない', !lastError, lastError ? JSON.stringify(lastError) : '');

console.log('\n=== ④ マスト判定の正しさ（全12案件）===');
const jobs = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ jobs: [] }, (o) => r(o.jobs))));
const passedIds = jobs.filter((j) => j.must && j.must.passed).map((j) => Number(String(j.id)));
for (const j of JOBS) {
  const found = jobs.find((x) => Number(String(x.id)) === j.id);
  const gotPass = !!(found && found.must && found.must.passed);
  const want = j.expect === 'pass';
  const detail = found
    ? `判定=${gotPass ? '合格' : '対象外'} / 理由=${[...(found.must.reasons || []), ...(found.must.unconfirmed || []).map((u) => `未確認:${u}`)].join(', ') || 'なし'}`
    : '一覧の時点で除外（詳細を取りに行っていない）';
  check(`#${j.id} ${j.expect === 'pass' ? '届く' : '届かない'}（${j.why}）`, gotPass === want, gotPass === want ? '' : detail);
}
check(`合格したのは想定どおり ${EXPECT_PASS.join(',')} 番`,
  JSON.stringify([...passedIds].sort((a, b) => a - b)) === JSON.stringify(EXPECT_PASS),
  `実際: ${passedIds.sort((a, b) => a - b).join(',')}`);

console.log('\n=== ⑤ 合格した案件だけがタブで開く ===');
await sleep(1500);
const openedJobUrls = ctx.pages().map((p) => p.url()).filter((u) => /\/job\/\d+/.test(u));
const openedIds = [...new Set(openedJobUrls.map((u) => Number(u.match(/\/job\/(\d+)/)[1])))].sort((a, b) => a - b);
check('開いたタブが合格案件と一致する',
  JSON.stringify(openedIds) === JSON.stringify(EXPECT_PASS), `開いたのは ${openedIds.join(',')} 番`);
check('対象外の案件はタブで開かれていない',
  openedIds.every((id) => EXPECT_PASS.includes(id)), `余計に開いた: ${openedIds.filter((i) => !EXPECT_PASS.includes(i)).join(',')}`);

console.log('\n=== ⑥ 応募文の生成 ===');
const detail = await ctx.newPage();
detail.on('pageerror', (e) => pageErrors.push(`detail: ${e.message}`));
await detail.goto(`http://localhost:${PORT}/job/1`);
await detail.waitForTimeout(1500);
const panel = detail.locator('#sales-apply-panel');
check('案件ページにパネルが出る', await panel.count() > 0);

const btn = detail.locator('#sales-apply-panel').locator('css=button.act', { hasText: '応募文を作る' }).first();
await detail.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  [...root.querySelectorAll('button.act')].find((b) => b.textContent.includes('応募文を作る')).click();
});
await detail.waitForTimeout(1200);
const draft = await detail.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  const ta = root.querySelector('textarea');
  return ta ? ta.value : '';
});
check('応募文が生成される', draft.length > 300, `${draft.length}文字`);
check('【要記入】が残っていない', !draft.includes('要記入'), draft.match(/【要記入:[^】]*】/g)?.join(',') || '');
check('案件名が入っている', draft.includes('パーソナルジム'));
check('未経験であることを正直に書いている', /未経験|経験は無い|経験はこれから/.test(draft));
check('逆質問（アポイントの獲得方法）が入っている', draft.includes('アポイント'));
check('稼働条件が入っている', draft.includes('平日19〜23時'));
for (const ng of ['貴社のご発展', '尽力させていただきます', 'スキルセット', '多岐にわたる', 'この度は']) {
  check(`AI臭ワード「${ng}」が入っていない`, !draft.includes(ng));
}

console.log('\n=== ⑦ フォーム自動入力 ===');
const form = await ctx.newPage();
form.on('pageerror', (e) => pageErrors.push(`form: ${e.message}`));
await form.goto(`http://localhost:${PORT}/apply/1`);
await form.waitForTimeout(1500);
await form.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  const b = [...root.querySelectorAll('button.act')].find((x) => x.textContent.includes('フォームに入れる'));
  if (b) b.click();
});
await form.waitForTimeout(1500);
const filled = await form.evaluate(() => ({
  proposal: document.querySelector('textarea[name=proposal]').value,
  name: document.querySelector('input[name=name]').value,
  kana: document.querySelector('input[name=kana]').value,
  email: document.querySelector('input[name=email]').value,
  tel: document.querySelector('input[name=tel]').value,
  address: document.querySelector('input[name=address]').value,
  sent: document.getElementById('sent').textContent,
}));
check('応募文がフォームに入る', filled.proposal.length > 300, `${filled.proposal.length}文字`);
check('氏名が入る', filled.name === '緒方 琴音', filled.name);
check('フリガナが入る', filled.kana === 'オガタコトネ', filled.kana);
check('メールが入る', filled.email === 'koto.tama.yellow@gmail.com', filled.email);
check('電話が入る', filled.tel === '08042934580', filled.tel);
check('住所が入る', filled.address.includes('東雪谷'), filled.address);
check('★送信ボタンは押されていない（最重要）', filled.sent === '', `sent=${filled.sent}`);

console.log('\n=== ⑧ 別の言い回しで作り直す ===');
const first = draft;
await detail.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  const b = [...root.querySelectorAll('button.act')].find((x) => x.textContent.includes('別の言い回し'));
  if (b) b.click();
});
await detail.waitForTimeout(1200);
const second = await detail.evaluate(() => document.getElementById('sales-apply-panel').shadowRoot.querySelector('textarea').value);
check('「別の言い回しで」で文面が変わる', second !== first && second.length > 300);
check('作り直しても【要記入】は出ない', !second.includes('要記入'));

console.log('\n=== ⑨ 応募済みの記録（二重応募の防止）===');
await detail.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  [...root.querySelectorAll('button.act')].find((x) => x.textContent.includes('応募済み')).click();
});
await detail.waitForTimeout(1000);
await popup.reload();
await popup.waitForTimeout(1200);
const afterApplied = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ applied: {} }, (o) => r(o.applied))));
check('応募済みとして記録される', Object.keys(afterApplied).length === 1, JSON.stringify(Object.keys(afterApplied)));
const topCount = await popup.locator('#list li').count();
check('応募済みは「条件に合う」一覧から消える', topCount === EXPECT_PASS.length - 1, `${topCount}件（期待 ${EXPECT_PASS.length - 1}件）`);

console.log('\n=== ⑩ マスト条件を変えると判定し直される ===');
await popup.evaluate(() => {
  const box = document.querySelector('#mustBox input[data-key="price"]');
  box.checked = true; box.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(1500);
const afterMust = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ jobs: [] }, (o) => r(o.jobs))));
const passWithPrice = afterMust.filter((j) => j.must && j.must.passed).map((j) => Number(j.id)).sort();
check('単価をマストに加えると、単価未記載の案件が落ちる',
  !passWithPrice.includes(2), `合格: ${passWithPrice.join(',')}`);
check('単価が書いてある案件は残る', passWithPrice.includes(1) && passWithPrice.includes(11), `合格: ${passWithPrice.join(',')}`);
await popup.evaluate(() => {
  const box = document.querySelector('#mustBox input[data-key="price"]');
  box.checked = false; box.dispatchEvent(new Event('change'));
});
await popup.waitForTimeout(1200);

console.log('\n=== ⑪ 2回目の巡回で重複しない ===');
const before = (await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ jobs: [] }, (o) => r(o.jobs))))).length;
await popup.click('#auto');
for (let i = 0; i < 90; i++) {
  const c = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ crawl: {} }, (o) => r(o.crawl))));
  if (c && !c.running && c.finishedAt) break;
  await sleep(1000);
}
const after = (await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ jobs: [] }, (o) => r(o.jobs))))).length;
check('同じ案件が二重に増えない', after === before, `${before}件 → ${after}件`);

console.log('\n=== ⑫ 設定画面 ===');
const opt = await ctx.newPage();
opt.on('pageerror', (e) => pageErrors.push(`options: ${e.message}`));
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.waitForTimeout(1000);
check('設定画面が開く', (await opt.locator('#displayName').inputValue()) === '緒方 琴音',
  await opt.locator('#displayName').inputValue());
check('メールが設定画面に出る', (await opt.locator('#email').inputValue()) === 'koto.tama.yellow@gmail.com');
check('稼働時間が設定画面に出る', (await opt.locator('#hours').inputValue()).includes('平日19〜23時'));
await opt.click('#preview');
await opt.waitForTimeout(1200);
const preview = await opt.locator('#previewOut').textContent();
check('プレビューで応募文が出る', preview.length > 300, `${preview.length}文字`);
check('プレビューに【要記入】が無い', !preview.includes('要記入'));
await opt.fill('#responseTime', '平日は2時間以内');
await opt.click('#save');
await opt.waitForTimeout(800);
const saved = await opt.evaluate(() => new Promise((r) => chrome.storage.local.get({ profile: null }, (o) => r(o.profile))));
check('設定が保存される', saved && saved.availability.responseTime === '平日は2時間以内',
  saved ? saved.availability.responseTime : 'null');

console.log('\n=== ⑬ 使用禁止の媒体 ===');
const cwCheck = await popup.evaluate(async (id) => {
  const ad = await import(`chrome-extension://${id}/content/adapters/index.js`);
  const cw = ad.adapters.find((a) => a.id === 'crowdworks');
  return {
    banned: !!cw.banned,
    inSearch: ad.allSearchUrls().some((s) => s.site === 'crowdworks'),
    matches: cw.matches({ hostname: 'crowdworks.jp' }),
  };
}, extId);
check('クラウドワークスは禁止として登録されている', cwCheck.banned);
check('クラウドワークスは巡回対象に入っていない', !cwCheck.inSearch);
check('クラウドワークスのページを認識する（警告を出すため）', cwCheck.matches);

console.log('\n=== ⑭ 例外の記録 ===');
check('ページ内で例外が出ていない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' / '));

await finish();

async function finish() {
  console.log('\n' + '='.repeat(60));
  console.log(`結果: ${pass} 件成功 / ${fail} 件失敗 （網羅率の分母 ${pass + fail} 件）`);
  if (fail) {
    console.log('\n失敗した項目:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}\n     ${r.detail}`));
  }
  console.log('='.repeat(60));
  await ctx.close().catch(() => {});
  server.close();
  rmSync(userDir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
