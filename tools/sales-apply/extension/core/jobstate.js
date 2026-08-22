/**
 * 案件の「状態」を管理する。
 *
 * 実運用でいちばん困るのは、同じものが何度も出てくること・二重に応募してしまうこと。
 * だから案件は必ずこの6つのどれかの状態を持ち、状態ごとに「もう出すか／二度と出さないか」を決める。
 *
 *   new       … 集めたばかり（まだ判定していない）
 *   rejected  … 条件に合わない。★二度と出さない
 *   candidate … 条件を満たす。まだ何もしていない → タブで開く対象
 *   drafted   … 応募文を作った。まだ送っていない → 「書きかけ」として残す。★もう自動では開かない
 *   applied   … 応募した。★二度と出さない・二度と開かない
 *   skipped   … 自分で見送った。★二度と出さない
 *
 * 状態が変わるのは次のときだけ:
 *   収集した       → new → （判定）→ candidate / rejected
 *   応募文を作った → drafted
 *   応募済みにした → applied
 *   見送りにした   → skipped
 *   マスト条件を変えた → rejected と candidate だけ判定し直す（drafted/applied/skipped は触らない）
 */

export const STATUS = {
  NEW: 'new',
  REJECTED: 'rejected',
  CANDIDATE: 'candidate',
  DRAFTED: 'drafted',
  APPLIED: 'applied',
  SKIPPED: 'skipped',
};

export const STATUS_LABEL = {
  new: '未判定',
  rejected: '対象外',
  candidate: '候補',
  drafted: '書きかけ',
  applied: '応募済み',
  skipped: '見送り',
};

/** 人が手をつけたあとの状態。判定し直しても勝手に変えない */
const HUMAN_TOUCHED = new Set([STATUS.DRAFTED, STATUS.APPLIED, STATUS.SKIPPED]);

/** 二度と一覧に出さない状態 */
const CLOSED = new Set([STATUS.REJECTED, STATUS.APPLIED, STATUS.SKIPPED]);

export const isClosed = (job) => CLOSED.has(job.status);
export const isTouched = (job) => HUMAN_TOUCHED.has(job.status);

/** マスト判定の結果から状態を決める */
export function statusFromMust(must) {
  return must && must.passed ? STATUS.CANDIDATE : STATUS.REJECTED;
}

/**
 * 集めた案件に状態を付ける（すでに状態があるものは尊重する）。
 * @param {object} incoming 今回集めた案件（採点・マスト判定済み）
 * @param {object|null} known 前から知っている同じ案件
 */
export function mergeJob(incoming, known) {
  if (!known) {
    return {
      ...incoming,
      status: statusFromMust(incoming.must),
      firstSeenAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  // 人が手をつけたあとは、中身だけ更新して状態は変えない
  if (isTouched(known)) {
    return { ...known, ...incoming, status: known.status, updatedAt: Date.now() };
  }
  return {
    ...known,
    ...incoming,
    status: statusFromMust(incoming.must),
    firstSeenAt: known.firstSeenAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/** マスト条件を変えたときの判定し直し。人が手をつけたものは触らない */
export function rejudge(job, must) {
  if (isTouched(job)) return { ...job, must };
  return { ...job, must, status: statusFromMust(must), updatedAt: Date.now() };
}

/** タブで開いてよい案件か。一度開いたものは二度と開かない */
export function shouldOpen(job) {
  return job.status === STATUS.CANDIDATE && !job.openedAt;
}

/** 状態を進める。戻る向きの変更は受け付けない（応募済みを候補に戻したりしない） */
export function advance(job, next, extra = {}) {
  if (job.status === STATUS.APPLIED && next !== STATUS.APPLIED) return job;
  return { ...job, status: next, updatedAt: Date.now(), ...extra };
}

/** 一覧に出す並び。候補が先、次に書きかけ */
const ORDER = { candidate: 0, drafted: 1, new: 2, skipped: 3, rejected: 4, applied: 5 };
export function sortForList(jobs) {
  return [...jobs].sort((a, b) => {
    const d = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
    return d !== 0 ? d : (b.score || 0) - (a.score || 0);
  });
}

/** 状態ごとの件数 */
export function summarize(jobs) {
  const n = { new: 0, rejected: 0, candidate: 0, drafted: 0, applied: 0, skipped: 0 };
  for (const j of jobs) if (n[j.status] !== undefined) n[j.status]++;
  return n;
}
