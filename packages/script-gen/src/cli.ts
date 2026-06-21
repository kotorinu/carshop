import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  CarSchema,
  paths,
  type Car,
  type VideoFormat,
  type TargetLayer,
} from "@app/shared";
import { generateScript } from "./generate.js";

/**
 * 使い方:
 *   npm run gen:scripts -- [--mock] [--car <carId>] [--format <fmt>] [--layer <A_seller|B_buyer>]
 * 既定: cars.json 全台について、在庫=B_buyer(manga-inventory) と 買取=A_seller(story-sell) の2本を生成。
 */
function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") flags.add("mock");
    else if (a.startsWith("--")) {
      args[a.slice(2)] = argv[++i];
    }
  }
  return { args, flags };
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));

  const carsRaw = JSON.parse(await readFile(paths.carsJson, "utf8"));
  const cars: Car[] = carsRaw.map((c: unknown) => CarSchema.parse(c));

  const targets = args.car ? cars.filter((c) => c.id === args.car) : cars;
  if (targets.length === 0) {
    console.error(`車が見つかりません: ${args.car ?? "(なし)"}`);
    process.exit(1);
  }

  // 生成プラン: 明示指定が無ければ 在庫(B) + 買取(A) の2本
  const plan: { format: VideoFormat; layer: TargetLayer }[] =
    args.format && args.layer
      ? [{ format: args.format as VideoFormat, layer: args.layer as TargetLayer }]
      : [
          { format: "manga-inventory", layer: "B_buyer" },
          { format: "story-sell", layer: "A_seller" },
        ];

  const mock = flags.has("mock") || !process.env.ANTHROPIC_API_KEY;
  if (mock) console.log("ℹ️  モックモード(APIキー無し or --mock)で生成します。");

  const outDir = path.dirname(paths.scriptJson("x"));
  await mkdir(outDir, { recursive: true });

  let n = 0;
  for (const car of targets) {
    for (const p of plan) {
      const script = await generateScript(car, { ...p, mock });
      const file = paths.scriptJson(script.videoId);
      await writeFile(file, JSON.stringify(script, null, 2), "utf8");
      console.log(`✅ ${script.videoId} (${script.scenes.length}シーン / ${script.estimatedDurationSec}秒) → ${path.relative(process.cwd(), file)}`);
      n++;
    }
  }
  console.log(`\n完了: ${n}本の台本を生成しました。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
