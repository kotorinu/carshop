import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestExtension } from './build-testext.mjs';
import { start } from './fixtures/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const server = await start(8787);
const extDir = buildTestExtension(null, path.join(HERE, '.testext'));
const userDir = mkdtempSync(path.join(tmpdir(), 'sa-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: process.env.CHROME_PATH, headless: true, chromiumSandbox: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const p = await ctx.newPage();
const site = process.env.SITE || 'D';
await p.goto(`http://localhost:8787/search?site=${site}`);
await p.waitForTimeout(1000);
const out = await p.evaluate(async (id) => {
  const dom = await import(`chrome-extension://${id}/content/dom.js`);
  const ad = await import(`chrome-extension://${id}/content/adapters/index.js`);
  const a = ad.pickAdapter(location);
  const cards = dom.scrapeListGeneric(a.detailPattern);
  return { n: cards.length, cards: cards.map((c) => ({ id: c.id, title: c.title.slice(0, 30), len: c.description.length, url: c.url })) };
}, extId);
console.log(`site=${site} 拾えた件数: ${out.n}`);
out.cards.forEach((c) => console.log(`  #${c.id} "${c.title}" 本文${c.len}字 ${c.url}`));
await ctx.close(); server.close(); rmSync(userDir, { recursive: true, force: true });
