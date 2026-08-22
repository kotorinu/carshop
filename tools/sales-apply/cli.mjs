#!/usr/bin/env node
/**
 * 営業応募ツール（パソコン側）。拡張機能と同じ頭脳を、ターミナルからも使えるようにしたもの。
 *
 *   node tools/sales-apply/cli.mjs doctor
 *     → プロフィールの埋まり具合をチェック（【要記入】が出る箇所を先に潰す）
 *
 *   node tools/sales-apply/cli.mjs draft --title "案件名" --desc "募集文をそのまま貼る"
 *     → 応募文を1本作って drafts/ に保存
 *
 *   node tools/sales-apply/cli.mjs draft --jobs data/jobs.json
 *     → 拡張機能から書き出したCSV/JSONをまとめて応募文にする
 *
 *   node tools/sales-apply/cli.mjs rank --jobs data/jobs.json
 *     → 点数順に並べて表示（応募する順番を決める）
 *
 *   node tools/sales-apply/cli.mjs check drafts/xxx.md
 *     → 書いた文章のAI臭を検査
 *
 *   node tools/sales-apply/cli.mjs interview
 *     → 面接で答える内容（自己紹介・動機・稼働時間・通信環境・逆質問）を作る
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeApplication, deodorize, detectCategory } from './extension/core/compose.js';
import { rankJobs, scoreJob, checkMust, CRITERIA_LABELS, DEFAULT_MUST } from './extension/core/scoring.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS = path.join(HERE, 'drafts');

/* ---------- 引数 ---------- */
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);

/* ---------- プロフィール ---------- */
function loadProfile() {
  const base = path.join(HERE, 'profile', 'profile.json');
  if (!existsSync(base)) die(`profile.json がありません: ${base}`);
  const p = JSON.parse(readFileSync(base, 'utf8'));
  const priv = path.join(HERE, 'profile', 'private.json');
  if (existsSync(priv)) Object.assign(p, JSON.parse(readFileSync(priv, 'utf8')));
  return p;
}

/** 「?」やTODOのまま残っている項目を拾う */
function findBlanks(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      if (/^\s*[?？]|^\s*TODO/.test(v)) out.push([key, v]);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const t = typeof item === 'string' ? item : item?.text;
        if (typeof t === 'string' && /^\s*[?？]|^\s*TODO/.test(t)) out.push([`${key}[${i}]`, t]);
      });
    } else if (v && typeof v === 'object') {
      out.push(...findBlanks(v, key));
    }
  }
  return out;
}

/* ---------- 案件の読み込み ---------- */
function loadJobs(file) {
  const raw = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : (j.jobs || []);
  }
  // CSV（拡張機能の「CSVで書き出す」形式）
  const rows = parseCsv(raw);
  const head = rows.shift().map((h) => h.trim());
  const col = (r, name) => r[head.indexOf(name)] ?? '';
  return rows.filter((r) => r.length > 1).map((r) => ({
    site: col(r, 'サイト'),
    title: col(r, 'タイトル'),
    description: col(r, 'タイトル'),
    budget: col(r, '報酬'),
    applicants: Number(col(r, '応募数')) || undefined,
    url: col(r, 'URL'),
    id: (col(r, 'URL').match(/(\d{4,})/) || [])[1] || col(r, 'URL'),
  }));
}

function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* ---------- 出力 ---------- */
const die = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };
const slug = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);

function writeDraft(job, out) {
  mkdirSync(DRAFTS, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 10)}_${slug(job.site || 'job')}_${slug(job.title || job.id)}.md`;
  const file = path.join(DRAFTS, name);
  const body = [
    `# ${job.title || '(無題)'}`,
    '',
    `- URL: ${job.url || '-'}`,
    `- 媒体: ${job.site || '-'}`,
    `- 報酬: ${job.budget || '-'}`,
    `- 型: ${out.categoryLabel}`,
    `- 件名: ${out.subject}`,
    `- 点数: ${job.score}（${job.verdict}）`,
    `- チェック: ${(job.checklist || []).map((c) => `${c.label}=${c.detail}`).join(' / ')}`,
    (job.askInInterview || []).length ? `\n**面接で必ず聞くこと**\n${job.askInInterview.map((q) => `- ${q}`).join('\n')}` : '',
    out.warnings.length ? `\n> ⚠ 直したほうがいい点\n${out.warnings.map((w) => `> - ${w}`).join('\n')}` : '',
    '',
    '---',
    '',
    out.text,
    '',
  ].join('\n');
  writeFileSync(file, body, 'utf8');
  return file;
}

