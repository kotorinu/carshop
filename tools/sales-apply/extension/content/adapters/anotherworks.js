/**
 * 複業クラウド（Another works）。
 * 実践活動で推奨されている媒体のひとつ。
 * ※ 案件検索ページのURLはサイト側の変更が入りやすい。開けなかったらトップから
 *   案件検索に進んで、そのページで「① 案件を集める」を押せば同じことができる。
 */
export default {
  id: 'anotherworks',
  name: '複業クラウド',
  searchUrls: ['https://aw-anotherworks.com/'],
  matches: (loc) => /anotherworks/.test(loc.hostname),
  detailPattern: /\/(?:jobs?|projects?|offers?|recruits?)\/([\w-]{4,})/,
  isListPage: (loc) => /(job|project|offer|search|recruit)/.test(loc.pathname) && !/\/\d{3,}/.test(loc.pathname),
  isDetailPage: (loc) => /\/(?:jobs?|projects?|offers?|recruits?)\/[\w-]{4,}/.test(loc.pathname),
  isFormPage: (loc) => /(entry|apply|proposal|message|contact)/.test(loc.pathname),
  hints: {
    title: ['h1'],
    description: ['[class*="detail"]', '[class*="description"]', 'article', 'main'],
    budget: ['[class*="reward"]', '[class*="price"]', '[class*="budget"]'],
    message: ['textarea'],
    submit: ['button[type="submit"]'],
  },
};
