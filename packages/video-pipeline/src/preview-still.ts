/**
 * オフライン静止プレビュー(Chrome不要)。
 * Remotion本番レンダの前に、台本から主要フレーム(フック/実車/エンドカード)を
 * sharpで近似描画して"絵の方向性"を素早く確認する用途。
 * 使い方: tsx packages/video-pipeline/src/preview-still.ts --video <videoId>
 *
 * スタイルは content/brand/style-params.json を反映(1080→540なので値は1/2)。
 */
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";
import { VideoScriptSchema, CarSchema, paths, CONTENT_DIR, type Scene } from "@app/shared";
import { DEFAULT_STYLE_PARAMS, type StyleParams } from "./remotion/types.js";
import { z } from "zod";

const W = 540;
const H = 960;
const JP = "'Noto Sans JP',IPAPGothic,'IPA Pゴシック',sans-serif";
const SHOP_NAME = process.env.SHOP_NAME ?? "Jupiter Coring";
const AREA = process.env.SHOP_AREA ?? "大阪";

const NUM_RE = /([0-9０-９][0-9０-９,.]*(?:万円|万km|万キロ|万|円|km|キロ|年式|年|％|%)?)/g;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 数字をゴールド、他を白で tspan 分割 */
function goldTspans(text: string): string {
  const parts = text.split(NUM_RE);
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? `<tspan fill="url(#gold)">${esc(part)}</tspan>`
        : `<tspan>${esc(part)}</tspan>`,
    )
    .join("");
}

function goldDef(p: StyleParams): string {
  return `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${p.gold.from}"/><stop offset="0.5" stop-color="${p.gold.mid}"/><stop offset="1" stop-color="${p.gold.to}"/>
  </linearGradient>`;
}

/** 暗幕グラデ(下側濃く) */
function overlayDef(p: StyleParams): string {
  return `<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="${p.darkOverlay.topOpacity}"/>
    <stop offset="0.38" stop-color="#000" stop-opacity="0.05"/>
    <stop offset="0.78" stop-color="#000" stop-opacity="${p.darkOverlay.bottomOpacity * 0.75}"/>
    <stop offset="1" stop-color="#000" stop-opacity="${p.darkOverlay.bottomOpacity}"/>
  </linearGradient>`;
}

/** 上部スペックバー */
function specBarSvg(p: StyleParams, info?: { priceMan: string; year: number; mileageManKm: string }): string {
  if (!info || !p.specBar.enabled) return "";
  const fs = p.specBar.fontSize / 2;
  const y = p.specBar.topPx / 2;
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${JP}" font-size="${fs}" font-weight="800" fill="#fff" stroke="rgba(0,0,0,0.85)" stroke-width="2" paint-order="stroke">¥${esc(info.priceMan)} ／ ${info.year}年式 ／ ${esc(info.mileageManKm)}</text>`;
}

/** 字幕(白+黒縁・数字ゴールド) */
function captionSvg(text: string, p: StyleParams) {
  const fs = p.caption.fontSize / 2;
  const y = H - H * (p.caption.bottomOffsetPct / 100);
  const boxW = W - 60;
  return `<g font-family="${JP}" font-size="${fs}" font-weight="900" text-anchor="middle">
    <rect x="30" y="${y - fs - 14}" width="${boxW}" height="${fs + 28}" rx="8" fill="#0C2340" fill-opacity="${p.caption.boxOpacity}"/>
    <text x="${W / 2}" y="${y}" fill="#fff" stroke="#0b1b30" stroke-width="${p.caption.strokeWidth / 2}" paint-order="stroke">${goldTspans(text)}</text>
  </g>`;
}

/** フック(0〜2秒・極太・数字ゴールド) */
function hookSvg(text: string, p: StyleParams) {
  const fs = p.hook.fontSize / 2;
  const y = H * (p.hook.topOffsetPct / 100) + fs;
  // 長いフックは2行に割る。数字の直前で割れると自然(「このレクサスが / 598万円」)
  let lines = [text];
  if (text.length > 9) {
    const numMatch = text.match(NUM_RE);
    const numStart = numMatch ? text.indexOf(numMatch[0]) : -1;
    const split = numStart >= 3 && numStart <= text.length - 2 ? numStart : Math.ceil(text.length / 2);
    lines = [text.slice(0, split), text.slice(split)];
  }
  return `<g font-family="${JP}" font-size="${fs}" font-weight="900" text-anchor="middle" stroke="#0b1b30" stroke-width="5" paint-order="stroke" fill="#fff">
    ${lines.map((ln, i) => `<text x="${W / 2}" y="${y + i * (fs * 1.3)}">${goldTspans(ln)}</text>`).join("")}
  </g>`;
}

