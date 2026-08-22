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
// テストでは全媒体を最後まで回らせる（途中で切り上げないように）
await popup.evaluate(() => new Promise((r) => chrome.runtime.sendMessage(
  { type: 'setSettings', settings: { targetCandidates: 30, maxOpenTabs: 20 } }, r)));
await popup.waitForTimeout(500);
await popup.click('#auto');

// 「巡回を始めています…」で固まらないこと
await popup.waitForTimeout(4000);
const stuck = (await popup.locator('#auto').textContent()).includes('始めています');
check('ボタンが「始めています…」で固まらない', !stuck, stuck ? '4秒経っても開始しませんでした' : '');

// 巡回の完了を待つ
let crawl = null;
for (let i = 0; i < 180; i++) {
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

console.log('\n=== ④の2 通した案件は必ず全条件を満たす（不変条件）===');
{
  const delivered = jobs.filter((j) => j.must && j.must.passed);
  check('★通した案件に「条件に反する」項目が1つも無い',
    delivered.every((j) => (j.checklist || []).every((c) => c.status !== 'ng')),
    delivered.filter((j) => (j.checklist || []).some((c) => c.status === 'ng')).map((j) => j.id).join(','));
  check('★通した案件に危険な条件が無い',
    delivered.every((j) => !(j.redFlags || []).length && !j.banned),
    delivered.filter((j) => (j.redFlags || []).length || j.banned).map((j) => j.id).join(','));
  check('★通した案件は必須4項目がすべて確認済み',
    delivered.every((j) => !(j.must.unconfirmed || []).length),
    delivered.filter((j) => (j.must.unconfirmed || []).length).map((j) => `${j.id}:${j.must.unconfirmed}`).join(' / '));
  check('★BtoBの案件が1件も通っていない',
    delivered.every((j) => (j.checklist || []).find((c) => c.key === 'target').status === 'ok'), '');
  check('★アポイント譲渡型でない案件が1件も通っていない',
    delivered.every((j) => (j.checklist || []).find((c) => c.key === 'appointment').status === 'ok'), '');
  check('★オンライン完結でない案件が1件も通っていない',
    delivered.every((j) => (j.checklist || []).find((c) => c.key === 'style').status === 'ok'), '');
  check('★有形商材の案件が1件も通っていない',
    delivered.every((j) => (j.checklist || []).find((c) => c.key === 'product').status === 'ok'), '');
}

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

console.log('\n=== ⑦の2 開いたタブに応募文が「もう出来ている」か ===');
{
  const jobTabs = ctx.pages().filter((p) => /\/job\/\d+/.test(p.url()));
  check('合格案件のタブが開いている', jobTabs.length > 0, `${jobTabs.length}枚`);
  let ready = 0;
  for (const t of jobTabs) {
    const v = await t.evaluate(() => {
      const host = document.getElementById('sales-apply-panel');
      if (!host) return null;
      const ta = host.shadowRoot.querySelector('textarea');
      return ta ? ta.value : '';
    }).catch(() => null);
    if (v && v.length > 300) ready++;
  }
  check('★開いた全タブで応募文が出来上がっている', ready === jobTabs.length,
    `${ready}/${jobTabs.length} 枚`);
}

console.log('\n=== ⑦の3 募集要項の指示を守っているか ===');
{
  // #13: 指定項目5つ＋合言葉
  const t13 = await ctx.newPage();
  await t13.goto(`http://localhost:${PORT}/job/13`);
  await t13.waitForTimeout(2500);
  const d13 = await t13.evaluate(() => document.getElementById('sales-apply-panel').shadowRoot.querySelector('textarea').value);
  check('★合言葉が冒頭にある', d13.startsWith('オンライン商談希望'), d13.slice(0, 30));
  for (const label of ['お名前', '稼働可能時間', '営業経験の有無', '志望動機', '通信環境']) {
    check(`★指定項目「${label}」に答えている`, d13.includes(`${label}：`), '');
  }
  check('指定項目の答えが空でない', !d13.includes('：\n') && !d13.includes('要記入'), '');
  check('会社名に触れている', d13.includes('株式会社ライフデザイン'));
  check('会社の理念の言葉を借りている', d13.includes('一人ひとりの人生の選択肢を増やす'));
  check('パネルに読み取り結果が出る', await t13.evaluate(() =>
    document.getElementById('sales-apply-panel').shadowRoot.textContent.includes('募集要項から読み取ったこと')));

  // #14: 400文字以内の指定
  const t14 = await ctx.newPage();
  await t14.goto(`http://localhost:${PORT}/job/14`);
  await t14.waitForTimeout(2500);
  const d14 = await t14.evaluate(() => document.getElementById('sales-apply-panel').shadowRoot.querySelector('textarea').value);
  const width14 = [...d14].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);
  check('★400文字以内の指定を守っている', width14 <= 400, `${Math.round(width14)}文字相当`);
  check('文字数を削っても熱量は残っている', /営業という|営業力|決めていただく/.test(d14), d14.slice(0, 60));
  check('文字数を削っても会社の言葉に触れている', d14.includes('続けられる人を増やす') || d14.includes('合同会社ヘルスラボ'));

  // #15: 答えられない指定項目（年齢・資格）
  const t15 = await ctx.newPage();
  await t15.goto(`http://localhost:${PORT}/job/15`);
  await t15.waitForTimeout(2500);
  const d15 = await t15.evaluate(() => document.getElementById('sales-apply-panel').shadowRoot.querySelector('textarea').value);
  check('★答えられない項目は【要記入】として残る', d15.includes('要記入'), d15.slice(0, 80));
  check('答えられない項目が警告に出る', await t15.evaluate(() =>
    document.getElementById('sales-apply-panel').shadowRoot.textContent.includes('答えられなかった項目')
    || document.getElementById('sales-apply-panel').shadowRoot.textContent.includes('未記入')));
  check('答えられる項目（お名前）は埋まっている', d15.includes('お名前：緒方 琴音'));

  await t13.close(); await t14.close(); await t15.close();
}

