/**
 * 応募文ジェネレーター。
 * 入力: 案件(job) + プロフィール(profile) → 出力: そのまま貼れる応募文。
 *
 * 設計方針:
 *  - AIに書かせない。phrases.js の「琴音さんの言葉」だけを組み合わせる。
 *  - 案件IDから決まる乱数で組み合わせを変える → 案件ごとに文面が変わる（コピペ判定されない）
 *    が、同じ案件なら何度作っても同じ文になる（作り直しても混乱しない）。
 *  - 生成後にAI臭チェックを必ず通す。
 */
import {
  CATEGORIES, CATEGORY_KEYWORDS, CATEGORY_LABELS,
  OPENERS, HOOK_FALLBACK, SELF_INTRO, CAPABILITY_BLOCKS,
  MOTIVATION, PROOF_OF_HUNGER, AVAILABILITY, CLOSERS, QUESTIONS,
  NG_WORDS, MAX_SENTENCE_LEN,
} from './phrases.js';

/* ---------- 小道具 ---------- */

/** 「?」や「TODO」のまま残っている未記入の値か */
export const isBlank = (v) => !v || /^\s*[?？]|^\s*TODO/i.test(String(v).trim());

/** 文字列 → 32bit ハッシュ（案件ごとに安定した乱数の種にする） */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 種から決まる擬似乱数（mulberry32） */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];

/** {key} を埋める。値が無ければプレースホルダを残して警告できるようにする */
function fill(tpl, vars, missing) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v === undefined || v === null || v === '' || isBlank(String(v))) {
      if (missing && !missing.includes(k)) missing.push(k);
      return `【要記入: ${k}】`;
    }
    return String(v);
  });
}

/* ---------- 案件の読み取り ---------- */

/** 募集文からカテゴリを推定 */
export function detectCategory(job) {
  const text = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  for (const [cat, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => text.includes(w.toLowerCase()))) return cat;
  }
  return CATEGORIES.UNKNOWN;
}

/**
 * 募集文から「フック」を1つ拾う。
 * クライアントが自分の言葉で書いた熱のある一文を優先する。
 */
