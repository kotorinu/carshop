/**
 * 自己採点ループ: 生成→AI採点→style-params調整→再生成 を自動で繰り返す。
 *
 * 使い方:
 *   npm run self-review -- --video <videoId>            # プレビューPNGで高速ループ
 *   npm run self-review -- --video <videoId> --mp4      # 最終確認をMP4フレームで
 *   npm run self-review -- --video <videoId> --max 5 --threshold 80
 *
 * ANTHROPIC_API_KEY が無い場合は静的チェック(寸法・秒数・禁止語・価格照合)のみ。
 * AI採点あり: Claude visionがルーブリック採点し、style-params.json の
 * ホワイトリスト項目だけを安全範囲内で自動調整して再レンダーする。
 * Klingクリップの再生成はしない(コスト保護)。悪いクリップは提案として報告のみ。
 *
 * 出力: content/renders/<videoId>.review.md (採点ログ=人間ゲート資料)
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  VideoScriptSchema,
  CarSchema,
  paths,
  CONTENT_DIR,
  REPO_ROOT,
  type VideoScript,
  type Car,
} from "@app/shared";
import { z } from "zod";

const MODEL = process.env.SELF_REVIEW_MODEL ?? "claude-sonnet-4-6";

// ---------- 引数 ----------
function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--mp4") flags.add("mp4");
    else if (t.startsWith("--")) a[t.slice(2)] = argv[++i];
  }
  return { a, flags };
}

function run(scriptRel: string, args: string[]) {
  execFileSync(process.execPath, ["--import", "tsx", path.join(REPO_ROOT, scriptRel), ...args], {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });
}

// ---------- 静的チェック(キー無しでも動く・法令系はここで必ず止める) ----------
const FORBIDDEN_WORDS = [
  "日本一", "業界一", "最安値", "業界最安", "絶対", "必ず得", "必ず儲", "損は一切",
  "外車専門", // ブランド方針: 「大阪・中古車」に統一
];

interface StaticResult {
  errors: string[]; // 焼き込み禁止レベル(景表法/古物商)
  warnings: string[]; // 改善推奨
}

function staticChecks(script: VideoScript, car: Car | undefined): StaticResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 長さ 15〜30秒
  if (script.estimatedDurationSec < 15 || script.estimatedDurationSec > 30) {
    errors.push(`動画の長さ ${script.estimatedDurationSec}秒 が15〜30秒の範囲外`);
  }

  // テンポ: カット2〜4秒(エンドカードは5秒まで)
  const last = script.scenes.length - 1;
  for (const [i, s] of script.scenes.entries()) {
    const dur = s.endSec - s.startSec;
    const maxDur = i === last ? 5 : 4.5;
    if (dur > maxDur) warnings.push(`シーン${s.index}が${dur.toFixed(1)}秒(${maxDur}秒超) — テンポ低下の恐れ`);
    if (dur < 1) warnings.push(`シーン${s.index}が${dur.toFixed(1)}秒 — 短すぎて読めない恐れ`);
  }

  // シーンの時間連続性
  for (let i = 1; i < script.scenes.length; i++) {
    if (Math.abs(script.scenes[i].startSec - script.scenes[i - 1].endSec) > 0.01) {
      errors.push(`シーン${i - 1}→${i} の時間が連続していない`);
    }
  }

  // 禁止語(景表法・ブランド方針)
  const allText = [script.hookText, script.cta, ...script.scenes.flatMap((s) => [s.caption, s.narration])].join(" ");
  for (const w of FORBIDDEN_WORDS) {
    if (allText.includes(w)) errors.push(`禁止語「${w}」が含まれている`);
  }

  // 価格照合(cars.json と一致するか = 景表法の要)
  if (car) {
    const okNumbers = new Set<string>();
    okNumbers.add(`${Math.round(car.priceJpy / 10000)}万`);
    if (car.marketPriceJpy) okNumbers.add(`${Math.round(car.marketPriceJpy / 10000)}万`);
    // 価格らしき「◯◯万(円)」だけ照合。走行距離(3.2万km等)・小数の断片は除外
    const priceMentions = allText.match(/(?<![\d.．])(\d{2,4})万(?:円)?(?!\s*(?:km|キロ|㎞))/g) ?? [];
    for (const m of priceMentions) {
      const num = `${m.match(/\d+/)?.[0]}万`;
      if (!okNumbers.has(num)) {
        errors.push(`価格「${m}」が cars.json(${[...okNumbers].join("/")}円) と一致しない`);
      }
    }
    // 年式・走行
    if (!allText.includes(String(car.year))) warnings.push(`年式 ${car.year} が動画に出ていない`);
  } else {
    warnings.push("cars.json に該当車が無く価格照合をスキップ");
  }

  // フックに数字(研究: 数字入りフックが強い)
  if (!/[0-9０-９]/.test(script.hookText)) {
    warnings.push("フックに数字が無い(価格/年式/◯◯万円を入れると強い)");
  }

  return { errors, warnings };
}

// ---------- AI採点(ルーブリック) ----------
const AdjustmentSchema = z.object({
  path: z.string(),
  value: z.number(),
  reason: z.string().default(""),
});
const ReviewSchema = z.object({
  scores: z.object({
    hook: z.number().min(0).max(10),
    readability: z.number().min(0).max(10),
    safeArea: z.number().min(0).max(10),
    tempo: z.number().min(0).max(10),
    gold: z.number().min(0).max(10),
    endcard: z.number().min(0).max(10),
    luxury: z.number().min(0).max(10),
  }),
  issues: z.array(z.string()).default([]),
  adjustments: z.array(AdjustmentSchema).default([]),
  clipComplaints: z.array(z.string()).default([]),
});
type Review = z.infer<typeof ReviewSchema>;

/** 重み付き合計(100点満点) */
function totalScore(r: Review): number {
  const s = r.scores;
  return Math.round(
    s.hook * 2 + s.readability * 2 + s.safeArea * 1 + s.tempo * 1.5 + s.gold * 1 + s.endcard * 1 + s.luxury * 1.5,
  );
}

