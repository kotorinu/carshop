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
  priceJpy: z.number().int().nonnegative(), // 車両本体価格(円)
  totalPaymentJpy: z.number().int().nonnegative().optional(), // 支払総額(円)。中古車広告の公正競争規約(2023年10月〜)で表示必須
  marketPriceJpy: z.number().int().nonnegative().optional(), // 相場/他店比較(円)
  body: z.string().optional(), // ボディタイプ(例 SUV)
  color: z.string().optional(),
  features: z.array(z.string()).default([]), // 装備(例 サンルーフ, 本革)
  sellingPoints: z.array(z.string()).default([]), // 大阪/外車の推し文句
  photos: z.array(z.string()).default([]), // car-photos/<id>/ 配下のファイル名
});
export type Car = z.infer<typeof CarSchema>;

/** フック型(0〜1秒・tiktok-spec.md と対応。2026研究版+旧型互換) */
export const HookType = z.enum([
  "shock_fact", // 衝撃の事実(「90%が損してる」)
  "before_after", // ビフォーアフター(結果を先に見せる)
  "relatable", // 共感あるある
  "price_impact", // 価格インパクト(在庫系の主軸)
  "contrarian", // 逆張り/意外性
  "mistake_warning", // 損失警告
  "open_loop", // オープンループ
  "confession", // 告白
  "identity_call", // 限定呼びかけ
  "question", // 疑問提起
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

/** 実車写真の役割(素材プールからの選定基準) */
export const PhotoRole = z.enum([
  "hero", // 正面/斜め前の外観(フック用)
  "move", // 走り/斜めアングル
  "interior", // 内装
  "detail", // ホイール/ライト等のディテール
]);
export type PhotoRole = z.infer<typeof PhotoRole>;

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
  /** 実車写真の役割(hero/move/interior/detail) */
  photoRole: PhotoRole.optional(),
  /** このシーンで価格を"ドン"とリビールする */
  priceReveal: z.boolean().optional(),
  /** mangaフレーム生成用プロンプト(SD/Midjourney) */
  visualPrompt: z.string().optional(),
  interrupt: InterruptKind.optional(), // このシーン冒頭の割込み演出
  sfx: z.string().optional(), // 効果音メモ
});
export type Scene = z.infer<typeof SceneSchema>;

/**
 * AI写真選定の結果(content/car-photos/<carId>/selection.json)。
 * pick:photos が書き、script-gen / gen:clips が読む。
 * 写真は素材プール — 全部使わず役割別ベストだけ動画に使う。
 */
export const PhotoSelectionSchema = z.object({
  hero: z.string().optional(), // 正面/斜め前の外観(フック用)
  move: z.string().optional(), // 走り/斜めアングル
  interior: z.string().optional(), // 内装
  detail: z.string().optional(), // ホイール/ライト等
  ranked: z.array(z.string()).default([]), // 良い順の全ランキング
  reasoning: z.string().default(""), // 選定理由(AIの説明)
  createdAt: z.string().optional(),
});
export type PhotoSelection = z.infer<typeof PhotoSelectionSchema>;

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

/**
 * LIFFフォーム送信(data/submissions.json)。
 * 来店予約=booking / 買取査定=appraisal。lineUserId/displayName/createdAt は
 * サーバー側でアクセストークン検証後に付与する(クライアントからは受け取らない)。
 */
export const BookingSubmissionSchema = z.object({
  type: z.literal("booking"),
  lineUserId: z.string(),
  displayName: z.string().optional(),
  name: z.string().min(1), // お名前
  phone: z.string().min(8), // 連絡先(電話)
  carInterest: z.string().default(""), // 気になる車種(任意)
  preferredDate: z.string().min(1), // 希望日 YYYY-MM-DD
  preferredTime: z.string().min(1), // 希望時間帯(午前/午後/夕方)
  note: z.string().default(""), // ご要望(任意)
  createdAt: z.string(),
});
export type BookingSubmission = z.infer<typeof BookingSubmissionSchema>;

export const AppraisalSubmissionSchema = z.object({
  type: z.literal("appraisal"),
  lineUserId: z.string(),
  displayName: z.string().optional(),
  name: z.string().min(1), // お名前
  phone: z.string().min(8), // 連絡先(電話)
  carName: z.string().min(1), // メーカー・車種
  year: z.string().min(1), // 年式(西暦・文字列)
  mileageKm: z.number().int().nonnegative(), // 走行距離(km)
  note: z.string().default(""), // 車の状態・ご要望(任意)
  createdAt: z.string(),
});
export type AppraisalSubmission = z.infer<typeof AppraisalSubmissionSchema>;

export const SubmissionSchema = z.discriminatedUnion("type", [
  BookingSubmissionSchema,
  AppraisalSubmissionSchema,
]);
export type Submission = z.infer<typeof SubmissionSchema>;

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
