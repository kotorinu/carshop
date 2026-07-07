// Kling AI (image-to-video) で走行クリップを自動生成する。
// 台本(content/scripts/<videoId>.json)の visualType:"videoClip" シーンを対象に、
// sourcePhoto(実車写真)+genPrompt を Kling に投げてクリップを生成し、
// content/car-clips/<carId>/<clipRef> に保存する。
//
//   node video/gen-clips.mjs <videoId>            # 未生成クリップだけ生成
//   node video/gen-clips.mjs <videoId> --force    # 既存クリップも上書き
//
// 認証: carshop/.env の KLING_API_KEY をそのまま Bearer トークンとして使う
// (JWT自前生成は不要な新方式。api-singapore.klingai.com で疎通確認済み)。
// 生成後は `npm run make:video -- <videoId>` で本編に合成する。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// .env はスクリプト位置基準で読む(どのcwdから実行しても効くように。scheduled-task対策)
dotenv.config({ path: path.join(ROOT, ".env") });
const CONTENT = path.join(ROOT, "content");

const API_KEY = process.env.KLING_API_KEY;
const API_BASE = process.env.KLING_API_BASE ?? "https://api-singapore.klingai.com";
const MODEL = process.env.KLING_MODEL ?? "kling-v1-6";
const MODE = process.env.KLING_MODE ?? "std"; // std=安い/速い, pro=高品質
const DURATION = process.env.KLING_DURATION ?? "5";

if (!API_KEY) {
  console.error("KLING_API_KEY が未設定です。carshop/.env に設定してください。");
  process.exit(1);
}

const HEADERS = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

function toBase64Image(filePath) {
  return fs.readFileSync(filePath).toString("base64");
}

async function submitJob(imagePath, prompt) {
  const body = {
    model_name: MODEL,
    image: toBase64Image(imagePath),
    prompt,
    mode: MODE,
    duration: DURATION,
  };
  const res = await fetch(`${API_BASE}/v1/videos/image2video`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error(`submit failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data.task_id;
}

async function pollJob(taskId, { onTick } = {}) {
  let delay = 3000;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 20000);
    const res = await fetch(`${API_BASE}/v1/videos/image2video/${taskId}`, { headers: HEADERS });
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(`poll failed: ${res.status} ${JSON.stringify(json)}`);
    const status = json.data.task_status;
    onTick?.(status, attempt);
    if (status === "succeed") return json.data.task_result.videos[0].url;
    if (status === "failed") throw new Error(`generation failed: ${json.data.task_status_msg ?? "unknown"}`);
  }
  throw new Error("polling timed out (3分待っても完了しませんでした)");
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const argv = process.argv.slice(2);
  const videoId = argv.find((a) => !a.startsWith("--"));
  const force = argv.includes("--force");
  if (!videoId) {
    console.error("使い方: node video/gen-clips.mjs <videoId> [--force]");
    process.exit(1);
  }

  const scriptPath = path.join(CONTENT, "scripts", `${videoId}.json`);
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const targets = script.scenes.filter((s) => s.visualType === "videoClip" && s.genPrompt && s.sourcePhoto && s.clipRef);
  if (!targets.length) {
    console.log("videoClip シーン(genPrompt/sourcePhoto/clipRef 付き)が見つかりません。");
    return;
  }

  const clipDir = path.join(CONTENT, "car-clips", script.carId);
  fs.mkdirSync(clipDir, { recursive: true });

  for (const scene of targets) {
    const destPath = path.join(clipDir, scene.clipRef);
    if (fs.existsSync(destPath) && !force) {
      console.log(`⏭  シーン${scene.index}: 既に生成済み (${scene.clipRef}) — スキップ (--force で再生成)`);
      continue;
    }
    const photoPath = path.join(CONTENT, "car-photos", script.carId, scene.sourcePhoto);
    if (!fs.existsSync(photoPath)) {
      console.warn(`⚠ シーン${scene.index}: 元写真が見つかりません (${photoPath}) — スキップ`);
      continue;
    }
    console.log(`▶ シーン${scene.index}: 生成開始 "${scene.genPrompt}"`);
    const taskId = await submitJob(photoPath, scene.genPrompt);
    console.log(`   task_id=${taskId} (数十秒〜数分かかります)`);
    const url = await pollJob(taskId, {
      onTick: (status, i) => console.log(`   [${i}] ${status}...`),
    });
    await downloadTo(url, destPath);
    console.log(`✅ シーン${scene.index}: 保存 → content/car-clips/${script.carId}/${scene.clipRef}`);
  }
  console.log(`\n次: npm run make:video -- ${videoId}`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
