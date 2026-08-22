import { DEFAULT_MUST, checkMust } from './core/scoring.js';

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
  settings: { mustKeys: DEFAULT_MUST, maxOpenTabs: 8 },
  crawl: { running: false, done: 0, total: 0, log: [], finishedAt: 0, opened: 0, found: 0 },
};

async function getState() {
  const s = await chrome.storage.local.get(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
}

/* ---------- 案件の保存 ---------- */

async function saveJobs(incoming, site) {
  const { jobs, applied } = await getState();
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  let added = 0;
  const { settings } = await getState();
  for (const j of incoming) {
    const key = `${site}:${j.id || j.url}`;
    // マスト判定は保存時に付け直す（設定が変わっても一覧が正しくなるように）
    const withMust = { ...j, must: j.must || checkMust(j, settings.mustKeys) };
    if (byKey.has(key)) byKey.set(key, { ...byKey.get(key), ...withMust, key, site });
    else { byKey.set(key, { ...withMust, key, site, collectedAt: Date.now() }); added++; }
  }
  const merged = [...byKey.values()];
  await chrome.storage.local.set({ jobs: merged });
  await updateBadge(merged, applied);
  return { added, total: merged.length };
}

async function updateBadge(jobs, applied) {
  const open = jobs.filter((j) => !applied[j.key] && j.must && j.must.passed).length;
  await chrome.action.setBadgeText({ text: open ? String(open) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });
}

/* ---------- 自動巡回 ---------- */

let crawlWaiters = new Map();   // tabId → resolve

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

  const mod = await import(chrome.runtime.getURL('content/adapters/index.js'));
  const targets = mod.allSearchUrls();
  if (!targets.length) return { error: '巡回する検索URLがありません' };

  await setCrawl({ running: true, done: 0, total: targets.length, log: [], opened: 0, found: 0, finishedAt: 0 });

  const log = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    await setCrawl({ done: i, total: targets.length, log: [...log, `${t.name} を見ています…`] });
    const res = await crawlOne(t);
    if (res.jobs && res.jobs.length) await saveJobs(res.jobs, res.site || t.site);
    log.push(`${t.name}: ${res.jobs ? res.jobs.length : 0}件${res.note ? `（${res.note}）` : ''}`);
    await setCrawl({ done: i + 1, log: [...log] });
  }

  // マスト条件を満たしたものだけをタブで開く
  const { jobs, applied } = await getState();
  const winners = pickWinners(jobs, applied, settings);

  for (const j of winners) {
    try { await chrome.tabs.create({ url: j.url, active: false }); } catch { /* noop */ }
  }

  const final = await setCrawl({
    running: false,
    done: targets.length,
    opened: winners.length,
    found: winners.length,
    finishedAt: Date.now(),
    log: [...log, winners.length
      ? `条件を満たした案件を${winners.length}件、タブで開きました。`
      : '条件を満たす案件はありませんでした。マスト条件のチェックを減らすか、検索キーワードを増やしてください。'],
  });
  await updateBadge(jobs, applied);
  return { ok: true, opened: winners.length, crawl: final };
}

/** 届けてよい案件（マスト条件を満たし、まだ応募していないもの） */
function pickWinners(jobs, applied, settings) {
  return jobs
    .filter((j) => !applied[j.key] && j.must && j.must.passed)
    .sort((a, b) => b.score - a.score)
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
    switch (msg.type) {
      case 'getState':
        sendResponse(await getState());
        break;

      case 'saveJobs':
        sendResponse(await saveJobs(msg.jobs, msg.site));
        break;

      case 'startCrawl':
        sendResponse(await startCrawl());
        break;

      case 'setSettings': {
        const { settings, jobs, applied } = await getState();
        const next = { ...settings, ...msg.settings };
        await chrome.storage.local.set({ settings: next });
        // マスト条件が変わったら、集めてある案件を判定し直す
        const rejudged = jobs.map((j) => ({ ...j, must: checkMust(j, next.mustKeys) }));
        await chrome.storage.local.set({ jobs: rejudged });
        await updateBadge(rejudged, applied);
        sendResponse({ ok: true, settings: next });
        break;
      }

      case 'openTop': {
        const { jobs, applied, settings } = await getState();
        const winners = pickWinners(jobs, applied, settings);
        for (const j of winners) {
          try { await chrome.tabs.create({ url: j.url, active: false }); } catch { /* noop */ }
        }
        sendResponse({ ok: true, opened: winners.length });
        break;
      }

      case 'markApplied': {
        const { applied, jobs } = await getState();
        applied[msg.key] = { at: Date.now(), url: msg.url, title: msg.title, note: msg.note || '' };
        await chrome.storage.local.set({ applied });
        await updateBadge(jobs, applied);
        sendResponse({ ok: true });
        break;
      }

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
  })();
  return true;   // 非同期で返すので true
});
