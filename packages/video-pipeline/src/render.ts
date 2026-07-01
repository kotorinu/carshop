import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { paths, CONTENT_DIR } from "@app/shared";
import { buildInputProps, findBrowser, CHROME_MODE } from "./setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const { inputProps } = await buildInputProps(args.video);

  console.log("📦 Remotionをバンドル中…");
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, "remotion", "index.ts"),
    publicDir: CONTENT_DIR, // staticFile の基準を content/ に
  });

  const browserExecutable = findBrowser();
  if (browserExecutable) console.log(`🌐 Chromium: ${browserExecutable}`);

  const composition = await selectComposition({
    serveUrl,
    id: "MangaInventory",
    inputProps,
    browserExecutable,
    chromeMode: CHROME_MODE,
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
    browserExecutable,
    chromeMode: CHROME_MODE,
  });
  console.log(`✅ 完成: ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