export function extractHook(job) {
  const desc = String(job.description || '').replace(/\r/g, '');
  if (!desc.trim()) return HOOK_FALLBACK;

  const sentences = desc
    .split(/[\n。！？]/)
    .map((s) => s.trim().replace(/^[・\-*■◆●▼\s]+/, ''))
    .filter((s) => s.length >= 12 && s.length <= 60);

  // 熱のある表現を優先
  const hot = [
    '一緒に', '仲間', '想い', '思い', '本気', '長く', '成長', '立ち上げ',
    '困って', '課題', '広めたい', '届けたい', '任せ', '裁量', '未経験',
  ];
  const scored = sentences.map((s) => ({
    s,
    score: hot.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  if (scored.length && scored[0].score > 0) return `「${scored[0].s}」という一文`;
  if (sentences.length) return `「${sentences[0]}」というところ`;
  return HOOK_FALLBACK;
}

/* ---------- AI臭チェック ---------- */

/** 全角換算のざっくり文字幅 */
const width = (s) => [...s].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);

/**
 * NGワードを置換し、残った問題を警告として返す。
 */
export function deodorize(text) {
  const warnings = [];
  let out = text;
  for (const [ng, rep] of NG_WORDS) {
    const needle = ng.replace(/^〜|〜$/g, '');
    if (!out.includes(needle)) continue;
    if (rep) out = out.split(needle).join(rep);
    else warnings.push(`AIっぽい言い回し: 「${ng}」が入っています。自分の言葉に直してください。`);
  }

  // 「させていただく」の多用チェック
  const humbleCount = (out.match(/させていただ/g) || []).length;
  if (humbleCount >= 3) {
    warnings.push(`「させていただく」が${humbleCount}回。2回までに減らすと人間らしくなります。`);
  }

  // 長すぎる文（箇条書きの行と、引用「」の中は数えない）
  for (const line of out.split('\n')) {
    if (/^[・\-*#>]/.test(line.trim())) continue;
    const bare = line.replace(/[「『][^」』]*[」』]/g, '');   // 案件名の引用は自分の文ではない
    for (const sentence of bare.split(/(?<=[。！？])/)) {
      const t = sentence.trim();
      if (t && width(t) > MAX_SENTENCE_LEN) {
        warnings.push(`一文が長すぎます（${Math.round(width(t))}字相当）: 「${t.slice(0, 24)}…」`);
      }
    }
  }

  // 感嘆符の使いすぎ
  if ((out.match(/[!！]/g) || []).length > 2) {
    warnings.push('「！」が多いと軽く見えます。2つまでを目安に。');
  }
  return { text: out, warnings };
}

/* ---------- 本体 ---------- */

/**
 * @param {object} job     {id,title,description,url,site,budget}
 * @param {object} profile profile.json の中身
 * @param {object} [opt]   {variant:number, includeQuestion:boolean, maxWidth:number}
 * @returns {{text:string, subject:string, category:string, warnings:string[], missing:string[]}}
 */
export function composeApplication(job, profile, opt = {}) {
  const p = profile || {};
  const missing = [];
  const category = opt.category || detectCategory(job);
  const seed = hashSeed(`${job.site || ''}:${job.id || job.url || job.title || ''}:${opt.variant || 0}`);
  const rnd = rngFrom(seed);

  const vars = {
    title: (job.title || 'ご募集の案件').replace(/\s+/g, ' ').trim(),
    hook: extractHook(job),
    who: p.displayName,
    business: nounish(p.businessSummary),
    selfCore: p.selfIntroCore,
    hours: p.availability && p.availability.hours,
    contact: p.availability && p.availability.contact,
    responseTime: p.availability && p.availability.responseTime,
    startDate: p.availability && p.availability.startDate,
  };

  const paras = [];

  // 1. 書き出し（案件名 + フック）
  paras.push(fill(pick(OPENERS, rnd), vars, missing));

  // 2. 自己紹介
  paras.push(fill(pick(SELF_INTRO, rnd), vars, missing));

  // 3. 実績（profileから、カテゴリに合うものを最大3つ）
  const achievements = selectAchievements(p.achievements || [], category, rnd, 3);
  if (achievements.length) {
    paras.push(['できることを具体的に書きます。', ...achievements.map((a) => `・${a}`)].join('\n'));
  }

  // 4. カテゴリ別の仕事の進め方
  const caps = CAPABILITY_BLOCKS[category] || CAPABILITY_BLOCKS.unknown;
  paras.push(pick(caps, rnd));

  // 5. 熱量（主役）
  paras.push(`${pick(MOTIVATION, rnd)}\n${pick(PROOF_OF_HUNGER, rnd)}`);

  // 6. 稼働条件
  paras.push(fill(pick(AVAILABILITY, rnd), vars, missing));

  // 7. 質問（返信率が上がる）
  if (opt.includeQuestion !== false) {
    paras.push(QUESTIONS[category] || QUESTIONS.unknown);
  }

  // 8. 締め
  paras.push(pick(CLOSERS, rnd));

  const raw = paras.filter(Boolean).join('\n\n');
  const { text, warnings } = deodorize(raw);

  if (missing.length) {
    warnings.unshift(`プロフィール未記入: ${missing.join(', ')} … profile.json を埋めてください。`);
  }

  return {
    text: clampToWidth(text, opt.maxWidth),
    subject: buildSubject(job, p, category),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    warnings,
    missing,
  };
}

/**
 * businessSummary は名詞句で書く前提だが、うっかり「〜をしています」と書かれても
 * 「〜をしていますです」にならないように語尾を落とす。
 */
export function nounish(s) {
  if (!s) return s;
  return String(s).trim()
    .replace(/[。．\.]+$/, '')
    .replace(/(をしています|をやっています|しています|やっています|をしております|しております|です|だ)$/, '')
    .trim();
}

/** 実績を案件カテゴリに寄せて選ぶ。achievements は文字列 or {text,tags} */
function selectAchievements(list, category, rnd, limit) {
  const norm = list.map((a) => (typeof a === 'string' ? { text: a, tags: [] } : a))
    .filter((a) => a && a.text && !isBlank(a.text));
  const hit = norm.filter((a) => (a.tags || []).includes(category));
  const rest = norm.filter((a) => !hit.includes(a));
  // タグ一致を先に、残りはシャッフルして埋める
  const shuffled = rest.map((v) => ({ v, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.v);
  return [...hit, ...shuffled].slice(0, limit).map((a) => a.text);
}

/** 件名（メッセージ送信型の媒体で使う） */
function buildSubject(job, p, category) {
  const name = isBlank(p.displayName) ? '【要記入: displayName】' : p.displayName;
  return `${CATEGORY_LABELS[category] || '営業代行'}のご応募（${name}）`;
}

/** 文字数上限がある媒体向けに、後ろの段落から落として収める */
function clampToWidth(text, maxWidth) {
  if (!maxWidth) return text;
  let paras = text.split('\n\n');
  // 落としてよい順（質問 → 実績詳細 → 進め方）。熱量と稼働条件と締めは残す。
  const droppable = [6, 3, 2];
  while (width(paras.join('\n\n')) > maxWidth && paras.length > 3) {
    let dropped = false;
    for (const i of droppable) {
      if (paras[i] !== undefined) { paras.splice(i, 1); dropped = true; break; }
    }
    if (!dropped) paras.splice(paras.length - 2, 1);
  }
  return paras.join('\n\n');
}

/** 短文DM用（ココナラのDM・InstagramのDMなど） */
export function composeShort(job, profile, opt = {}) {
  const full = composeApplication(job, profile, { ...opt, includeQuestion: false });
  return { ...full, text: clampToWidth(full.text, opt.maxWidth || 300) };
}
