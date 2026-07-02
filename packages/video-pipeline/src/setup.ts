/**
 * render.ts / still-frames.ts 共通のセットアップ:
 * 台本読込 → QR生成 → 写真/クリップ解決 → styleParams/carInfo → inputProps。
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { VideoScriptSchema, CarSchema, paths, CONTENT_DIR, type VideoScript } from "@app/shared";
import {
  DEFAULT_STYLE_PARAMS,
  type MangaInventoryProps,
  type StyleParams,
  type CarInfo,
} from "./remotion/types.js";
import { z } from "zod";

const SHOP_NAME = process.env.SHOP_NAME ?? "Jupiter Coring";
const AREA = process.env.SHOP_AREA ?? "大阪";
const LINE_URL = process.env.LINE_URL ?? "https://lin.ee/your-line-id";

/**
 * Chrome/Chromium の実行ファイル。指定が無いとRemotionが自前DLしようとして
 * ネット制限環境で落ちるため、既知のパスを自動検出する。
 */
export function findBrowser(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for (const p of [
    "/opt/pw-browsers/chromium", // このリモート実行環境(Playwright同梱)
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ]) {
    if (existsSync(p)) return p;
  }
  return undefined; // 見つからなければRemotionの自動解決に任せる
}

/** chrome-for-testing モード: 新ヘッドレスで起動する(通常のChromiumは旧headless非搭載) */
export const CHROME_MODE = "chrome-for-testing" as const;

/** style-params.json を読む(無ければデフォルト)。自己採点ループが書き換える */
export async function loadStyleParams(): Promise<StyleParams> {
  try {
    const raw = JSON.parse(await readFile(paths.styleParams, "utf8"));
    return { ...DEFAULT_STYLE_PARAMS, ...raw };
  } catch {
    return DEFAULT_STYLE_PARAMS;
  }
}

/** 上部スペックバー用の在庫情報を cars.json から作る */
async function loadCarInfo(carId: string): Promise<CarInfo | undefined> {
  try {
    const cars = z.array(CarSchema).parse(JSON.parse(await readFile(paths.carsJson, "utf8")));
    const car = cars.find((c) => c.id === carId);
    if (!car) return undefined;
    return {
      priceMan: `${Math.round(car.priceJpy / 10000)}万`,
      totalMan: car.totalPaymentJpy
        ? `${Math.round(car.totalPaymentJpy / 10000)}万`
        : undefined,
      year: car.year,
      mileageManKm: `${(car.mileageKm / 10000).toFixed(1)}万km`,
    };
  } catch {
    return undefined;
  }
}

/** videoId から Remotion の inputProps を組み立てる */
export async function buildInputProps(videoId: string): Promise<{
  script: VideoScript;
  inputProps: MangaInventoryProps;
}> {
  const script = VideoScriptSchema.parse(
    JSON.parse(await readFile(paths.scriptJson(videoId), "utf8")),
  );

  // LINE QR を content/visuals/_brand/ に生成(staticFileで参照)
  const qrRel = "visuals/_brand/line-qr.png";
  const qrAbs = path.join(CONTENT_DIR, qrRel);
  await mkdir(path.dirname(qrAbs), { recursive: true });
  await QRCode.toFile(qrAbs, LINE_URL, { width: 600, margin: 1 });

  // 実車写真の存在チェック(無ければプレースホルダ表示)
  const imageByScene: Record<number, string> = {};
  for (const scene of script.scenes) {
    if (scene.visualType === "carPhoto" && scene.photoRef) {
      const rel = path.posix.join("car-photos", script.carId, scene.photoRef);
      if (existsSync(path.join(CONTENT_DIR, rel))) imageByScene[scene.index] = rel;
    }
  }

  // Kling生成クリップの存在チェック(photos のファイル名 → .mp4 で探す)
  const clipByScene: Record<number, string> = {};
  const clipsDir = path.join(CONTENT_DIR, "clips", script.carId);
  if (existsSync(clipsDir)) {
    for (const scene of script.scenes) {
      if (scene.visualType === "carPhoto" && scene.photoRef) {
        const clipName = scene.photoRef.replace(/\.\w+$/, ".mp4");
        const rel = path.posix.join("clips", script.carId, clipName);
        if (existsSync(path.join(CONTENT_DIR, rel))) clipByScene[scene.index] = rel;
      }
    }
    if (Object.keys(clipByScene).length > 0) {
      console.log(`🎬 Klingクリップ ${Object.keys(clipByScene).length}本 を使用します`);
    }
  }

  // VOICEVOXナレーション(gen:tts が生成)があればシーンごとに合成する
  const audioByScene: Record<number, string> = {};
  const audioDir = path.join(CONTENT_DIR, "audio", videoId);
  if (existsSync(audioDir)) {
    for (const scene of script.scenes) {
      const wav = `scene-${String(scene.index).padStart(2, "0")}.wav`;
      if (existsSync(path.join(audioDir, wav))) {
        audioByScene[scene.index] = path.posix.join("audio", videoId, wav);
      }
    }
    if (Object.keys(audioByScene).length > 0) {
      console.log(`🔊 ナレーション音声 ${Object.keys(audioByScene).length}本 を合成します`);
    }
  }

  const inputProps: MangaInventoryProps = {
    script,
    carId: script.carId,
    imageByScene,
    clipByScene,
    audioByScene,
    qrSrc: qrRel,
    shopName: SHOP_NAME,
    area: AREA,
    carInfo: script.targetLayer === "B_buyer" ? await loadCarInfo(script.carId) : undefined,
    styleParams: await loadStyleParams(),
  };
  return { script, inputProps };
}
