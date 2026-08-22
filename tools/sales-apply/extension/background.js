import { DEFAULT_MUST, checkMust } from './core/scoring.js';
import { STATUS, mergeJob, rejudge, shouldOpen, advance, summarize, isClosed } from './core/jobstate.js';
import { allSearchUrls } from './content/adapters/index.js';

/**
 * サービスワーカー。保存と、自動巡回の司令塔。
 * 送信は絶対にしない（ここでも content 側でもクリックしない）。
 *
 * 自動巡回の流れ:
 *   検索URLを裏のタブで順に開く → autocollect.js を差し込む
 *   → 詳細まで読んで採点した結果を受け取る → タブを閉じる
 *   → 全部終わったら、合格点以上の案件だけをタブで開く
 */
const DEFAULT_STATE = {
  profile: null,
  jobs: [],
  applied: {},
  // minScore（点数のしきい値）ではなく、マスト条件で絞る。
  // 条件を満たさない案件は、点数がいくら高くても届けない。
  settings: { mustKeys: DEFAULT_MUST, maxOpenTabs: 8, targetCandidates: 10 },
  crawl: { running: false, done: 0, total: 0, log: [], finishedAt: 0, opened: 0, found: 0, error: '' },
  lastError: null,
};

async function getState() {
  const s = await chrome.storage.local.get(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
}

/* ---------- 案件の保存 ---------- */

async function saveJobs(incoming, site) {
  const { jobs, settings } = await getState();
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  let added = 0;
  let newCandidates = 0;
  for (const j of incoming) {
    const key = `${site}:${j.id || j.url}`;
    const withMust = { ...j, key, site, must: j.must || checkMust(j, settings.mustKeys) };
    const known = byKey.get(key);
    const merged = mergeJob(withMust, known);
    if (!known) { added++; if (merged.status === STATUS.CANDIDATE) newCandidates++; }
    byKey.set(key, merged);
  }
  const all = [...byKey.values()];
  await chrome.storage.local.set({ jobs: all });
  await updateBadge(all);
  return { added, newCandidates, total: all.length };
}

async function updateBadge(jobs) {
  const n = summarize(jobs);
  const open = n.candidate + n.drafted;
  await chrome.action.setBadgeText({ text: open ? String(open) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });
}

/* ---------- 自動巡回 ---------- */

let crawlWaiters = new Map();   // tabId → resolve
let keepAliveTimer = null;

/**
 * 巡回中にサービスワーカーが眠らないようにする。
 * MV3のサービスワーカーは何もしないと30秒で止められ、巡回が途中で消える。
 */
function keepAlive(on) {
  clearInterval(keepAliveTimer);
  keepAliveTimer = on ? setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000) : null;
}

async function setCrawl(patch) {
  const { crawl } = await getState();
  const next = { ...crawl, ...patch };
  await chrome.storage.local.set({ crawl: next });
  chrome.runtime.sendMessage({ type: 'crawlProgress', crawl: next }).catch(() => {});
  return next;
}

/** タブの読み込み完了を待つ */
function waitForLoad(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpdated); resolve(false); }, timeoutMs);
    function onUpdated(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(true);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** 1つの検索URLを裏タブで開いて、採点済みの案件を受け取る */
async function crawlOne(target) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: target.url, active: false });
  } catch (e) {
    return { jobs: [], note: `タブを開けませんでした: ${String(e).slice(0, 80)}` };
  }

  const result = await new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve({ jobs: [], note: '時間切れ（ログインが必要かもしれません）' }), 90000);
    crawlWaiters.set(tab.id, (payload) => { clearTimeout(timer); resolve(payload); });

    const loaded = await waitForLoad(tab.id);
    if (!loaded) return;   // 時間切れのタイマーに任せる
    try {
      // すでに知っている案件は調べ直さない。ページに先に伝えておく
      const { jobs } = await getState();
      const knownIds = jobs.map((j) => j.key);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (ids) => { window.__SALES_KNOWN_IDS__ = ids; },
        args: [knownIds],
      });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/autocollect.js'] });
    } catch (e) {
      clearTimeout(timer);
      resolve({ jobs: [], note: `読み取りを開始できませんでした: ${String(e).slice(0, 80)}` });
    }
  });

  crawlWaiters.delete(tab.id);
  try { await chrome.tabs.remove(tab.id); } catch { /* すでに閉じられている */ }
  return result;
}

