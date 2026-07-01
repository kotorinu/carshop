import type { Car, VideoFormat, TargetLayer, PhotoSelection } from "@app/shared";

/**
 * tiktok-spec.md を丸ごと注入したシステムプロンプトを作る。
 * 出力は VideoScript(scenes[]) に対応する JSON のみ。
 */
export function buildSystemPrompt(tiktokSpec: string): string {
  return `あなたは日本の中古車店のTikTok動画の台本を作る、ショート動画グロースの専門家です。
以下の「伸ばす型」に**厳密に**従って台本を作ってください。

==== 伸ばす型(tiktok-spec) ====
${tiktokSpec}
==== ここまで ====

# 出力ルール(厳守)
- 出力は **JSONオブジェクトのみ**。前後に説明文・コードフェンスを付けない。
- 動画は **15〜30秒**(在庫=15〜20秒、買取=20〜30秒)、9:16。完了率70%+を狙う構成。
- カット割りは2〜4秒に1回。シーン数は5〜6(最後はエンドカード)。
- scenes は秒単位タイムライン。各シーンに start/end 秒、ナレ、字幕(1行4〜6語)、visualType を必ず付ける。
- **全シーン実写(visualType:"carPhoto")**。最後のエンドカードのみ "manga" でよい。漫画調・AIイラストは禁止。
- 各実写シーンには photoRef(写真ファイル名)と photoRole("hero"|"move"|"interior"|"detail")を付ける。
- 与えられた「役割別 選定写真」を優先して使う。写真は素材プール — 全部使う必要はない。
- 価格を"ドン"と見せるシーンには "priceReveal": true を付ける(在庫系は必須・1シーンだけ)。
- 最初のシーン(0〜2秒)は強いフック。hookType を選び hookText を入れる。**数字入りが強い**。
- ハッシュタグは3〜5個。CTAはLINE誘導。

# 出力JSONの形(キーと型)
{
  "format": "manga-inventory" | "story-sell" | "owner-talk",
  "targetLayer": "A_seller" | "B_buyer",
  "hookType": "shock_fact"|"before_after"|"relatable"|"price_impact"|"contrarian"|"mistake_warning"|"open_loop"|"confession"|"identity_call"|"question"|"pattern_interrupt"|"list_tease",
  "hookText": string,
  "scenes": [
    { "index": number, "startSec": number, "endSec": number,
      "narration": string, "caption": string,
      "visualType": "manga"|"carPhoto"|"ownerFace",
      "photoRef": string(carPhoto時), "photoRole": "hero"|"move"|"interior"|"detail"(carPhoto時),
      "priceReveal": boolean(任意・価格ドンのシーンのみtrue),
      "interrupt": "zoom"|"cut"|"textPop"|"sfx"|"colorShift"(任意), "sfx": string(任意) }
  ],
  "cta": string,
  "hashtags": [string],
  "trendingSoundNote": string,
  "estimatedDurationSec": number(15〜30)
}`;
}

export function buildUserPrompt(
  car: Car,
  format: VideoFormat,
  layer: TargetLayer,
  selection?: PhotoSelection,
): string {
  const selectionNote = selection
    ? `# 役割別 選定写真(AI選定済み・これを優先して使う)
- hero(外観ヒーロー): ${selection.hero ?? "なし"}
- move(走り/斜め): ${selection.move ?? "なし"}
- interior(内装): ${selection.interior ?? "なし"}
- detail(ディテール): ${selection.detail ?? "なし"}
選定理由: ${selection.reasoning || "(記載なし)"}`
    : `# 写真(選定なし・ファイル名順): ${JSON.stringify(car.photos)}
先頭が外観ヒーローの想定で photoRef に使う。`;

  return `次の在庫1台で、format="${format}" / targetLayer="${layer}" の動画台本をJSONで作ってください。

# 在庫データ
${JSON.stringify(car, null, 2)}

${selectionNote}

# 注意
- 価格は「◯◯万円」のように自然な日本語で字幕・ナレに使う。
- ${layer === "A_seller" ? "買取(車を売りたい人)向け。査定・高く売るコツ・LINEで無料査定に誘導。20〜30秒。" : "在庫紹介(買いたい人)向け。ウォークアラウンド型: 価格フック→スペック→特徴→正直な一言→価格ドン→LINE誘導。15〜20秒。"}`;
}
