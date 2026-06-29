/**
 * 実車写真 → Kling AI動画クリップ生成
 * 使い方: npm run gen:clips -- --car <carId>
 *
 * 出力: content/clips/<carId>/01.mp4, 02.mp4 ...
 * 環境変数: KLING_ACCESS_KEY, KLING_SECRET_KEY
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { paths, CONTENT_DIR } from "@app/shared";
import { generateClipFromPhoto, downloadClip } from "./kling.js";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

async function fileExists(p: string) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.car) {
    console.error("使い方: npm run gen:clips -- --car <carId>");
    process.exit(1);
  }

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    console.error("KLING_ACCESS_KEY と KLING_SECRET_KEY を .env に設定してください");
    process.exit(1);
  }

  // 在庫データから車情報取得
  const cars = JSON.parse(await readFile(paths.carsJson, "utf8")) as Array<{
    id: string; maker: string; model: string; color: string; photos: string[];
  }>;
  const car = cars.find((c) => c.id === args.car);
  if (!car) {
    console.error(`車が見つかりません: ${args.car}`);
    process.exit(1);
  }

  // order.json があれば写真順序を尊重する
  const orderFile = path.join(paths.carPhotosDir(car.id), "order.json");
  let photos = car.photos;
  if (await fileExists(orderFile)) {
    photos = JSON.parse(await readFile(orderFile, "utf8")) as string[];
  }

  const clipsDir = paths.carClipsDir(car.id);
  await mkdir(clipsDir, { recursive: true });

  console.log(`\n🎬 ${car.maker} ${car.model} のクリップを生成します（${photos.length}枚）\n`);

  for (const photo of photos) {
    const photoPath = path.join(paths.carPhotosDir(car.id), photo);
    const clipPath = paths.carClipFile(car.id, photo);

    if (await fileExists(clipPath)) {
      console.log(`✅ スキップ（生成済み）: ${photo}`);
      continue;
    }
    if (!(await fileExists(photoPath))) {
      console.log(`⚠️  写真が見つからないためスキップ: ${photo}`);
      continue;
    }

    const prompt = buildCarPrompt(car);
    console.log(`📸 生成中: ${photo}`);

    const videoUrl = await generateClipFromPhoto(photoPath, prompt, {
      accessKey,
      secretKey,
      duration: "5",
      mode: "std",
    });

    console.log(`  ダウンロード中...`);
    const buf = await downloadClip(videoUrl);
    await writeFile(clipPath, buf);
    console.log(`  ✅ 保存: ${path.relative(CONTENT_DIR, clipPath)}`);
  }

  console.log(`\n✅ 完了！ content/clips/${car.id}/ を確認してください`);
}

function buildCarPrompt(car: { maker: string; model: string; color: string }): string {
  return (
    `Cinematic car showcase, ${car.maker} ${car.model}, ${car.color}, ` +
    `smooth slow camera pan, professional automotive photography, ` +
    `dramatic lighting, showroom quality, ultra realistic, 4K`
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
