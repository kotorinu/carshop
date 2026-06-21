import type { messagingApi } from "@line/bot-sdk";

const LIFF_BOOKING = process.env.LIFF_BOOKING_URL ?? "https://liff.line.me/xxxx-booking";
const LIFF_APPRAISAL = process.env.LIFF_APPRAISAL_URL ?? "https://liff.line.me/xxxx-appraisal";

/** 3メニューのクイックリプライ付きウェルカム */
export function welcomeMessages(): messagingApi.Message[] {
  return [
    {
      type: "text",
      text: "友だち追加ありがとうございます！大阪の外車専門店です🚗\n\n下のメニューからお選びください。配信停止はいつでも「停止」と送ってください。",
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "無料査定", data: "menu=appraisal", displayText: "無料査定をしたい" } },
          { type: "action", action: { type: "postback", label: "在庫を見る", data: "menu=inventory", displayText: "在庫を見たい" } },
          { type: "action", action: { type: "postback", label: "来店予約", data: "menu=booking", displayText: "来店予約したい" } },
        ],
      },
    },
  ];
}

export function appraisalMessages(): messagingApi.Message[] {
  return [
    { type: "text", text: `愛車の無料査定はこちらのフォームから30秒で完了します。\n${LIFF_APPRAISAL}\n\n車種・年式・走行距離・お写真を送っていただくと、より正確にご案内できます。` },
  ];
}

export function inventoryMessages(): messagingApi.Message[] {
  return [
    { type: "text", text: "最新の在庫をご案内します。気になる車種があればお気軽に返信ください。来店予約もLINEから可能です。" },
  ];
}

export function bookingMessages(): messagingApi.Message[] {
  return [
    { type: "text", text: `来店予約はこちらから（30秒）。\n${LIFF_BOOKING}\n\nご希望日時を選ぶと確定メッセージをお送りします。前日にリマインドもします。` },
  ];
}

export function unsubscribedMessage(): messagingApi.Message[] {
  return [{ type: "text", text: "配信を停止しました。再開したいときは「再開」と送ってください。" }];
}

export function fallbackMessages(): messagingApi.Message[] {
  return welcomeMessages();
}
