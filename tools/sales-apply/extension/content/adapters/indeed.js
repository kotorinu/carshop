/**
 * Indeed（日本）。
 * 求人票の書き方が企業ごとにバラバラなので、読み取りは汎用エンジン頼み。
 * 応募が Indeed 内で完結しない（企業サイトに飛ぶ）ことも多い。その場合は
 * 飛んだ先で「このページで起動」を押せば同じように使える。
 */
const search = (q) => `https://jp.indeed.com/jobs?q=${encodeURIComponent(q)}`;

export default {
  id: 'indeed',
  name: 'Indeed',
  searchUrls: [
    search('営業代行 業務委託 未経験'),
    search('無形商材 営業 業務委託 オンライン'),
    search('インサイドセールス 業務委託 副業'),
  ],
  matches: (loc) => /(^|\.)indeed\.com$/.test(loc.hostname),
  detailPattern: /[?&]jk=([a-f0-9]{8,})/,
  isListPage: (loc) => /\/jobs/.test(loc.pathname),
  isDetailPage: (loc) => /\/viewjob/.test(loc.pathname) || /[?&]vjk=/.test(loc.search),
  isFormPage: (loc) => /apply|smartapply/.test(loc.hostname + loc.pathname),
  hints: {
    title: ['h1', '[class*="jobsearch-JobInfoHeader-title"]'],
    description: ['#jobDescriptionText', '[class*="jobsearch-JobComponent-description"]'],
    budget: ['[class*="salary"]', '[id*="salaryInfo"]'],
    message: ['textarea'],
    submit: ['button[type="submit"]'],
  },
};
