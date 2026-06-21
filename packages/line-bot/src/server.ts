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
} from "./messages.js";

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
    return reply(event.replyToken, fallbackMessages());
  }
}