/* ---------- コマンド ---------- */
const commands = {
  doctor() {
    const p = loadProfile();
    console.log('\n=== プロフィールの状態 ===\n');
    const blanks = findBlanks(p);
    if (!blanks.length) {
      console.log('✅ 未記入なし。応募文に【要記入】は出ません。');
    } else {
      console.log(`⚠️  未記入 ${blanks.length}件。ここを埋めると応募文が完成します:\n`);
      for (const [k, v] of blanks) console.log(`   ${k}\n      → ${v}`);
    }
    const priv = path.join(HERE, 'profile', 'private.json');
    console.log(existsSync(priv)
      ? '\n✅ private.json あり（フォーム自動入力に使えます）'
      : '\n⚠️  private.json なし … メール・電話・住所が自動入力されません。'
        + '\n    cp tools/sales-apply/profile/private.example.json tools/sales-apply/profile/private.json'
        + '\n    で作って中身を埋めてください（氏名・フリガナは profile.json 側にあるので不要）');
    const n = existsSync(DRAFTS) ? readdirSync(DRAFTS).filter((f) => f.endsWith('.md')).length : 0;
    console.log(`\n📝 これまでに作った応募文: ${n}本 (${DRAFTS})\n`);
  },

  draft() {
    const profile = loadProfile();
    const jobsFile = flag('jobs');
    let jobs;
    if (jobsFile) {
      jobs = loadJobs(jobsFile);
    } else {
      const title = flag('title');
      if (!title) die('--title か --jobs のどちらかが必要です。');
      let desc = flag('desc', '');
      const descFile = flag('desc-file');
      if (descFile) desc = readFileSync(descFile, 'utf8');
      jobs = [{ id: slug(title), site: flag('site', 'manual'), title, description: desc, budget: flag('budget', ''), url: flag('url', '') }];
    }

    const limit = Number(flag('limit', 0)) || jobs.length;
    const ranked = rankJobs(jobs, profile).slice(0, limit);
    console.log(`\n=== 応募文を作ります（${ranked.length}件）===\n`);
    for (const job of ranked) {
      if (!job.must.passed && !has('force')) {
        const why = job.must.reasons.length
          ? `条件に反する: ${job.must.reasons.join(' / ')}`
          : `募集文で確認できず: ${job.must.unconfirmed.join(' / ')}`;
        console.log(`⏭  スキップ: ${job.title}\n     ${why}（それでも作るなら --force）`);
        continue;
      }
      const out = composeApplication(job, profile);
      const file = writeDraft(job, out);
      console.log(`✅ ${job.score}点 ${job.title}\n     → ${path.relative(process.cwd(), file)}`);
      if (out.warnings.length) out.warnings.forEach((w) => console.log(`     ⚠ ${w}`));
      if (has('print')) console.log(`\n${out.text}\n${'─'.repeat(50)}`);
    }
    console.log('\n最後に自分で声に出して読んでから送ってください。\n');
  },

  rank() {
    const profile = loadProfile();
    const file = flag('jobs');
    if (!file) die('--jobs <ファイル> を指定してください。');
    const ranked = rankJobs(loadJobs(file), profile);
    const icon = { ok: '◯', ng: '×', warn: '△', unknown: '?' };
    const pass = ranked.filter((j) => j.must.passed);
    console.log('\n判定    点数  対象 商材 単価 アポ 形式 客層   タイトル');
    console.log('─'.repeat(100));
    for (const j of ranked) {
      const mark = j.must.passed ? '✅合格' : j.must.reasons.length ? '⛔対象外' : '△確認要';
      const cl = j.checklist.map((c) => ` ${icon[c.status] || '?'} `).join(' ');
      console.log(`${mark} ${String(j.score).padStart(4)} ${cl}  ${j.title}`);
      if (j.must.reasons.length) console.log(`        └ ⛔ ${j.must.reasons.join(' / ')}`);
      else if (j.must.unconfirmed.length) console.log(`        └ △ 募集文で確認できず: ${j.must.unconfirmed.join(' / ')}`);
    }
    console.log(`\n${ranked.length}件中、マスト条件を満たすのは ${pass.length}件。`);
    console.log('マスト条件: ' + DEFAULT_MUST.map((k) => CRITERIA_LABELS[k]).join(' / '));
    console.log('列の意味: 対象=BtoC / 商材=無形 / 単価=30〜120万 / アポ=譲渡型 / 形式=オンライン完結 / 客層=一般成人\n');
  },

  check() {
    const file = argv[1];
    if (!file) die('検査したいファイルを指定してください。');
    const text = readFileSync(file, 'utf8');
    const { text: fixed, warnings } = deodorize(text);
    console.log('\n=== AI臭チェック ===\n');
    if (!warnings.length) console.log('✅ 引っかかる表現はありませんでした。');
    else warnings.forEach((w) => console.log(`⚠ ${w}`));
    if (fixed !== text) {
      const out = file.replace(/(\.\w+)?$/, '.fixed$1');
      writeFileSync(out, fixed, 'utf8');
      console.log(`\n置換したものを書き出しました: ${out}`);
    }
    console.log('');
  },

  interview() {
    const p = loadProfile();
    const a = p.availability || {};
    const newbie = p.salesExperienceLevel === 'none';
    const lines = [
      '',
      '=== 面接カンペ（声に出して1回読んでおく）===',
      '',
      '■ 自己紹介（30秒）',
      `${p.displayName}と申します。普段は${p.businessSummary}をしています。`,
      `${p.selfIntroCore}`,
      newbie
        ? '営業代行としての実務経験はまだありません。ただ、Zoomで初対面の方と1対1で話して、その方がやりたいことを聞き出すことは、いまも続けています。'
        : (p.salesExperience || ''),
      '',
      '■ 稼働可能な時間帯・週の稼働時間',
      `${a.hours}で動けます。開始は${a.startDate}から可能です。`,
      `連絡は${a.contact}が一番早く、${a.responseTime}で返します。`,
      '',
      '■ 営業代行に取り組もうと思った動機',
      '報酬のためだけではありません。営業という、どこに行っても通用する力を自分の中に作りたいからです。',
      '人の話を聞くところまでは今もやっていますが、そこから先、決めていただくところまでを自分の力にしたい。',
      'だから件数もフィードバックも、多いほどありがたいです。',
      '',
      '■ 通信環境',
      'Zoomでの商談に問題ない回線と、静かに話せる環境があります。カメラ・マイクも常時使えます。',
      p.zoomReady ? '　（Zoomの動作確認は済み）' : '　※ 実際にZoomのテスト通話を一度しておくこと（ここで詰まると印象が落ちる）',
      '',
      '■ 逆質問（必ず聞く）',
      '1. アポイントはどのような方法で獲得されていますか（広告・SNS運用・LINEリストなど）。',
      '2. 商材の単価と、成約時の報酬の考え方を教えてください。',
      '3. 初回はどのくらいの商談数からお願いできますか。',
      '',
      '　→ 1番は案件の質を見極める材料になる。複数案件を抱えたときの優先順位の判断にも使う。',
      '',
    ];
    console.log(lines.join('\n'));
    const blanks = findBlanks(p);
    if (blanks.length) console.log(`⚠️  未記入が${blanks.length}件あります（cli.mjs doctor で確認）\n`);
  },

  help() {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
  },
};

(commands[cmd] || commands.help)();
