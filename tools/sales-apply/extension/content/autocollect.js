/**
 * 自動巡回の実行部。検索結果のタブに差し込まれて、裏で全部やる。
 *
 *   一覧を読む → 明らかに違うものを落とす → 残りの「詳細ページの本文」を取りに行く
 *   → その本文で採点 → 結果を background に返す
 *
 * なぜ詳細まで取りに行くか:
 *   一覧のカードには「BtoCか」「無形か」「アポは譲渡型か」が書いていない。
 *   カードだけで採点すると全部「不明」になって点数が上がらず、
 *   結局どれが良い案件か分からない（＝自分で探しているのと変わらない）。
 */
(async () => {
  if (window.__SALES_AUTOCOLLECT_RUNNING__) return;
  window.__SALES_AUTOCOLLECT_RUNNING__ = true;

  const u = (p) => chrome.runtime.getURL(p);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 1ページあたり、詳細まで取りに行く上限。相手のサーバーに負担をかけない範囲 */
  const MAX_DETAIL = 20;
  /** 詳細を取りに行く間隔（人が読む速さと同じくらい） */
  const FETCH_INTERVAL_MS = 500;

  const report = (payload) => chrome.runtime.sendMessage({ type: 'crawlResult', ...payload });

  try {
    const [dom, adaptersMod, scoring] = await Promise.all([
      import(u('content/dom.js')),
      import(u('content/adapters/index.js')),
      import(u('core/scoring.js')),
    ]);

    const ad = adaptersMod.pickAdapter(location);
    if (ad.banned) return report({ site: ad.id, jobs: [], note: ad.banned });

    const profile = await loadProfile(u);

    // 画面が出来上がるまで少し待つ（遅延読み込みの一覧対策）
    await waitForLinks(ad.detailPattern);

    const cards = dom.scrapeListGeneric(ad.detailPattern);
    if (!cards.length) return report({ site: ad.id, jobs: [], note: '一覧を読み取れませんでした' });

    // カードの時点で明らかに違うものは、詳細を取りに行かない（時間と相手への負担の節約）
    const prescored = cards.map((j) => ({ ...j, site: ad.id, ...scoring.scoreJob({ ...j, site: ad.id }, profile) }));
    const worthOpening = prescored
      .filter((j) => !j.banned && !j.redFlags.length && !hasHardMismatch(j))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DETAIL);

    const out = [];
    for (let i = 0; i < worthOpening.length; i++) {
      const j = worthOpening[i];
      const url = ad.detailUrl ? ad.detailUrl(j.id) : j.url;
      let full = j;
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const detail = dom.scrapeDetailFromHtml(await res.text(), ad.hints || {}, url);
          // 一覧で拾えた情報は残しつつ、本文・報酬は詳細のほうを優先する
          full = {
            ...j,
            title: detail.title || j.title,
            description: detail.description.length > (j.description || '').length ? detail.description : j.description,
            budget: detail.budget || j.budget,
            applicants: detail.applicants ?? j.applicants,
            clientVerified: detail.clientVerified || j.clientVerified,
            url,
            detailFetched: true,
          };
        }
      } catch { /* 取れなければカードの情報のまま採点する */ }

      out.push({ ...full, site: ad.id, ...scoring.scoreJob({ ...full, site: ad.id }, profile) });

      chrome.runtime.sendMessage({
        type: 'crawlTick', site: ad.id, done: i + 1, total: worthOpening.length,
      });
      if (i < worthOpening.length - 1) await sleep(FETCH_INTERVAL_MS);
    }

    report({ site: ad.id, jobs: out, scanned: cards.length });
  } catch (e) {
    report({ site: 'unknown', jobs: [], note: `読み取りに失敗: ${String(e).slice(0, 120)}` });
  }

  /** 保存済みプロフィール → 無ければ同梱の初期プロフィール */
  async function loadProfile(url) {
    const saved = await new Promise((r) => chrome.storage.local.get({ profile: null }, (o) => r(o.profile)));
    if (saved && saved.displayName) return saved;
    try {
      const res = await fetch(url('profile.default.json'));
      if (res.ok) return await res.json();
    } catch { /* noop */ }
    return {};
  }

  /** 一覧のリンクが出てくるまで待つ（最大6秒） */
  async function waitForLinks(pattern) {
    for (let i = 0; i < 12; i++) {
      const hit = [...document.querySelectorAll('a[href]')].some((a) => pattern.test(a.href));
      if (hit) return;
      await sleep(500);
    }
  }

  /** チェックリストで「避けるべき」が2つ以上なら、詳細を見るまでもない */
  function hasHardMismatch(j) {
    return (j.checklist || []).filter((c) => c.status === 'ng').length >= 2;
  }
})();