/** style-params.json の調整可能項目と安全範囲(自己採点ループの暴走防止) */
const PARAM_BOUNDS: Record<string, [number, number]> = {
  "hook.fontSize": [90, 150],
  "hook.numberScale": [1.1, 1.5],
  "hook.topOffsetPct": [20, 42],
  "caption.fontSize": [52, 84],
  "caption.boxOpacity": [0.3, 0.75],
  "caption.bottomOffsetPct": [27, 40], // 下25%は安全域なので27%未満に下げない
  "caption.strokeWidth": [5, 10],
  "specBar.fontSize": [30, 46],
  "specBar.topPx": [292, 420], // 上15%(288px)より下
  "darkOverlay.topOpacity": [0.1, 0.4],
  "darkOverlay.bottomOpacity": [0.5, 0.85],
  "kenBurns.scaleFrom": [1.05, 1.2],
  "kenBurns.scaleTo": [1.15, 1.45],
  "kenBurns.panPx": [10, 44],
  "priceReveal.fontSize": [110, 190],
  "endCard.qrSizePx": [280, 420],
  "endCard.shopNameFontSize": [56, 96],
};

async function applyAdjustments(adjustments: z.infer<typeof AdjustmentSchema>[]): Promise<string[]> {
  if (adjustments.length === 0) return [];
  const params = JSON.parse(await readFile(paths.styleParams, "utf8"));
  const applied: string[] = [];
  for (const adj of adjustments) {
    const bounds = PARAM_BOUNDS[adj.path];
    if (!bounds) continue; // ホワイトリスト外は無視
    const clamped = Math.min(bounds[1], Math.max(bounds[0], adj.value));
    const [group, key] = adj.path.split(".");
    if (params[group] && typeof params[group][key] === "number") {
      const old = params[group][key];
      if (old === clamped) continue;
      params[group][key] = clamped;
      applied.push(`${adj.path}: ${old} → ${clamped}（${adj.reason}）`);
    }
  }
  if (applied.length > 0) {
    await writeFile(paths.styleParams, JSON.stringify(params, null, 2), "utf8");
  }
  return applied;
}

