/**
 * 1台分の動画をワンコマンドで作る(初心者向け)。
 * 使い方:
 *   npm run make -- --car lexus-rx450h-2021-01            # 台本→字幕/音声→MP4
 *   npm run make -- --car lexus-rx450h-2021-01 --mock     # APIキー無しでも動く
 *   npm run make -- --car lexus-rx450h-2021-01 --preview  # Chrome不要の静止画だけ
 *
 * 内部で gen:scripts → gen:tts → render(or preview) を順に実行する。
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { paths, VideoScriptSchema, REPO_ROOT } from "@app/shared";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--mock") flags.add("mock");
    else if (t === "--preview") flags.add("preview");
    else if (t.startsWith("--")) a[t.slice(2)] = argv[++i];
  }
  return { a, flags };
}

function run(scriptRel: string, args: string[]) {
  // ローカルの tsx でサブステップを実行(OS非依存)。
  // npx.cmd を直接 spawn すると Windows + Node 20+ で EINVAL になる(CVE-2024-27980 対策で
  // .cmd の直接実行が禁止された)ため、node の `--import tsx` で .ts を直接起動する。
  execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(REPO_ROOT, scriptRel), ...args],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
}

function scriptsForCar(carId: string): string[] {
  const dir = path.dirname(paths.scriptJson("x"));
  const ids: Record<string, string> = {}; // format -> 最新videoId
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = VideoScriptSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      if (s.carId !== carId) continue;
      if (!ids[s.format] || s.videoId > ids[s.format]) ids[s.format] = s.videoId;
    } catch {
      /* skip */
    }
  }
  return Object.values(ids);
}

async function main() {
  const { a, flags } = parseArgs(process.argv.slice(2));
  if (!a.car) {
    console.error("使い方: npm run make -- --car <車のid> [--mock] [--preview]");
    process.exit(1);
  }
  const mock = flags.has("mock");

  console.log(`\n🚗 ${a.car} の動画を作ります${mock ? "（mock）" : ""}\n`);

  // 1) 台本(在庫=B + 買取=A の2本)
  console.log("① 台本を生成…");
  run("packages/script-gen/src/cli.ts", ["--car", a.car, ...(mock ? ["--mock"] : [])]);

  const videoIds = scriptsForCar(a.car);
  if (videoIds.length === 0) {
    console.error("台本が見つかりませんでした");
    process.exit(1);
  }

  for (const id of videoIds) {
    console.log(`\n② 字幕（＋VOICEVOXがあれば音声）: ${id}`);
    run("packages/tts/src/cli.ts", ["--video", id]);

    if (flags.has("preview")) {
      console.log(`③ 静止プレビュー: ${id}`);
      run("packages/video-pipeline/src/preview-still.ts", ["--video", id]);
    } else {
      console.log(`③ MP4を書き出し: ${id}`);
      run("packages/video-pipeline/src/render.ts", ["--video", id]);
    }
  }

  const outDir = path.relative(REPO_ROOT, path.dirname(paths.renderMp4("x")));
  console.log(`\n✅ 完成！ ${outDir}/ を確認してください（${videoIds.length}本）。`);
  console.log("   よければTikTokアプリに読み込んで、トレンド音を付けて投稿しましょう。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