console.log('\n=== ⑦の4 応募文の品質 ===');
{
  const quality = draft;
  const paras = quality.split('\n\n');
  check('段落に分かれている（読みやすさ）', paras.length >= 5, `${paras.length}段落`);
  check('長すぎない（2000文字未満）', quality.length < 2000, `${quality.length}文字`);
  check('短すぎない（400文字超）', quality.length > 400, `${quality.length}文字`);
  check('「！」が2つ以下', (quality.match(/[!！]/g) || []).length <= 2);
  check('「させていただ」が2回以下', (quality.match(/させていただ/g) || []).length <= 2,
    String((quality.match(/させていただ/g) || []).length));
  check('宛先の取り違えが無い（他社名が混ざらない）', !quality.includes('株式会社ライフデザイン'));
  check('嘘の実績が入っていない（LINE bot構築を名乗らない）', !quality.includes('AI接客bot'));
  check('嘘の実績が入っていない（DXパックを売った実績を名乗らない）', !quality.includes('DXパック'));
  check('リモート運営を名乗っていない', !quality.includes('リモートで運営'));
  check('締めの挨拶がある', /お願いいたします/.test(quality));
  check('自分の言葉（一人称）で書かれている', /自分|私/.test(quality));
}

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

console.log('\n=== ⑧の2 媒体ごとのHTMLの違いに耐えるか ===');
{
  const bySite = {};
  for (const j of JOBS) (bySite[j.site || 'A'] = bySite[j.site || 'A'] || []).push(j.id);
  const collected = jobs.map((j) => Number(String(j.id)));
  for (const [site, ids] of Object.entries(bySite)) {
    const wantPass = ids.filter((id) => JOBS.find((j) => j.id === id).expect === 'pass');
    const gotPass = wantPass.filter((id) => {
      const f = jobs.find((x) => Number(String(x.id)) === id);
      return f && f.must && f.must.passed;
    });
    const layout = { A: 'divのカード', B: 'テーブル', C: 'リンクだけの短いカード', D: '入れ子が深い＋ヘッダーに罠' }[site];
    check(`媒体${site}（${layout}）から案件を読み取れる`, gotPass.length === wantPass.length,
      `合格すべき ${wantPass.join(',')} / 実際 ${gotPass.join(',')}`);
  }
  check('ヘッダーの求人リンクを案件として拾っていない',
    collected.filter((id) => id === 15).length <= 1, `#15が${collected.filter((id) => id === 15).length}件`);
}