/** 採点用フレームを抽出(Remotion renderStillでコンポジションを直接描画・ffmpeg不要) */
async function extractFrames(videoId: string, durationSec: number): Promise<string[]> {
  const outDir = path.join(CONTENT_DIR, "renders", `${videoId}.frames`);
  const times = [
    0.5,
    durationSec * 0.25,
    durationSec * 0.5,
    durationSec * 0.75,
    durationSec - 1.5,
  ].map((t) => Math.round(t * 10) / 10);
  run("packages/video-pipeline/src/still-frames.ts", [
    "--video", videoId,
    "--times", times.join(","),
    "--out", outDir,
  ]);
  const files = (await readdir(outDir)).filter((f) => f.endsWith(".png")).sort();
  return files.map((f) => path.join(outDir, f));
}

async function aiReview(
  images: string[],
  script: VideoScript,
  staticResult: StaticResult,
  currentParams: string,
): Promise<Review> {
  const client = new Anthropic();
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const img of images) {
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: (await readFile(img)).toString("base64"),
      },
    });
  }

  const prompt = `あなたはTikTokショート動画の品質監督です。上の画像は中古車紹介動画(9:16・${script.estimatedDurationSec}秒)のフレームです。
1枚目=フック(0〜2秒)、続くフレーム=本編、最後=エンドカード。

台本: フック「${script.hookText}」/ CTA「${script.cta}」
シーン: ${script.scenes.map((s) => `[${s.startSec}-${s.endSec}s]${s.caption}`).join(" ")}
静的チェック結果: ${JSON.stringify(staticResult)}
現在のstyle-params: ${currentParams}

## ルーブリック(各0〜10点・厳しめに)
- hook: フックが1秒で目を止めるか(大きさ/数字の強調/インパクト)
- readability: テロップが一瞬で読めるか(太さ/縁取り/背景とのコントラスト)
- safeArea: 上15%・下25%にテキストが被っていないか
- tempo: 構成にメリハリがあるか(単調に見えないか)
- gold: 数字/価格のゴールド強調が効いているか(やりすぎもNG)
- endcard: QR/店名/CTAが明瞭か
- luxury: 全体の高級感・プロ感(素人くさくないか)

## 調整可能なstyle-params(この範囲だけ提案可)
${Object.entries(PARAM_BOUNDS).map(([k, [lo, hi]]) => `${k}: ${lo}〜${hi}`).join(" / ")}

JSONのみで回答:
{"scores": {"hook": n, "readability": n, "safeArea": n, "tempo": n, "gold": n, "endcard": n, "luxury": n},
 "issues": ["問題点を具体的に"],
 "adjustments": [{"path": "caption.fontSize", "value": 72, "reason": "小さくて読めない"}],
 "clipComplaints": ["クリップ/写真自体の問題(あれば・再生成提案)"]}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return ReviewSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

// ---------- メイン ----------
async function main() {
  const { a, flags } = parseArgs(process.argv.slice(2));
  if (!a.video) {
    console.error("使い方: npm run self-review -- --video <videoId> [--mp4] [--max 5] [--threshold 80]");
    process.exit(1);
  }
  const videoId = a.video;
  const maxIters = Number(a.max ?? 5);
  const threshold = Number(a.threshold ?? 80);
  const useMp4 = flags.has("mp4");

  const script = VideoScriptSchema.parse(JSON.parse(await readFile(paths.scriptJson(videoId), "utf8")));
  let car: Car | undefined;
  try {
    const cars = z.array(CarSchema).parse(JSON.parse(await readFile(paths.carsJson, "utf8")));
    car = cars.find((c) => c.id === script.carId);
  } catch { /* 照合スキップ */ }

  const lines: string[] = [
    `# 自己採点レポート: ${videoId}`,
    ``,
    `- 実行: ${new Date().toISOString()}`,
    `- モード: ${useMp4 ? "MP4フレーム" : "静止プレビュー"} / 閾値 ${threshold}点 / 最大${maxIters}周`,
    ``,
  ];

  // 静的チェック(常に実行)
  const st = staticChecks(script, car);
  lines.push(`## 静的チェック(景表法・構成)`, ``);
  lines.push(st.errors.length === 0 ? `✅ エラーなし` : st.errors.map((e) => `- ❌ ${e}`).join("\n"));
  if (st.warnings.length > 0) lines.push(``, st.warnings.map((w) => `- ⚠️ ${w}`).join("\n"));
  lines.push(``);

  if (st.errors.length > 0) {
    console.error("❌ 静的チェックでエラー。焼き込み前に台本を修正してください:");
    for (const e of st.errors) console.error(`   - ${e}`);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    lines.push(`## AI採点`, ``, `スキップ(ANTHROPIC_API_KEY 未設定)。静的チェックのみ実施。`);
    const out = path.join(CONTENT_DIR, "renders", `${videoId}.review.md`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, lines.join("\n"), "utf8");
    console.log(`\nℹ️  APIキー無し → 静的チェックのみ。レポート: ${path.relative(process.cwd(), out)}`);
    process.exit(st.errors.length > 0 ? 1 : 0);
  }

  // AI採点ループ
  lines.push(`## AI採点ループ`, ``);
  let best = -1;
  for (let iter = 1; iter <= maxIters; iter++) {
    console.log(`\n🔁 ${iter}周目: レンダー中…`);
    let images: string[];
    if (useMp4) {
      // Remotionの実フレームで採点(MP4本体は採点完了後に1回だけ書き出す)
      images = await extractFrames(videoId, script.estimatedDurationSec);
    } else {
      run("packages/video-pipeline/src/preview-still.ts", ["--video", videoId]);
      images = [path.join(CONTENT_DIR, "renders", `${videoId}.preview.png`)];
    }

    console.log(`🤖 AI採点中…`);
    const currentParams = await readFile(paths.styleParams, "utf8");
    const review = await aiReview(images, script, st, currentParams);
    const total = totalScore(review);
    console.log(`📊 ${total}点 (${Object.entries(review.scores).map(([k, v]) => `${k}:${v}`).join(" ")})`);

    lines.push(`### ${iter}周目: **${total}点**`, ``);
    lines.push(`| 項目 | 点 |`, `|---|---|`);
    for (const [k, v] of Object.entries(review.scores)) lines.push(`| ${k} | ${v}/10 |`);
    if (review.issues.length > 0) lines.push(``, `指摘:`, ...review.issues.map((i) => `- ${i}`));
    if (review.clipComplaints.length > 0) {
      lines.push(``, `クリップ差し替え提案(Kling再生成は手動判断):`, ...review.clipComplaints.map((c) => `- 🎬 ${c}`));
    }

    if (total >= threshold) {
      lines.push(``, `✅ 閾値${threshold}点に到達。ループ終了。`, ``);
      console.log(`✅ 閾値${threshold}点に到達！`);
      best = total;
      break;
    }

    const applied = await applyAdjustments(review.adjustments);
    if (applied.length === 0) {
      lines.push(``, `調整案なし(またはホワイトリスト外のみ)。ループ終了。`, ``);
      console.log("ℹ️  適用できる調整が無いため終了");
      best = total;
      break;
    }
    lines.push(``, `適用した調整:`, ...applied.map((s) => `- 🔧 ${s}`), ``);
    for (const s of applied) console.log(`🔧 ${s}`);
    best = Math.max(best, total);
  }

  // 調整済みパラメータで最終MP4を1回だけ書き出す
  if (useMp4) {
    console.log(`\n🎬 最終MP4を書き出し中…`);
    run("packages/video-pipeline/src/render.ts", ["--video", videoId]);
  }

  lines.push(``, `## 結果`, ``, `最終スコア: **${best}点**(閾値 ${threshold}点)`);
  lines.push(``, `> このレポートは人間ゲート(焼き込み前チェック)の補助資料。価格・年式・読み(VOICEVOX)の最終確認は必ず人間が行うこと。`);

  const out = path.join(CONTENT_DIR, "renders", `${videoId}.review.md`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, lines.join("\n"), "utf8");
  console.log(`\n📝 レポート: ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
