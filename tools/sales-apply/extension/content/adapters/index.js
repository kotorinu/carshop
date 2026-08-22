import lancers from './lancers.js';
import crowdworks from './crowdworks.js';
import coconala from './coconala.js';
import generic from './generic.js';

/** 上から順に判定。generic は必ず最後 */
export const adapters = [lancers, crowdworks, coconala, generic];

export function pickAdapter(loc = location) {
  return adapters.find((a) => a.matches(loc)) || generic;
}

/** 案件を探しに行く検索URL一覧（パネルの「案件を探しに行く」で使う） */
export function allSearchUrls() {
  return adapters.flatMap((a) => (a.searchUrls || []).map((url) => ({ site: a.id, name: a.name, url })));
}
