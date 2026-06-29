/**
 * オフライン静止プレビュー(Chrome不要)。
 * Remotion本番レンダの前に、台本から主要フレーム(フック/実車/エンドカード)を
 * sharpで近似描画して"絵の方向性"を素早く確認する用途。
 * 使い方: tsx packages/video-pipeline/src/preview-still.ts --video <videoId>
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";
import { VideoScriptSchema, paths, CONTENT_DIR, type Scene } from "@app/shared";

const W = 540;
const H = 960;
const JP = "IPAPGothic,'IPA Pゴシック',sans-serif";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 下三分の一の字幕(白文字+黒縁) */
function captionSvg(text: string) {
  return `<g font-family="${JP}" font-size="34" font-weight="900" text-anchor="middle">
    <rect x="40" y="600" width="${W - 80}" height="84" rx="12" fill="#0C2340" fill-opacity="0.55"/>
    <text x="${W / 2}" y="654" fill="#fff" stroke="#0b1b30" stroke-width="6" paint-order="stroke">${esc(text)}</text>
  </g>`;
}

function frameSvg(scene: Scene, isLast: boolean): string {
  if (isLast) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0E2E55"/><stop offset="1" stop-color="#0A1E3C"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <text x="${W / 2}" y="250" text-anchor="middle" font-family="${JP}" font-size="24" fill="#9FC2F2">大阪・中古車</text>
      <text x="${W / 2}" y="300" text-anchor="middle" font-family="${JP}" font-size="40" font-weight="900" fill="#fff">${process.env.SHOP_NAME ?? "Jupiter Coring"}</text>
      <rect x="${W / 2 - 95}" y="360" width="190" height="190" rx="14" fill="#fff"/>
      <text x="${W / 2}" y="640" text-anchor="middle" font-family="${JP}" font-size="30" font-weight="900" fill="#fff">
        <tspan>　${esc("LINEで無料査定")}　</tspan></text>
      <rect x="${W / 2 - 150}" y="610" width="300" height="46" rx="23" fill="#1A6FE0" opacity="0.0"/>
      <text x="${W / 2}" y="710" text-anchor="middle" font-family="${JP}" font-size="22" fill="#cfe0f5">プロフィールのLINEから</text>
    </svg>`;
  }
  if (scene.visualType === "carPhoto") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1b2b44"/><stop offset="1" stop-color="#0a1830"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <text x="${W / 2}" y="300" text-anchor="middle" font-family="${JP}" font-size="34" font-weight="700" fill="#5b7aa8">実車写真</text>
      <text x="${W / 2}" y="346" text-anchor="middle" font-family="${JP}" font-size="22" fill="#39507a">${esc(scene.photoRef ?? "")}</text>
      ${captionSvg(scene.caption)}
    </svg>`;
  }
  // manga
  const palettes = [["#fff4d6", "#ffd98a"], ["#dbeafe", "#93c5fd"], ["#ffe1e1", "#ffb3b3"]];
  const [a, b] = palettes[scene.index % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.6" fill="rgba(0,0,0,0.10)"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#dots)"/>
    <rect x="13" y="13" width="${W - 26}" height="${H - 26}" fill="none" stroke="#111" stroke-width="8" rx="6"/>
    ${scene.sfx ? `<text x="${W / 2}" y="300" text-anchor="middle" font-family="${JP}" font-size="64" font-weight="900" fill="#ffd400" stroke="#111" stroke-width="6" paint-order="stroke" transform="rotate(-8 ${W / 2} 300)">${esc(scene.sfx)}</text>` : ""}
    ${captionSvg(scene.caption)}
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

  // 主要3フレーム: フック / 中盤の実車(or代表) / エンドカード
  const hook = script.scenes[0];
  const carScene = script.scenes.find((s) => s.visualType === "carPhoto") ?? script.scenes[1];
  const last = script.scenes[script.scenes.length - 1];

  const frames = await Promise.all([
    sharp(Buffer.from(frameSvg(hook, false))).png().toBuffer(),
    sharp(Buffer.from(frameSvg(carScene, false))).png().toBuffer(),
    sharp(Buffer.from(frameSvg(last, true))).png().toBuffer(),
  ]);

  // エンドカードにQRを合成
  const qrBuf = await QRCode.toBuffer(process.env.LINE_URL ?? "https://lin.ee/your-line-id", { width: 180, margin: 1 });
  frames[2] = await sharp(frames[2]).composite([{ input: qrBuf, left: W / 2 - 90, top: 365 }]).png().toBuffer();

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
