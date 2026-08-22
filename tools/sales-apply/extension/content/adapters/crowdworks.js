/**
 * クラウドワークス — 🚫 使用禁止（実践活動ルール）。
 * 消さずに残しているのは、うっかり開いたときに警告を出すため。
 */
export default {
  id: 'crowdworks',
  name: 'クラウドワークス（使用禁止）',
  banned: 'クラウドワークスは使用禁止です。実践活動（BtoC・無形商材・アポイント譲渡型）に合う案件がほとんど無く、時間の機会損失になります。複業クラウド・ランサーズ・Indeed で探してください。',
  searchUrls: [],
  matches: (loc) => /(^|\.)crowdworks\.jp$/.test(loc.hostname),
  detailPattern: /crowdworks\.jp\/public\/jobs\/(\d+)/,
  isListPage: () => false,
  isDetailPage: () => false,
  isFormPage: () => false,
  hints: {},
};
