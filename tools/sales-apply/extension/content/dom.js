/**
 * DOM操作の共通部品。
 *
 * 方針: サイトのHTMLは予告なく変わる。だから「決め打ちセレクタ」は当てにせず、
 *       ①アダプタが渡すヒント → ②汎用ヒューリスティック の二段構えで拾う。
 *       片方が壊れてももう片方で動く。
 */

export const text = (el) => (el ? (el.innerText || el.textContent || '').replace(/ /g, ' ').trim() : '');

/** 候補セレクタを順に試して、最初に見つかった要素を返す */
export function q(root, selectors) {
  for (const s of selectors || []) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch { /* 無効なセレクタは飛ばす */ }
  }
  return null;
}

export function qa(root, selectors) {
  for (const s of selectors || []) {
    try {
      const els = [...root.querySelectorAll(s)];
      if (els.length) return els;
    } catch { /* noop */ }
  }
  return [];
}

/** 見えている要素か（非表示のダミーフォームを掴まないため） */
export function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
}

/**
 * React/Vue製フォームでも確実に値が入るセッター。
 * el.value = x だけだとフレームワークが変更に気づかず、送信時に空で飛ぶ。
 */
export function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  el.blur();
}

/** contenteditable（リッチテキスト欄）にも対応 */
export function setEditableValue(el, value) {
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  setNativeValue(el, value);
  return true;
}

/** 要素の見出し・ラベル・placeholder・name をまとめた検索用の文字列 */
export function fieldSignature(el) {
  const bits = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')];
  const labelled = el.labels && el.labels.length ? text(el.labels[0]) : '';
  const wrap = el.closest('label, .form-group, .form-row, dl, tr, li, div');
  const near = wrap ? text(wrap).slice(0, 80) : '';
  return [...bits, labelled, near].filter(Boolean).join(' ').toLowerCase();
}

