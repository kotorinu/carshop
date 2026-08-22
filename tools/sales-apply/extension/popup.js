const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { jobs: [], applied: {}, settings: { mustKeys: [], maxOpenTabs: 8 }, crawl: {} };
let tab = 'top';
let LABELS = {};
let ALL_KEYS = [];

async function load() {
  const scoring = await import(chrome.runtime.getURL('core/scoring.js'));
  LABELS = scoring.CRITERIA_LABELS;
  ALL_KEYS = scoring.CRITERIA_KEYS;
  state = await send({ type: 'getState' });
  $('#maxOpenTabs').value = state.settings.maxOpenTabs;
  renderMust();
  renderProgress(state.crawl);
  render();
}

function renderMust() {
  const on = new Set(state.settings.mustKeys || []);
  $('#mustBox').innerHTML = ALL_KEYS.map((k) => `
    <label><input type="checkbox" data-key="${k}" ${on.has(k) ? 'checked' : ''}>${esc(LABELS[k])}</label>
  `).join('');
  $('#mustBox').querySelectorAll('input').forEach((el) => {
    el.onchange = async () => {
      const keys = [...$('#mustBox').querySelectorAll('input:checked')].map((x) => x.dataset.key);
      await send({ type: 'setSettings', settings: { mustKeys: keys } });
      await load();
    };
  });
}

/* ---------- 一覧 ---------- */

function rows() {
  const { jobs, applied } = state;
  if (tab === 'applied') {
    return Object.entries(applied)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([key, v]) => ({ key, title: v.title, url: v.url, score: '', verdict: 'apply', budget: new Date(v.at).toLocaleString('ja-JP') }));
  }
  const open = (jobs || []).filter((j) => !applied[j.key]);
  const sorted = [...open].sort((a, b) => (b.score || 0) - (a.score || 0));
  return tab === 'top' ? sorted.filter((j) => j.must && j.must.passed) : sorted;
}

function render() {
  const list = $('#list');
  const data = rows();
  if (!data.length) {
    list.innerHTML = tab === 'top'
      ? `<div class="empty">条件を満たす案件がまだありません。<br>上の「条件に合う案件を探して開く」を押してください。<br><br>探しても出てこないときは、マスト条件のチェックを減らしてください。<br>確認できなかった項目は、面接で聞けば済みます。</div>`
      : `<div class="empty">まだ案件がありません。上のボタンを押してください。</div>`;
    return;
  }
  const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };
  list.innerHTML = data.map((j) => {
    const must = j.must || { passed: false, reasons: [], unconfirmed: [] };
    const state2 = must.passed ? ['apply', '合格'] : must.reasons.length ? ['skip', '対象外'] : ['maybe', '確認要'];
    return `
    <li class="${must.passed ? 'top' : ''}">
      <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title || '(無題)')}</a>
      <div class="meta">
        ${j.score !== '' ? `<span class="badge ${state2[0]}">${state2[1]}</span> ${esc(j.score)}点` : ''}
        ${esc(j.budget || '')}
        ${j.applicants != null ? `／応募${esc(j.applicants)}件` : ''}
        ${j.detailFetched === false ? '／<span title="詳細ページを読めていません">概要のみ</span>' : ''}
      </div>
      ${must.reasons.length ? `<div class="meta">⛔ ${esc(must.reasons[0])}</div>` : ''}
      ${must.unconfirmed.length ? `<div class="meta">△ 確認できず: ${esc(must.unconfirmed.join('・'))}</div>` : ''}
      ${(j.checklist || []).length ? `<div class="meta">${j.checklist.map((c) => `${esc(c.label)}${icon[c.status] || '?'}`).join(' ')}</div>` : ''}
    </li>`;
  }).join('');
}

/* ---------- 進捗 ---------- */

function renderProgress(crawl) {
  if (!crawl || (!crawl.running && !crawl.finishedAt)) { $('#progress').hidden = true; return; }
  $('#progress').hidden = false;
  const pct = crawl.total ? Math.round((crawl.done / crawl.total) * 100) : 0;
  $('#pBar').style.width = `${pct}%`;
  $('#pTitle').textContent = crawl.running
    ? `巡回中… ${crawl.done}/${crawl.total} サイト`
    : `完了（${crawl.opened || 0}件を開きました）`;
  $('#pLog').innerHTML = (crawl.log || []).slice(-6).map((l) => esc(l)).join('<br>');
  $('#auto').disabled = !!crawl.running;
  $('#auto').textContent = crawl.running ? '巡回中…（閉じてもそのまま進みます）' : '🔍 条件に合う案件を探して開く';
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'crawlProgress') { state.crawl = msg.crawl; renderProgress(msg.crawl); }
  if (msg.type === 'crawlTickUi') {
    $('#pTitle').textContent = `巡回中… 詳細を確認しています（${msg.done}/${msg.total}）`;
  }
});

/* ---------- 操作 ---------- */

$('#auto').onclick = async () => {
  $('#auto').disabled = true;
  $('#auto').textContent = '巡回を始めています…';
  const res = await send({ type: 'startCrawl' });
  if (res?.error) { $('#hint').textContent = res.error; $('#auto').disabled = false; }
  await load();
};

$('#openTop').onclick = async () => {
  const res = await send({ type: 'openTop' });
  $('#hint').textContent = res.opened ? `${res.opened}件を開きました` : '条件を満たす案件がありません';
};

$('#maxOpenTabs').onchange = async () => {
  await send({ type: 'setSettings', settings: { maxOpenTabs: Number($('#maxOpenTabs').value) } });
  await load();
};

document.querySelectorAll('.tabs button').forEach((b) => {
  b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  };
});

$('#options').onclick = () => chrome.runtime.openOptionsPage();

$('#inject').onclick = async () => {
  const res = await send({ type: 'injectHere' });
  if (res?.error) alert(`起動できませんでした: ${res.error}`);
  else window.close();
};

$('#csv').onclick = () => {
  const head = ['サイト', 'タイトル', '判定', '点数', '報酬', '応募数', '条件に反する点', '確認できず', 'URL'];
  const lines = [head, ...rows().map((j) => [j.site || '', j.title || '',
    j.must && j.must.passed ? '合格' : '対象外', j.score, j.budget || '', j.applicants ?? '',
    (j.must && j.must.reasons || []).join(' / '), (j.must && j.must.unconfirmed || []).join(' / '), j.url])]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `営業案件_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

load();
