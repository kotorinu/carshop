import { Hono } from "hono";
import { messagingApi, validateSignature, type WebhookEvent } from "@line/bot-sdk";
import { upsertLead, addTag } from "./store.js";
import { liffRoutes } from "./liff/routes.js";
import {
  welcomeMessages,
  appraisalMessages,
  inventoryMessages,
  bookingMessages,
  unsubscribedMessage,
  fallbackMessages,
  bookingReceivedMessages,
} from "./messages.js";

const OWNER_LINE_USER_ID = process.env.OWNER_LINE_USER_ID ?? "";

/** 新しいリード(来店希望など)をオーナーにLINE通知。未設定ならログのみ */
async function notifyOwner(text: string): Promise<void> {
  if (!OWNER_LINE_USER_ID) {
    console.log("[lead]", text);
    return;
  }
  try {
    await client.pushMessage({ to: OWNER_LINE_USER_ID, messages: [{ type: "text", text }] });
  } catch (err) {
    console.error("notifyOwner failed", err);
  }
}

const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

const client = new messagingApi.MessagingApiClient({ channelAccessToken });

export const app = new Hono();

app.get("/", (c) => c.text("line-bot ok"));

// LIFFフォーム(来店予約 / 買取査定): /liff/* と /api/*
app.route("/", liffRoutes);

app.post("/webhook", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("x-line-signature") ?? "";
  if (!channelSecret || !validateSignature(body, channelSecret, signature)) {
    return c.text("invalid signature", 401);
  }
  const events: WebhookEvent[] = JSON.parse(body).events ?? [];
  await Promise.all(events.map((e) => handleEvent(e).catch((err) => console.error(err))));
  return c.json({ ok: true });
});

async function reply(replyToken: string, messages: messagingApi.Message[]) {
  await client.replyMessage({ replyToken, messages });
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  // 友だち追加 = オプトイン(同意記録)+ ウェルカム
  if (event.type === "follow") {
    const userId = event.source.userId;
    if (userId) upsertLead(userId, { consentAt: new Date().toISOString(), stage: "welcomed" });
    await reply(event.replyToken, welcomeMessages());
    return;
  }

  // メニュー選択(postback)→ タグ付け + 分岐
  if (event.type === "postback") {
    const userId = event.source.userId;
    const data = new URLSearchParams(event.postback.data);
    const menu = data.get("menu");
    if (userId && menu === "appraisal") addTag(userId, "buyback_inquiry");
    if (userId && menu === "inventory") addTag(userId, "inventory_interested");
    if (menu === "appraisal") return reply(event.replyToken, appraisalMessages());
    if (menu === "inventory") return reply(event.replyToken, inventoryMessages());
    if (menu === "booking") return reply(event.replyToken, bookingMessages());
    return;
  }

  // テキスト → 配信停止/再開 + キーワード分岐 + フォールバック
  if (event.type === "message" && event.message.type === "text") {
    const userId = event.source.userId;
    const t = event.message.text.trim();
    if (userId && (t === "停止" || t === "配信停止")) {
      upsertLead(userId, { stage: "unsubscribed" });
      return reply(event.replyToken, unsubscribedMessage());
    }
    if (userId && t === "再開") {
      upsertLead(userId, { stage: "welcomed" });
      return reply(event.replyToken, welcomeMessages());
    }
    if (t.includes("査定")) {
      if (userId) addTag(userId, "buyback_inquiry");
      return reply(event.replyToken, appraisalMessages());
    }
    // 来店希望(予約カードの日時ボタン or 自由入力)→ 即時受付 + オーナー通知
    if (t.startsWith("来店希望")) {
      if (userId) {
        addTag(userId, "booking_requested");
        upsertLead(userId, { stage: "booking_requested" });
      }
      await notifyOwner(`🔔 来店予約リクエスト\n${t}\nLINE公式アカウントのチャットから確定連絡をしてください(30分以内目標)`);
      return reply(event.replyToken, bookingReceivedMessages(t));
    }
    // 自由文もリードの可能性が高いのでオーナーに転送
    await notifyOwner(`💬 お客様からメッセージ\n「${t}」\nチャットから返信してください(30分以内目標)`);
    return reply(event.replyToken, fallbackMessages());
  }
}
