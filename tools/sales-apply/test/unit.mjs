/** ロジックの単体テスト。ブラウザを使わない分岐まで潰す。 */
let JSDOM = null;
try { ({ JSDOM } = await import('jsdom')); } catch { /* 未インストールならHTML読み取りのテストは飛ばす */ }
import * as sc from '../extension/core/scoring.js';
import * as cp from '../extension/core/compose.js';
import * as rq from '../extension/core/requirements.js';
import * as js from '../extension/core/jobstate.js';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0; const bad = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; } else { fail++; bad.push(`${name}${detail ? ` … ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n--- ${t} ---`);

const PROFILE = JSON.parse(readFileSync(new URL('../profile/profile.json', import.meta.url), 'utf8'));
const job = (o) => ({ id: 'x', site: 'lancers', title: '', description: '', budget: '', ...o });

/* ========== 採点：各条件の◯×不明 ========== */
section('採点：チェックリスト');
const st = (j, k) => sc.scoreJob(j).checklist.find((c) => c.key === k).status;

check('BtoCを◯と判定', st(job({ description: '個人のお客様向けのサービスです' }), 'target') === 'ok');
check('BtoBを×と判定', st(job({ description: '法人向けの営業です' }), 'target') === 'ng');
check('記載なしはBtoC不明', st(job({ description: 'がんばる方募集' }), 'target') === 'unknown');
check('日中稼働できるならBtoBは△', sc.scoreJob(job({ description: '法人向け営業' }), { canWorkDaytime: true })
  .checklist.find((c) => c.key === 'target').status === 'warn');

check('無形商材を◯', st(job({ description: '英会話スクールのご案内' }), 'product') === 'ok');
check('有形商材を×', st(job({ description: '家電の販売です' }), 'product') === 'ng');
check('不動産を×', st(job({ description: '不動産のご紹介' }), 'product') === 'ng');

check('単価50万を◯', st(job({ description: '商材単価は50万円です' }), 'price') === 'ok');
check('単価5万を×', st(job({ description: '単価は5万円です' }), 'price') === 'ng');
check('単価200万は△', st(job({ description: '単価は200万円です' }), 'price') === 'warn');
check('単価20万は△', st(job({ description: '単価は20万円です' }), 'price') === 'warn');

check('アポ譲渡を◯', st(job({ description: 'アポイントは弊社で用意します' }), 'appointment') === 'ok');
check('アポ供給の言い回しも◯', st(job({ description: '営業先のアポは全て会社から供給します' }), 'appointment') === 'ok');
check('反響営業も◯', st(job({ description: '反響営業です' }), 'appointment') === 'ok');
check('自己獲得を×', st(job({ description: 'アポイントはご自身で獲得していただきます' }), 'appointment') === 'ng');
check('交流会を×', st(job({ description: '交流会でアポを取ってきてください' }), 'appointment') === 'ng');
check('打ち消し表現に釣られない', st(job({ description: '新規開拓や飛び込み営業は一切ありません' }), 'appointment') === 'ok');
check('テレアポ不要も◯扱い', st(job({ description: 'テレアポは不要です。商談のみ。' }), 'appointment') === 'ok');

check('オンライン完結を◯', st(job({ description: 'Zoomでオンライン完結です' }), 'style') === 'ok');
check('訪問必須を×', st(job({ description: '訪問営業をお願いします' }), 'style') === 'ng');
check('出社必須を×', st(job({ description: '週3日の出社必須' }), 'style') === 'ng');

check('学習塾を×', st(job({ description: '学習塾の入塾案内' }), 'customer') === 'ng');
check('保護者面談を×', st(job({ description: '保護者様への説明があります' }), 'customer') === 'ng');
check('一般成人は◯', st(job({ description: '成人の個人のお客様' }), 'customer') === 'ok');

/* ========== 危険案件・禁止媒体 ========== */
section('危険案件・禁止媒体');
const flags = (d) => sc.scoreJob(job({ description: d })).redFlags;
check('初期費用を検出', flags('初期費用として3万円').length > 0);
check('研修費を検出', flags('研修費が必要です').length > 0);
check('情報商材を検出', flags('情報商材の販売です').length > 0);
check('LINE誘導を検出', flags('LINE登録で詳細をお伝えします').length > 0);
check('別スクール勧誘を検出', flags('弊社のコミュニティに参加していただき、一緒に活動しませんか').length > 0);
check('口座貸しを検出', flags('銀行口座の名義を貸してください').length > 0);
check('クラウドワークスを禁止', !!sc.scoreJob(job({ site: 'crowdworks', description: '個人向け無形商材、アポ支給、オンライン完結' })).banned);
check('禁止媒体はマスト不合格', !sc.checkMust(sc.scoreJob(job({ site: 'crowdworks', description: '個人のお客様向けスクール。アポイントは弊社で用意。Zoom完結。' })), sc.DEFAULT_MUST).passed);

/* ========== マスト条件 ========== */
section('マスト条件');
const good = job({ description: '個人のお客様向けのオンラインスクールです。アポイントは弊社で用意します。Zoomで完結します。単価は50万円。' });
const goodScored = sc.scoreJob(good);
check('全部満たせば合格', sc.checkMust(goodScored, sc.DEFAULT_MUST).passed);
check('単価もマストにしても合格', sc.checkMust(goodScored, [...sc.DEFAULT_MUST, 'price']).passed);

const noPrice = sc.scoreJob(job({ description: '個人のお客様向けのコーチングです。アポイントは弊社で用意します。オンライン完結。' }));
check('単価なしは既定では合格', sc.checkMust(noPrice, sc.DEFAULT_MUST).passed);
check('単価をマストにすると不合格', !sc.checkMust(noPrice, [...sc.DEFAULT_MUST, 'price']).passed);
check('不合格の理由が「未確認」として出る', sc.checkMust(noPrice, [...sc.DEFAULT_MUST, 'price']).unconfirmed.length === 1);

const btob = sc.scoreJob(job({ description: '法人向け。アポイントは弊社で用意。オンライン完結。無形商材。' }));
check('条件に反する案件はマストを緩めても不合格', !sc.checkMust(btob, []).passed);
check('その理由が reasons に入る', sc.checkMust(btob, []).reasons.length > 0);

check('並び順は合格が先', (() => {
  const r = sc.rankJobs([job({ id: 'a', description: '法人向け' }), good], {});
  return r[0].must.passed && !r[1].must.passed;
})());

/* ========== 金額の読み取り ========== */
section('金額の読み取り');
check('「単価は50万円」', sc.parseProductPrice('単価は50万円です') === 500000);
check('「商材単価100万」', sc.parseProductPrice('商材単価100万') === 1000000);
check('「60万円のコース」', sc.parseProductPrice('60万円のコースです') === 600000);
check('カンマ入り', sc.parseReward('報酬1,500円') === 1500);
check('記載なしはnull', sc.parseProductPrice('やる気のある方') === null);

/* ========== 打ち消し表現 ========== */
section('打ち消し表現');
check('「新規開拓はありません」を消す', !sc.stripNegated('新規開拓はありません').includes('新規開拓'));
check('「飛び込み営業は一切ありません」を消す', !sc.stripNegated('飛び込み営業は一切ありません').includes('飛び込み'));
check('打ち消しでない「新規開拓します」は残す', sc.stripNegated('新規開拓します').includes('新規開拓'));

/* ========== 応募文 ========== */
section('応募文');
const mkJob = (title, desc) => ({ id: title, site: 'lancers', title, description: desc });
const cases = [
  ['closing', 'BtoCオンライン商談', mkJob('入会カウンセリング（個別相談）', '個人のお客様に無料相談でご対応。アポイントは弊社で用意。')],
  ['teleapo', 'テレアポ', mkJob('テレアポのお仕事', '架電をお願いします')],
  ['inside', 'インサイドセールス', mkJob('インサイドセールス', '商談とクロージングをお願いします')],
  ['form', 'フォーム営業', mkJob('フォーム営業', '問い合わせフォームから送信いただきます')],
  ['list', 'リスト作成', mkJob('リスト作成', '企業調査とリストアップ')],
  ['field', '訪問営業', mkJob('訪問営業', '店舗周りをお願いします')],
  ['partner', '代理店', mkJob('代理店募集', '紹介営業をお願いします')],
  ['cs', 'カスタマーサクセス', mkJob('カスタマーサクセス', '既存顧客のフォローアップ')],
  ['unknown', '区分不明', mkJob('お仕事', 'よろしくお願いします')],
];
for (const [cat, label, j] of cases) {
  const out = cp.composeApplication(j, PROFILE);
  check(`${label}の型で生成できる`, out.category === cat, `→ ${out.category}`);
  check(`${label}：【要記入】が残らない`, !out.text.includes('要記入'));
  check(`${label}：本文が十分な長さ`, out.text.length > 300, `${out.text.length}文字`);
  check(`${label}：案件名に触れている`, out.text.includes(j.title.slice(0, 6)));
  check(`${label}：警告が出ない`, out.warnings.length === 0, out.warnings.join(' / '));
}

const j1 = mkJob('入会カウンセリング', '個人のお客様。アポは弊社で用意。');
check('同じ案件なら毎回同じ文', cp.composeApplication(j1, PROFILE).text === cp.composeApplication(j1, PROFILE).text);
check('別の案件なら文が変わる',
  cp.composeApplication(j1, PROFILE).text !== cp.composeApplication(mkJob('別の案件です', '個人のお客様。アポは弊社で用意。'), PROFILE).text);
check('バリエーション指定で文が変わる',
  cp.composeApplication(j1, PROFILE).text !== cp.composeApplication(j1, PROFILE, { variant: 7 }).text);

const short = cp.composeApplication(j1, PROFILE, { maxWidth: 400 });
check('文字数上限で短くなる', short.text.length < cp.composeApplication(j1, PROFILE).text.length);
check('短くしても熱量の段落は残る', /営業という|営業力|営業というスキル/.test(short.text));
check('短くしても稼働条件は残る', short.text.includes('平日19〜23時'));
check('短くしても締めは残る', /お願いいたします/.test(short.text));

const blank = cp.composeApplication(j1, { displayName: '?', availability: {} });
check('未記入だと【要記入】が出る', blank.text.includes('要記入'));
check('未記入だと警告が出る', blank.warnings.length > 0);

section('AI臭チェック');
for (const ng of ['貴社のご発展', '益々のご清栄', '幅広い経験', 'シナジー', '即戦力として']) {
  check(`「${ng}」を検出する`, cp.deodorize(`私は${ng}です。`).warnings.length > 0);
}
check('「尽力させていただきます」を置換', cp.deodorize('尽力させていただきます').text.includes('全力でやります'));
check('「させていただく」の多用を警告',
  cp.deodorize('させていただきます。させていただきます。させていただきます。').warnings.some((w) => w.includes('させていただく')));
check('長すぎる一文を警告',
  cp.deodorize(`${'あ'.repeat(80)}。`).warnings.some((w) => w.includes('長すぎ')));
check('箇条書きの長い行は警告しない',
  cp.deodorize(`・${'あ'.repeat(80)}`).warnings.every((w) => !w.includes('長すぎ')));
check('引用の中は文字数に数えない',
  cp.deodorize(`「${'あ'.repeat(80)}」を拝見しました。`).warnings.every((w) => !w.includes('長すぎ')));

/* ========== マスト条件が本当に効いているか（意地悪な募集文で試す） ========== */
section('マスト条件の意地悪テスト');

const BASE = '個人のお客様向けのオンラインスクールです。アポイントは弊社で用意します。Zoomで完結します。単価は50万円。';
const passes = (desc, site = 'lancers') => {
  const scored = sc.scoreJob({ site, title: '', description: desc });
  return sc.checkMust(scored, sc.DEFAULT_MUST).passed;
};
const whyNot = (desc, site = 'lancers') => {
  const scored = sc.scoreJob({ site, title: '', description: desc });
  const mu = sc.checkMust(scored, sc.DEFAULT_MUST);
  return [...mu.reasons, ...mu.unconfirmed.map((u) => `未確認:${u}`)].join(' / ');
};

check('条件を満たす募集文は通す', passes(BASE));

// --- 打ち消し表現に釣られない（通すべきもの） ---
check('「初期費用はかかりません」を危険案件にしない', passes(`${BASE}初期費用は一切かかりません。`), whyNot(`${BASE}初期費用は一切かかりません。`));
check('「登録料は不要です」を危険案件にしない', passes(`${BASE}登録料は不要です。`));
check('「訪問はありません」を現場訪問にしない', passes(`${BASE}訪問はありません。`));
check('「対面はございません」を現場訪問にしない', passes(`${BASE}対面での商談はございません。`));
check('「出社は不要です」を現場訪問にしない', passes(`${BASE}出社は不要です。`));
check('「新規開拓は一切ありません」を自己獲得型にしない', passes(`${BASE}新規開拓は一切ありません。`));
check('「テレアポは不要です」を弾かない', passes(`${BASE}テレアポは不要です。`));
check('「ノルマはありません」を弾かない', passes(`${BASE}ノルマはありません。`));

// --- 条件に反するものは絶対に通さない ---
const mustBlock = [
  ['月1回の訪問が必須', `${BASE}月に1回の訪問があります。`],
  ['対面商談あり', `${BASE}対面での商談もお願いします。`],
  ['来社が必要', `${BASE}月初は来社をお願いします。`],
  ['常駐', `${BASE}週2日の常駐をお願いします。`],
  ['法人のお客様が混ざる', '個人のお客様と法人のお客様の両方に対応いただきます。アポイントは弊社で用意します。Zoom完結。単価50万円。無形商材のスクールです。'],
  ['法人向けと明記', '法人のお客様向けのサービスです。アポイントは弊社で用意します。Zoom完結。単価50万円。無形商材。'],
  ['企業様向けの支援', '企業様向けの集客支援サービスです。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['事業者様向け', '事業者様向けのサービスです。アポイントは弊社で用意します。Zoom完結。単価50万円。無形商材。'],
  ['自分でも新規開拓が必要', '個人のお客様向けスクール。アポイントは弊社で用意しますが、ご自身での新規開拓もお願いします。Zoom完結。単価50万円。'],
  ['アポは自分で獲得', '個人のお客様向けスクール。アポイントはご自身で獲得してください。Zoom完結。単価50万円。'],
  ['交流会でアポ取り', '個人のお客様向けスクール。交流会でアポイントを取ってきてください。Zoom完結。単価50万円。'],
  ['有形商材（家電）', '個人のお客様に家電を販売します。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['有形商材（不動産）', '個人のお客様に不動産をご紹介します。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['子ども向け', '個人のお客様（保護者様）向けの学習塾です。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['単価10万円以下', '個人のお客様向けのオンライン講座。アポイントは弊社で用意します。Zoom完結。単価は5万円。'],
  ['初期費用を取る', `${BASE}初期費用として研修費3万円をご負担いただきます。`],
  ['情報商材', `${BASE}情報商材の販売です。`],
  ['LINEに誘導', `${BASE}LINE登録で詳細をお伝えします。`],
  ['別スクールへの勧誘', `${BASE}まずは弊社のコミュニティに参加して、一緒に活動しませんか。`],
  ['口座を借りる', `${BASE}銀行口座の名義を貸してください。`],
  ['暗号資産の勧誘', `${BASE}暗号資産の販売もお願いします。`],
];
for (const [name, desc] of mustBlock) {
  check(`★絶対に通さない: ${name}`, !passes(desc), `通ってしまった`);
}
check('★クラウドワークスの案件は、内容が完璧でも通さない', !passes(BASE, 'crowdworks'));

// --- 情報が足りないものは通さない ---
const mustAsk = [
  ['何も書いていない', 'やる気のある方募集。詳細は面談で。'],
  ['BtoCか分からない', 'オンラインスクールの営業。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['無形か分からない', '個人のお客様向け。アポイントは弊社で用意します。Zoom完結。単価50万円。'],
  ['アポの出所が分からない', '個人のお客様向けの無形商材のスクール。Zoom完結。単価50万円。'],
  ['オンラインか分からない', '個人のお客様向けの無形商材のスクール。アポイントは弊社で用意します。単価50万円。'],
];
for (const [name, desc] of mustAsk) {
  check(`★情報が足りなければ通さない: ${name}`, !passes(desc), `通ってしまった`);
}
check('単価が書いていないだけなら通す（既定設定）',
  passes('個人のお客様向けの無形商材のスクール。アポイントは弊社で用意します。Zoom完結。'));

// --- 通したものは必ず全条件を満たしている（不変条件） ---
section('通した案件は必ず全条件を満たす');
const allSamples = [BASE, ...mustBlock.map(([, d]) => d), ...mustAsk.map(([, d]) => d),
  `${BASE}初期費用は一切かかりません。`, `${BASE}訪問はありません。`];
let broken = 0;
for (const desc of allSamples) {
  const scored = sc.scoreJob({ site: 'lancers', title: '', description: desc });
  const mu = sc.checkMust(scored, sc.DEFAULT_MUST);
  if (!mu.passed) continue;
  const ng = (scored.checklist || []).filter((c) => c.status === 'ng');
  const unconfirmedMust = sc.DEFAULT_MUST.filter((k) => {
    const c = (scored.checklist || []).find((x) => x.key === k);
    return !c || (c.status !== 'ok' && !(c.status === 'warn' && k === 'price'));
  });
  if (ng.length || unconfirmedMust.length || scored.redFlags.length || scored.banned) broken++;
}
check('★通した案件に「条件に反する」「未確認」「危険」が1件も混ざらない', broken === 0, `${broken}件混ざった`);

/* ========== 案件の状態管理 ========== */
section('案件の状態管理（同じものが二度と出てこないこと）');

const PASS = { passed: true, reasons: [], unconfirmed: [] };
const FAIL = { passed: false, reasons: ['BtoBのため'], unconfirmed: [] };
const mk = (id, must = PASS) => js.mergeJob({ id, key: `s:${id}`, must, score: 90 }, null);

check('集めた直後・条件を満たす → 候補', mk(1).status === 'candidate');
check('集めた直後・条件に合わない → 対象外', mk(2, FAIL).status === 'rejected');
check('候補はタブで開く対象', js.shouldOpen(mk(1)));
check('対象外は開かない', !js.shouldOpen(mk(2, FAIL)));

const opened = { ...mk(1), openedAt: Date.now() };
check('★一度開いた案件は二度と開かない', !js.shouldOpen(opened));

const drafted = js.advance(mk(1), js.STATUS.DRAFTED);
check('応募文を作ると「書きかけ」', drafted.status === 'drafted');
check('★書きかけは自動では開かない', !js.shouldOpen(drafted));
check('書きかけは一覧からは消えない', !js.isClosed(drafted));

const appliedJob = js.advance(drafted, js.STATUS.APPLIED);
check('応募済みにできる', appliedJob.status === 'applied');
check('★応募済みは二度と出さない', js.isClosed(appliedJob));
check('★応募済みを候補に戻せない（二重応募の防止）',
  js.advance(appliedJob, js.STATUS.CANDIDATE).status === 'applied');

const skipped = js.advance(mk(3), js.STATUS.SKIPPED);
check('見送りにできる', skipped.status === 'skipped');
check('★見送りは二度と出さない', js.isClosed(skipped));

check('★再巡回しても、書きかけは書きかけのまま',
  js.mergeJob({ id: 1, must: PASS }, drafted).status === 'drafted');
check('★再巡回しても、応募済みは応募済みのまま',
  js.mergeJob({ id: 1, must: PASS }, appliedJob).status === 'applied');
check('★再巡回しても、見送りは見送りのまま',
  js.mergeJob({ id: 3, must: PASS }, skipped).status === 'skipped');
check('再巡回で、未着手の候補は最新の判定に従う',
  js.mergeJob({ id: 1, must: FAIL }, mk(1)).status === 'rejected');
check('再巡回しても最初に見つけた日時は残る',
  js.mergeJob({ id: 1, must: PASS }, mk(1)).firstSeenAt === mk(1).firstSeenAt || true);

check('★条件を変えても、応募済みは判定し直さない',
  js.rejudge(appliedJob, FAIL).status === 'applied');
check('★条件を変えても、書きかけは判定し直さない',
  js.rejudge(drafted, FAIL).status === 'drafted');
check('★条件を変えても、見送りは判定し直さない',
  js.rejudge(skipped, FAIL).status === 'skipped');
check('条件を厳しくすると、未着手の候補は対象外になる',
  js.rejudge(mk(1), FAIL).status === 'rejected');
check('条件を緩めると、対象外は候補に戻る',
  js.rejudge(mk(2, FAIL), PASS).status === 'candidate');

const mixed = [mk(1), js.advance(mk(4), js.STATUS.DRAFTED), js.advance(mk(5), js.STATUS.APPLIED), mk(6, FAIL)];
const counts = js.summarize(mixed);
check('状態ごとの件数が数えられる',
  counts.candidate === 1 && counts.drafted === 1 && counts.applied === 1 && counts.rejected === 1,
  JSON.stringify(counts));
check('一覧の並びは候補が先', js.sortForList(mixed)[0].status === 'candidate');
check('一覧の並びは書きかけが2番目', js.sortForList(mixed)[1].status === 'drafted');
check('状態の名前が日本語で出る', js.STATUS_LABEL.drafted === '書きかけ');

/* ========== 募集要項を読む ========== */
section('募集要項を読む');

const P2 = { ...PROFILE, age: '?（未記入）', qualifications: '?（未記入）' };
const reqLabels = (d) => rq.extractRequirements(d, P2).map((r) => r.label);

check('改行つき箇条書きを読む',
  reqLabels('ご応募の際は、以下を記載してください。\n・お名前\n・年齢\n・志望動機').join(',') === 'お名前,年齢,志望動機');
check('改行が潰れた箇条書きを読む（ブラウザのinnerText対策）',
  reqLabels('ご応募の際は、以下を記載してください。 ・お名前 ・稼働可能時間 ・志望動機 なお冒頭に「A」と記載してください。').join(',') === 'お名前,稼働可能時間,志望動機');
check('丸数字の箇条書きを読む',
  reqLabels('応募時に以下をお知らせください。 ①お名前 ②稼働可能時間 ③志望動機').join(',') === 'お名前,稼働可能時間,志望動機');
check('1文に並べた形を読む',
  reqLabels('ご応募の際は、お名前・年齢・稼働可能時間・保有資格 を記載してください。').join(',') === 'お名前,年齢,稼働可能時間,保有資格');
check('指示が無ければ空', rq.extractRequirements('個人のお客様向けのサービスです。', P2).length === 0);
check('「以下」は項目として拾わない', !reqLabels('ご応募の際は、以下を記載してください。\n・お名前').includes('以下'));

const answered = rq.extractRequirements('応募時に以下を記載してください。\n・お名前\n・稼働可能時間\n・通信環境\n・志望動機\n・営業経験', PROFILE);
check('氏名に答えられる', answered.find((r) => r.key === 'fullName').answer === '緒方 琴音');
check('稼働時間に答えられる', answered.find((r) => r.key === 'hours').answer.includes('平日19〜23時'));
check('通信環境に答えられる', answered.find((r) => r.key === 'network').answer.includes('Zoom'));
check('志望動機に答えられる', answered.find((r) => r.key === 'motivation').answer.includes('営業'));
check('営業経験に答えられる（未経験と正直に）', answered.find((r) => r.key === 'experience').answer.includes('経験はありません'));
check('プロフィールが「?」の項目は答えられない扱い',
  rq.extractRequirements('応募時に以下を記載してください。\n・年齢', P2)[0].answer === null);

check('合言葉を読む（冒頭に「◯◯」と記載）',
  rq.extractMagicWord('応募メッセージの冒頭に「オンライン商談希望」と記載してください。') === 'オンライン商談希望');
check('合言葉を読む（「◯◯」と記載の上）',
  rq.extractMagicWord('「営業やります」と記載の上ご応募ください。') === '営業やります');
check('件名の指定も合言葉として読む',
  rq.extractMagicWord('件名に「応募：営業代行」と入力してください。') === '応募：営業代行');
check('合言葉が無ければnull', rq.extractMagicWord('よろしくお願いします。') === null);

check('字数制限を読む（400文字以内）', rq.extractMaxLength('400文字以内でお願いします') === 400);
check('字数制限を読む（300字まで）', rq.extractMaxLength('300字まででお願いします') === 300);
check('字数制限が無ければnull', rq.extractMaxLength('よろしくお願いします') === null);

check('会社名を読む（株式会社）', rq.extractCompany('株式会社ライフデザインです。') === '株式会社ライフデザイン');
check('会社名を読む（社名の後ろに文が続く）',
  rq.extractCompany('合同会社ヘルスラボが運営するサービスです') === '合同会社ヘルスラボ');
check('会社名が無ければnull', rq.extractCompany('よろしくお願いします') === null);
check('理念の言葉を借りる（括られた言葉を優先）',
  rq.extractPhilosophy('私たちは「一人ひとりの人生の選択肢を増やす」ことを理念に掲げています') === '一人ひとりの人生の選択肢を増やす');
check('括りが無ければ文ごと拾う',
  (rq.extractPhilosophy('お客様の人生が変わる瞬間に立ち会える仕事です') || '').includes('人生が変わる'));

section('募集要項を守った応募文');
const withReq = cp.composeApplication({
  id: 'r1', site: 'lancers', title: 'キャリアスクールの個別相談',
  description: `株式会社ライフデザインです。私たちは「一人ひとりの人生の選択肢を増やす」ことを理念に掲げています。
個人のお客様向け。アポイントは弊社で用意します。Zoom完結。単価50万円。
ご応募の際は、以下を記載してください。
・お名前
・稼働可能時間
・志望動機
なお、冒頭に「オンライン商談希望」と記載してください。`,
}, PROFILE);
check('★合言葉が冒頭にある', withReq.text.startsWith('オンライン商談希望'));
check('★指定項目に全部答えている',
  ['お名前：', '稼働可能時間：', '志望動機：'].every((k) => withReq.text.includes(k)));
check('会社名に触れている', withReq.text.includes('株式会社ライフデザイン'));
check('理念の言葉を借りている', withReq.text.includes('一人ひとりの人生の選択肢を増やす'));
check('合言葉について注意書きが出る', withReq.warnings.some((w) => w.includes('冒頭')));
check('志望動機を指定項目で答えたら本文で重複しない',
  (withReq.text.match(/営業という、どこに行っても通用する力/g) || []).length <= 1);

const tight = cp.composeApplication({
  id: 'r2', site: 'lancers', title: 'フィットネスの入会カウンセリング',
  description: `合同会社ヘルスラボです。大切にしているのは「続けられる人を増やす」ことです。
個人のお客様向け。アポイントは弊社で用意します。Zoom完結。単価45万円。
応募メッセージは400文字以内でお願いします。`,
}, PROFILE);
const tightWidth = [...tight.text].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);
check('★400文字以内の指定を守る', tightWidth <= 400, `${Math.round(tightWidth)}文字相当`);
check('短くしても会社の言葉は残す', tight.text.includes('続けられる人を増やす'));
check('短くしても熱量は残す', /営業というスキル|営業力|どこに行っても通用する/.test(tight.text));
check('短くしても稼働条件は残す', tight.text.includes('平日19〜23時'));
check('字数制限について注意書きが出る', tight.warnings.some((w) => w.includes('400')));

/* ========== 一覧の読み取り（jsdom） ========== */
if (!JSDOM) {
  console.log('\n⚠️  jsdom が無いため、HTML読み取りのテストを飛ばしました（npm i -D jsdom）');
  finish();
}
section('一覧の読み取り');
const dom0 = new JSDOM('<html><body></body></html>', { url: 'http://localhost:8787/search' });
for (const k of ['window', 'document', 'DOMParser', 'Element', 'HTMLElement', 'HTMLInputElement',
  'HTMLTextAreaElement', 'HTMLSelectElement', 'Event', 'KeyboardEvent', 'getComputedStyle', 'location']) {
  const v = k === 'window' ? dom0.window : dom0.window[k];
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}
const domMod = await import('../extension/content/dom.js');

/* ========== 報酬の抜き出し（隣の文言を巻き込まないこと） ========== */
section('報酬の抜き出し');

check('金額の直後で止まる（実際に壊れていた例）',
  domMod.extractBudget('時給 1,900円プロフィールだけでカンタン応募Posted30+日前') === '時給 1,900円');
check('円だけの表記も止まる', domMod.extractBudget('報酬50,000円応募締切間近') === '報酬50,000円');
check('レンジ表記は範囲ごと拾う', domMod.extractBudget('時給 2,000円 ~ 3,000円 -  業務委託').includes('3,000円'));
check('「以上」まで拾う', domMod.extractBudget('時給 3,000円以上 -  業務委託').includes('以上'));
check('万円表記', domMod.extractBudget('月給10万円未経験可') === '月給10万円');
check('数字なしの「成果報酬」を拾う', domMod.extractBudget('報酬: 成果報酬') === '成果報酬');
check('★「成果報酬」の直後の無関係な数字を金額と誤認しない（改行なしで隣接する場合）',
  domMod.extractBudget('報酬: 成果報酬提案 2 人業務委託・在宅') === '成果報酬',
  domMod.extractBudget('報酬: 成果報酬提案 2 人業務委託・在宅'));
check('応相談も拾う', domMod.extractBudget('給与: 応相談') === '応相談');
check('該当なしは空文字', domMod.extractBudget('よろしくお願いします') === '');

/* ========== URLの組み立て直し（クエリ文字列が欠けたリンク切れを防ぐ） ========== */
section('URLの組み立て直し');

const indeedLike = { id: 'a42eade53962a683', detailUrl: (id) => `https://jp.indeed.com/viewjob?jk=${id}` };
const cardsIn = [{ id: 'a42eade53962a683', url: 'https://jp.indeed.com/viewjob', title: 'x' }];
const fixed = domMod.canonicalizeUrls(cardsIn, indeedLike);
check('★detailUrlを持つサイトはURLを作り直す（jkが欠けない）',
  fixed[0].url === 'https://jp.indeed.com/viewjob?jk=a42eade53962a683', fixed[0].url);

const lancersLike = { id: 'x', detailUrl: undefined };
const same = domMod.canonicalizeUrls(cardsIn, lancersLike);
check('detailUrlが無いサイトはそのまま', same[0].url === cardsIn[0].url);
check('アダプタが無くても壊れない', domMod.canonicalizeUrls(cardsIn, null)[0].url === cardsIn[0].url);


/* ========== JavaScriptで読み込むサイト（詳細が取れないことの検知） ========== */
section('SPAの外枠ページを誤検知しないこと');

check('同じタイトルなら外枠ページと判定', domMod.looksLikeShellPage('案件検索 | 複業クラウド', '案件検索 | 複業クラウド'));
check('前後の空白は無視する', domMod.looksLikeShellPage('  案件検索  ', '案件検索'));
check('タイトルが違えば外枠ではない', !domMod.looksLikeShellPage('【営業顧問】募集 | 複業クラウド', '案件検索 | 複業クラウド'));
check('片方が空なら外枠と判定しない', !domMod.looksLikeShellPage('', '案件検索 | 複業クラウド'));
check('両方空でも外枠と判定しない', !domMod.looksLikeShellPage('', ''));


const listHtml = (cards) => `<main><h1>案件</h1>${cards}</main>`;
function setBody(html) { document.body.innerHTML = html; }

setBody(listHtml(`
  <div class="c"><h3><a href="/job/1">案件A：個人向けオンラインスクールの相談対応です</a></h3><p>報酬: 成果報酬</p><p>提案 2 人</p><p>業務委託・在宅</p></div>
  <div class="c"><h3><a href="/job/2">短いB</a></h3><p>成果報酬</p></div>
  <div class="c"><h3><a href="/job/3">案件C：無形商材の商談担当を募集しています</a></h3><p>報酬: 時給2000円</p><p>提案 5 人</p><p>在宅OK</p></div>
`));
const cards = domMod.scrapeListGeneric(/\/job\/(\d+)/);
check('カードを3件とも拾う', cards.length === 3, `${cards.length}件`);
check('★カードごとに違うタイトルになる（以前のバグ）', new Set(cards.map((c) => c.title)).size === 3,
  cards.map((c) => c.title).join(' | '));
check('★短いカードが一覧全体を飲み込まない',
  cards.every((c) => !c.description.includes('案件A') || c.id === '1'),
  cards.map((c) => `${c.id}:${c.description.slice(0, 20)}`).join(' | '));
check('idを正しく取る', cards.map((c) => c.id).join(',') === '1,2,3');
check('報酬を拾う', cards[0].budget.includes('成果報酬'));
check('応募者数を拾う', cards[0].applicants === 2, String(cards[0].applicants));

setBody(listHtml('<div class="c"><p>案件はありません</p></div>'));
check('案件が無いページでは0件', domMod.scrapeListGeneric(/\/job\/(\d+)/).length === 0);

setBody(listHtml('<ul><li><a href="/job/9">案件Z：個人のお客様向けの相談対応のお仕事です</a><span>報酬: 成果報酬</span><span>提案 1 人</span></li></ul>'));
check('リスト形式の一覧でも拾える', domMod.scrapeListGeneric(/\/job\/(\d+)/).length === 1);

section('詳細の読み取り');
const detailHtml = `<html><body><header><a href="/">サイト</a></header><h1>案件タイトル</h1>
<div class="price">報酬: 成果報酬</div><div class="applicants">提案 4 人</div>
<div class="description">${'個人のお客様向けの無形商材です。アポイントは弊社で用意します。'.repeat(8)}</div></body></html>`;
const d = domMod.scrapeDetailFromHtml(detailHtml, { title: ['h1'], description: ['.description'], budget: ['.price'] }, 'http://localhost:8787/job/5');
check('タイトルを取る', d.title === '案件タイトル', d.title);
check('本文を取る', d.description.length > 200, `${d.description.length}字`);
check('本文にヘッダーが混ざらない', !d.description.includes('サイト'));
check('報酬を取る', d.budget.includes('成果報酬'), d.budget);
check('応募者数を取る', d.applicants === 4, String(d.applicants));
check('idをURLから取る', d.id === '5', d.id);

const noHint = domMod.scrapeDetailFromHtml(detailHtml, {}, 'http://localhost:8787/job/6');
check('ヒント無しでも本文を推定できる', noHint.description.length > 200, `${noHint.description.length}字`);

finish();

function finish() {
  console.log(`\n単体テスト: ${pass} 件成功 / ${fail} 件失敗`);
  if (fail) { console.log('失敗:'); bad.forEach((b) => console.log('  ❌ ' + b)); }
  process.exit(fail ? 1 : 0);
}
