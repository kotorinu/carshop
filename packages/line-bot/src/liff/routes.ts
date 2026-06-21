/**
 * LIFFフォーム(来店予約 / 買取査定)の配信とAPI。
 * - GET  /liff/booking    … 来店予約フォーム(HTML)。__LIFF_ID__ を環境変数で差し込む
 * - GET  /liff/appraisal  … 買取査定フォーム(HTML)
 * - POST /api/booking     … 予約を保存 + リードにタグ + オーナー通知
 * - POST /api/appraisal   … 査定依頼を保存 + リードにタグ + オーナー通知
 *
 * React/バンドラは使わず、LIFF公式SDK(CDN)+静的HTMLをこのHonoが配信する。
 * tsx直実行のため src 配下がそのまま実行パスになる(=public/ を実行時に読める)。
 */
import { Hono } from "hono";
import { messagingApi } from "@line/bot-sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BookingSubmissionSchema,
  AppraisalSubmissionSchema,
  type Submission,
} from "@app/shared";
import { getProfileFromAccessToken } from "./lineProfile.js";
import { addSubmission } from "../submissions.js";
import { upsertLead, addTag } from "../store.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
});

/** public/<file> を読み、__LIFF_ID__ を実際のLIFF IDに置換して返す */
function renderPage(file: string, liffId: string): string {
  const html = readFileSync(path.join(PUBLIC_DIR, file), "utf8");
  return html.replaceAll("__LIFF_ID__", liffId);
}

/** オーナーに新着リードをLINEで通知(未設定/失敗してもフォーム成功は妨げない) */
async function notifyOwner(text: string): Promise<void> {
  const ownerId = process.env.OWNER_LINE_USER_ID;
  if (!ownerId) {
    console.log("[owner通知 未設定]\n" + text);
    return;
  }
  try {
    await client.pushMessage({ to: ownerId, messages: [{ type: "text", text }] });
  } catch (e) {
    console.error("オーナー通知に失敗:", e);
  }
}

/** リクエストボディ用スキーマ(サーバー付与分を除いたフォーム入力のみ) */
const BookingBody = BookingSubmissionSchema.omit({
  type: true,
  lineUserId: true,
  displayName: true,
  createdAt: true,
});
const AppraisalBody = AppraisalSubmissionSchema.omit({
  type: true,
  lineUserId: true,
  displayName: true,
  createdAt: true,
});

export const liffRoutes = new Hono();

liffRoutes.get("/liff/booking", (c) =>
  c.html(renderPage("booking.html", process.env.LIFF_BOOKING_ID ?? "")),
);
liffRoutes.get("/liff/appraisal", (c) =>
  c.html(renderPage("appraisal.html", process.env.LIFF_APPRAISAL_ID ?? "")),
);

liffRoutes.post("/api/booking", async (c) => {
  const { token, ...fields } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const profile = await getProfileFromAccessToken(String(token ?? ""));
  if (!profile) return c.json({ ok: false, error: "認証に失敗しました" }, 401);

  const parsed = BookingBody.safeParse(fields);
  if (!parsed.success) return c.json({ ok: false, error: "入力に不備があります" }, 400);

  const submission: Submission = {
    type: "booking",
    lineUserId: profile.userId,
    displayName: profile.displayName,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };
  addSubmission(submission);
  upsertLead(profile.userId, { displayName: profile.displayName });
  addTag(profile.userId, "booking_requested");

  await notifyOwner(
    "🔔 来店予約が入りました\n" +
      `お名前: ${submission.name}\n` +
      `電話: ${submission.phone}\n` +
      `希望日時: ${submission.preferredDate} ${submission.preferredTime}\n` +
      `気になる車種: ${submission.carInterest || "-"}\n` +
      `ご要望: ${submission.note || "-"}\n` +
      `LINE名: ${profile.displayName}`,
  );
  return c.json({ ok: true });
});

liffRoutes.post("/api/appraisal", async (c) => {
  const { token, ...fields } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const profile = await getProfileFromAccessToken(String(token ?? ""));
  if (!profile) return c.json({ ok: false, error: "認証に失敗しました" }, 401);

  const parsed = AppraisalBody.safeParse(fields);
  if (!parsed.success) return c.json({ ok: false, error: "入力に不備があります" }, 400);

  const submission: Submission = {
    type: "appraisal",
    lineUserId: profile.userId,
    displayName: profile.displayName,
    createdAt: new Date().toISOString(),
    ...parsed.data,
  };
  addSubmission(submission);
  upsertLead(profile.userId, { displayName: profile.displayName });
  addTag(profile.userId, "buyback_inquiry");

  await notifyOwner(
    "🔔 買取査定の依頼が入りました\n" +
      `お名前: ${submission.name}\n` +
      `電話: ${submission.phone}\n` +
      `車種: ${submission.carName}\n` +
      `年式: ${submission.year}\n` +
      `走行: ${submission.mileageKm.toLocaleString()}km\n` +
      `状態/ご要望: ${submission.note || "-"}\n` +
      `LINE名: ${profile.displayName}`,
  );
  return c.json({ ok: true });
});
