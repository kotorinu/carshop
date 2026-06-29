import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { VideoScriptSchema, paths, CONTENT_DIR } from "@app/shared";
import type { MangaInventoryProps } from "./remotion/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 設定(後で店舗情報に差し替え)
const SHOP_NAME = process.env.SHOP_NAME ?? "Jupiter Coring";
const AREA = process.env.SHOP_AREA ?? "大阪";
const LINE_URL = process.env.LINE_URL ?? "https://lin.ee/your-line-id";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video) {
    console.error("--video <videoId> を指定してください");
    process.exit(1);
  }
  const script = VideoScriptSchema.parse(
    JSON.parse(await readFile(paths.scriptJson(args.video), "utf8")),
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

  const inputProps: MangaInventoryProps = {
    script,
    carId: script.carId,
    imageByScene,
    clipByScene,
    qrSrc: qrRel,
    shopName: SHOP_NAME,
    area: AREA,
  };

  console.log("📦 Remotionをバンドル中…");
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, "remotion", "index.ts"),
    publicDir: CONTENT_DIR, // staticFile の基準を content/ に
  });

  const composition = await selectComposition({
    serveUrl,
    id: "MangaInventory",
    inputProps,
  });

  await mkdir(path.dirname(paths.renderMp4(args.video)), { recursive: true });
  const out = paths.renderMp4(args.video);
  console.log(`🎬 レンダリング中… (${composition.durationInFrames}フレーム)`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: out,
    inputProps,
  });
  console.log(`✅ 完成: ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
