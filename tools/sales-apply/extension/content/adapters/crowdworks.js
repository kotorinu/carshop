/** クラウドワークス */
export default {
  id: 'crowdworks',
  name: 'クラウドワークス',
  searchUrls: [
    'https://crowdworks.jp/public/jobs/search?keep_search_criteria=true&search%5Bkeywords%5D=営業代行',
    'https://crowdworks.jp/public/jobs/search?search%5Bkeywords%5D=テレアポ',
    'https://crowdworks.jp/public/jobs/search?search%5Bkeywords%5D=インサイドセールス',
  ],
  matches: (loc) => /(^|\.)crowdworks\.jp$/.test(loc.hostname),
  detailPattern: /crowdworks\.jp\/public\/jobs\/(\d+)/,
  isListPage: (loc) => /\/public\/jobs(\/search)?\/?$/.test(loc.pathname) || /\/public\/jobs\/(category|group)/.test(loc.pathname),
  isDetailPage: (loc) => /\/public\/jobs\/\d+/.test(loc.pathname),
  isFormPage: (loc) => /proposals|applications|entries/.test(loc.pathname),
  hints: {
    title: ['h1.job_offer_detail__title', 'h1'],
    description: ['.job_offer_detail__body', '[class*="job_offer_detail"]', '[class*="description"]'],
    budget: ['.payment_price', '[class*="price"]', '[class*="payment"]'],
    message: ['textarea[name*="conditions"]', 'textarea[name*="message"]', 'textarea[name*="body"]', 'textarea'],
    submit: ['button[type="submit"]', 'input[type="submit"]'],
  },
};
