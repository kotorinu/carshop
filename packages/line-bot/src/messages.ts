import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { messagingApi } from "@line/bot-sdk";

const LIFF_BOOKING = process.env.LIFF_BOOKING_URL ?? "";
const LIFF_APPRAISAL = process.env.LIFF_APPRAISAL_URL ?? "";

const SHOP = {
  name: "カーショップJupiterCoring",
  area: "大阪・寝屋川の中古車販売・買取",
  address: "寝屋川市黒原橘町4-1",
  hours: "9:00〜19:00(木曜定休)",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("大阪府寝屋川市黒原橘町4-1"),
  heroImage: "https://ccsrpcma.carsensor.net/CSphoto/bkkn/488/221/U00052488221/U00052488221_002L.JPG",
  gold: "#E8B84B",
  navy: "#0E2A47",
};

// 在庫(content/inventory/cars.json)。起動時に読み込み。
type Car = {
  id: string;
  maker: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
  priceJpy: number | null;
  heroImageUrl?: string;
  detailUrl?: string;
  inspection?: string | null;
};

function loadCars(): Car[] {
  try {
    const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/inventory/cars.json");
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}
const CARS = loadCars();

const yen = (n: number) => (n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
const km = (n: number) => (n / 10000).toFixed(1) + "万km";

function menuButton(label: string, menu: string, displayText: string, primary = false): messagingApi.FlexButton {
  return {
    type: "button",
    style: primary ? "primary" : "secondary",
    color: primary ? SHOP.navy : undefined,
    height: "sm",
    action: { type: "postback", label, data: `menu=${menu}`, displayText },
  };
}

/** 友だち追加時のあいさつ(Flexカード+クイックリプライ) */
export function welcomeMessages(): messagingApi.Message[] {
  return [
    {
      type: "flex",
      altText: `友だち追加ありがとうございます！${SHOP.name}です`,
      contents: {
        type: "bubble",
        hero: { type: "image", url: SHOP.heroImage, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
        body: {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            { type: "text", text: "友だち追加ありがとうございます!", weight: "bold", size: "md", wrap: true },
            { type: "text", text: SHOP.name, weight: "bold", size: "xl", wrap: true },
            { type: "text", text: SHOP.area, size: "sm", color: "#8b91a0", wrap: true },
            {
              type: "box", layout: "vertical", margin: "md", spacing: "xs",
              contents: [
                { type: "text", text: "🚗 全車 支払総額表示・法定整備付き・保証付き", size: "xs", color: "#555555", wrap: true },
                { type: "text", text: "💰 他店で0円と言われた車も査定します", size: "xs", color: "#555555", wrap: true },
              ],
            },
          ],
        },
        footer: {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            menuButton("🚙 在庫をみる", "inventory", "在庫を見たい", true),
            menuButton("💰 無料査定(30秒)", "appraisal", "無料査定をしたい"),
            menuButton("📅 来店予約", "booking", "来店予約したい"),
            { type: "text", text: "配信停止は「停止」と送ってください", size: "xxs", color: "#aaaaaa", align: "center", margin: "sm" },
          ],
        },
      },
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

function carBubble(car: Car): messagingApi.FlexBubble {
  const rows: messagingApi.FlexComponent[] = [];
  if (car.year) rows.push({ type: "text", text: `${car.year}年式`, size: "sm", color: "#555555" });
  if (car.mileageKm != null) rows.push({ type: "text", text: `走行 ${km(car.mileageKm)}`, size: "sm", color: "#555555" });
  if (car.inspection) rows.push({ type: "text", text: car.inspection, size: "sm", color: "#555555" });
  return {
    type: "bubble",
    size: "kilo",
    hero: car.heroImageUrl
      ? { type: "image", url: car.heroImageUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" }
      : undefined,
    body: {
      type: "box", layout: "vertical", spacing: "xs",
      contents: [
        { type: "text", text: `${car.maker} ${car.model}`, weight: "bold", size: "md", wrap: true },
        { type: "box", layout: "horizontal", spacing: "md", contents: rows },
        car.priceJpy != null
          ? { type: "text", text: `支払総額 ${yen(car.priceJpy)}`, weight: "bold", size: "lg", color: "#B7791F", margin: "sm" }
          : { type: "text", text: "価格はお問い合わせください", size: "sm", margin: "sm" },
      ],
    },
    footer: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        {
          type: "button", style: "primary", color: SHOP.navy, height: "sm",
          action: { type: "postback", label: "この車について聞く", data: "menu=booking", displayText: `${car.maker} ${car.model}について聞きたい` },
        },
        ...(car.detailUrl
          ? [{
              type: "button" as const, style: "link" as const, height: "sm" as const,
              action: { type: "uri" as const, label: "詳細写真をみる", uri: car.detailUrl },
            }]
          : []),
      ],
    },
  };
}

/** 在庫案内(実在庫のFlexカルーセル) */
export function inventoryMessages(): messagingApi.Message[] {
  const cars = CARS.filter((c) => c.heroImageUrl).slice(0, 10);
  if (!cars.length) {
    return [{ type: "text", text: "最新の在庫をご案内します。気になる車種があればお気軽に返信ください。" }];
  }
  return [
    { type: "text", text: "現在の在庫からピックアップしてご紹介します🚗" },
    {
      type: "flex",
      altText: "在庫のご案内",
      contents: { type: "carousel", contents: cars.map(carBubble) },
    },
    { type: "text", text: "「◯◯みたいな車を探してる」という探し方でもOKです。お気軽にどうぞ!" },
  ];
}

/** 無料査定の案内 */
export function appraisalMessages(): messagingApi.Message[] {
  return [
    {
      type: "flex",
      altText: "無料査定のご案内",
      contents: {
        type: "bubble",
        body: {
          type: "box", layout: "vertical", spacing: "md",
          contents: [
            { type: "text", text: "💰 無料査定", weight: "bold", size: "xl" },
            { type: "text", text: "他店で0円と言われた車も、まず見せてください。自社販売だから中間マージンを乗せません。", size: "sm", wrap: true, color: "#555555" },
            { type: "separator" },
            { type: "text", text: "このトークに送るだけ👇", weight: "bold", size: "md" },
            {
              type: "box", layout: "vertical", spacing: "xs",
              contents: [
                { type: "text", text: "1️⃣ 車種と年式(例: プリウス 2015年)", size: "sm", wrap: true },
                { type: "text", text: "2️⃣ おおよその走行距離", size: "sm", wrap: true },
                { type: "text", text: "3️⃣ 車の写真3枚(前・後ろ・メーター)", size: "sm", wrap: true },
              ],
            },
            { type: "text", text: "当日中に概算をお返しします。出張査定もOKです。", size: "xs", color: "#8b91a0", wrap: true },
          ],
        },
        ...(LIFF_APPRAISAL
          ? {
              footer: {
                type: "box" as const, layout: "vertical" as const,
                contents: [{
                  type: "button" as const, style: "primary" as const, color: SHOP.navy,
                  action: { type: "uri" as const, label: "査定フォーム(30秒)", uri: LIFF_APPRAISAL },
                }],
              },
            }
          : {}),
      },
    },
  ];
}

/** 来店予約の案内 */
export function bookingMessages(): messagingApi.Message[] {
  return [
    {
      type: "flex",
      altText: "来店予約のご案内",
      contents: {
        type: "bubble",
        body: {
          type: "box", layout: "vertical", spacing: "md",
          contents: [
            { type: "text", text: "📅 来店予約", weight: "bold", size: "xl" },
            { type: "text", text: "現車確認大歓迎です。ご希望の日にちと時間帯をこのトークに送ってください(例:「土曜の午前」)。折り返し確定のご連絡をします。", size: "sm", wrap: true, color: "#555555" },
            { type: "separator" },
            { type: "text", text: `🏠 ${SHOP.address}`, size: "sm", wrap: true },
            { type: "text", text: `🕘 ${SHOP.hours}`, size: "sm", wrap: true },
          ],
        },
        footer: {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            ...(LIFF_BOOKING
              ? [{
                  type: "button" as const, style: "primary" as const, color: SHOP.navy, height: "sm" as const,
                  action: { type: "uri" as const, label: "予約フォーム(30秒)", uri: LIFF_BOOKING },
                }]
              : []),
            {
              type: "button", style: "link", height: "sm",
              action: { type: "uri", label: "🗺 地図をひらく", uri: SHOP.mapUrl },
            },
          ],
        },
      },
    },
  ];
}

export function unsubscribedMessage(): messagingApi.Message[] {
  return [{ type: "text", text: "配信を停止しました。再開したいときは「再開」と送ってください。" }];
}

export function fallbackMessages(): messagingApi.Message[] {
  return welcomeMessages();
}
