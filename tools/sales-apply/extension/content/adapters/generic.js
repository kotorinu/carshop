/**
 * どのサイトでもとりあえず動く保険のアダプタ。
 * 未対応の媒体（複業クラウド・Wantedly・企業の採用フォーム等）でも、
 * ポップアップの「このページで起動」から使える。
 */
export default {
  id: 'generic',
  name: 'このページ（汎用）',
  matches: () => true,
  detailPattern: /\/(?:jobs?|works?|requests?|projects?|offers?)\/(\d+)/,
  isListPage: () => document.querySelectorAll('a[href]').length > 60,
  isDetailPage: () => !!document.querySelector('h1'),
  isFormPage: () => !!document.querySelector('textarea'),
  hints: {
    title: ['h1'],
    description: ['article', 'main', '[class*="description"]', '[class*="detail"]'],
    budget: ['[class*="price"]', '[class*="budget"]', '[class*="salary"]'],
    message: ['textarea'],
    submit: ['button[type="submit"]'],
  },
};
