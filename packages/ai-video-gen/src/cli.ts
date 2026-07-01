/**
 * 実車写真 → Kling AI動画クリップ生成
 * 使い方: npm run gen:clips -- --car <carId>
 *
 * 写真は素材プール: selection.json(pick:photos の出力)があれば
 * **選定された3〜4枚だけ**をクリップ化する(コスト保護・1クリップ=数十円)。
 * 出力: content/clips/<carId>/01.mp4 など(写真名と対応)
 * 環境変数: KLING_ACCESS_KEY, KLING_SECRET_KEY
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import {
  paths,
  CONTENT_DIR,
  PhotoSelectionSchema,
  type PhotoSelection,
  type PhotoRole,
} from "@app/shared";
import { generateClipFromPhoto, downloadClip } from "./kling.js";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

async function fileExists(p: string) {
  try { await access(p); return true; } catch { return false; }
}

/** 役割別のカメラワーク指示(Klingプロンプト) */
function rolePrompt(role: PhotoRole, car: { maker: string; model: string; color?: string }): string {
  const base = `${car.maker} ${car.model}${car.color ? `, ${car.color}` : ""}, ultra realistic, professional automotive videography, 4K, no text, no watermark`;
  switch (role) {
    case "hero":
      return `Cinematic slow orbit around parked car, dramatic showroom lighting, ${base}`;
    case "move":
      return `Smooth lateral dolly shot along the car body, reflections moving across paint, ${base}`;
    case "interior":
      return `Slow pan across luxurious car interior, soft natural light through windows, ${base}`;
    case "detail":
      return `Macro slow zoom on car detail, shallow depth of field, premium feel, ${base}`;
  }
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
    id: string; maker: string; model: string; color?: string; photos: string[];
  }>;
  const car = cars.find((c) => c.id === args.car);
  if (!car) {
    console.error(`車が見つかりません: ${args.car}`);
    process.exit(1);
  }

  // selection.json(AI選定)があれば選定写真のみ。無ければ先頭4枚(コスト保護)
  let targets: Array<{ file: string; role: PhotoRole }>;
  if (await fileExists(paths.photoSelection(car.id))) {
    const sel: PhotoSelection = PhotoSelectionSchema.parse(
      JSON.parse(await readFile(paths.photoSelection(car.id), "utf8")),
    );
    const roles: PhotoRole[] = ["hero", "move", "interior", "detail"];
    const seen = new Set<string>();
    targets = [];
    for (const role of roles) {
      const f = sel[role];
      if (f && !seen.has(f)) {
        targets.push({ file: f, role });
        seen.add(f);
      }
    }
    console.log(`📋 selection.json の選定写真 ${targets.length}枚のみクリップ化(素材プール方式)`);
  } else {
    const roles: PhotoRole[] = ["hero", "move", "interior", "detail"];
    targets = car.photos.slice(0, 4).map((file, i) => ({ file, role: roles[i] ?? "detail" }));
    console.log("ℹ️  selection.json 無し → 先頭4枚を使用(pick:photos の実行を推奨)");
  }

  const clipsDir = paths.carClipsDir(car.id);
  await mkdir(clipsDir, { recursive: true });

  console.log(`\n🎬 ${car.maker} ${car.model} のクリップを生成します(${targets.length}本)\n`);

  for (const { file, role } of targets) {
    const photoPath = path.join(paths.carPhotosDir(car.id), file);
    const clipPath = paths.carClipFile(car.id, file);

    if (await fileExists(clipPath)) {
      console.log(`✅ スキップ(生成済み): ${file}`);
      continue;
    }
    if (!(await fileExists(photoPath))) {
      console.log(`⚠️  写真が見つからないためスキップ: ${file}`);
      continue;
    }

    console.log(`📸 生成中 [${role}]: ${file}`);
    const videoUrl = await generateClipFromPhoto(photoPath, rolePrompt(role, car), {
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

main().catch((e) => { console.error(e); process.exit(1); });
