/**
 * AI写真選定: 素材プール(content/car-photos/<id>/)から役割別ベストを選ぶ。
 * 写真は全部使わない — hero/move/interior/detail の4役割+ランキングを出す。
 *
 * 使い方: npm run pick:photos -- --car <carId>
 * 出力:
 *   content/car-photos/<carId>/selection.json (役割別選定・理由)
 *   content/car-photos/<carId>/order.json    (良い順の全ランキング)
 *
 * ANTHROPIC_API_KEY が無い場合はファイル名順のフォールバックを書く。
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { paths, PhotoSelectionSchema, type PhotoSelection } from "@app/shared";

const MODEL = process.env.PICK_PHOTOS_MODEL ?? "claude-haiku-4-5-20251001";
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

async function listPhotos(carId: string): Promise<string[]> {
  const dir = paths.carPhotosDir(carId);
  const files = await readdir(dir);
  return files.filter((f) => PHOTO_EXT.test(f)).sort();
}

/** 判定用に縮小したJPEGのbase64を作る(トークン節約) */
async function thumbBase64(carId: string, file: string): Promise<string> {
  const buf = await sharp(path.join(paths.carPhotosDir(carId), file))
    .resize(640, 640, { fit: "inside" })
    .jpeg({ quality: 70 })
    .toBuffer();
  return buf.toString("base64");
}

/** キー無しフォールバック: ファイル名順に役割を割り当てる */
function fallbackSelection(photos: string[]): PhotoSelection {
  return PhotoSelectionSchema.parse({
    hero: photos[0],
    move: photos[1] ?? photos[0],
    interior: photos[2] ?? photos[0],
    detail: photos[3] ?? photos[0],
    ranked: photos,
    reasoning: "APIキー無しのためファイル名順で割り当て(pick:photos を再実行で改善)",
    createdAt: new Date().toISOString(),
  });
}

async function pickViaApi(carId: string, photos: string[]): Promise<PhotoSelection> {
  const client = new Anthropic();

  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const f of photos) {
    imageBlocks.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: await thumbBase64(carId, f) },
    });
  }

  const prompt = `あなたは中古車TikTok動画の映像ディレクターです。
上の${photos.length}枚は同じ車の写真で、順番にファイル名は ${JSON.stringify(photos)} です。

TikTok縦動画(9:16)で「バズるウォークアラウンド型 車両紹介」を作るため、役割別にベストな写真を選んでください:
- hero: フック(0〜2秒)用。正面/斜め前の外観で一番カッコよく写っているもの。明るく背景がきれいなもの
- move: 動きを感じる斜めアングル/サイド。heroと違うアングル
- interior: 内装で一番魅力的なもの(シート/コックピット)
- detail: ホイール/ライト/エンブレム等の「寄り」で質感が出るもの

避けるべき: メーター単体・書類・ピンボケ・暗い・ナンバーが大写し。
9:16に切り抜かれるため、被写体が中央にあるものが有利。

JSONのみで回答:
{"hero": "ファイル名", "move": "ファイル名", "interior": "ファイル名", "detail": "ファイル名", "ranked": [全ファイル名を良い順に], "reasoning": "選定理由を2〜3文で"}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const raw = JSON.parse(text.slice(start, end + 1));

  // 実在ファイルのみ許可(モデルの捏造ファイル名対策)
  const valid = (f: unknown): string | undefined =>
    typeof f === "string" && photos.includes(f) ? f : undefined;
  return PhotoSelectionSchema.parse({
    hero: valid(raw.hero) ?? photos[0],
    move: valid(raw.move) ?? photos[1] ?? photos[0],
    interior: valid(raw.interior) ?? photos[2] ?? photos[0],
    detail: valid(raw.detail) ?? photos[3] ?? photos[0],
    ranked: Array.isArray(raw.ranked) ? raw.ranked.filter((f: unknown) => valid(f)) : photos,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    createdAt: new Date().toISOString(),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.car) {
    console.error("使い方: npm run pick:photos -- --car <carId>");
    process.exit(1);
  }

  const photos = await listPhotos(args.car);
  if (photos.length === 0) {
    console.error(`写真がありません: ${paths.carPhotosDir(args.car)}/ に .jpg を置いてください`);
    process.exit(1);
  }
  console.log(`📸 ${photos.length}枚から役割別ベストを選定します(素材プール方式・全部は使いません)`);

  let selection: PhotoSelection;
  if (process.env.ANTHROPIC_API_KEY) {
    selection = await pickViaApi(args.car, photos);
    console.log(`🤖 AI選定完了: ${selection.reasoning}`);
  } else {
    selection = fallbackSelection(photos);
    console.log("ℹ️  APIキー無し → ファイル名順フォールバック(キー設定後に再実行推奨)");
  }

  await writeFile(paths.photoSelection(args.car), JSON.stringify(selection, null, 2), "utf8");
  await writeFile(
    path.join(paths.carPhotosDir(args.car), "order.json"),
    JSON.stringify(selection.ranked, null, 2),
    "utf8",
  );
  console.log(`✅ hero=${selection.hero} / move=${selection.move} / interior=${selection.interior} / detail=${selection.detail}`);
  console.log(`✅ 保存: selection.json, order.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
