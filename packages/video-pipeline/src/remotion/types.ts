import type { VideoScript } from "@app/shared";

/**
 * スタイルのツマミ(content/brand/style-params.json)。
 * 自己採点ループ(tools/self-review.ts)がこのJSONを書き換えて品質を反復改善する。
 * Remotionはfsを読めないので render.ts / preview-still.ts が読み込んで props で渡す。
 */
export type StyleParams = {
  version: number;
  hook: { fontSize: number; numberScale: number; topOffsetPct: number };
  caption: {
    fontSize: number;
    strokeWidth: number;
    boxOpacity: number;
    bottomOffsetPct: number;
    maxCharsPerLine: number;
  };
  specBar: { enabled: boolean; fontSize: number; topPx: number };
  darkOverlay: { topOpacity: number; bottomOpacity: number };
  kenBurns: { scaleFrom: number; scaleTo: number; panPx: number };
  priceReveal: { fontSize: number; springDamping: number; springStiffness: number };
  gold: { from: string; mid: string; to: string };
  endCard: { qrSizePx: number; shopNameFontSize: number };
};

export const DEFAULT_STYLE_PARAMS: StyleParams = {
  version: 1,
  hook: { fontSize: 112, numberScale: 1.3, topOffsetPct: 34 },
  caption: {
    fontSize: 68,
    strokeWidth: 8,
    boxOpacity: 0.5,
    bottomOffsetPct: 31,
    maxCharsPerLine: 12,
  },
  specBar: { enabled: true, fontSize: 38, topPx: 300 },
  darkOverlay: { topOpacity: 0.25, bottomOpacity: 0.72 },
  kenBurns: { scaleFrom: 1.1, scaleTo: 1.3, panPx: 26 },
  priceReveal: { fontSize: 148, springDamping: 80, springStiffness: 200 },
  gold: { from: "#FFE9A8", mid: "#E9C45A", to: "#B8893B" },
  endCard: { qrSizePx: 340, shopNameFontSize: 76 },
};

/** 上部スペックバーに出す在庫情報 */
export type CarInfo = {
  priceMan: string; // 車両本体 例 "598万"
  totalMan?: string; // 支払総額 例 "618万"(公正競争規約: 総額表示必須)
  year: number; // 例 2021
  mileageManKm: string; // 例 "3.2万km"
};

/** コンポジションに渡す inputProps(Remotionは Record<string,unknown> 互換を要求) */
export type MangaInventoryProps = {
  script: VideoScript;
  carId: string;
  /** scene.index -> 実車写真の staticFile パス(存在する場合のみ) */
  imageByScene: Record<number, string>;
  /** scene.index -> Kling生成動画クリップの staticFile パス(存在する場合のみ) */
  clipByScene: Record<number, string>;
  /** scene.index -> VOICEVOXナレーションwavの staticFile パス(存在する場合のみ) */
  audioByScene?: Record<number, string>;
  /** LINE QR の staticFile パス */
  qrSrc: string | null;
  shopName: string;
  area: string;
  /** 上部スペックバー(在庫系で必須) */
  carInfo?: CarInfo;
  styleParams: StyleParams;
} & Record<string, unknown>;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
