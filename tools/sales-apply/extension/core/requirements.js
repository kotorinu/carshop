/**
 * 募集要項を「読む」ための部品。
 *
 * 発注者は募集文の中で、応募者に守ってほしいことを書いている。
 *   ・「応募時に以下を記載してください」＋項目リスト
 *   ・「冒頭に『◯◯』と記載してください」（コピペ応募をふるい落とす合言葉）
 *   ・「300文字以内で」
 *   ・会社名・理念・大切にしていること
 * これを読まずに定型文を送ると、それだけで落ちる。ここが応募文の質を決める。
 */

/** 「以下を記載してください」系の合図 */
const ASK_TRIGGER = new RegExp([
  '(?:ご)?応募(?:の際|時|される際)[^。\\n]{0,80}?(?:記載|明記|お知らせ|ご記入|記入|教えて|添えて)',
  '(?:以下|下記|次)[^。\\n]{0,20}?(?:記載|明記|ご記入|記入|お書き|お知らせ|教えて)',
  '(?:記載|明記|ご記入)(?:の上|したうえで|して)[^。\\n]{0,12}?(?:応募|ご応募)',
  '(?:応募|メッセージ)(?:文|時)?[^。\\n]{0,10}?(?:含めて|入れて)',
].join('|'));

/** 箇条書きの行か */
const BULLET = /^\s*(?:[・\-*●○◆■□▼>]|[①-⑳]|\(?\d{1,2}[.)．、]|[０-９]{1,2}[.)．、])\s*(.+)$/;

/** 項目名 → プロフィールのどこから答えるか */
const ANSWERS = [
  [/氏名|お?名前|フルネーム/, 'fullName', (p) => p.fullName || p.displayName],
  [/フリガナ|ふりがな|カナ/, 'fullNameKana', (p) => p.fullNameKana],
  [/年齢|生年月日|お歳/, 'age', (p) => p.age],
  [/居住|お住まい|都道府県|在住|エリア/, 'location', (p) => p.location],
  [/メール|mail/i, 'email', (p) => p.email],
  [/電話|連絡先番号|携帯/, 'phone', (p) => p.phone],
  [/連絡(?:手段|ツール|方法)/, 'contact', (p) => (p.availability || {}).contact],
  [/稼働(?:可能)?(?:時間|日数|日|曜日)|週[^。\n]{0,4}時間|勤務(?:時間|可能)/, 'hours', (p) => (p.availability || {}).hours],
  [/(?:稼働)?開始(?:日|時期|可能)|いつから/, 'startDate', (p) => (p.availability || {}).startDate],
  [/(?:営業)?経験|職務経歴|実績|キャリア/, 'experience', (p) => p.salesExperienceLevel === 'none'
    ? '営業代行の実務経験はありません。ただ、AIコミュニティの運営で新しく参加された方とZoomで1対1の面談をしていて、初対面の方の話を聞くことは続けています。中古車販売店では個人のお客様の問い合わせ対応を毎日しています。'
    : p.salesExperience],
  [/志望(?:動機|理由)|応募(?:動機|理由|の理由)|なぜ/, 'motivation', () =>
    '営業という、どこに行っても通用する力を自分の中に作りたいからです。人の話を聞くところまでは今もやっていますが、そこから先、決めていただくところまでを自分の力にしたいと思っています。'],
  [/自己PR|強み|アピール/, 'strength', () =>
    '返信が速いことです。問い合わせは返事が遅れるほど熱が冷めることを、実際のお客様の反応で見てきました。'],
  [/通信環境|ネット環境|PC環境|パソコン環境|zoom.{0,6}環境/i, 'network', (p) => p.zoomReady
    ? 'Zoomでの商談に問題ない回線と、静かに話せる環境があります。カメラ・マイクも常時使えます。' : null],
  [/使用(?:可能)?(?:ツール|ソフト)|使えるツール|ツール/, 'tools', (p) => (p.tools || []).join('・')],
  [/希望(?:単価|報酬|金額|条件)|報酬(?:の)?希望/, 'reward', (p) => p.rewardWish],
  [/顔(?:出し|写真)|プロフィール写真/, 'photo', (p) => p.photoOk],
  [/資格/, 'qualifications', (p) => p.qualifications],
];

/**
 * 「応募時にこれを書いてください」を読み取る。
 * @returns {{label:string, key:string|null, answer:string|null}[]}
 */
