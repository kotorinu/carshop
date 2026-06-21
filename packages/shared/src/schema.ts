import { z } from "zod";

/**
 * 全ステージを貫く結合契約(zod)。
 * cars.json → script-gen → tts → visuals → video-pipeline → scheduler が
 * これらの型を読み書きして連携する。video-id が全フォルダを貫く結合キー。
 */

/** 在庫1台 = content/inventory/cars.json の1レコード */
export const CarSchema = z.object({
  id: z.string(), // 例 "lexus-rx-2021-01"(car-photos/<id>/ と対応)
  maker: z.string(), // メーカー(例 レクサス)
  model: z.string(), // 車種(例 RX450h)
  year: z.number().int(), // 年式(西暦)
  mileageKm: z.number().int().nonnegative(), // 走行距離(km)
  priceJpy: z.number().int().nonnegative(), // 販売価格(円)
  marketPriceJpy: z.number().int().nonnegative().optional(), // 相場/他店比較(円)
  body: z.string().optional(), // ボディタイプ(例 SUV)
  color: z.string().optional(),
  features: z.array(z.string()).default([]), // 装備(例 サンルーフ, 本革)
  sellingPoints: z.array(z.string()).default([]), // 大阪/外車の推し文句
  photos: z.array(z.string()).default([]), // car-photos/<id>/ 配下のファイル名
});
export type Car = z.infer<typeof CarSchema>;

/** フック型(0〜1秒・tiktok-spec.md と対応) */
export const HookType = z.enum([
  "contrarian", // 逆張り
  "mistake_warning", // 損失警告
  "open_loop", // オープンループ
  "confession", // 告白
  "identity_call", // 限定呼びかけ
  "question", // 質問
  "pattern_interrupt", // 視覚インパクト
  "list_tease", // リスト予告
]);
export type HookType = z.infer<typeof HookType>;

/** 動画フォーマット */
export const VideoFormat = z.enum([
  "manga-inventory", // 顔出しなし・在庫紹介(量産)
  "story-sell", // 漫画風ストーリー(買取/啓発)
  "owner-talk", // 中の人(声/顔)= 信頼・転換
]);
export type VideoFormat = z.infer<typeof VideoFormat>;

/** ターゲット層 */
export const TargetLayer = z.enum([
  "A_seller", // 売りたい人=買取リード(最優先)
  "B_buyer", // 買いたい人=来店/在庫
]);
export type TargetLayer = z.infer<typeof TargetLayer>;

/** ビジュアル種別 */
export const VisualType = z.enum(["manga", "carPhoto", "ownerFace"]);
export type VisualType = z.infer<typeof VisualType>;

/** パターン割込み種別(3〜5秒ごと) */
export const InterruptKind = z.enum([
  "zoom", // Ken-Burns
  "cut",
  "textPop",
  "sfx",
  "colorShift",
]);

/** 1シーン(秒単位タイムラインの1ブロック) */
export const SceneSchema = z.object({
  index: z.number().int().nonnegative(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  narration: z.string(), // ナレーション(VOICEVOXへ)
  caption: z.string(), // 焼き込み字幕(1行4〜6語)
  visualType: VisualType,
  /** carPhoto時に使う car-photos/<carId>/ のファイル名 */
  photoRef: z.string().optional(),
  /** mangaフレーム生成用プロンプト(SD/Midjourney) */
  visualPrompt: z.string().optional(),
  interrupt: InterruptKind.optional(), // このシーン冒頭の割込み演出
  sfx: z.string().optional(), // 効果音メモ
});
export type Scene = z.infer<typeof SceneSchema>;

/** 動画の状態(status.ts の state machine と一致) */
export const VideoStatus = z.enum([
  "draft", // 台本生成済
  "rendered", // 動画書き出し済
  "approved", // 人間が確認・承認
  "rejected", // 却下(要修正)
  "scheduled", // スケジューラに予約投入
  "posted", // 投稿済
]);
export type VideoStatus = z.infer<typeof VideoStatus>;

/** 生成された1動画の台本(content/scripts/<videoId>.json) */
export const VideoScriptSchema = z.object({
  videoId: z.string(), // 例 "2026-06-inv-lexus-rx-01"
  carId: z.string(),
  format: VideoFormat,
  targetLayer: TargetLayer,
  hookType: HookType,
  hookText: z.string(), // 0〜1秒に出す強いテキスト(7〜10語)
  scenes: z.array(SceneSchema).min(1),
  cta: z.string(), // 例 "LINEで無料査定(無料)"
  hashtags: z.array(z.string()).min(3).max(6),
  trendingSoundNote: z.string().default(""), // 投稿時に手付けする音の方針
  estimatedDurationSec: z.number().positive(),
  status: VideoStatus.default("draft"),
  reviewNotes: z.string().default(""),
  createdAt: z.string(), // ISO8601
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

/** LINEリード(line-bot / data/leads.sqlite と対応・将来用) */
export const LeadSchema = z.object({
  lineUserId: z.string(),
  displayName: z.string().optional(),
  addedAt: z.string(),
  consentAt: z.string().optional(),
  tags: z.array(z.string()).default([]), // inventory_interested / buyback_inquiry / visited
  stage: z.string().default("new"),
});
export type Lead = z.infer<typeof LeadSchema>;
