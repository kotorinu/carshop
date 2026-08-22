/** ココナラ（公開依頼） */
export default {
  id: 'coconala',
  name: 'ココナラ',
  searchUrls: [
    'https://coconala.com/requests?categoryId=&keyword=営業代行',
    'https://coconala.com/requests?keyword=テレアポ',
  ],
  matches: (loc) => /(^|\.)coconala\.com$/.test(loc.hostname),
  detailPattern: /coconala\.com\/requests\/(\d+)/,
  isListPage: (loc) => /\/requests\/?$/.test(loc.pathname),
  isDetailPage: (loc) => /\/requests\/\d+/.test(loc.pathname),
  isFormPage: (loc) => /proposal|apply|estimate/.test(loc.pathname),
  // ココナラの提案文は文字数上限が短いことがある
  maxWidth: 900,
  hints: {
    title: ['h1'],
    description: ['[class*="requestDetail"]', '[class*="description"]', 'article'],
    budget: ['[class*="budget"]', '[class*="price"]'],
    message: ['textarea'],
    submit: ['button[type="submit"]'],
  },
};