export function extractRequirements(description, profile = {}) {
  const text = String(description || '').replace(/\r/g, '');
  const m = ASK_TRIGGER.exec(text);
  if (!m) return [];

  const scope = text.slice(m.index, m.index + 700);
  let items = [];

  // ① 改行つきの箇条書き
  const lines = scope.split('\n').map((l) => l.trim());
  for (let i = 1; i < lines.length && items.length < 12; i++) {
    const b = BULLET.exec(lines[i]);
    if (b) { items.push(b[1]); continue; }
    if (items.length && (!lines[i] || lines[i].length > 60)) break;
  }

  // ② 改行が潰れて1行になっている箇条書き。
  //    ブラウザの innerText は、HTMLの改行を空白に潰す。実機ではこの形で届く。
  if (!items.length) {
    const parts = scope.split(/[・●○◆■▼]|[①-⑳]/);
    // 1つ目の区切りより前にも項目があることがある（例:「ご応募の際は、お名前・年齢…」）
    const head = (parts[0] || '').split(/[、：:。]/).pop().trim();
    const rest = parts.slice(1).map((c) => c.split(/[ 　\n]/)[0]);
    items = [head, ...rest].filter((c) => c && c.length >= 2 && c.length <= 24);
  }

  // ③ それも無ければ、合図の文そのものを「・」「、」で割る
  if (!items.length) {
    const sentence = (scope.split(/[。\n]/)[0] || '');
    const inner = sentence
      .replace(/^[^、]{0,20}[、]/, '')                                                    // 「ご応募の際は、」を落とす
      .replace(/(?:を|は|の)?\s*(?:記載|明記|ご記入|記入|お知らせ|教えて|添えて)[^。]*$/, ''); // 末尾の「〜を記載してください」を落とす
    items = inner.split(/[・、／\/]/).map((x) => x.trim());
  }

  const NOISE = /^(以下|下記|次|上記|こちら|それぞれ|全て|すべて)$/;
  const VERBS = /(記載|明記|ご記入|お知らせ|教えて|ください|応募|なお)/;
  const seen = new Set();
  return items
    .map((raw) => String(raw).replace(/[:：].*$/, '').replace(/[（(].*?[）)]/g, '').trim())
    .filter((label) => label.length >= 2 && label.length <= 24)
    .filter((label) => !NOISE.test(label) && !VERBS.test(label))
    .filter((label) => (seen.has(label) ? false : (seen.add(label), true)))
    .slice(0, 10)
    .map((label) => {
      const hit = ANSWERS.find(([re]) => re.test(label));
      const raw = hit ? hit[2](profile) : null;
      // プロフィールが「?」のままの項目は、答えられていない扱いにする
      const answer = raw && !/^\s*[?？]|^\s*TODO/i.test(String(raw)) ? String(raw) : null;
      return { label, key: hit ? hit[1] : null, answer };
    });
}

/**
 * 「冒頭に『◯◯』と記載してください」の合言葉を読み取る。
 * これを守らないと、読まれずに落とされる。
 */
export function extractMagicWord(description) {
  const text = String(description || '');
  const patterns = [
    /(?:冒頭|件名|最初|一行目|文頭|先頭)[^。\n]{0,16}?[「『"]([^」』"\n]{1,40})[」』"]/,
    /[「『]([^」』\n]{1,40})[」』]\s*(?:と|を)\s*(?:必ず\s*)?(?:記載|入力|明記|記入|お書き)/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** 「300文字以内で」のような字数制限を読み取る（全角換算） */
export function extractMaxLength(description) {
  const m = /(\d{2,4})\s*(?:文字|字)(?:程度)?(?:以内|まで)/.exec(String(description || ''));
  return m ? parseInt(m[1], 10) : null;
}

/** 会社名を拾う */
export function extractCompany(text) {
  const m = /((?:株式会社|合同会社|一般社団法人)[^\s、。「」（）()\n]{1,20}|[^\s、。「」（）()\n]{1,20}(?:株式会社|合同会社))/
    .exec(String(text || ''));
  if (!m) return null;
  let name = m[1].replace(/(?:です|でした|は|が|の|も)$/, '');
  // 「合同会社ヘルスラボが運営する…」のように、社名の後ろに文が続いている場合を切る。
  // ただし社名そのものが短くなりすぎないよう、2文字以上残るときだけ切る。
  const cut = /^((?:株式会社|合同会社|一般社団法人)?.{2,}?)(?:が|は|を|も)(?=[ぁ-ん一-龠])/.exec(name);
  if (cut && cut[1].replace(/^(?:株式会社|合同会社|一般社団法人)/, '').length >= 2) name = cut[1];
  return name;
}

/**
 * 会社が自分の言葉で書いている「大切にしていること」を1文だけ拾う。
 * ここに触れると、募集文を読んだ証拠になる。
 */
export function extractPhilosophy(description) {
  const words = ['理念', 'ミッション', 'ビジョン', '大切にして', '想い', '思い', '使命',
    '届けたい', '広めたい', '世の中', '社会', '人生', '変わる', '支えて', '寄り添'];
  const sentences = String(description || '')
    .split(/[\n。]/)
    .map((s) => s.trim().replace(/^[・\-*■◆●▼\s]+/, ''))
    .filter((s) => s.length >= 14 && s.length <= 70);
  const hit = sentences
    .map((s) => ({ s, n: words.reduce((a, w) => a + (s.includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)[0];
  if (!hit) return null;
  // 文の中で会社が自分で括っている言葉があれば、そこだけを借りる
  const inner = /[「『]([^」』]{6,40})[」』]/.exec(hit.s);
  return inner ? inner[1] : hit.s;
}

/** 募集要項から読み取れたこと全部 */
export function readPosting(job, profile) {
  const desc = job.description || '';
  const reqs = extractRequirements(desc, profile);
  return {
    magicWord: extractMagicWord(desc),
    maxLength: extractMaxLength(desc),
    company: extractCompany(`${job.title || ''}\n${desc}`),
    philosophy: extractPhilosophy(desc),
    requirements: reqs,
    unanswered: reqs.filter((r) => !r.answer).map((r) => r.label),
  };
}
