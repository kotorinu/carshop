/** テスト用の求人サイト。実物と同じ形（一覧のカードは要約だけ／詳細に本文）にしてある。 */
import http from 'node:http';
import { JOBS } from './jobs.mjs';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const listPage = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>案件検索</title></head><body>
<header><a href="/">テスト求人サイト</a></header>
<main><h1>営業代行の案件</h1>
${JOBS.map((j) => `
  <div class="job-card">
    <h3><a href="/job/${j.id}">${esc(j.title)}</a></h3>
    <p class="teaser">${esc(j.teaser)}</p>
    <p class="pay">報酬: ${esc(j.budget)}</p>
    <p class="applicants">提案 ${j.id % 7} 人</p>
    <p class="misc">掲載から3日 / 業務委託 / オンライン面談あり</p>
  </div>`).join('')}
</main></body></html>`;

const detailPage = (j) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(j.title)}</title></head><body>
<header><a href="/">テスト求人サイト</a></header>
<h1>${esc(j.title)}</h1>
<div class="price">報酬: ${esc(j.budget)}</div>
<div class="applicants">提案 ${j.id % 7} 人</div>
<div class="description">${esc(j.body)}</div>
<p><a href="/apply/${j.id}">この案件に応募する</a></p>
</body></html>`;

const applyPage = (j) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>応募 - ${esc(j.title)}</title></head><body>
<h1>応募フォーム: ${esc(j.title)}</h1>
<form id="f" onsubmit="document.getElementById('sent').textContent='SENT';return false;">
  <label>お名前 <input name="name"></label>
  <label>フリガナ <input name="kana"></label>
  <label>メールアドレス <input name="email" type="email"></label>
  <label>電話番号 <input name="tel"></label>
  <label>ご住所 <input name="address"></label>
  <label>提案メッセージ <textarea name="proposal" rows="12" cols="60"></textarea></label>
  <button type="submit">応募する</button>
</form>
<div id="sent"></div>
</body></html>`;

export function start(port = 8787) {
  const byId = new Map(JOBS.map((j) => [String(j.id), j]));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const send = (html) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); };
    let m;
    if (url.pathname === '/' || url.pathname === '/search') return send(listPage());
    if ((m = url.pathname.match(/^\/job\/(\d+)$/))) {
      const j = byId.get(m[1]);
      return j ? send(detailPage(j)) : (res.writeHead(404), res.end('nf'));
    }
    if ((m = url.pathname.match(/^\/apply\/(\d+)$/))) {
      const j = byId.get(m[1]);
      return j ? send(applyPage(j)) : (res.writeHead(404), res.end('nf'));
    }
    res.writeHead(404); res.end('nf');
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) start().then(() => console.log('http://localhost:8787'));
