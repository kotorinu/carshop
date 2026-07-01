/**
 * 動画の任意秒のフレームをPNGで書き出す(自己採点ループのAI採点用)。
 * MP4デコード(ffmpeg)不要 — Remotion renderStill でコンポジションを直接描画する。
 *
 * 使い方: tsx packages/video-pipeline/src/still-frames.ts --video <videoId> --times 0.5,4,9,13.5 --out <dir>
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { CONTENT_DIR } from "@app/shared";
import { FPS } from "./remotion/types.js";
import { buildInputProps, findBrowser, CHROME_MODE } from "./setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video || !args.times) {
    console.error("使い方: --video <videoId> --times 0.5,4,9 [--out <dir>]");
    process.exit(1);
  }
  const { script, inputProps } = await buildInputProps(args.video);
  const times = args.times.split(",").map(Number).filter((t) => !Number.isNaN(t));
  const outDir = args.out ?? path.join(CONTENT_DIR, "renders", `${args.video}.frames`);
  await mkdir(outDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, "remotion", "index.ts"),
    publicDir: CONTENT_DIR,
  });
  const browserExecutable = findBrowser();
  const composition = await selectComposition({
    serveUrl,
    id: "MangaInventory",
    inputProps,
    browserExecutable,
    chromeMode: CHROME_MODE,
  });

  for (const [i, t] of times.entries()) {
    const frame = Math.min(
      composition.durationInFrames - 1,
      Math.max(0, Math.round(Math.min(t, script.estimatedDurationSec - 0.1) * FPS)),
    );
    const output = path.join(outDir, `f${i}-${t}s.png`);
    await renderStill({
      composition,
      serveUrl,
      output,
      frame,
      inputProps,
      browserExecutable,
      chromeMode: CHROME_MODE,
    });
    console.log(`✅ ${path.relative(process.cwd(), output)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
