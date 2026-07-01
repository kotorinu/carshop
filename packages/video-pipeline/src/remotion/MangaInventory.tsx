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
import { FPS, HEIGHT, type MangaInventoryProps, type StyleParams, type CarInfo, DEFAULT_STYLE_PARAMS } from "./types";

const NAVY = "#0C2340";
const BLUE = "#1A6FE0";
const JP_FONT = "'Noto Sans JP','IPAPGothic','IPA Pゴシック',sans-serif";

/** 数字(価格/年式/走行/◯◯万円)をゴールドグラデで強調して分割描画する */
const NUM_RE = /([0-9０-９][0-9０-９,.]*(?:万円|万km|万キロ|万|円|km|キロ|年式|年|％|%)?)/g;

const GoldText: React.FC<{
  text: string;
  gold: StyleParams["gold"];
  numberScale?: number;
  strokeWidth: number;
}> = ({ text, gold, numberScale = 1.15, strokeWidth }) => {
  const parts = text.split(NUM_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // 縁取り層+グラデ層の2枚重ね。text-strokeとbackground-clip:textを
          // 同一要素に併用するとstrokeがグラデを塗り潰すため分離する
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              fontSize: `${numberScale}em`,
              lineHeight: 1.2,
            }}
          >
            <span
              style={{
                WebkitTextStroke: `${strokeWidth}px #0b1b30`,
                color: "#0b1b30",
              }}
            >
              {part}
            </span>
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                WebkitTextStroke: "0px transparent",
                background: `linear-gradient(180deg, ${gold.from} 0%, ${gold.mid} 50%, ${gold.to} 100%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {part}
            </span>
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

/** 暗幕グラデ(下側を濃く)。文字を必ず読めるようにする */
const DarkOverlay: React.FC<{ params: StyleParams["darkOverlay"] }> = ({ params }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(to bottom, rgba(0,0,0,${params.topOpacity}) 0%, rgba(0,0,0,0.05) 38%, rgba(0,0,0,${params.bottomOpacity * 0.75}) 78%, rgba(0,0,0,${params.bottomOpacity}) 100%)`,
    }}
  />
);

/** Ken-Burns(ズーム/パン)。シーンごとに方向を変えて単調さを消す */
const KenBurns: React.FC<{
  src: string;
  durationFrames: number;
  sceneIndex: number;
  params: StyleParams;
}> = ({ src, durationFrames, sceneIndex, params }) => {
  const frame = useCurrentFrame();
  const kb = params.kenBurns;
  const dir = sceneIndex % 2 === 0 ? 1 : -1;
  const zoomIn = sceneIndex % 3 !== 2; // 3シーンに1回はズームアウトで変化を付ける
  const scale = interpolate(
    frame,
    [0, durationFrames],
    zoomIn ? [kb.scaleFrom, kb.scaleTo] : [kb.scaleTo, kb.scaleFrom],
    { extrapolateRight: "clamp" },
  );
  const x = interpolate(frame, [0, durationFrames], [-kb.panPx * dir, kb.panPx * dir], {
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
      <DarkOverlay params={params.darkOverlay} />
    </AbsoluteFill>
  );
};

/** Kling生成クリップを全画面再生 */
const ClipPlayer: React.FC<{ src: string; params: StyleParams }> = ({ src, params }) => (
  <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
    <Video
      src={staticFile(src)}
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <DarkOverlay params={params.darkOverlay} />
  </AbsoluteFill>
);

/** 実車写真が無い時のプレースホルダ(本番は実写に差し替わる) */
const PhotoPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(135deg,#1b2b44,#0a1830)",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div style={{ color: "#5b7aa8", fontSize: 44, fontWeight: 700 }}>🚗 実車写真</div>
    <div style={{ color: "#39507a", fontSize: 30, marginTop: 12 }}>{label}</div>
  </AbsoluteFill>
);

/** 旧manga/汎用シーンの背景(漫画調は廃止→ブランド濃紺) */
const BrandPanel: React.FC = () => (
  <AbsoluteFill
    style={{ background: `linear-gradient(160deg, #12335f 0%, ${NAVY} 55%, #071528 100%)` }}
  >
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 30% 20%, rgba(233,196,90,0.10), transparent 55%)",
      }}
    />
  </AbsoluteFill>
);

