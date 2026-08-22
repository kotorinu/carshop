const $ = (s) => document.querySelector(s);
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { jobs: [], applied: {}, settings: { mustKeys: [], maxOpenTabs: 8, targetCandidates: 10 }, crawl: {} };
let tab = 'candidate';
let JS = null;   // jobstate モジュール
let LABELS = {};
let ALL_KEYS = [];

async function load() {
  const scoring = await import(chrome.runtime.getURL('core/scoring.js'));
  JS = await import(chrome.runtime.getURL('core/jobstate.js'));
  LABELS = scoring.CRITERIA_LABELS;
  ALL_KEYS = scoring.CRITERIA_KEYS;
  state = await send({ type: 'getState' });
  $('#maxOpenTabs').value = state.settings.maxOpenTabs;
  $('#targetCandidates').value = state.settings.targetCandidates ?? 10;
  renderCounts();
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

function renderCounts() {
  const n = JS ? JS.summarize(state.jobs || []) : {};
  $('#counts').innerHTML = [
    ['候補', n.candidate], ['書きかけ', n.drafted], ['応募済み', n.applied],
    ['見送り', n.skipped], ['対象外', n.rejected],
  ].map(([k, v]) => `${k} <b>${v || 0}</b>`).join('　');
}

function rows() {
  const jobs = state.jobs || [];
  const sorted = JS ? JS.sortForList(jobs) : jobs;
  if (tab === 'all') return sorted;
  return sorted.filter((j) => j.status === tab);
}

function render() {
  const list = $('#list');
  const data = rows();
  if (!data.length) {
    const empty = {
      candidate: '条件を満たす新しい案件がありません。<br>上の「条件に合う案件を探して開く」を押してください。<br><br>探しても出てこないときは、マスト条件のチェックを減らしてください。<br>確認できなかった項目は、面接で聞けば済みます。',
      drafted: '書きかけの応募文はありません。<br>候補のタブから案件を開くと、応募文が作られてここに入ります。',
      applied: 'まだ応募していません。<br>応募したら、その案件のパネルで「✅ 応募した」を押してください。',
      rejected: '対象外にした案件はまだありません。',
      all: 'まだ案件がありません。上のボタンを押してください。',
    }[tab];
    list.innerHTML = `<div class="empty">${empty}</div>`;
    return;
  }
  if (false) {
    list.innerHTML = tab === 'top'
      ? `<div class="empty">条件を満たす案件がまだありません。<br>上の「条件に合う案件を探して開く」を押してください。<br><br>探しても出てこないときは、マスト条件のチェックを減らしてください。<br>確認できなかった項目は、面接で聞けば済みます。</div>`
      : `<div class="empty">まだ案件がありません。上のボタンを押してください。</div>`;
    return;
  }
  const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };
  list.innerHTML = data.map((j) => {
    const must = j.must || { passed: false, reasons: [], unconfirmed: [] };
    const badgeBy = {
      candidate: ['apply', '候補'], drafted: ['maybe', '書きかけ'], applied: ['apply', '応募済み'],
      skipped: ['banned', '見送り'], rejected: ['skip', '対象外'], new: ['maybe', '未判定'],
    };
    const state2 = badgeBy[j.status] || (must.passed ? ['apply', '候補'] : ['skip', '対象外']);
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
  renderCounts();
}

/* ---------- 進捗 ---------- */

let pollTimer = null;

function renderProgress(crawl) {
  crawl = crawl || {};
  const show = crawl.running || crawl.finishedAt || crawl.error;
  $('#progress').hidden = !show;
  if (show) {
    const pct = crawl.total ? Math.round((crawl.done / crawl.total) * 100) : 0;
    $('#pBar').style.width = `${pct}%`;
    $('#pTitle').textContent = crawl.error
      ? '⚠ エラーで止まりました'
      : crawl.running
        ? `巡回中… ${crawl.done}/${crawl.total} サイト`
        : `完了（${crawl.opened || 0}件を開きました）`;
    const lines = [...(crawl.log || []).slice(-8)];
    if (crawl.error) lines.push(`<span style="color:#b91c1c">${esc(crawl.error)}</span>`);
    $('#pLog').innerHTML = lines.map((l) => (l.startsWith('<span') ? l : esc(l))).join('<br>');
  }
  $('#auto').disabled = !!crawl.running;
  $('#auto').textContent = crawl.running ? '巡回中…（閉じてもそのまま進みます）' : '🔍 条件に合う案件を探して開く';

  // 巡回中はメッセージだけに頼らず、保存された状態を見に行く
  clearInterval(pollTimer);
  if (crawl.running) {
    pollTimer = setInterval(async () => {
      const st = await send({ type: 'getState' });
      if (!st) return;
      state = st;
      renderProgress(st.crawl);
      render();
    }, 1500);
  }
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
  $('#progress').hidden = false;
  $('#pTitle').textContent = '巡回を開始しています…';
  $('#pLog').textContent = '';

  // 返事が来ないまま固まらないよう、5秒で見張る
  const watchdog = setTimeout(() => {
    $('#pTitle').textContent = '⚠ 反応がありません';
    $('#pLog').innerHTML = '拡張機能の再読み込み（chrome://extensions のリロードボタン）を試してください。'
      + '<br>それでも直らないときは、この画面をClaudeに見せてください。';
    $('#auto').disabled = false;
    $('#auto').textContent = '🔍 条件に合う案件を探して開く';
  }, 5000);

  let res;
  try {
    res = await send({ type: 'startCrawl' });
  } catch (e) {
    res = { error: String(e) };
  }
  clearTimeout(watchdog);

  if (res && res.error) {
    $('#pTitle').textContent = '⚠ 開始できませんでした';
    $('#pLog').innerHTML = `<span style="color:#b91c1c">${esc(res.error)}</span>`;
    $('#auto').disabled = false;
    $('#auto').textContent = '🔍 条件に合う案件を探して開く';
    return;
  }
  await load();
};

$('#openTop').onclick = async () => {
  const res = await send({ type: 'openTop' });
  $('#hint').textContent = res.opened ? `${res.opened}件を開きました` : '条件を満たす案件がありません';
};

for (const id of ['maxOpenTabs', 'targetCandidates']) {
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

$('#diag').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { alert('タブが見つかりません'); return; }
  $('#diagBox').hidden = false;
  $('#diagOut').value = '診断しています…（詳細ページを1件取りに行くので数秒かかります）';
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (extUrl, pageUrl) => {
        const m = await import(`${extUrl}content/diagnose.js`);
        return m.runDiagnosis(pageUrl, extUrl);
      },
      args: [chrome.runtime.getURL(''), tab.url],
    });
    $('#diagOut').value = (res && res.result) || '結果を取得できませんでした。';
  } catch (e) {
    $('#diagOut').value = `診断できませんでした: ${e}\n\n`
      + 'このサイトはまだ拡張機能の対象外かもしれません。\n'
      + 'その場合は「このページで起動」を先に押してから、もう一度診断してください。';
  }
};
$('#diagCopy').onclick = async () => {
  $('#diagOut').select();
  try { await navigator.clipboard.writeText($('#diagOut').value); } catch { document.execCommand('copy'); }
  $('#diagCopy').textContent = 'コピーした';
  setTimeout(() => { $('#diagCopy').textContent = 'コピー'; }, 1500);
};
$('#diagClose').onclick = () => { $('#diagBox').hidden = true; };

$('#csv').onclick = () => {
  const head = ['サイト', 'タイトル', '状態', '点数', '報酬', '応募数', '条件に反する点', '確認できず', 'URL'];
  const lines = [head, ...rows().map((j) => [j.site || '', j.title || '',
    (JS && JS.STATUS_LABEL[j.status]) || j.status || '', j.score, j.budget || '', j.applicants ?? '',
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
