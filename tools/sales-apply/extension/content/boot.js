/**
 * 入口。ページの種類を見て、パネルにボタンを出す。
 *
 * やること: 案件を集める → 点数を付ける → 応募文を作る → フォームに入れる
 * やらないこと: 送信ボタンを押すこと。ここは絶対に自動化しない。
 */
(async () => {
  if (window.__SALES_APPLY_BOOTED__) {
    window.__SALES_APPLY_RESHOW__?.();
    return;
  }
  window.__SALES_APPLY_BOOTED__ = true;

  const u = (p) => chrome.runtime.getURL(p);
  const [dom, ui, adaptersMod, scoring, composer] = await Promise.all([
    import(u('content/dom.js')),
    import(u('content/ui.js')),
    import(u('content/adapters/index.js')),
    import(u('core/scoring.js')),
    import(u('core/compose.js')),
  ]);

  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));
  const store = {
    get: (k, d) => new Promise((res) => chrome.storage.local.get({ [k]: d }, (o) => res(o[k]))),
    set: (k, v) => new Promise((res) => chrome.storage.local.set({ [k]: v }, res)),
  };

  const ad = adaptersMod.pickAdapter(location);
  const mode = ad.isFormPage(location) && document.querySelector('textarea')
    ? 'form'
    : ad.isDetailPage(location) ? 'detail'
      : ad.isListPage(location) ? 'list' : 'other';

  /** 保存済みプロフィール → 無ければ拡張機能に同梱した初期プロフィール */
  async function loadProfile() {
    const saved = await store.get('profile', null);
    if (saved && saved.displayName) return saved;
    try {
      const res = await fetch(u('profile.default.json'));
      if (res.ok) return await res.json();
    } catch { /* 同梱ファイルが無ければ未設定として扱う */ }
    return null;
  }

  let profile = await loadProfile();
  let currentJob = null;

  const panel = ui.mountPanel({ buttons, onDraftEdited: (v) => saveDraft(v) });
  window.__SALES_APPLY_RESHOW__ = () => panel.set({});

  panel.set({
    site: ad.name,
    mode: { list: '案件一覧のページ', detail: '案件の詳細ページ', form: '応募フォーム', other: 'その他のページ' }[mode],
    banned: ad.banned || '',
    message: ad.banned ? '' : profile ? '' : 'まずプロフィールを登録してください（拡張機能アイコン → 設定）。',
  });

  if (!ad.banned && (mode === 'detail' || mode === 'form')) {
    currentJob = await resolveJob();
    if (currentJob) {
      const s = scoring.scoreJob(currentJob, profile || {});
      const settings = await new Promise((r) => chrome.storage.local.get({ settings: {} }, (o) => r(o.settings || {})));
      currentJob = { ...currentJob, ...s };
      currentJob.must = scoring.checkMust(currentJob, settings.mustKeys || scoring.DEFAULT_MUST);
      const draft = await loadDraft();
      panel.set({
        draft: draft || '',
        message: verdictMessage(currentJob),
        warnings: currentJob.redFlags,
        checklist: currentJob.checklist || [],
        askInInterview: currentJob.askInInterview || [],
      });
    }
  }

  /* ---------- ボタン定義 ---------- */
  function buttons(state) {
    const list = [];
    // 使用禁止の媒体では、応募のための機能は一切出さない
    if (ad.banned) {
      return [{ label: '使える媒体で探しに行く', onClick: openSearches }];
    }
    if (mode === 'list') {
      list.push({ label: '① 案件を集める', onClick: collect });
    }
    if (mode === 'detail' || mode === 'other') {
      list.push({ label: '② 応募文を作る', onClick: () => compose(0) });
      if (state.draft) list.push({ label: '別の言い回しで', sub: true, onClick: () => compose(nextVariant()) });
    }
    if (mode === 'form') {
      list.push({ label: '③ フォームに入れる', onClick: fillForm });
      if (!state.draft) list.push({ label: '応募文を作る', sub: true, onClick: () => compose(0) });
    }
    if (state.draft) {
      list.push({ label: 'コピー', sub: true, onClick: copyDraft });
      list.push({ label: '応募済みにする', sub: true, onClick: markApplied });
    }
    if (mode === 'detail') {
      list.push({ label: '応募ページへ', sub: true, onClick: goToForm });
    }
    list.push({ label: '案件を探しに行く', sub: true, onClick: openSearches });
    return list;
  }

  /* ---------- ①集める ---------- */
  async function collect() {
    panel.set({ busy: true, message: '集めています…' });
    const jobs = dom.scrapeListGeneric(ad.detailPattern);
    if (!jobs.length) {
      panel.set({ busy: false, message: '案件が見つかりませんでした。検索結果のページで押してください（読み込みが終わるまで少し待つ）。' });
      return;
    }
    const settings = await new Promise((r) => chrome.storage.local.get({ settings: {} }, (o) => r(o.settings || {})));
    const ranked = scoring.rankJobs(jobs, profile || {}, settings.mustKeys || scoring.DEFAULT_MUST);
    const res = await send({ type: 'saveJobs', jobs: ranked, site: ad.id });
    const passCount = ranked.filter((j) => j.must.passed).length;
    panel.set({
      busy: false,
      jobs: ranked,
      message: `${jobs.length}件を読み取りました（新規${res.added}件）。条件を満たすのは${passCount}件です。`
        + '複数の案件に同時に応募するのが前提です。上から順に開いてください。',
    });
  }

  /* ---------- ②応募文を作る ---------- */
  async function compose(variant) {
    profile = (await loadProfile()) || profile;
    if (!profile) {
      panel.set({ message: 'プロフィール未登録です。拡張機能アイコン → 設定 から登録してください。' });
      return;
    }
    panel.set({ busy: true, message: '' });
    if (!currentJob) currentJob = await resolveJob();
    if (!currentJob) {
      panel.set({ busy: false, message: '案件情報を読み取れませんでした。案件の詳細ページで押してください。' });
      return;
    }
    const out = composer.composeApplication(currentJob, profile, {
      variant,
      maxWidth: ad.maxWidth,
    });
    await store.set('variant:' + jobKey(), variant);
    await saveDraft(out.text);
    panel.set({
      busy: false,
      draft: out.text,
      warnings: [...(currentJob.redFlags || []), ...(currentJob.ngItems || []), ...out.warnings],
      checklist: currentJob.checklist || [],
      askInInterview: currentJob.askInInterview || [],
      message: `${out.categoryLabel} の型で書きました。声に出して読んで、引っかかる所だけ直してください。`,
    });
  }

  function nextVariant() {
    return Math.floor(Math.random() * 1000) + 1;
  }

  /* ---------- ③フォームに入れる ---------- */
  async function fillForm() {
    const state = panel.get();
    const draft = state.draft || (await loadDraft());
    if (!draft) {
      panel.set({ message: '先に応募文を作ってください。' });
      return;
    }
    const field = dom.findMessageField(ad.hints.message);
    if (!field) {
      panel.set({ message: '応募文の入力欄が見つかりませんでした。「コピー」して手で貼ってください。' });
      return;
    }
    dom.setEditableValue(field, draft);

    const filled = ['応募文'];
    for (const f of fieldMap()) {
      if (!f.value) continue;
      const el = dom.findFieldByWords(f.words);
      if (el && !el.value) { dom.setNativeValue(el, f.value); filled.push(f.label); }
    }

    const submit = dom.findSubmitButton(ad.hints.submit);
    dom.highlight(submit || field);
    panel.set({
      message: `入力しました（${filled.join('・')}）。${submit ? 'オレンジで囲った送信ボタン' : '送信ボタン'}を、内容を読んでから自分で押してください。`,
    });
  }

  /** プロフィールの値 → フォーム項目の対応表 */
  function fieldMap() {
    const p = profile || {};
    const a = p.availability || {};
    return [
      { label: '氏名', words: ['氏名', 'お名前', 'name', '担当者'], value: p.fullName || p.displayName },
      { label: 'フリガナ', words: ['フリガナ', 'ふりガナ', 'かな', 'kana'], value: p.fullNameKana },
      { label: 'メール', words: ['メール', 'mail', 'e-mail'], value: p.email },
      { label: '電話', words: ['電話', 'tel', 'phone', '携帯'], value: p.phone },
      { label: '郵便番号', words: ['郵便', 'zip', 'postal'], value: p.postalCode },
      { label: '住所', words: ['住所', 'address', '所在地'], value: p.address },
      { label: '希望金額', words: ['希望金額', '提案金額', '見積', '報酬', '単価', 'price', 'amount'], value: p.proposedAmount },
      { label: '稼働時間', words: ['稼働', '作業時間', '週あたり', '対応可能時間'], value: a.hours },
      { label: '開始日', words: ['開始', '着手', '納期', '開始可能'], value: a.startDate },
    ];
  }

  /* ---------- 補助 ---------- */
  function jobKey() {
    const id = currentJob?.id || (location.pathname.match(/(\d{4,})/) || [])[1] || location.pathname;
    return `${ad.id}:${id}`;
  }

  async function saveDraft(text) {
    const drafts = await store.get('drafts', {});
    drafts[jobKey()] = { text, at: Date.now(), url: location.href, title: currentJob?.title || document.title };
    await store.set('drafts', drafts);
  }

  async function loadDraft() {
    const drafts = await store.get('drafts', {});
    return drafts[jobKey()]?.text || '';
  }

  /** 詳細ページはその場から、フォームページは保存済みの案件情報から復元する */
  async function resolveJob() {
    const scraped = dom.scrapeDetailGeneric(ad.hints);
    if (mode === 'detail' && scraped.description.length > 120) return scraped;

    const id = (location.pathname.match(/(\d{4,})/) || [])[1];
    if (id) {
      const { jobs } = await send({ type: 'getState' });
      const hit = (jobs || []).find((j) => j.site === ad.id && String(j.id) === String(id));
      if (hit) return hit;
    }
    return scraped.title ? scraped : null;
  }

  function verdictMessage(job) {
    const must = job.must || { passed: false, reasons: [], unconfirmed: [] };
    if (must.reasons.length) return `⛔ 条件に反しています: ${must.reasons.join(' / ')}`;
    if (must.unconfirmed.length) {
      return `△ 募集文で確認できなかった条件があります: ${must.unconfirmed.join(' / ')}。面接で聞いてください。`;
    }
    return `✅ マスト条件を全部満たしています（${job.score}点）。`;
  }

  async function copyDraft() {
    const t = panel.get().draft;
    try {
      await navigator.clipboard.writeText(t);
      panel.set({ message: 'コピーしました。' });
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      panel.set({ message: 'コピーしました。' });
    }
  }

  async function markApplied() {
    await send({ type: 'markApplied', key: jobKey(), url: location.href, title: currentJob?.title || document.title });
    panel.set({ message: '応募済みに記録しました。同じ案件に二重応募しないよう、一覧から消えます。' });
  }

  /** 詳細ページの「応募する／提案する」リンクをたどる（送信ではなく画面遷移だけ） */
  function goToForm() {
    const links = [...document.querySelectorAll('a[href]')].filter(dom.isVisible);
    const hit = links.find((a) => /応募する|提案する|見積り|応募画面/.test(dom.text(a)))
      || links.find((a) => /propose|proposal|apply|entry/.test(a.getAttribute('href') || ''));
    if (hit) { location.href = hit.href; return; }
    panel.set({ message: '応募ページへのリンクが見つかりませんでした。ページ内の「応募する」を自分で押してください。' });
  }

  function openSearches() {
    for (const s of adaptersMod.allSearchUrls()) window.open(s.url, '_blank', 'noopener');
    panel.set({ message: '検索ページをタブで開きました。各タブで「① 案件を集める」を押してください。' });
  }
})();
