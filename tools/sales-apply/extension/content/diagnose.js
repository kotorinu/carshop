/**
 * 実サイトでの読み取り診断。
 *
 * 開発側（Claude）は組織のネットワーク制限で実サイトに接続できないため、
 * 「実際のページで何がどこまで読めているか」をこのツール自身に報告させる。
 * 出た結果をそのまま貼ってもらえれば、直すべき箇所が分かる。
 *
 * ⚠️ 個人情報は一切出さない。フォームの項目は「見つかった／見つからない」だけ。
 */
export async function runDiagnosis(url, extBase) {
  // 拡張機能の場所は呼び出し元から渡せるようにする。
  // ページの世界（main world）から呼ぶと chrome.runtime が無いため。
  const base = extBase
    || (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL('')) 
    || new URL('../', import.meta.url).toString();
  const u = (p) => `${base}${p}`;
  const [dom, adaptersMod, scoring] = await Promise.all([
    import(u('content/dom.js')),
    import(u('content/adapters/index.js')),
    import(u('core/scoring.js')),
  ]);

  const ad = adaptersMod.pickAdapter(location);
  const L = [];
  const say = (s) => L.push(s);
  const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };

  const kind = ad.banned ? '使用禁止の媒体'
    : ad.isFormPage(location) && document.querySelector('textarea') ? '応募フォーム'
      : ad.isDetailPage(location) ? '案件の詳細ページ'
        : ad.isListPage(location) ? '案件一覧のページ' : 'その他';

  say('=== 営業応募オートパイロット 読み取り診断 ===');
  say(`URL: ${String(url || location.href).split('?')[0]}`);
  say(`媒体の判定: ${ad.name}（${ad.id}）`);
  say(`ページ種別の判定: ${kind}`);
  say('');

  /* ---------- 一覧 ---------- */
  const allLinks = [...document.querySelectorAll('a[href]')];
  const jobLinks = allLinks.filter((a) => { try { return ad.detailPattern.test(a.href); } catch { return false; } });
  say('■ 一覧の読み取り');
  say(`  ページ内のリンク: ${allLinks.length}本 / 案件らしいリンク: ${jobLinks.length}本`);

  let cards = [];
  try { cards = dom.scrapeListGeneric(ad.detailPattern); } catch (e) { say(`  ⚠ 例外: ${e}`); }
  say(`  読み取れた案件: ${cards.length}件`);

  if (!cards.length && jobLinks.length) {
    say('  ⚠ リンクはあるのに案件を組み立てられていません（カードの切り出しに失敗）');
  }
  if (cards.length) {
    const titles = new Set(cards.map((c) => c.title));
    if (titles.size < cards.length) {
      say(`  ⚠ タイトルが重複しています（${cards.length}件中${titles.size}種類）→ カードの切り出しに失敗`);
    }
    const avg = Math.round(cards.reduce((n, c) => n + (c.description || '').length, 0) / cards.length);
    say(`  カード本文の平均: ${avg}字${avg > 1000 ? '  ⚠ 長すぎ（一覧全体を掴んでいる疑い）' : ''}`);
    say(`  報酬を拾えた: ${cards.filter((c) => c.budget).length}件 / 応募数を拾えた: ${cards.filter((c) => c.applicants != null).length}件`);
    say('  --- 先頭3件 ---');
    for (const c of cards.slice(0, 3)) {
      say(`  ・[${c.id}] ${String(c.title).slice(0, 40)}`);
      say(`      報酬:${c.budget || '取れず'} / 応募:${c.applicants ?? '取れず'} / 本文${(c.description || '').length}字`);
    }
  }
  say('');

  /* ---------- 詳細 ---------- */
  say('■ 詳細ページの読み取り');
  let detail = null;
  if (kind === '案件の詳細ページ') {
    detail = dom.scrapeDetailGeneric(ad.hints || {});
    say('  （いま開いているページから読み取り）');
  } else if (cards.length) {
    const first = cards[0];
    const durl = ad.detailUrl ? ad.detailUrl(first.id) : first.url;
    try {
      const res = await fetch(durl, { credentials: 'include' });
      say(`  1件目を取得: HTTP ${res.status}`);
      if (res.ok) detail = dom.scrapeDetailFromHtml(await res.text(), ad.hints || {}, durl);
    } catch (e) {
      say(`  ⚠ 詳細ページを取得できません: ${String(e).slice(0, 80)}`);
      say('    → ログインが必要か、サイト側が拒否しています');
    }
  } else {
    say('  （一覧でも詳細でもないため省略）');
  }

  if (detail) {
    say(`  タイトル: ${String(detail.title).slice(0, 50) || '取れず'}`);
    say(`  本文: ${(detail.description || '').length}字`);
    say(`  報酬: ${detail.budget || '取れず'}`);
    if ((detail.description || '').length < 150) {
      say('  ⚠ 本文が短すぎます（読み取り位置がずれている可能性）');
    }
    say(`  本文の先頭: ${String(detail.description || '').replace(/\s+/g, ' ').slice(0, 120)}`);
    say('');
    say('■ 条件の判定（この案件について）');
    const scored = scoring.scoreJob({ ...detail, site: ad.id });
    const must = scoring.checkMust(scored, scoring.DEFAULT_MUST);
    say(`  ${scored.checklist.map((c) => `${c.label}${icon[c.status]}`).join(' ')}`);
    for (const c of scored.checklist) say(`   ・${c.label}: ${c.detail}`);
    say(`  判定: ${must.passed ? '✅ 届ける' : '⛔ 届けない'}`);
    if (must.reasons.length) say(`   条件に反する: ${must.reasons.join(' / ')}`);
    if (must.unconfirmed.length) say(`   募集文で確認できず: ${must.unconfirmed.join(' / ')}`);
    const posting = await readPostingSafe(u, detail);
    if (posting) {
      say('');
      say('■ 募集要項から読み取れたこと');
      say(`  会社名: ${posting.company || '取れず'}`);
      say(`  大切にしている言葉: ${posting.philosophy || '取れず'}`);
      say(`  合言葉: ${posting.magicWord || 'なし'}`);
      say(`  字数制限: ${posting.maxLength || 'なし'}`);
      say(`  指定項目: ${posting.requirements.length ? posting.requirements.map((r) => r.label).join('・') : 'なし'}`);
      if (posting.unanswered.length) say(`  ⚠ 答えられない項目: ${posting.unanswered.join('・')}`);
    }
  }
  say('');

  /* ---------- フォーム ---------- */
  say('■ 応募フォームの読み取り');
  const field = dom.findMessageField((ad.hints && ad.hints.message) || []);
  say(`  応募文の入力欄: ${field ? `見つかった（${describe(field)}）` : '見つからない'}`);
  const wants = [
    ['氏名', ['氏名', 'お名前', 'name', '担当者']],
    ['フリガナ', ['フリガナ', 'ふりがな', 'かな', 'kana']],
    ['メール', ['メール', 'mail', 'e-mail']],
    ['電話', ['電話', 'tel', 'phone', '携帯']],
    ['郵便番号', ['郵便', 'zip', 'postal']],
    ['住所', ['住所', 'address', '所在地']],
    ['希望金額', ['希望金額', '提案金額', '見積', '報酬', '単価']],
  ];
  for (const [label, words] of wants) {
    const el = dom.findFieldByWords(words);
    say(`  ${label}の欄: ${el ? `見つかった（${describe(el)}）` : '見つからない'}`);
  }
  const submit = dom.findSubmitButton((ad.hints && ad.hints.submit) || []);
  say(`  送信ボタン: ${submit ? `見つかった「${dom.text(submit).slice(0, 20)}」` : '見つからない'}`);
  say('');
  say('※ この診断は個人情報を一切含みません。そのまま貼って大丈夫です。');

  return L.join('\n');

  /** 要素を「どれか」だけ分かる形で表す（中身は出さない） */
  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute('name');
    const id = el.getAttribute('id');
    return [tag, name && `name=${name}`, !name && id && `id=${id}`].filter(Boolean).join(' ');
  }

  async function readPostingSafe(urlFn, job) {
    try {
      const rq = await import(urlFn('core/requirements.js'));
      return rq.readPosting(job, {});
    } catch { return null; }
  }
}
