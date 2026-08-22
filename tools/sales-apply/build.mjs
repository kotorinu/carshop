#!/usr/bin/env node
/**
 * 配布用の拡張機能を組み立てる。テストもZIPもこれを使う。
 * （テストしたものと配るものがズレないようにするため、入口は1本だけにする）
 *
 *   node tools/sales-apply/build.mjs --out <出力先> [--zip <出力先.zip>] [--no-private]
 *
 *   --no-private … 連絡先（private.json）を同梱しない。人に配るときに使う。
 */
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, 'extension');

/** profile.json（＋private.json）を拡張機能に同梱する形にまとめる */
export function buildProfile({ includePrivate = true } = {}) {
  const p = JSON.parse(readFileSync(path.join(HERE, 'profile', 'profile.json'), 'utf8'));
  const priv = path.join(HERE, 'profile', 'private.json');
  if (includePrivate && existsSync(priv)) Object.assign(p, JSON.parse(readFileSync(priv, 'utf8')));
  for (const k of Object.keys(p)) if (k.startsWith('_')) delete p[k];
  delete p.accounts;
  delete p.bankNote;
  return p;
}

export function build(outDir, { includePrivate = true, readme = null } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(EXT, outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'profile.default.json'),
    `${JSON.stringify(buildProfile({ includePrivate }), null, 2)}\n`, 'utf8');
  if (readme) writeFileSync(path.join(outDir, 'はじめにお読みください.txt'), readme, 'utf8');
  return outDir;
}

/* ---------- CLI ---------- */
if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
  const out = arg('out') || path.join(HERE, 'dist', '営業応募オートパイロット');
  const readmePath = path.join(HERE, '配布用README.txt');
  build(out, {
    includePrivate: !process.argv.includes('--no-private'),
    readme: existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null,
  });
  console.log(`✅ 組み立て完了: ${out}`);
  const zip = arg('zip');
  if (zip) {
    rmSync(zip, { force: true });
    execFileSync('zip', ['-qr', path.resolve(zip), '.'], { cwd: out });
    console.log(`✅ ZIP作成: ${zip}`);
  }
}
