import type { Car, VideoFormat, TargetLayer, Scene, PhotoSelection } from "@app/shared";

/** 円 → 「◯◯万円」 */
const man = (yen: number) => `${Math.round(yen / 10000)}万円`;
/** 円 → 「◯◯万」(字幕を短くしたい時) */
const manShort = (yen: number) => `${Math.round(yen / 10000)}万`;

/**
 * APIキー無しでもパイプラインを通せる決定論的モック。
 * tiktok-spec.md(2026研究改訂版)の 15〜30秒・実写ショーケース型に準拠。
 * 写真は素材プール: selection.json(AI選定)があれば役割別ベストを使う。
 */
export function buildMockScript(
  car: Car,
  format: VideoFormat,
  layer: TargetLayer,
  selection?: PhotoSelection,
) {
  const fallback = (i: number) => car.photos[i] ?? car.photos[0] ?? "01.jpg";
  const pick = {
    hero: selection?.hero ?? fallback(0),
    move: selection?.move ?? fallback(1),
    interior: selection?.interior ?? fallback(2),
    detail: selection?.detail ?? fallback(3),
  };
  const priceMan = man(car.priceJpy);
  const marketMan = car.marketPriceJpy ? man(car.marketPriceJpy) : undefined;
  const mileageMan = `${(car.mileageKm / 10000).toFixed(1)}万km`;

  if (layer === "A_seller") {
    // 買取(20〜27秒): 損失警告フック → 問題 → 解決+実車例 → 証拠 → CTA → エンドカード
    const scenes: Scene[] = [
      { index: 0, startSec: 0, endSec: 2, narration: "中古車買取、9割の人が損してます。", caption: "買取、9割が損してる", visualType: "carPhoto", photoRef: pick.hero, photoRole: "hero", interrupt: "textPop" },
      { index: 1, startSec: 2, endSec: 6, narration: "下取りだけで決めていませんか？それが一番もったいない。", caption: "下取りだけで決めてない?", visualType: "carPhoto", photoRef: pick.move, photoRole: "move", interrupt: "cut" },
      { index: 2, startSec: 6, endSec: 12, narration: `たとえばこの${car.maker}${car.model}。相場は${marketMan ?? priceMan}前後です。`, caption: `相場は${marketMan ?? priceMan}前後`, visualType: "carPhoto", photoRef: pick.detail, photoRole: "detail", interrupt: "zoom", sfx: "ポンッ" },
      { index: 3, startSec: 12, endSec: 17, narration: "記録簿と状態が揃えば、査定はここから伸びます。", caption: "記録簿で査定は伸びる", visualType: "carPhoto", photoRef: pick.interior, photoRole: "interior", interrupt: "cut" },
      { index: 4, startSec: 17, endSec: 23, narration: "大阪で売るなら、まずLINEで無料査定。30秒で終わります。", caption: "LINEで無料査定 30秒", visualType: "carPhoto", photoRef: pick.hero, photoRole: "hero", interrupt: "zoom" },
      { index: 5, startSec: 23, endSec: 27, narration: "プロフィールのLINEから、お気軽にどうぞ。", caption: "プロフのLINEから", visualType: "manga", interrupt: "cut" },
    ];
    return {
      format,
      targetLayer: layer,
      hookType: "shock_fact" as const,
      hookText: "買取、9割が損してる",
      scenes,
      cta: "LINEで無料査定（無料）",
      hashtags: ["#中古車買取", "#大阪中古車", "#車査定", `#${car.maker}`],
      trendingSoundNote: "緊張→解放系のトレンド音を投稿時に手付け。¥演出に合わせる。",
      estimatedDurationSec: 27,
    };
  }

  // B_buyer 在庫紹介(15〜19秒・ウォークアラウンド型): 価格フック → スペック → 特徴 → 正直 → 価格ドン → エンドカード
  const featureCaption = car.features.slice(0, 2).join("・") || "装備充実";
  const honest = car.sellingPoints[0] ?? "状態は動画より現車で";
  const scenes: Scene[] = [
    { index: 0, startSec: 0, endSec: 2, narration: `この${car.maker}${car.model}、${priceMan}です。`, caption: `この${car.maker}が${priceMan}`, visualType: "carPhoto", photoRef: pick.hero, photoRole: "hero", interrupt: "textPop" },
    { index: 1, startSec: 2, endSec: 5, narration: `${car.year}年式、走行${mileageMan}。`, caption: `${car.year}年式 走行${mileageMan}`, visualType: "carPhoto", photoRef: pick.move, photoRole: "move", interrupt: "cut" },
    { index: 2, startSec: 5, endSec: 9, narration: `装備は${car.features.slice(0, 2).join("、")}。`, caption: featureCaption, visualType: "carPhoto", photoRef: pick.interior, photoRole: "interior", interrupt: "zoom" },
    { index: 3, startSec: 9, endSec: 12, narration: `正直に言うと、${honest}。`, caption: honest, visualType: "carPhoto", photoRef: pick.detail, photoRole: "detail", interrupt: "cut" },
    { index: 4, startSec: 12, endSec: 15, narration: marketMan ? `相場${marketMan}のところ、当店${priceMan}。` : `価格は${priceMan}。早い者勝ちです。`, caption: car.marketPriceJpy ? `${manShort(car.marketPriceJpy)}→${priceMan}` : `${priceMan}`, visualType: "carPhoto", photoRef: pick.hero, photoRole: "hero", priceReveal: true, interrupt: "textPop", sfx: "ドン" },
    { index: 5, startSec: 15, endSec: 19, narration: "在庫確認と来店予約はLINEから30秒。", caption: "LINEで在庫確認", visualType: "manga", interrupt: "cut" },
  ];
  return {
    format,
    targetLayer: layer,
    hookType: "price_impact" as const,
    hookText: `この${car.maker}が${priceMan}`,
    scenes,
    cta: "在庫リスト全部LINEで送ります",
    hashtags: ["#中古車", "#大阪中古車", "#中古車販売", `#${car.maker}`],
    trendingSoundNote: "アップビートのトレンド音を投稿時に手付け。価格リビールに合わせる。",
    estimatedDurationSec: 19,
  };
}
