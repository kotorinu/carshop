import type { VideoStatus } from "./schema.js";

/**
 * 動画ライフサイクルの状態遷移。
 * draft → rendered → approved → scheduled → posted
 *                  ↘ rejected(approvedの前段で却下)
 */
const TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
  draft: ["rendered"],
  rendered: ["approved", "rejected"],
  rejected: ["draft", "rendered"], // 修正して再生成/再描画
  approved: ["scheduled"],
  scheduled: ["posted", "approved"], // 予約取消で承認済へ戻す
  posted: [],
};

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: VideoStatus, to: VideoStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`不正な状態遷移: ${from} → ${to}`);
  }
}
