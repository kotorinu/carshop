import type { messagingApi } from "@line/bot-sdk";
import type { Lead } from "@app/shared";

/**
 * ステップ配信(育成)定義。Day0〜7の5通。
 * scheduler.ts が「友だち追加からの経過日数」と「送信済みステップ」を見て送る。
 * 無料枠(月200通)を守るため通数は絞る。
 */
export interface Step {
  id: string;
  day: number; // 友だち追加からの経過日数
  build: (lead: Lead) => messagingApi.Message[];
}

const text = (t: string): messagingApi.Message[] => [{ type: "text", text: t }];

export const STEPS: Step[] = [
  {
    id: "d0-welcome",
    day: 0,
    build: () =>
      text(
        "【1/5】当店は大阪の外車専門店です。\n媒体に頼らず、SNSで「本当にいい一台」と「高く売りたい方」を直接つないでいます。買取も販売もお任せください。",
      ),
  },
  {
    id: "d1-inventory",
    day: 1,
    build: () =>
      text(
        "【2/5】今週の注目在庫を3台ピックアップ。\n気になる車種があれば返信で「車種名」を送ってください。来店予約もLINEから可能です。",
      ),
  },
  {
    id: "d3-buyback",
    day: 3,
    build: () =>
      text(
        "【3/5】外車を高く売るコツ。\n①下取りより専門店査定 ②記録簿・整備歴を揃える ③相場を知ってから出す。\nLINEなら無料で査定シミュレーションができます。",
      ),
  },
  {
    id: "d5-proof",
    day: 5,
    build: () =>
      text(
        "【4/5】お客様の声・納車事例をご紹介。\n初めての外車も、維持の本音まで正直にご案内します。今だけ来店予約で点検サービス付き。",
      ),
  },
  {
    id: "d7-offer",
    day: 7,
    build: () =>
      text(
        "【5/5】期間限定の買取アップキャンペーン中。\n「査定」と送っていただくか、メニューの無料査定からどうぞ。最後までお読みいただきありがとうございます！",
      ),
  },
];