/** 応募文を書く「一番大きい入力欄」を探す */
export function findMessageField(hints = []) {
  const hinted = q(document, hints);
  if (hinted && isVisible(hinted)) return hinted;

  const candidates = [
    ...document.querySelectorAll('textarea, [contenteditable="true"]'),
  ].filter(isVisible);
  if (!candidates.length) return null;

  const keywords = ['提案', '応募', 'メッセージ', '自己紹介', 'アピール', '本文', 'proposal', 'message', 'body', 'comment', 'apply'];
  const scored = candidates.map((el) => {
    const sig = fieldSignature(el);
    const r = el.getBoundingClientRect();
    let s = Math.min(r.width * r.height / 5000, 40);         // 大きい欄ほど本命
    if (keywords.some((k) => sig.includes(k))) s += 50;
    if (sig.includes('検索') || sig.includes('search')) s -= 60;
    return { el, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0].s > 0 ? scored[0].el : null;
}

/** ラベルの言葉から入力欄を探す（氏名・メール・希望金額など） */
export function findFieldByWords(words, types = ['input', 'textarea', 'select']) {
  const els = [...document.querySelectorAll(types.join(','))].filter(isVisible)
    .filter((el) => !['hidden', 'submit', 'button', 'file', 'password'].includes(el.type));
  for (const el of els) {
    const sig = fieldSignature(el);
    if (words.some((w) => sig.includes(w.toLowerCase()))) return el;
  }
  return null;
}

/** 送信ボタンを探す（押さない。場所を教えて光らせるだけ） */
export function findSubmitButton(hints = []) {
  const hinted = q(document, hints);
  if (hinted && isVisible(hinted)) return hinted;
  const words = ['応募する', '提案する', '送信', '応募', '確認画面', '確認する', '送る'];
  const els = [...document.querySelectorAll('button, input[type="submit"], a[role="button"]')].filter(isVisible);
  return els.find((el) => {
    const t = `${text(el)} ${el.value || ''}`;
    return words.some((w) => t.includes(w));
  }) || null;
}

/** 送信ボタンを目立たせる（クリックはしない） */
export function highlight(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prev = el.style.cssText;
  el.style.cssText += ';outline:4px solid #ea580c;outline-offset:3px;border-radius:6px;transition:outline .2s;';
  setTimeout(() => { el.style.cssText = prev; }, 6000);
}

/* ---------- 一覧ページから案件を拾う汎用エンジン ---------- */

/**
 * サイトが対応済み（＝detailUrlという「idから正しいURLを組み立てる関数」を
 * 持っている）なら、案件のURLは常にそれで作り直す。
 *
 * href.split('?')[0] で末尾のクエリ文字列を落としているため、
 * Indeedのように「?jk=案件ID」という形でidを持つサイトだと、
 * 素通しのURLはid（jk）が欠けたリンク切れになってしまう。
 * detailUrlがあれば、そのURLだけを信じて作り直すほうが確実。
 */
export function canonicalizeUrls(cards, adapter) {
  if (!adapter || typeof adapter.detailUrl !== 'function') return cards;
  return cards.map((c) => {
    try {
      const url = adapter.detailUrl(c.id);
      return url ? { ...c, url } : c;
    } catch {
      return c;
    }
  });
}

/**
 * リンクから見て「案件1件分」のまとまりになっている親要素を探す。
 *
 * 文字数だけで親をたどると、情報の少ないカードのときに一覧全体を掴んでしまい、
 * 全案件が1件目と同じ内容として読み取られる（実際にこのバグがあった）。
 * なので「他の案件のリンクを含まない、いちばん外側の親」を採る。
 */
function cardOf(link, pattern) {
  const idOf = (href) => { const m = pattern.exec(href); return m ? m[1] : null; };
  const myId = idOf(link.href);
  // ページ全体を掴まないための境界。
  // ヘッダーに同じ案件へのリンクがあると「別の案件は含まれない」判定をすり抜けるため、
  // ページ構造の区切りでも必ず止める。
  const STOP = new Set(['BODY', 'MAIN', 'HEADER', 'NAV', 'FOOTER', 'HTML']);
  let el = link;
  let best = link.parentElement || link;
  for (let i = 0; i < 8 && el.parentElement; i++) {
    el = el.parentElement;
    if (STOP.has(el.tagName)) break;
    const ids = new Set(
      [...el.querySelectorAll('a[href]')].map((a) => idOf(a.href)).filter(Boolean),
    );
    // 別の案件まで含む親まで来たら、その手前が1件分
    if (ids.size > 1 || (ids.size === 1 && !ids.has(myId))) break;
    best = el;
  }
  return best;
}

/**
 * 報酬の文字列を、数字と単位の直後で止めて抜き出す。
 * サイトによっては要素の間に改行が無く、金額のすぐ後ろに
 * 「プロフィールだけでカンタン応募」のようなボタン文言が続くため、
 * 何も考えずに40字を切り取ると隣の文言まで巻き込んでしまう。
 * 金額らしき形（◯円・◯円〜◯円・◯万円など）が終わった所で切る。
 */
export const BUDGET_RE = /(?:予算|報酬|価格|時給|単価|固定報酬|時間単価|給与|月給)[^\n\d]{0,6}[\d,]+(?:\.\d+)?\s*(?:万)?円?(?:\s*[〜~\-]\s*[\d,]+(?:\.\d+)?\s*(?:万)?円)?(?:\s*(?:以上|以下|前後))?/;

/** 「成果報酬」「応相談」のように、金額の数字が無い報酬表記 */
export const BUDGET_NO_NUMBER_RE = /(?:成果報酬|完全歩合制|応相談|要相談|給与応相談)/;

/**
 * BUDGET_RE で金額を拾う。ただし「成果報酬」のような数字なし表現の中に
 * たまたま「報酬」という文字が含まれているせいで、そのすぐ後ろにある
 * 無関係な数字（応募者数など）を金額と誤認しないよう、
 * 数字なし表現の範囲内から始まる候補は除外する。
 * 見つからなければ数字なし表現を、それも無ければ空文字を返す。
 */
export function extractBudget(text) {
  const s = String(text || '');
  const noNumber = [...s.matchAll(new RegExp(BUDGET_NO_NUMBER_RE.source, 'g'))]
    .map((m) => [m.index, m.index + m[0].length]);
  const insideNoNumber = (i) => noNumber.some(([start, end]) => i >= start && i < end);

  for (const m of s.matchAll(new RegExp(BUDGET_RE.source, 'g'))) {
    if (!insideNoNumber(m.index)) return m[0];
  }
  return (s.match(BUDGET_NO_NUMBER_RE) || [])[0] || '';
}

const num = (s) => {
  const m = String(s || '').replace(/[,，]/g, '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
};

/**
 * 一覧ページを走査して案件を配列で返す。
 * @param {RegExp} detailPattern 詳細ページURLの形（例: /work\/detail\/(\d+)/）
 */
export function scrapeListGeneric(detailPattern, opt = {}) {
  return scrapeListFrom(document, detailPattern, location.href, opt);
}

/** fetchしてきた一覧HTMLから案件を拾う（ページ送りで使う） */
export function scrapeListFromDoc(doc, detailPattern, baseUrl, opt = {}) {
  return scrapeListFrom(doc, detailPattern, baseUrl, opt);
}

function scrapeListFrom(root, detailPattern, baseUrl, opt = {}) {
  const seen = new Set();
  const jobs = [];
  for (const a of root.querySelectorAll('a[href]')) {
    // fetchしたHTMLでは a.href が空になることがあるので、baseUrl で補う
    let href = a.href;
    if (!href || href.startsWith('about:')) {
      try { href = new URL(a.getAttribute('href'), baseUrl).toString(); } catch { continue; }
    }
    const m = detailPattern.exec(href);
    if (!m) continue;
    const id = m[1] || href;
    if (seen.has(id)) continue;

    // ヘッダー・ナビ・フッターの中のリンクは案件ではない
    if (a.closest('header, nav, footer')) continue;

    const card = cardOf(a, detailPattern);
    const cardText = text(card);
    // 情報が少ないカードでも落とさない（本文は詳細ページで取り直すため）。
    // 中身が空のリンクだけ除外する。
    if (cardText.length < 2) continue;
    seen.add(id);

    const title = text(q(card, ['h2 a', 'h3 a', 'h2', 'h3', '[class*="title"]'])) || text(a);
    const budget = extractBudget(cardText);
    const applicants = num((cardText.match(/(?:提案|応募)[^\n]{0,6}?(\d+)\s*(?:人|件)/) || [])[1]);

    jobs.push({
      id: String(id),
      url: href.split('?')[0],
      title: title.replace(/\s+/g, ' ').trim().slice(0, 160),
      description: cardText.slice(0, 1200),
      budget: budget.trim(),
      applicants,
      clientVerified: /本人確認済|認証済/.test(cardText),
      listedAt: Date.now(),
      ...(opt.extra ? opt.extra(card, a) : {}),
    });
  }
  return jobs;
}

/**
 * 本文（募集文）のブロックを選ぶ。
 * ページ全体(body)を掴むとヘッダー・広告まで材料に混ざるので上限を掛ける。
 * @param {Document|Element} root
 * @param {boolean} useVisibility 表示状態で絞るか（fetchしたHTMLでは使えない）
 */
function pickDescription(root, hints, useVisibility) {
  const hinted = q(root, hints.description || []);
  if (hinted && text(hinted).length > 120) return text(hinted);

  const body = root.body || root;
  const bodyLen = text(body).length || 1;
  let best = null; let bestLen = 0;
  for (const el of root.querySelectorAll('section, article, main, div[class*="detail"], div[class*="description"], div[class*="body"], div[class*="content"], div[id*="Description"]')) {
    if (useVisibility && !isVisible(el)) continue;
    const t = text(el);
    if (t.length < 200 || t.length > bodyLen * 0.8) continue;
    if (t.length > bestLen) { best = el; bestLen = t.length; }
  }
  return best ? text(best) : text(body);
}

/** 詳細のHTMLから案件1件分を組み立てる共通部分 */
function buildDetail(root, hints, url, useVisibility) {
  const title = text(q(root, hints.title || []) || root.querySelector('h1'))
    || (root.title || '');
  const description = pickDescription(root, hints, useVisibility).slice(0, 8000);
  const page = text(root.body || root);
  const budget = text(q(root, hints.budget || [])) || extractBudget(page);
  const applicants = num((page.match(/(?:提案|応募)[^\n]{0,6}?(\d+)\s*(?:人|件)/) || [])[1]);
  // ホスト名やポート番号からidを拾わないよう、パス以降だけを見る
  let tail = url;
  try { const u = new URL(url); tail = u.pathname + u.search; } catch { /* 相対URLならそのまま */ }
  return {
    // パスの最後の数字を採る（/2024/jobs/5 のような形で年を拾わないため）
    id: (tail.match(/[?&]v?jk=([\w-]+)/) || tail.match(/(\d+)(?!.*\d)/) || [])[1] || tail,
    url: url.split('#')[0],
    title: title.replace(/\s+/g, ' ').trim(),
    description,
    budget: budget.trim(),
    applicants,
    clientVerified: /本人確認済|認証済/.test(page),
  };
}

/** いま開いているページから案件1件分を拾う */
export function scrapeDetailGeneric(hints = {}) {
  return buildDetail(document, hints, location.href, true);
}

/**
 * fetchしてきたHTML文字列から案件1件分を拾う。
 * 一覧のカードだけでは「無形かどうか」「アポは譲渡型か」が分からず点数が上がらないので、
 * 詳細ページの本文まで取りに行くために使う。
 */
export function scrapeDetailFromHtml(html, hints, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return buildDetail(doc, hints, url, false);
}

/**
 * 「詳細ページとして取得したものが、実は一覧ページ（アプリの外枠）そのもの」
 * かどうかを、<title>タグの一致で判定する。
 *
 * JavaScriptで中身を後から読み込むタイプのサイト（クライアント側レンダリングの
 * SPA）は、fetch() では読み込み前の空の外枠しか取れず、どの案件IDに対しても
 * 同じ内容が返ってくる。これを見分けないと「詳細を取得できた」と誤認して、
 * 中身のない情報で誤判定してしまう。
 */
export function looksLikeShellPage(fetchedTitle, listPageTitle) {
  const a = String(fetchedTitle || '').trim();
  const b = String(listPageTitle || '').trim();
  return !!a && !!b && a === b;
}
