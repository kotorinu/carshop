const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { jobs: [], applied: {}, settings: { minScore: 85, maxOpenTabs: 8 }, crawl: {} };
let tab = 'top';

async function load() {
  state = await send({ type: 'getState' });
  $('#minScore').value = state.settings.minScore;
  $('#maxOpenTabs').value = state.settings.maxOpenTabs;
  renderProgress(state.crawl);
  render();
}

/* ---------- 一覧 ---------- */

function rows() {
  const { jobs, applied, settings } = state;
  if (tab === 'applied') {
    return Object.entries(applied)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([key, v]) => ({ key, title: v.title, url: v.url, score: '', verdict: 'apply', budget: new Date(v.at).toLocaleString('ja-JP') }));
  }
  const open = (jobs || []).filter((j) => !applied[j.key]);
  const sorted = [...open].sort((a, b) => (b.score || 0) - (a.score || 0));
  return tab === 'top'
    ? sorted.filter((j) => !j.banned && !(j.redFlags || []).length && j.score >= settings.minScore)
    : sorted;
}

function render() {
  const list = $('#list');
  const data = rows();
  if (!data.length) {
    list.innerHTML = tab === 'top'
      ? `<div class="empty">${state.settings.minScore}点以上の案件がまだありません。<br>上の「案件を探して、合格点のものを開く」を押してください。<br><br>探しても出てこないときは、合格点を75〜80に下げると候補が増えます。</div>`
      : `<div class="empty">まだ案件がありません。上のボタンを押してください。</div>`;
    return;
  }
  const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };
  list.innerHTML = data.map((j) => `
    <li class="${j.score >= state.settings.minScore ? 'top' : ''}">
      <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title || '(無題)')}</a>
      <div class="meta">
        ${j.score !== '' ? `<span class="badge ${esc(j.banned ? 'banned' : j.verdict)}">${esc(j.score)}点</span>` : ''}
        ${esc(j.budget || '')}
        ${j.applicants != null ? `／応募${esc(j.applicants)}件` : ''}
        ${j.detailFetched ? '' : '／<span title="詳細ページを読めていないため点数が低めに出ます">概要のみ</span>'}
      </div>
      ${j.banned ? `<div class="meta">🚫 ${esc(j.banned)}</div>` : ''}
      ${(j.redFlags || []).length ? `<div class="meta">⚠ ${esc(j.redFlags[0])}</div>` : ''}
      ${(j.checklist || []).length ? `<div class="meta">${j.checklist.map((c) => `${esc(c.label)}${icon[c.status] || '?'}`).join(' ')}</div>` : ''}
    </li>`).join('');
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
  $('#auto').textContent = crawl.running ? '巡回中…（閉じてもそのまま進みます）' : '🔍 案件を探して、合格点のものを開く';
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
  $('#hint').textContent = res.opened ? `${res.opened}件を開きました` : '合格点の案件がありません';
};

for (const id of ['minScore', 'maxOpenTabs']) {
  $(`#${id}`).onchange = async () => {
    await send({ type: 'setSettings', settings: { [id]: Number($(`#${id}`).value) } });
    await load();
  };
}

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
  const head = ['サイト', 'タイトル', '点数', '判定', '報酬', '応募数', '避けるべき条件', '危険', 'URL'];
  const lines = [head, ...rows().map((j) => [j.site || '', j.title || '', j.score, j.verdict, j.budget || '',
    j.applicants ?? '', (j.ngItems || []).join(' / '), [j.banned, ...(j.redFlags || [])].filter(Boolean).join(' / '), j.url])]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `営業案件_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

load();
