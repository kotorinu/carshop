import type { VideoScript } from "@app/shared";

/** コンポジションに渡す inputProps(Remotionは Record<string,unknown> 互換を要求) */
export type MangaInventoryProps = {
  script: VideoScript;
  carId: string;
  /** scene.index -> 実車写真の staticFile パス(存在する場合のみ) */
  imageByScene: Record<number, string>;
  /** LINE QR の staticFile パス */
  qrSrc: string | null;
  shopName: string;
  area: string;
} & Record<string, unknown>;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
