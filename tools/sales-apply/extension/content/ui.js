/**
 * ページに出す操作パネル。ShadowDOMなので、サイト側のCSSに壊されない／壊さない。
 * 「送信」ボタンだけは絶対に置かない（押すのは人間の仕事）。
 */
const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 380px; max-height: 78vh; display: flex; flex-direction: column;
  font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  font-size: 13px; line-height: 1.7; color: #1c1917;
  background: #fffdfa; border: 1px solid #e7e0d6; border-radius: 14px;
  box-shadow: 0 12px 40px rgba(28,25,23,.22); overflow: hidden;
}
.wrap.min { width: 200px; }
header {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: #1c1917; color: #fafaf9; cursor: move; user-select: none;
}
header .dot { width: 8px; height: 8px; border-radius: 99px; background: #f97316; }
header b { font-size: 13px; font-weight: 700; flex: 1; }
header button { background: none; border: 0; color: #d6d3d1; cursor: pointer; font-size: 15px; padding: 0 4px; }
.body { padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.mode { font-size: 11px; color: #78716c; }
.row { display: flex; gap: 6px; flex-wrap: wrap; }
button.act {
  flex: 1; min-width: 118px; padding: 9px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid #1c1917; background: #1c1917; color: #fff; font-weight: 700; font-size: 12.5px;
}
button.act.sub { background: #fff; color: #1c1917; }
button.act:disabled { opacity: .35; cursor: not-allowed; }
textarea {
  width: 100%; box-sizing: border-box; min-height: 220px; padding: 10px; font: inherit;
  border: 1px solid #d6d3d1; border-radius: 9px; resize: vertical; background: #fff; line-height: 1.8;
}
.warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.warn b { color: #c2410c; }
.banned { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #991b1b; }
.banned b { display: block; font-size: 13px; margin-bottom: 3px; }
table.check { width: 100%; border-collapse: collapse; font-size: 11.5px; }
table.check td { padding: 3px 4px; border-bottom: 1px solid #f0ece5; vertical-align: top; }
table.check td.k { width: 74px; color: #78716c; white-space: nowrap; }
table.check td.s { width: 18px; text-align: center; font-weight: 700; }
td.s.ok { color: #15803d; } td.s.ng { color: #b91c1c; } td.s.warn { color: #a16207; } td.s.unknown { color: #a8a29e; }
.h { font-size: 11px; font-weight: 700; color: #78716c; margin-top: 2px; }
ol.ask { margin: 2px 0 0; padding-left: 18px; font-size: 11.5px; color: #57534e; }
.ok { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
ul.jobs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
ul.jobs li { border: 1px solid #e7e0d6; border-radius: 9px; padding: 8px 10px; background: #fff; }
ul.jobs a { color: #1c1917; font-weight: 700; text-decoration: none; display: block; font-size: 12.5px; }
ul.jobs a:hover { text-decoration: underline; }
.meta { font-size: 11px; color: #78716c; margin-top: 3px; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 700; }
.badge.apply { background: #dcfce7; color: #15803d; }
.badge.maybe { background: #fef9c3; color: #a16207; }
.badge.skip { background: #fee2e2; color: #b91c1c; }
.count { font-size: 11px; color: #78716c; }
footer { padding: 8px 12px; border-top: 1px solid #f0ece5; font-size: 11px; color: #78716c; background: #faf8f5; }
`;

export function mountPanel(handlers) {
  document.getElementById('sales-apply-panel')?.remove();
  const host = document.createElement('div');
  host.id = 'sales-apply-panel';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.append(wrap);
  document.documentElement.append(host);

  let state = {
    mode: '', site: '', jobs: [], draft: '', warnings: [], message: '',
    banned: '', checklist: [], askInInterview: [], posting: null, busy: false, minimized: false,
  };

  function render() {
    wrap.classList.toggle('min', state.minimized);
    wrap.innerHTML = '';

    const head = document.createElement('header');
    head.innerHTML = `<span class="dot"></span><b>営業応募オートパイロット</b>`;
    const minBtn = document.createElement('button');
    minBtn.textContent = state.minimized ? '□' : '—';
    minBtn.onclick = () => { state.minimized = !state.minimized; render(); };
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.onclick = () => host.remove();
    head.append(minBtn, closeBtn);
    wrap.append(head);
    makeDraggable(head, host);
    if (state.minimized) return;

    const body = document.createElement('div');
    body.className = 'body';
    wrap.append(body);

    const mode = document.createElement('div');
    mode.className = 'mode';
    mode.textContent = `${state.site}｜${state.mode}`;
    body.append(mode);

    if (state.banned) {
      const b = document.createElement('div');
      b.className = 'banned';
      b.innerHTML = `<b>🚫 この媒体は使用禁止です</b>${escapeHtml(state.banned)}`;
      body.append(b);
    }

    const row = document.createElement('div');
    row.className = 'row';
    for (const b of handlers.buttons(state)) {
      const btn = document.createElement('button');
      btn.className = `act${b.sub ? ' sub' : ''}`;
      btn.textContent = b.label;
      btn.disabled = state.busy || b.disabled;
      btn.onclick = () => b.onClick();
      row.append(btn);
    }
    body.append(row);

    if (state.message) {
      const m = document.createElement('div');
      m.className = 'ok';
      m.textContent = state.message;
      body.append(m);
    }

    if (state.warnings.length) {
      const w = document.createElement('div');
      w.className = 'warn';
      w.innerHTML = `<b>直したほうがいい点</b><br>` + state.warnings.map((x) => `・${escapeHtml(x)}`).join('<br>');
      body.append(w);
    }

    if (state.posting) {
      const po = state.posting;
      const bits = [];
      if (po.magicWord) bits.push(`合言葉「${po.magicWord}」を冒頭に入れました`);
      if (po.maxLength) bits.push(`${po.maxLength}文字以内の指定に合わせました`);
      if (po.company) bits.push(`会社名: ${po.company}`);
      if (po.requirements.length) bits.push(`指定項目 ${po.requirements.length}件に回答しました`);
      if (po.unanswered.length) bits.push(`⚠ 答えられなかった項目: ${po.unanswered.join('・')}`);
      if (bits.length) {
        const h = document.createElement('div');
        h.className = 'h';
        h.textContent = '募集要項から読み取ったこと';
        const box = document.createElement('div');
        box.className = 'ok';
        box.innerHTML = bits.map((b) => `・${escapeHtml(b)}`).join('<br>');
        body.append(h, box);
      }
    }

    if (state.checklist.length) {
      const h = document.createElement('div');
      h.className = 'h';
      h.textContent = '案件チェックリスト';
      const t = document.createElement('table');
      t.className = 'check';
      const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };
      t.innerHTML = state.checklist.map((c) => `
        <tr><td class="k">${escapeHtml(c.label)}</td>
        <td class="s ${escapeHtml(c.status)}">${icon[c.status] || '?'}</td>
        <td>${escapeHtml(c.detail)}</td></tr>`).join('');
      body.append(h, t);
    }

    if (state.askInInterview.length) {
      const h = document.createElement('div');
      h.className = 'h';
      h.textContent = '面接で必ず聞くこと';
      const ol = document.createElement('ol');
      ol.className = 'ask';
      ol.innerHTML = state.askInInterview.map((q) => `<li>${escapeHtml(q)}</li>`).join('');
      body.append(h, ol);
    }

    if (state.draft) {
      const ta = document.createElement('textarea');
      ta.value = state.draft;
      ta.oninput = () => { state.draft = ta.value; handlers.onDraftEdited?.(ta.value); };
      body.append(ta);
      const cnt = document.createElement('div');
      cnt.className = 'count';
      const update = () => { cnt.textContent = `${ta.value.length}文字`; };
      ta.addEventListener('input', update); update();
      body.append(cnt);
    }

    if (state.jobs.length) {
      const c = document.createElement('div');
      c.className = 'count';
      const pass = state.jobs.filter((j) => j.must && j.must.passed).length;
      c.textContent = `${state.jobs.length}件中、条件を満たすのは${pass}件`;
      body.append(c);
      const ul = document.createElement('ul');
      ul.className = 'jobs';
      for (const j of state.jobs.slice(0, 20)) {
        const li = document.createElement('li');
        const must = j.must || { passed: false, reasons: [], unconfirmed: [] };
        const reason = must.reasons.length ? `⛔ ${must.reasons[0]}`
          : must.unconfirmed.length ? `△ 確認できず: ${must.unconfirmed.join('・')}`
            : '✅ 条件をすべて満たしています';
        li.innerHTML = `<a href="${escapeHtml(j.url)}" target="_blank" rel="noopener">${escapeHtml(j.title)}</a>
          <div class="meta"><span class="badge ${must.passed ? 'apply' : must.reasons.length ? 'skip' : 'maybe'}">${must.passed ? '合格' : '対象外'}</span> ${j.score}点 ${escapeHtml(j.budget || '報酬不明')} ${j.applicants != null ? `／応募${j.applicants}件` : ''}</div>
          <div class="meta">${escapeHtml(reason)}</div>`;
        ul.append(li);
      }
      body.append(ul);
    }

    const foot = document.createElement('footer');
    foot.textContent = '送信ボタンは自動では押しません。最後に自分の目で読んでから押してください。';
    wrap.append(foot);
  }

  render();
  return {
    set(patch) { state = { ...state, ...patch }; render(); },
    get() { return state; },
    remove() { host.remove(); },
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeDraggable(handle, host) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = host.shadowRoot.querySelector('.wrap');
    w.style.left = `${ox + e.clientX - sx}px`;
    w.style.top = `${oy + e.clientY - sy}px`;
    w.style.right = 'auto'; w.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}
