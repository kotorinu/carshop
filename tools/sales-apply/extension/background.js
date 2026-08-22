/**
 * サービスワーカー。保存と、任意のサイトで手動起動する役だけ。
 * 送信は絶対にしない（ここでも content 側でもクリックはしない）。
 */
const DEFAULT_STATE = { profile: null, jobs: [], applied: {}, settings: { minScore: 45 } };

async function getState() {
  const s = await chrome.storage.local.get(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...s };
}

async function saveJobs(incoming, site) {
  const { jobs, applied } = await getState();
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  let added = 0;
  for (const j of incoming) {
    const key = `${site}:${j.id || j.url}`;
    if (byKey.has(key)) {
      byKey.set(key, { ...byKey.get(key), ...j, key, site });
    } else {
      byKey.set(key, { ...j, key, site, collectedAt: Date.now() });
      added++;
    }
  }
  const merged = [...byKey.values()];
  await chrome.storage.local.set({ jobs: merged });
  await updateBadge(merged, applied);
  return { added, total: merged.length };
}

async function updateBadge(jobs, applied) {
  const open = jobs.filter((j) => !applied[j.key] && (j.verdict === 'apply' || j.score >= 65)).length;
  await chrome.action.setBadgeText({ text: open ? String(open) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'getState':
        sendResponse(await getState());
        break;

      case 'saveJobs':
        sendResponse(await saveJobs(msg.jobs, msg.site));
        break;

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
  return true; // 非同期で返すので true
});
