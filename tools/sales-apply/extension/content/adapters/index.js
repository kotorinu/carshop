import anotherworks from './anotherworks.js';
import lancers from './lancers.js';
import indeed from './indeed.js';
import crowdworks from './crowdworks.js';
import generic from './generic.js';

/**
 * 上から順に判定。generic は必ず最後。
 * 並び順＝実践活動での優先度（複業クラウド・ランサーズ・Indeed を軸にする）。
 * crowdworks は「使用禁止」の警告を出すためだけに残してある。
 */
export const adapters = [anotherworks, lancers, indeed, crowdworks, generic];

export function pickAdapter(loc = location) {
  return adapters.find((a) => a.matches(loc)) || generic;
}

/** 「案件を探しに行く」で開く検索URL（禁止媒体は含めない） */
export function allSearchUrls() {
  return adapters
    .filter((a) => !a.banned)
    .flatMap((a) => (a.searchUrls || []).map((url) => ({ site: a.id, name: a.name, url })));
}
