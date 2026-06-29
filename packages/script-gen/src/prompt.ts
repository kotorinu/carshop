import type { Car, VideoFormat, TargetLayer } from "@app/shared";

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
- 動画は 25〜40秒、9:16。完了率70%+を狙う構成。
- scenes は秒単位タイムライン。各シーンに start/end 秒、ナレ、字幕(1行4〜6語)、visualType を必ず付ける。
- 実車写真(visualType:"carPhoto")を**2〜3シーン**入れ、photoRef に与えられた写真ファイル名を使う。
- 最初のシーン(0〜1秒)は強いフック。hookType を選び hookText を入れる。
- ハッシュタグは3〜5個。CTAはLINE誘導。

# 出力JSONの形(キーと型)
{
  "format": "manga-inventory" | "story-sell" | "owner-talk",
  "targetLayer": "A_seller" | "B_buyer",
  "hookType": "contrarian"|"mistake_warning"|"open_loop"|"confession"|"identity_call"|"question"|"pattern_interrupt"|"list_tease",
  "hookText": string,
  "scenes": [
    { "index": number, "startSec": number, "endSec": number,
      "narration": string, "caption": string,
      "visualType": "manga"|"carPhoto"|"ownerFace",
      "photoRef": string(任意), "visualPrompt": string(mangaの時),
      "interrupt": "zoom"|"cut"|"textPop"|"sfx"|"colorShift"(任意), "sfx": string(任意) }
  ],
  "cta": string,
  "hashtags": [string],
  "trendingSoundNote": string,
  "estimatedDurationSec": number
}`;
}

export function buildUserPrompt(
  car: Car,
  format: VideoFormat,
  layer: TargetLayer,
): string {
  return `次の在庫1台で、format="${format}" / targetLayer="${layer}" の動画台本をJSONで作ってください。

# 在庫データ
${JSON.stringify(car, null, 2)}

# 注意
- 価格は「◯◯万円」のように自然な日本語で字幕・ナレに使う。
- 利用可能な実車写真ファイル名: ${JSON.stringify(car.photos)} を photoRef に使う。
- ${layer === "A_seller" ? "買取(車を売りたい人)向け。査定・高く売るコツ・LINEで無料査定に誘導。" : "在庫紹介(買いたい人)向け。コスパ・装備・他店比較・来店/在庫確認に誘導。"}`;
}
