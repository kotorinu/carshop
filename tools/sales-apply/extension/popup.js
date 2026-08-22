const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { jobs: [], applied: {} };
let tab = 'apply';

async function load() {
  state = await send({ type: 'getState' });
  render();
}

function rows() {
  const { jobs, applied } = state;
  if (tab === 'applied') {
    return Object.entries(applied).map(([key, v]) => ({ key, title: v.title, url: v.url, score: '', verdict: 'apply', budget: new Date(v.at).toLocaleString('ja-JP') }));
  }
  const open = (jobs || []).filter((j) => !applied[j.key]);
  const sorted = [...open].sort((a, b) => (b.score || 0) - (a.score || 0));
  return tab === 'apply' ? sorted.filter((j) => j.verdict === 'apply') : sorted;
}

function render() {
  const list = $('#list');
  const data = rows();
  if (!data.length) {
    list.innerHTML = `<div class="empty">まだ案件がありません。<br>「案件を探しに行く」を押して、開いたタブで画面右下のパネルの「① 案件を集める」を押してください。</div>`;
    return;
  }
  list.innerHTML = data.map((j) => `
    <li>
      <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title || '(無題)')}</a>
      <div class="meta">
        ${j.score !== '' ? `<span class="badge ${esc(j.verdict)}">${esc(j.score)}点</span>` : ''}
        ${esc(j.budget || '')}
        ${j.applicants != null ? `／応募${esc(j.applicants)}件` : ''}
      </div>
      ${j.banned ? `<div class="meta">🚫 ${esc(j.banned)}</div>` : ''}
      ${j.redFlags && j.redFlags.length ? `<div class="meta">⚠ ${esc(j.redFlags[0])}</div>` : ''}
      ${j.checklist && j.checklist.length ? `<div class="meta">${j.checklist.map((c) => `${esc(c.label)}${({ ok: '◯', ng: '×', warn: '△', unknown: '?' })[c.status] || '?'}`).join(' ')}</div>` : ''}
    </li>`).join('');
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

$('#search').onclick = async () => {
  const mod = await import(chrome.runtime.getURL('content/adapters/index.js'));
  for (const s of mod.allSearchUrls()) chrome.tabs.create({ url: s.url, active: false });
  window.close();
};

$('#csv').onclick = () => {
  const head = ['サイト', 'タイトル', '点数', '判定', '報酬', '応募数', '避けるべき条件', '危険', 'URL'];
  const lines = [head, ...rows().map((j) => [j.site || '', j.title || '', j.score, j.verdict, j.budget || '', j.applicants ?? '', (j.ngItems || []).join(' / '), [j.banned, ...(j.redFlags || [])].filter(Boolean).join(' / '), j.url])]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `営業案件_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

load();