/** 長いフックを数字の直前で2行に割る(「このレクサスが / 598万円」) */
function splitHookLines(text: string): string[] {
  if (text.length <= 9) return [text];
  const m = text.match(NUM_RE);
  const numStart = m ? text.indexOf(m[0]) : -1;
  const split = numStart >= 3 && numStart <= text.length - 2 ? numStart : Math.ceil(text.length / 2);
  return [text.slice(0, split), text.slice(split)];
}

/** フック(0〜2秒)。画面中央上寄りに極太・数字ゴールド */
const Hook: React.FC<{ text: string; params: StyleParams }> = ({ text, params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: 12 });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${params.hook.topOffsetPct}%`,
          width: "88%",
          textAlign: "center",
          transform: `scale(${0.8 + s * 0.2})`,
          fontSize: params.hook.fontSize,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.25,
          fontFamily: JP_FONT,
          WebkitTextStroke: "10px #0b1b30",
          paintOrder: "stroke fill",
          textShadow: "0 8px 32px rgba(0,0,0,0.65)",
        }}
      >
        {splitHookLines(text).map((line, i) => (
          <div key={i}>
            <GoldText
              text={line}
              gold={params.gold}
              numberScale={params.hook.numberScale}
              strokeWidth={10}
            />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 字幕(安全域内・中央やや下・数字ゴールド) */
const Caption: React.FC<{ text: string; params: StyleParams }> = ({ text, params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 8 });
  const c = params.caption;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div
        style={{
          textAlign: "center",
          transform: `scale(${0.9 + s * 0.1})`,
          paddingBottom: HEIGHT * (c.bottomOffsetPct / 100),
        }}
      >
        <span
          style={{
            display: "inline",
            fontSize: c.fontSize,
            fontWeight: 900,
            color: "#fff",
            background: `rgba(12,35,64,${c.boxOpacity})`,
            padding: "10px 26px",
            borderRadius: 16,
            lineHeight: 1.6,
            WebkitTextStroke: `${c.strokeWidth}px #0b1b30`,
            paintOrder: "stroke fill",
            fontFamily: JP_FONT,
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          <GoldText text={text} gold={params.gold} numberScale={1.12} strokeWidth={c.strokeWidth} />
        </span>
      </div>
    </AbsoluteFill>
  );
};

/** 価格リビール("ドン"と拡大・ゴールド) */
const PriceReveal: React.FC<{ text: string; params: StyleParams }> = ({ text, params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = params.priceReveal;
  const s = spring({
    frame,
    fps,
    config: { damping: p.springDamping, stiffness: p.springStiffness },
  });
  // 長い価格テキスト(「650万→598万円」等)は画面幅に収まるよう自動縮小・折返し禁止
  const shrink = Math.min(1, 6.5 / Math.max(1, text.length));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          whiteSpace: "nowrap",
          transform: `scale(${0.55 + s * 0.45})`,
          fontSize: Math.round(p.fontSize * Math.max(0.5, shrink)),
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
          fontFamily: JP_FONT,
          color: "#fff",
          WebkitTextStroke: "12px #0b1b30",
          paintOrder: "stroke fill",
          textShadow: "0 10px 44px rgba(0,0,0,0.7)",
        }}
      >
        <GoldText text={text} gold={params.gold} numberScale={1.2} strokeWidth={12} />
      </div>
    </AbsoluteFill>
  );
};

