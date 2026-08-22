/**
 * 出荷する拡張機能をそのままコピーして、テスト用サイト（localhost）だけを
 * 見に行くように差し替えたものを作る。ロジックには一切手を入れない。
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from '../build.mjs';

export function buildTestExtension(srcDir, outDir, { port = 8787 } = {}) {
  // 配布するものと完全に同じ組み立て方をする（テストと配布のズレを無くす）
  build(outDir, { includePrivate: true });

  const origin = `http://localhost:${port}`;

  // テスト用サイトのアダプタ（本番のアダプタと同じ形）
  writeFileSync(path.join(outDir, 'content/adapters/localtest.js'), `
export default {
  id: 'localtest',
  name: 'テスト求人サイト',
  searchUrls: ['${origin}/search'],
  matches: (loc) => loc.hostname === 'localhost',
  detailPattern: /\\/job\\/(\\d+)/,
  detailUrl: (id) => '${origin}/job/' + id,
  isListPage: (loc) => /\\/(search)?$/.test(loc.pathname),
  isDetailPage: (loc) => /\\/job\\/\\d+/.test(loc.pathname),
  isFormPage: (loc) => /\\/apply\\//.test(loc.pathname),
  hints: {
    title: ['h1'],
    description: ['.description'],
    budget: ['.price'],
    message: ['textarea[name="proposal"]'],
    submit: ['button[type="submit"]'],
  },
};
`, 'utf8');

  // テスト中は本番サイトを巡回しない（localtest だけにする）
  const idx = path.join(outDir, 'content/adapters/index.js');
  writeFileSync(idx, readFileSync(idx, 'utf8')
    .replace("import anotherworks from './anotherworks.js';", "import localtest from './localtest.js';\nimport anotherworks from './anotherworks.js';")
    .replace('export const adapters = [anotherworks,', 'export const adapters = [localtest, anotherworks,')
    .replace('.filter((a) => !a.banned)', ".filter((a) => !a.banned && a.id === 'localtest')"), 'utf8');

  // localhost を見られるようにする
  const mf = path.join(outDir, 'manifest.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.host_permissions.push(`${origin}/*`);
  m.content_scripts[0].matches.push(`${origin}/*`);
  m.web_accessible_resources[0].matches.push(`${origin}/*`);
  writeFileSync(mf, JSON.stringify(m, null, 2), 'utf8');

  return outDir;
}
