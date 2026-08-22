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
  NEWBIE_HONESTY, EXPERIENCED,
  NG_WORDS, MAX_SENTENCE_LEN,
} from './phrases.js';
import { readPosting } from './requirements.js';

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

  vars.salesExperience = p.salesExperience;

  // 募集要項を読む。指定された項目・合言葉・字数制限・会社の言葉を拾う
  const posting = opt.posting || readPosting(job, p);
  const reqKeys = new Set(posting.requirements.map((r) => r.key));
  const maxWidth = posting.maxLength || opt.maxWidth;

  // 段落は「名前つき」で作る。文字数上限のある媒体では、落としてよい段落から削るため。
  const paras = [];
  const add = (key, textValue) => { if (textValue) paras.push({ key, text: textValue }); };

  // 0. 合言葉。「冒頭に◯◯と記載」は守らないと読まれずに落とされる。絶対に削らない
  if (posting.magicWord) add('magic', posting.magicWord);

  // 1. 書き出し（案件名 + 募集文から拾ったフック）
  add('opener', fill(pick(OPENERS, rnd), vars, missing));

  // 字数制限が厳しいときは、全体を短い型に切り替える。
  // 削って消すより、短く書いたほうが「読んだ証拠」を残せる。
  const tight = !!maxWidth && maxWidth <= 600;

  // 2. 会社の言葉に触れる。募集文を読んだ証拠になるので、字数が厳しくても必ず入れる
  const phil = posting.philosophy ? posting.philosophy.replace(/^[「『]|[」』]$/g, '') : null;
  if (phil && tight) {
    add('company', `${posting.company ? `${posting.company}の` : ''}「${phil}」という言葉に、いちばん反応しました。`);
  } else if (phil) {
    add('company', `${posting.company ? `${posting.company}の` : ''}「${phil}」というところ、読んでいて手が止まりました。自分がやりたいのもそこなので、その言葉を借りて話せる側に回りたいです。`);
  } else if (posting.company && !tight) {
    add('company', `${posting.company}の募集文を最後まで読みました。書かれていることに嘘がない感じがして、ここで働いている姿を想像できました。`);
  }

  // 2. 自己紹介
  add('intro', fill(pick(SELF_INTRO, rnd), vars, missing));

  // 3. 実績（profileから、案件の型に合うものを最大3つ）
  const achievements = selectAchievements(p.achievements || [], category, rnd, 3);
  if (achievements.length) {
    add('achievements', ['できることを具体的に書きます。', ...achievements.map((a) => `・${a}`)].join('\n'));
  }

  // 4. 仕事の進め方（案件の型ごと）
  add('capability', pick(CAPABILITY_BLOCKS[category] || CAPABILITY_BLOCKS.unknown, rnd));

  // 5. 営業経験。未経験なら隠さず正直に書く（そのほうが通る）
  // ※ 指定項目で聞かれている場合は、後ろの「ご指定の項目」でまとめて答えるので重複させない
  if (reqKeys.has('experience')) {
    // 指定項目側で答える
  } else if (p.salesExperienceLevel === 'none') {
    add('experience', pick(NEWBIE_HONESTY, rnd));
  } else if (p.salesExperienceLevel && !isBlank(p.salesExperience)) {
    add('experience', fill(pick(EXPERIENCED, rnd), vars, missing));
  }

  // 6. 熱量（応募文の主役）。志望動機を指定項目で聞かれていれば、そちらに寄せる
  if (!reqKeys.has('motivation')) {
    add('motivation', tight ? pick(MOTIVATION, rnd) : `${pick(MOTIVATION, rnd)}\n${pick(PROOF_OF_HUNGER, rnd)}`);
  }

  // 7. 稼働条件（指定項目で聞かれていればそちらに寄せる）
  if (!reqKeys.has('hours')) add('availability', fill(pick(AVAILABILITY, rnd), vars, missing));

  // 8. ご指定の項目。ここを外すと読まれずに落ちるので、絶対に削らない
  if (posting.requirements.length) {
    const rows = posting.requirements.map((r) => {
      const a = r.answer || `【要記入: ${r.label}】`;
      if (!r.answer && !missing.includes(r.label)) missing.push(r.label);
      return `${r.label}：${a}`;
    });
    add('requirements', ['ご指定の項目にお答えします。', ...rows].join('\n'));
  }

  // 8. 質問（返信のきっかけ。案件の質を見極める逆質問も兼ねる）
  if (opt.includeQuestion !== false) add('question', QUESTIONS[category] || QUESTIONS.unknown);

  // 9. 締め
  add('closer', pick(CLOSERS, rnd));

  const raw = clampParagraphs(paras, maxWidth).map((x) => x.text).join('\n\n');
  const { text, warnings } = deodorize(raw);

  if (missing.length) {
    warnings.unshift(`未記入: ${missing.join(', ')} … 設定画面かprofile.jsonを埋めてください。`);
  }
  if (posting.magicWord) warnings.push(`募集文の指示どおり、冒頭に「${posting.magicWord}」を入れました。消さないでください。`);
  if (posting.maxLength) warnings.push(`募集文の指定により${posting.maxLength}文字以内に収めています。`);

  return {
    text,
    subject: buildSubject(job, p, category),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    warnings,
    missing,
    posting,
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

/**
 * 文字数上限がある媒体向けに、落としてよい段落から削って収める。
 * 書き出し・熱量・稼働条件・締めは何があっても残す（応募文の芯なので）。
 */
function clampParagraphs(paras, maxWidth) {
  if (!maxWidth) return paras;
  // 合言葉と指定項目は、削ると落とされるので絶対に残す
  const droppable = ['question', 'capability', 'experience', 'achievements', 'intro', 'company'];
  let out = [...paras];
  const total = () => width(out.map((x) => x.text).join('\n\n'));
  for (const key of droppable) {
    if (total() <= maxWidth) break;
    out = out.filter((x) => x.key !== key);
  }
  return out;
}

/** 短文DM用（SNSのDMなど） */
export function composeShort(job, profile, opt = {}) {
  return composeApplication(job, profile, { ...opt, includeQuestion: false, maxWidth: opt.maxWidth || 300 });
}
