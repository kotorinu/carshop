import type { Car, VideoFormat, TargetLayer, Scene } from "@app/shared";

/** 円 → 「◯◯万円」 */
const man = (yen: number) => `${Math.round(yen / 10000)}万円`;

/**
 * APIキー無しでもパイプラインを通せる決定論的モック。
 * tiktok-spec.md の8ビット構成に沿った schema 準拠の台本を返す。
 */
export function buildMockScript(
  car: Car,
  format: VideoFormat,
  layer: TargetLayer,
) {
  const photo = (i: number) => car.photos[i] ?? car.photos[0] ?? "01.jpg";
  const priceMan = man(car.priceJpy);
  const marketMan = car.marketPriceJpy ? man(car.marketPriceJpy) : priceMan;

  if (layer === "A_seller") {
    const scenes: Scene[] = [
      { index: 0, startSec: 0, endSec: 1, narration: "外車買取、ほぼ全員が損してます。", caption: "外車買取、ほぼ全員損してる", visualType: "manga", interrupt: "textPop", visualPrompt: "驚く漫画風キャラ、強い表情、縦構図" },
      { index: 1, startSec: 1, endSec: 3.5, narration: "理由はシンプル。査定の出し方を知らないだけ。", caption: "理由は査定方法を知らないだけ", visualType: "manga", interrupt: "zoom", visualPrompt: "考え込む漫画風キャラ" },
      { index: 2, startSec: 3.5, endSec: 8, narration: `たとえばこの${car.maker}${car.model}。相場は${marketMan}前後。`, caption: `相場は${marketMan}前後`, visualType: "carPhoto", photoRef: photo(0), interrupt: "cut" },
      { index: 3, startSec: 8, endSec: 12, narration: "状態と記録簿が揃えば、査定はここまで伸びます。", caption: "状態と記録簿で査定は伸びる", visualType: "carPhoto", photoRef: photo(1), interrupt: "zoom" },
      { index: 4, startSec: 12, endSec: 18, narration: "大阪で外車を売るなら、まず本当の価値を知るのが先。", caption: "まず本当の価値を知る", visualType: "manga", interrupt: "colorShift", visualPrompt: "¥マークと上向き矢印の演出" },
      { index: 5, startSec: 18, endSec: 25, narration: "LINEなら無料で査定シミュレーションができます。", caption: "LINEで無料査定（無料）", visualType: "manga", interrupt: "textPop", sfx: "ポンッ" },
      { index: 6, startSec: 25, endSec: 31, narration: "今だけ買取アップキャンペーン中。気になる方はプロフから。", caption: "今だけ買取アップ中", visualType: "carPhoto", photoRef: photo(0), interrupt: "cut" },
      { index: 7, startSec: 31, endSec: 35, narration: "プロフィールのLINEから、まずは無料査定。", caption: "プロフのLINEで無料査定", visualType: "manga", interrupt: "zoom", visualPrompt: "LINE QRのエンドカード、店名と大阪" },
    ];
    return {
      format,
      targetLayer: layer,
      hookType: "contrarian" as const,
      hookText: "外車買取、ほぼ全員損してる",
      scenes,
      cta: "LINEで無料査定（無料）",
      hashtags: ["#外車買取", "#大阪外車店", "#中古車買取", "#車査定"],
      trendingSoundNote: "緊張→解放系のトレンド音を投稿時に手付け。¥演出に合わせる。",
      estimatedDurationSec: 35,
    };
  }

  // B_buyer: 在庫紹介
  const scenes: Scene[] = [
    { index: 0, startSec: 0, endSec: 1, narration: `この${car.maker}、この値段は正直アリです。`, caption: "この値段は正直アリ", visualType: "carPhoto", photoRef: photo(0), interrupt: "textPop" },
    { index: 1, startSec: 1, endSec: 3.5, narration: `${car.year}年式、走行${(car.mileageKm / 10000).toFixed(1)}万キロ。`, caption: `${car.year}年式 ${Math.round(car.mileageKm / 1000)}千km`, visualType: "carPhoto", photoRef: photo(0), interrupt: "zoom" },
    { index: 2, startSec: 3.5, endSec: 8, narration: `装備も充実。${car.features.slice(0, 2).join("、")}。`, caption: car.features.slice(0, 2).join("・"), visualType: "carPhoto", photoRef: photo(1), interrupt: "cut" },
    { index: 3, startSec: 8, endSec: 12, narration: `内装のコンディションも良好。${car.sellingPoints[0] ?? ""}`, caption: car.sellingPoints[0] ?? "コンディション良好", visualType: "manga", interrupt: "zoom", visualPrompt: "内装に感心する漫画風キャラ" },
    { index: 4, startSec: 12, endSec: 18, narration: `相場は${marketMan}前後。それが当店なら${priceMan}。`, caption: `相場${marketMan} → ${priceMan}`, visualType: "manga", interrupt: "colorShift", visualPrompt: "比較グラフ、価格ダウンの演出" },
    { index: 5, startSec: 18, endSec: 24, narration: "気になる方は在庫がなくなる前に。", caption: "在庫がなくなる前に", visualType: "carPhoto", photoRef: photo(0), interrupt: "textPop", sfx: "ピン！" },
    { index: 6, startSec: 24, endSec: 30, narration: "在庫確認と来店予約はLINEから30秒で完了します。", caption: "LINEで在庫確認・来店予約", visualType: "manga", interrupt: "cut", visualPrompt: "スマホとLINE画面の演出" },
    { index: 7, startSec: 30, endSec: 34, narration: "プロフィールのLINEから、お気軽にどうぞ。", caption: "プロフのLINEへ", visualType: "manga", interrupt: "zoom", visualPrompt: "LINE QRのエンドカード、店名と大阪" },
  ];
  return {
    format,
    targetLayer: layer,
    hookType: "question" as const,
    hookText: "この値段は正直アリ",
    scenes,
    cta: "プロフのLINE→来店予約30秒",
    hashtags: ["#大阪外車店", "#中古車販売", "#外車", `#${car.maker}`],
    trendingSoundNote: "アップビートのトレンド音を投稿時に手付け。価格リビールに合わせる。",
    estimatedDurationSec: 34,
  };
}
