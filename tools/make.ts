/**
 * 1台分の動画をワンコマンドで作る(初心者向け)。
 * 使い方:
 *   npm run make -- --car lexus-rx450h-2021-01            # 写真選定→台本→字幕/音声→MP4
 *   npm run make -- --car lexus-rx450h-2021-01 --mock     # APIキー無しでも動く
 *   npm run make -- --car lexus-rx450h-2021-01 --preview  # Chrome不要の静止画だけ
 *   npm run make -- --car lexus-rx450h-2021-01 --auto     # 自己採点ループ付き(要ANTHROPIC_API_KEY)
 *
 * 内部で pick:photos → gen:scripts → gen:clips(Klingキーがあれば) → gen:tts
 * → render(or preview) → self-review(--auto時) を順に実行する。
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { paths, VideoScriptSchema, REPO_ROOT } from "@app/shared";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--mock") flags.add("mock");
    else if (t === "--preview") flags.add("preview");
    else if (t === "--clips") flags.add("clips"); // Kling動画生成を強制実行
    else if (t === "--auto") flags.add("auto"); // 自己採点ループ
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

/** 写真フォルダに写真があるか(選定・クリップ生成の前提) */
function hasPhotos(carId: string): boolean {
  try {
    return readdirSync(paths.carPhotosDir(carId)).some((f) => /\.(jpe?g|png|webp)$/i.test(f));
  } catch {
    return false;
  }
}

async function main() {
  const { a, flags } = parseArgs(process.argv.slice(2));
  if (!a.car) {
    console.error("使い方: npm run make -- --car <車のid> [--mock] [--preview] [--auto]");
    process.exit(1);
  }
  const mock = flags.has("mock");

  console.log(`\n🚗 ${a.car} の動画を作ります${mock ? "（mock）" : ""}\n`);

  // 0) 写真選定(素材プールから役割別ベストを選ぶ。写真が無ければスキップ)
  if (hasPhotos(a.car)) {
    if (!existsSync(paths.photoSelection(a.car)) || flags.has("clips")) {
      console.log("⓪ 写真を選定…(素材プールからベストだけ使います)");
      run("packages/ai-video-gen/src/pick-photos.ts", ["--car", a.car]);
    }
  } else {
    console.log(`ℹ️  写真がまだありません: content/car-photos/${a.car}/ に .jpg を置くと品質が大きく上がります`);
  }

  // 1) 台本(在庫=B + 買取=A の2本)
  console.log("① 台本を生成…");
  run("packages/script-gen/src/cli.ts", ["--car", a.car, ...(mock ? ["--mock"] : [])]);

  const videoIds = scriptsForCar(a.car);
  if (videoIds.length === 0) {
    console.error("台本が見つかりませんでした");
    process.exit(1);
  }

  // 2) Kling クリップ生成(--clips フラグ or KLING_ACCESS_KEY が設定されている場合)
  const hasKlingKey = !!process.env.KLING_ACCESS_KEY;
  if ((flags.has("clips") || hasKlingKey) && hasPhotos(a.car)) {
    console.log("\n② Kling AIクリップを生成…(選定写真のみ)");
    run("packages/ai-video-gen/src/cli.ts", ["--car", a.car]);
  }

  for (const id of videoIds) {
    console.log(`\n③ 字幕（＋VOICEVOXがあれば音声）: ${id}`);
    run("packages/tts/src/cli.ts", ["--video", id]);

    if (flags.has("preview")) {
      console.log(`④ 静止プレビュー: ${id}`);
      run("packages/video-pipeline/src/preview-still.ts", ["--video", id]);
    } else {
      console.log(`④ MP4を書き出し: ${id}`);
      run("packages/video-pipeline/src/render.ts", ["--video", id]);
    }

    // 自己採点ループ(--auto時。キー無しなら静的チェックのみが走る)
    if (flags.has("auto")) {
      console.log(`⑤ 自己採点ループ: ${id}`);
      try {
        run("tools/self-review.ts", [
          "--video", id,
          ...(flags.has("preview") ? [] : ["--mp4"]),
        ]);
      } catch {
        // 静的チェックのエラーは self-review が表示済み。他の動画の処理は続ける
        console.error(`⚠️  ${id} は人間ゲート前に要修正(上のエラーと review.md を確認)`);
        process.exitCode = 1;
      }
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