/** 実車写真を背景に埋める(写真があれば) */
async function photoBgDataUri(carId: string, photoRef?: string): Promise<string | null> {
  if (!photoRef) return null;
  const p = path.join(CONTENT_DIR, "car-photos", carId, photoRef);
  if (!existsSync(p)) return null;
  const buf = await sharp(p).resize(W, H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function frameSvg(
  scene: Scene,
  opts: {
    isLast: boolean;
    isFirst: boolean;
    hookText: string;
    cta: string;
    p: StyleParams;
    carId: string;
    specInfo?: { priceMan: string; year: number; mileageManKm: string };
  },
): Promise<string> {
  const { isLast, isFirst, hookText, cta, p, specInfo } = opts;
  if (isLast) {
    const qrSize = p.endCard.qrSizePx / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>${goldDef(p)}<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0E2E55"/><stop offset="1" stop-color="#0A1E3C"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <text x="${W / 2}" y="250" text-anchor="middle" font-family="${JP}" font-size="24" fill="#9FC2F2">${esc(AREA)}・中古車</text>
      <text x="${W / 2}" y="305" text-anchor="middle" font-family="${JP}" font-size="${p.endCard.shopNameFontSize / 2}" font-weight="900" fill="#fff">${esc(SHOP_NAME)}</text>
      <rect x="${W / 2 - qrSize / 2 - 6}" y="${360 - 6}" width="${qrSize + 12}" height="${qrSize + 12}" rx="12" fill="#fff"/>
      <rect x="${W / 2 - 160}" y="${370 + qrSize + 20}" width="320" height="52" rx="26" fill="#1A6FE0"/>
      <text x="${W / 2}" y="${370 + qrSize + 55}" text-anchor="middle" font-family="${JP}" font-size="26" font-weight="900" fill="#fff">${esc(cta)}</text>
      <text x="${W / 2}" y="${370 + qrSize + 105}" text-anchor="middle" font-family="${JP}" font-size="20" fill="#cfe0f5">プロフィールのLINEから</text>
    </svg>`;
  }

  const bg = await photoBgDataUri(opts.carId, scene.photoRef);
  const bgSvg = bg
    ? `<image href="${bg}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
    : scene.visualType === "carPhoto"
      ? `<rect width="${W}" height="${H}" fill="url(#navy)"/>
         <text x="${W / 2}" y="300" text-anchor="middle" font-family="${JP}" font-size="34" font-weight="700" fill="#5b7aa8">実車写真</text>
         <text x="${W / 2}" y="346" text-anchor="middle" font-family="${JP}" font-size="22" fill="#39507a">${esc(scene.photoRef ?? "")}</text>`
      : `<rect width="${W}" height="${H}" fill="url(#navy)"/>`;

  const overlay = bg ? `<rect width="${W}" height="${H}" fill="url(#dark)"/>` : "";
  // 長い価格テキストは画面幅に収まるよう自動縮小(Remotion側と同じロジック)
  const prShrink = Math.max(0.55, Math.min(1, 8.5 / Math.max(1, scene.caption.length)));
  const priceRevealSvg = scene.priceReveal
    ? `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="${JP}" font-size="${Math.round((opts.p.priceReveal.fontSize / 2) * prShrink)}" font-weight="900" stroke="#0b1b30" stroke-width="6" paint-order="stroke" fill="#fff">${goldTspans(scene.caption)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>${goldDef(p)}${overlayDef(p)}
      <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12335f"/><stop offset="1" stop-color="#071528"/></linearGradient>
    </defs>
    ${bgSvg}
    ${overlay}
    ${specBarSvg(p, specInfo)}
    ${scene.priceReveal ? priceRevealSvg : isFirst ? hookSvg(hookText, p) : captionSvg(scene.caption, p)}
  </svg>`;
}

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video) { console.error("--video <videoId> を指定"); process.exit(1); }
  const script = VideoScriptSchema.parse(JSON.parse(await readFile(paths.scriptJson(args.video), "utf8")));

  let p: StyleParams = DEFAULT_STYLE_PARAMS;
  try {
    p = { ...DEFAULT_STYLE_PARAMS, ...JSON.parse(await readFile(paths.styleParams, "utf8")) };
  } catch { /* デフォルトで続行 */ }

  // 上部スペックバー(在庫系のみ)
  let specInfo: { priceMan: string; year: number; mileageManKm: string } | undefined;
  if (script.targetLayer === "B_buyer") {
    try {
      const cars = z.array(CarSchema).parse(JSON.parse(await readFile(paths.carsJson, "utf8")));
      const car = cars.find((c) => c.id === script.carId);
      if (car) {
        specInfo = {
          priceMan: `${Math.round(car.priceJpy / 10000)}万`,
          year: car.year,
          mileageManKm: `${(car.mileageKm / 10000).toFixed(1)}万km`,
        };
      }
    } catch { /* 無くても続行 */ }
  }

  // 主要3フレーム: フック / 価格リビール(無ければ実車) / エンドカード
  const hook = script.scenes[0];
  const midScene =
    script.scenes.find((s) => s.priceReveal) ??
    script.scenes.slice(1).find((s) => s.visualType === "carPhoto") ??
    script.scenes[1];
  const last = script.scenes[script.scenes.length - 1];

  const common = { hookText: script.hookText, cta: script.cta, p, carId: script.carId, specInfo };
  const svgs = await Promise.all([
    frameSvg(hook, { ...common, isFirst: true, isLast: false }),
    frameSvg(midScene, { ...common, isFirst: false, isLast: false }),
    frameSvg(last, { ...common, isFirst: false, isLast: true }),
  ]);
  const frames = await Promise.all(svgs.map((s) => sharp(Buffer.from(s)).png().toBuffer()));

  // エンドカードにQRを合成
  const qrSize = Math.round(p.endCard.qrSizePx / 2);
  const qrBuf = await QRCode.toBuffer(process.env.LINE_URL ?? "https://lin.ee/your-line-id", { width: qrSize, margin: 1 });
  frames[2] = await sharp(frames[2]).composite([{ input: qrBuf, left: Math.round(W / 2 - qrSize / 2), top: 360 }]).png().toBuffer();

  const pad = 40, gap = 24;
  const stripW = W * 3 + gap * 2 + pad * 2;
  const stripH = H + pad * 2;
  const out = path.join(CONTENT_DIR, "renders", `${args.video}.preview.png`);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp({ create: { width: stripW, height: stripH, channels: 3, background: "#d7dce3" } })
    .composite([
      { input: frames[0], left: pad, top: pad },
      { input: frames[1], left: pad + W + gap, top: pad },
      { input: frames[2], left: pad + (W + gap) * 2, top: pad },
    ])
    .png()
    .toFile(out);
  console.log(`✅ プレビュー: ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
