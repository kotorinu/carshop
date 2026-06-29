import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  Video,
  staticFile,
  interpolate,
  useCurrentFrame,
  spring,
  useVideoConfig,
} from "remotion";
import type { Scene } from "@app/shared";
import { FPS, type MangaInventoryProps } from "./types";

const NAVY = "#0C2340";
const BLUE = "#1A6FE0";

/** Ken-Burns(ゆっくりズーム/パン)で静止画を常時微動させる */
const KenBurns: React.FC<{ src: string; durationFrames: number }> = ({
  src,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationFrames], [1.08, 1.18], {
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame, [0, durationFrames], [-10, 10], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${x}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** 実車写真が無い時のプレースホルダ(本番は実写に差し替わる) */
const PhotoPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(135deg,#1b2b44,#0a1830)",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ color: "#5b7aa8", fontSize: 44, fontWeight: 700 }}>
      🚗 実車写真
    </div>
    <div style={{ color: "#39507a", fontSize: 30, marginTop: 12 }}>{label}</div>
  </AbsoluteFill>
);

/** 漫画風パネル(ハーフトーン風の背景演出) */
const MangaPanel: React.FC<{ tone: number }> = ({ tone }) => {
  const colors = [
    ["#fff4d6", "#ffd98a"],
    ["#dbeafe", "#93c5fd"],
    ["#ffe1e1", "#ffb3b3"],
  ];
  const [a, b] = colors[tone % colors.length];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg,${a},${b})` }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,0,0,0.10) 2px, transparent 2px)",
          backgroundSize: "22px 22px",
          opacity: 0.6,
        }}
      />
      {/* 集中線風の枠 */}
      <AbsoluteFill
        style={{
          border: "14px solid #111",
          margin: 26,
          borderRadius: 8,
        }}
      />
    </AbsoluteFill>
  );
};

/** 下三分の一の字幕(太ゴシック・白文字+黒縁) */
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 8 });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 560 }}>
      <div style={{ textAlign: "center", transform: `scale(${0.9 + s * 0.1})` }}>
        <span
          style={{
            display: "inline",
            fontSize: 78,
            fontWeight: 900,
            color: "#fff",
            background: "rgba(12,35,64,0.55)",
            padding: "10px 26px",
            borderRadius: 14,
            lineHeight: 1.5,
            WebkitTextStroke: "8px #0b1b30",
            paintOrder: "stroke fill",
            fontFamily:
              "'IPAPGothic','IPA Pゴシック','Noto Sans JP',sans-serif",
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/** 割込みSFXテキスト(シーン頭で一瞬出す) */
const SfxPop: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 }, durationInFrames: 12 });
  const opacity = interpolate(frame, [0, 6, 14], [0, 1, 0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity,
          transform: `scale(${0.6 + s}) rotate(-8deg)`,
          fontSize: 120,
          fontWeight: 900,
          color: "#ffd400",
          WebkitTextStroke: "10px #111",
          paintOrder: "stroke fill",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** エンドカード(店名 + LINE QR + CTA) */
const EndCard: React.FC<{
  cta: string;
  shopName: string;
  area: string;
  qrSrc: string | null;
}> = ({ cta, shopName, area, qrSrc }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(135deg,${NAVY},#0a1e3c)`,
      alignItems: "center",
      justifyContent: "center",
      gap: 36,
    }}
  >
    <div style={{ color: "#9FC2F2", fontSize: 40 }}>{area}・中古車</div>
    <div style={{ color: "#fff", fontSize: 80, fontWeight: 900 }}>{shopName}</div>
    {qrSrc ? (
      <Img src={staticFile(qrSrc)} style={{ width: 360, height: 360, borderRadius: 18, background: "#fff", padding: 18 }} />
    ) : (
      <div style={{ width: 360, height: 360, background: "#fff", borderRadius: 18 }} />
    )}
    <div
      style={{
        marginTop: 10,
        background: BLUE,
        color: "#fff",
        fontSize: 56,
        fontWeight: 900,
        padding: "20px 48px",
        borderRadius: 999,
      }}
    >
      {cta}
    </div>
    <div style={{ color: "#cfe0f5", fontSize: 38 }}>プロフィールのLINEから</div>
  </AbsoluteFill>
);

/** Kling生成クリップを全画面再生。暗幕オーバーレイ付き */
const ClipPlayer: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
    <Video
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    {/* 文字を読みやすくする暗幕グラデ（下側を濃く） */}
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.7) 100%)",
      }}
    />
  </AbsoluteFill>
);

const SceneView: React.FC<{
  scene: Scene;
  durationFrames: number;
  imageSrc?: string;
  clipSrc?: string;
  isLast: boolean;
  props: MangaInventoryProps;
}> = ({ scene, durationFrames, imageSrc, clipSrc, isLast, props }) => {
  if (isLast) {
    return (
      <EndCard
        cta={props.script.cta}
        shopName={props.shopName}
        area={props.area}
        qrSrc={props.qrSrc}
      />
    );
  }
  return (
    <AbsoluteFill>
      {scene.visualType === "carPhoto" && clipSrc ? (
        // Kling生成クリップがあれば最優先で使う
        <ClipPlayer src={clipSrc} />
      ) : scene.visualType === "carPhoto" && imageSrc ? (
        <KenBurns src={staticFile(imageSrc)} durationFrames={durationFrames} />
      ) : scene.visualType === "carPhoto" ? (
        <PhotoPlaceholder label={scene.photoRef ?? ""} />
      ) : (
        <MangaPanel tone={scene.index} />
      )}
      {scene.sfx ? <SfxPop text={scene.sfx} /> : null}
      <Caption text={scene.caption} />
    </AbsoluteFill>
  );
};

export const MangaInventory: React.FC<MangaInventoryProps> = (props) => {
  const { script, imageByScene, clipByScene } = props;
  const last = script.scenes.length - 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {script.scenes.map((scene, i) => {
        const from = Math.round(scene.startSec * FPS);
        const durationFrames = Math.max(
          1,
          Math.round((scene.endSec - scene.startSec) * FPS),
        );
        return (
          <Sequence key={scene.index} from={from} durationInFrames={durationFrames}>
            <SceneView
              scene={scene}
              durationFrames={durationFrames}
              imageSrc={imageByScene[scene.index]}
              clipSrc={clipByScene?.[scene.index]}
              isLast={i === last}
              props={props}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
