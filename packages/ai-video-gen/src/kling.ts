/**
 * Kling AI image-to-video クライアント。
 * 実車写真1枚 → 5秒の滑らかな動き付き動画クリップを生成する。
 *
 * 必要な環境変数:
 *   KLING_ACCESS_KEY  — Kling APIコンソールの Access Key
 *   KLING_SECRET_KEY  — Kling APIコンソールの Secret Key
 *
 * API仕様: https://klingai.kuaishou.com/api
 */
import { createHmac } from "node:crypto";
import sharp from "sharp";

const KLING_API_BASE = "https://api.klingai.com";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72; // 最大6分待つ

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })));
  const signing = `${header}.${payload}`;
  const sig = base64url(createHmac("sha256", secretKey).update(signing).digest());
  return `${signing}.${sig}`;
}

function authHeaders(accessKey: string, secretKey: string) {
  return {
    "Authorization": `Bearer ${signJwt(accessKey, secretKey)}`,
    "Content-Type": "application/json",
  };
}

export interface KlingOptions {
  accessKey: string;
  secretKey: string;
  duration?: "5" | "10";
  mode?: "std" | "pro";
}

/**
 * 写真1枚から動画URLを生成して返す。
 * ダウンロードは呼び出し側で行う（URLは有効期限あり）。
 *
 * 送信前に9:16(1080×1920)へリフレームする。横写真のまま送ると4:3クリップが返り、
 * 縦画面で大幅クロップ(被写体切れ)になるため。attention crop で被写体を残す。
 */
export async function generateClipFromPhoto(
  imagePath: string,
  prompt: string,
  opts: KlingOptions,
): Promise<string> {
  const { accessKey, secretKey, duration = "5", mode = "std" } = opts;

  const imageData = await sharp(imagePath)
    .resize(1080, 1920, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const dataUrl = `data:image/jpeg;base64,${imageData.toString("base64")}`;

  // タスク作成
  const createRes = await fetch(`${KLING_API_BASE}/v1/videos/image2video`, {
    method: "POST",
    headers: authHeaders(accessKey, secretKey),
    body: JSON.stringify({
      model_name: "kling-v1",
      image: dataUrl,
      prompt,
      negative_prompt: "blur, distortion, low quality, watermark",
      cfg_scale: 0.5,
      mode,
      duration,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Kling API error ${createRes.status}: ${await createRes.text()}`);
  }
  const createData = await createRes.json() as { code: number; message: string; data: { task_id: string } };
  if (createData.code !== 0) {
    throw new Error(`Kling create failed: ${createData.message}`);
  }
  const taskId = createData.data.task_id;
  console.log(`  Kling task created: ${taskId}`);

  // ポーリングして完了待ち
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${KLING_API_BASE}/v1/videos/image2video/${taskId}`, {
      headers: authHeaders(accessKey, secretKey),
    });
    const pollData = await pollRes.json() as {
      code: number;
      data: {
        task_status: "submitted" | "processing" | "succeed" | "failed";
        task_result?: { videos: Array<{ url: string }> };
      };
    };

    const status = pollData.data?.task_status;
    process.stdout.write(`\r  状態: ${status} (${(i + 1) * 5}秒経過)`);

    if (status === "succeed") {
      console.log("");
      const url = pollData.data.task_result?.videos[0]?.url;
      if (!url) throw new Error("Kling: 動画URLが取得できませんでした");
      return url;
    }
    if (status === "failed") {
      throw new Error(`Kling task failed: ${JSON.stringify(pollData)}`);
    }
  }
  throw new Error("Kling: タスクが6分以内に完了しませんでした");
}

/** 動画URLをバイナリとして取得する */
export async function downloadClip(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
