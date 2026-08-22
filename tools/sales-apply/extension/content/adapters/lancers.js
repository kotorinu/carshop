/**
 * ランサーズ。
 * 検索キーワードは 案件選定ルール.md（無形・BtoC・オンライン完結）に合わせている。
 * URLが変わったらここだけ直せばいい。
 */
const search = (kw) => `https://www.lancers.jp/work/search?keyword=${encodeURIComponent(kw)}&open=1&show_description=1`;

export default {
  id: 'lancers',
  name: 'ランサーズ',
  searchUrls: [
    search('無形商材 営業代行'),
    search('オンライン完結 営業代行'),
    search('BtoC 営業代行'),
    search('営業代行 未経験可'),
  ],
  matches: (loc) => /(^|\.)lancers\.jp$/.test(loc.hostname),
  detailPattern: /lancers\.jp\/work\/detail\/(\d+)/,
  detailUrl: (id) => `https://www.lancers.jp/work/detail/${id}`,
  isListPage: (loc) => /\/work\/search|\/work\/?$|\/work\/category/.test(loc.pathname),
  isDetailPage: (loc) => /\/work\/detail\/\d+/.test(loc.pathname),
  isFormPage: (loc) => /propose|proposal|entry/.test(loc.pathname + loc.search),
  hints: {
    title: ['h1.heading-title', '.c-heading__title', 'h1'],
    description: ['.work-detail__description', '#work-detail-description', '[class*="description"]'],
    budget: ['.work-detail__price', '[class*="price"]'],
    message: ['textarea[name*="proposal"]', 'textarea[name*="message"]', 'textarea[name="comment"]'],
    submit: ['button[type="submit"]', 'input[type="submit"]'],
  },
};