async function startCrawl() {
  const { crawl, settings } = await getState();
  if (crawl.running) return { error: 'すでに巡回中です' };
  keepAlive(true);

  const targets = allSearchUrls();
  if (!targets.length) { keepAlive(false); return { error: '巡回する検索URLがありません' }; }

  await setCrawl({
    running: true, done: 0, total: targets.length, opened: 0, found: 0, finishedAt: 0, error: '',
    log: [`巡回する検索ページ: ${targets.length}件`],
  });

  const log = [];
  let foundCandidates = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    await setCrawl({ done: i, total: targets.length, log: [...log, `${t.name} を見ています…`] });
    const res = await crawlOne(t);
    let saved = { added: 0, newCandidates: 0 };
    if (res.jobs && res.jobs.length) saved = await saveJobs(res.jobs, res.site || t.site);
    foundCandidates += saved.newCandidates;
    const parts = [];
    if (saved.added) parts.push(`新しい案件${saved.added}件`);
    if (saved.newCandidates) parts.push(`うち条件に合うもの${saved.newCandidates}件`);
    if (res.skipped) parts.push(`調べ済み${res.skipped}件は飛ばした`);
    if (res.pagesRead > 1) parts.push(`${res.pagesRead}ページ目まで確認`);
    if (res.note) parts.push(res.note);
    log.push(`${t.name}: ${parts.join(' / ') || '新しいものなし'}`);
    await setCrawl({ done: i + 1, log: [...log], found: foundCandidates });

    // 目標の件数が見つかったら、そこで切り上げる（無駄に回らない）
    if (foundCandidates >= (settings.targetCandidates || 10)) {
      log.push(`条件に合う案件が${foundCandidates}件見つかったので、ここで切り上げます。`);
      await setCrawl({ done: targets.length, log: [...log] });
      break;
    }
  }

  // 条件を満たし、まだ一度も開いていないものだけをタブで開く
  const { jobs } = await getState();
  const winners = pickWinners(jobs, settings);

  await openJobs(winners);

  const final = await setCrawl({
    running: false,
    done: targets.length,
    opened: winners.length,
    found: winners.length,
    finishedAt: Date.now(),
    log: [...log, winners.length
      ? `条件を満たした案件を${winners.length}件、タブで開きました。`
      : '新しく開くものはありませんでした（すでに開いた案件は二度と開きません）。'],
  });
  await updateBadge((await getState()).jobs);
  keepAlive(false);
  return { ok: true, opened: winners.length, crawl: final };
}

/** 案件をタブで開き、「開いた」と記録する（二度と開かないようにするため） */
async function openJobs(list) {
  if (!list.length) return;
  const { jobs } = await getState();
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  for (const j of list) {
    try { await chrome.tabs.create({ url: j.url, active: false }); } catch { /* noop */ }
    const cur = byKey.get(j.key);
    if (cur) byKey.set(j.key, { ...cur, openedAt: Date.now() });
  }
  await chrome.storage.local.set({ jobs: [...byKey.values()] });
}

/** 届けてよい案件（条件を満たし、まだ一度も開いていないもの） */
function pickWinners(jobs, settings) {
  return jobs
    .filter(shouldOpen)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, settings.maxOpenTabs);
}

/* ---------- メッセージ ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 巡回中のタブからの報告
  if (msg.type === 'crawlResult') {
    const waiter = sender.tab && crawlWaiters.get(sender.tab.id);
    if (waiter) waiter(msg);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'crawlTick') {
    // ポップアップに中継するだけ。自分に返ってこないよう型名を変える
    chrome.runtime.sendMessage({ type: 'crawlTickUi', site: msg.site, done: msg.done, total: msg.total }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  (async () => {
    try {
    switch (msg.type) {
      case 'getState':
        sendResponse(await getState());
        break;

      case 'saveJobs':
        sendResponse(await saveJobs(msg.jobs, msg.site));
        break;

      case 'startCrawl': {
        const { crawl } = await getState();
        if (crawl.running) { sendResponse({ error: 'すでに巡回中です' }); break; }
        // 巡回は数分かかる。待たせずに開始だけ返して、進捗は storage 経由で見せる
        startCrawl().catch(async (e) => {
          await setCrawl({ running: false, error: String(e && e.message || e).slice(0, 200) });
        });
        sendResponse({ ok: true, started: true });
        break;
      }

      case 'setSettings': {
        const { settings, jobs } = await getState();
        const next = { ...settings, ...msg.settings };
        await chrome.storage.local.set({ settings: next });
        // マスト条件が変わったら判定し直す。
        // ただし書きかけ・応募済み・見送りは、人が判断した結果なので触らない
        const rejudged = jobs.map((j) => rejudge(j, checkMust(j, next.mustKeys)));
        await chrome.storage.local.set({ jobs: rejudged });
        await updateBadge(rejudged);
        sendResponse({ ok: true, settings: next });
        break;
      }

      case 'openTop': {
        const { jobs, settings } = await getState();
        const winners = pickWinners(jobs, settings);
        await openJobs(winners);
        sendResponse({ ok: true, opened: winners.length });
        break;
      }

      case 'setStatus': {
        const { jobs, applied } = await getState();
        const next = jobs.map((j) => (j.key === msg.key ? advance(j, msg.status, msg.extra || {}) : j));
        // 応募済みは別台帳にも残す（案件が一覧から消えても履歴が残るように）
        if (msg.status === STATUS.APPLIED) {
          applied[msg.key] = { at: Date.now(), url: msg.url, title: msg.title, note: msg.note || '' };
          await chrome.storage.local.set({ applied });
        }
        await chrome.storage.local.set({ jobs: next });
        await updateBadge(next);
        sendResponse({ ok: true, status: msg.status });
        break;
      }

      case 'getSummary':
        sendResponse(summarize((await getState()).jobs));
        break;

      case 'saveProfile':
        await chrome.storage.local.set({ profile: msg.profile });
        sendResponse({ ok: true });
        break;

      // 対応外のサイトでも、ポップアップから手動でパネルを出せるようにする
      case 'injectHere': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) { sendResponse({ error: 'タブが見つかりません' }); break; }
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/boot.js'] });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ error: String(e) });
        }
        break;
      }

      default:
        sendResponse({ error: `unknown message: ${msg.type}` });
    }
    } catch (e) {
      // 例外で黙って固まるのが一番困る。必ず理由を返す
      const detail = String((e && e.stack) || e).slice(0, 300);
      await chrome.storage.local.set({ lastError: { at: Date.now(), where: msg.type, detail } });
      await setCrawl({ running: false, error: detail });
      sendResponse({ error: detail });
    }
  })();
  return true;   // 非同期で返すので true
});
