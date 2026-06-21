import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { VideoScriptSchema, paths } from "@app/shared";
import { isAvailable, audioQuery, queryDurationSec, synthesis } from "./voicevox.js";
import { buildSrt } from "./captions.js";

/**
 * 使い方: npm run gen:tts -- --video <videoId> [--speaker 3]
 * - 字幕SRTは常に生成(オフラインOK)
 * - VOICEVOXが起動していれば各シーンのwav + timings.json も生成
 */
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
  const speaker = Number(args.speaker ?? 3); // VOICEVOX標準: ずんだもん=3 等
  const script = VideoScriptSchema.parse(
    JSON.parse(await readFile(paths.scriptJson(args.video), "utf8")),
  );

  // 1) 字幕SRT(常に)
  await mkdir(path.dirname(paths.captionSrt(args.video)), { recursive: true });
  await writeFile(paths.captionSrt(args.video), buildSrt(script), "utf8");
  console.log(`✅ 字幕: ${path.relative(process.cwd(), paths.captionSrt(args.video))}`);

  // 2) 音声(VOICEVOXがあれば)
  if (!(await isAvailable())) {
    console.log("ℹ️  VOICEVOX未起動のため音声はスキップ(字幕のみ生成)。");
    console.log("   ローカルで: docker run --rm -p 50021:50021 voicevox/voicevox_engine");
    return;
  }
  const audioDir = paths.audioDir(args.video);
  await mkdir(audioDir, { recursive: true });
  const timings: { index: number; startSec: number; durationSec: number; file: string }[] = [];
  let cursor = 0;
  for (const scene of script.scenes) {
    const q = await audioQuery(scene.narration, speaker);
    const dur = queryDurationSec(q);
    const wav = await synthesis(q, speaker);
    const file = `scene-${String(scene.index).padStart(2, "0")}.wav`;
    await writeFile(path.join(audioDir, file), wav);
    timings.push({ index: scene.index, startSec: cursor, durationSec: dur, file });
    cursor += dur;
  }
  await writeFile(
    path.join(audioDir, "timings.json"),
    JSON.stringify({ speaker, totalSec: cursor, scenes: timings }, null, 2),
    "utf8",
  );
  console.log(`✅ 音声: ${script.scenes.length}本 + timings.json → ${path.relative(process.cwd(), audioDir)} (合計${cursor.toFixed(1)}秒)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
