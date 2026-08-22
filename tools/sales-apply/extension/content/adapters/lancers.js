/** ランサーズ */
export default {
  id: 'lancers',
  name: 'ランサーズ',
  searchUrls: [
    'https://www.lancers.jp/work/search/business/sales?keyword=営業代行&open=1&show_description=1',
    'https://www.lancers.jp/work/search?keyword=テレアポ&open=1',
    'https://www.lancers.jp/work/search?keyword=インサイドセールス&open=1',
  ],
  matches: (loc) => /(^|\.)lancers\.jp$/.test(loc.hostname),
  detailPattern: /lancers\.jp\/work\/detail\/(\d+)/,
  isListPage: (loc) => /\/work\/search|\/work\/?$|\/work\/category/.test(loc.pathname),
  isDetailPage: (loc) => /\/work\/detail\/\d+/.test(loc.pathname),
  isFormPage: (loc) => /propose|proposal|entry/.test(loc.pathname + loc.search),
  hints: {
    title: ['h1.heading-title', '.c-heading__title', 'h1'],
    description: ['.work-detail__description', '#work-detail-description', '[class*="worDetail"]', '[class*="description"]'],
    budget: ['.work-detail__price', '[class*="price"]'],
    message: ['textarea[name*="proposal"]', 'textarea[name*="message"]', 'textarea[name="comment"]'],
    submit: ['button[type="submit"]', 'input[type="submit"]'],
  },
};