console.log('\n=== ⑨ 状態の管理（同じものが二度と出てこないこと）===');
const readJobs = () => popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ jobs: [] }, (o) => r(o.jobs))));
const statusOf = async (id) => {
  const js = await readJobs();
  const f = js.find((j) => Number(String(j.id)) === id);
  return f ? f.status : null;
};

check('★応募文を作った案件は「書きかけ」になる', (await statusOf(1)) === 'drafted', String(await statusOf(1)));
check('★開いた案件はすべて「書きかけ」になる（開いた時点で応募文ができている）',
  (await statusOf(2)) === 'drafted', String(await statusOf(2)));
check('条件に合わない案件は「対象外」', (await statusOf(3)) === 'rejected' || (await statusOf(3)) === null);
{
  const all = await readJobs();
  const n = all.reduce((a, j) => ({ ...a, [j.status]: (a[j.status] || 0) + 1 }), {});
  check('条件を満たした案件がすべて書きかけになっている',
    (n.drafted || 0) === EXPECT_PASS.length, JSON.stringify(n));
  check('★対象外の案件が候補や書きかけに混ざっていない',
    all.filter((j) => j.status === 'drafted' || j.status === 'candidate')
      .every((j) => j.must && j.must.passed), '');
}

// 応募済みにする
await detail.evaluate(() => {
  const root = document.getElementById('sales-apply-panel').shadowRoot;
  [...root.querySelectorAll('button.act')].find((x) => x.textContent.includes('応募した')).click();
});
await detail.waitForTimeout(1200);
check('★「応募した」を押すと応募済みになる', (await statusOf(1)) === 'applied', String(await statusOf(1)));
const appliedLedger = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ applied: {} }, (o) => r(o.applied))));
check('応募履歴が別台帳にも残る', Object.keys(appliedLedger).length === 1);

await popup.reload();
await popup.waitForTimeout(1200);
const candidateCount = await popup.locator('#list li').count();
check('★応募済みは「候補」一覧から消える',
  !(await popup.locator('#list').textContent()).includes('パーソナルジム'), '');
await popup.evaluate(() => document.querySelector('.tabs button[data-tab="applied"]').click());
await popup.waitForTimeout(400);
check('「応募済み」タブに移る', (await popup.locator('#list').textContent()).includes('パーソナルジム'));
await popup.evaluate(() => document.querySelector('.tabs button[data-tab="drafted"]').click());
await popup.waitForTimeout(400);
await popup.evaluate(() => document.querySelector('.tabs button[data-tab="candidate"]').click());
await popup.waitForTimeout(400);

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

console.log('\n=== ⑪ 2回目の巡回（もう出てこないことの確認）===');
const before = (await readJobs()).length;
const tabsBefore = ctx.pages().filter((p) => /\/job\/\d+/.test(p.url())).length;
const beforeStates = Object.fromEntries((await readJobs()).map((j) => [String(j.id), j.status]));

await popup.click('#auto');
for (let i = 0; i < 180; i++) {
  const c = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ crawl: {} }, (o) => r(o.crawl))));
  if (c && !c.running && c.finishedAt) break;
  await sleep(1000);
}
await sleep(1500);
const afterJobs = await readJobs();
check('同じ案件が二重に増えない', afterJobs.length === before, `${before}件 → ${afterJobs.length}件`);
check('★応募済みの案件は2回目でも応募済みのまま',
  afterJobs.find((j) => Number(String(j.id)) === 1).status === 'applied',
  afterJobs.find((j) => Number(String(j.id)) === 1).status);
check('★一度開いた案件は2回目でタブを開き直さない',
  ctx.pages().filter((p) => /\/job\/\d+/.test(p.url())).length === tabsBefore,
  `${tabsBefore}枚 → ${ctx.pages().filter((p) => /\/job\/\d+/.test(p.url())).length}枚`);
const changed = afterJobs.filter((j) => beforeStates[String(j.id)] && beforeStates[String(j.id)] !== j.status);
check('★2回目の巡回で状態が勝手に変わらない', changed.length === 0,
  changed.map((j) => `${j.id}:${beforeStates[String(j.id)]}→${j.status}`).join(', '));
const crawl2 = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get({ crawl: {} }, (o) => r(o.crawl))));
check('2回目は「調べ済みは飛ばした」と記録される',
  (crawl2.log || []).some((l) => l.includes('飛ばした') || l.includes('新しいものなし') || l.includes('新しい案件はありません')),
  (crawl2.log || []).join(' / '));

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
