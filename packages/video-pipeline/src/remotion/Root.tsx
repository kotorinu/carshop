import React from "react";
import { Composition } from "remotion";
import type { VideoScript } from "@app/shared";
import { MangaInventory } from "./MangaInventory";
import { FPS, WIDTH, HEIGHT, type MangaInventoryProps } from "./types";

// スタジオ表示用の最小ダミー(本番は render.ts が inputProps を渡す)
const placeholderScript: VideoScript = {
  videoId: "preview",
  carId: "preview",
  format: "manga-inventory",
  targetLayer: "B_buyer",
  hookType: "question",
  hookText: "プレビュー",
  scenes: [
    { index: 0, startSec: 0, endSec: 2, narration: "プレビュー", caption: "プレビュー", visualType: "manga" },
    { index: 1, startSec: 2, endSec: 4, narration: "CTA", caption: "LINEで無料査定", visualType: "manga" },
  ],
  cta: "LINEで無料査定（無料）",
  hashtags: ["#中古車買取", "#大阪中古車", "#中古車販売"],
  trendingSoundNote: "",
  estimatedDurationSec: 4,
  status: "draft",
  reviewNotes: "",
  createdAt: new Date().toISOString(),
};

const defaultProps: MangaInventoryProps = {
  script: placeholderScript,
  carId: "preview",
  imageByScene: {},
  clipByScene: {},
  qrSrc: null,
  shopName: "Jupiter Coring",
  area: "大阪",
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MangaInventory"
      component={MangaInventory}
      durationInFrames={Math.round(defaultProps.script.estimatedDurationSec * FPS)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={({ props }: { props: MangaInventoryProps }) => ({
        durationInFrames: Math.max(
          1,
          Math.round(props.script.estimatedDurationSec * FPS),
        ),
      })}
    />
  );
};