/** 上部スペックバー(¥/年式/走行を常時表示・在庫系で必須) */
const SpecBar: React.FC<{ carInfo: CarInfo; params: StyleParams }> = ({ carInfo, params }) => {
  const sb = params.specBar;
  return (
    <div
      style={{
        position: "absolute",
        top: sb.topPx,
        width: "100%",
        textAlign: "center",
        fontSize: sb.fontSize,
        fontWeight: 800,
        fontFamily: JP_FONT,
        color: "#fff",
        WebkitTextStroke: "4px rgba(0,0,0,0.85)",
        paintOrder: "stroke fill",
        letterSpacing: 1,
        opacity: 0.95,
      }}
    >
      ¥{carInfo.priceMan} ／ {carInfo.year}年式 ／ {carInfo.mileageManKm}
    </div>
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
          fontFamily: JP_FONT,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** エンドカード(店名 + LINE QR + CTA)。3〜4秒で切る */
const EndCard: React.FC<{
  cta: string;
  shopName: string;
  area: string;
  qrSrc: string | null;
  params: StyleParams;
}> = ({ cta, shopName, area, qrSrc, params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 100, stiffness: 180 }, durationInFrames: 12 });
  const qr = params.endCard.qrSizePx;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg,${NAVY},#0a1e3c)`,
        alignItems: "center",
        justifyContent: "center",
        gap: 34,
        fontFamily: JP_FONT,
        transform: `scale(${0.96 + s * 0.04})`,
      }}
    >
      <div style={{ color: "#9FC2F2", fontSize: 40 }}>{area}・中古車</div>
      <div style={{ color: "#fff", fontSize: params.endCard.shopNameFontSize, fontWeight: 900 }}>
        {shopName}
      </div>
      {qrSrc ? (
        <Img
          src={staticFile(qrSrc)}
          style={{ width: qr, height: qr, borderRadius: 18, background: "#fff", padding: 18 }}
        />
      ) : (
        <div style={{ width: qr, height: qr, background: "#fff", borderRadius: 18 }} />
      )}
      <div
        style={{
          marginTop: 8,
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
};

const SceneView: React.FC<{
  scene: Scene;
  durationFrames: number;
  imageSrc?: string;
  clipSrc?: string;
  isFirst: boolean;
  isLast: boolean;
  props: MangaInventoryProps;
  params: StyleParams;
}> = ({ scene, durationFrames, imageSrc, clipSrc, isFirst, isLast, props, params }) => {
  if (isLast) {
    return (
      <EndCard
        cta={props.script.cta}
        shopName={props.shopName}
        area={props.area}
        qrSrc={props.qrSrc}
        params={params}
      />
    );
  }
  return (
    <AbsoluteFill>
      {scene.visualType === "carPhoto" && clipSrc ? (
        // Kling生成クリップがあれば最優先で使う
        <ClipPlayer src={clipSrc} params={params} />
      ) : scene.visualType === "carPhoto" && imageSrc ? (
        <KenBurns
          src={staticFile(imageSrc)}
          durationFrames={durationFrames}
          sceneIndex={scene.index}
          params={params}
        />
      ) : scene.visualType === "carPhoto" ? (
        <PhotoPlaceholder label={scene.photoRef ?? ""} />
      ) : (
        <BrandPanel />
      )}
      {props.carInfo && params.specBar.enabled ? (
        <SpecBar carInfo={props.carInfo} params={params} />
      ) : null}
      {scene.sfx ? <SfxPop text={scene.sfx} /> : null}
      {scene.priceReveal ? (
        <PriceReveal text={scene.caption} params={params} />
      ) : isFirst ? (
        <Hook text={props.script.hookText} params={params} />
      ) : (
        <Caption text={scene.caption} params={params} />
      )}
    </AbsoluteFill>
  );
};

export const MangaInventory: React.FC<MangaInventoryProps> = (props) => {
  const { script, imageByScene, clipByScene } = props;
  const params = props.styleParams ?? DEFAULT_STYLE_PARAMS;
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
              isFirst={i === 0}
              isLast={i === last}
              props={props}
              params={params}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
