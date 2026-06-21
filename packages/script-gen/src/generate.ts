import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import {
  VideoScriptSchema,
  paths,
  type Car,
  type VideoFormat,
  type TargetLayer,
  type VideoScript,
} from "@app/shared";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { buildMockScript } from "./mock.js";

const MODEL = process.env.SCRIPT_GEN_MODEL ?? "claude-sonnet-4-6";

function makeVideoId(format: VideoFormat, car: Car): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const short = format === "manga-inventory" ? "inv" : format === "story-sell" ? "sell" : "owner";
  return `${stamp}-${short}-${car.id}`;
}

/** モデルの生出力 → VideoScript(共通の後処理 + zod 検証) */
function finalize(
  raw: Omit<VideoScript, "videoId" | "carId" | "status" | "reviewNotes" | "createdAt">,
  car: Car,
): VideoScript {
  const videoId = makeVideoId(raw.format, car);
  return VideoScriptSchema.parse({
    ...raw,
    videoId,
    carId: car.id,
    status: "draft",
    reviewNotes: "",
    createdAt: new Date().toISOString(),
  });
}

/** Claude API で台本生成 */
async function generateViaApi(
  car: Car,
  format: VideoFormat,
  layer: TargetLayer,
): Promise<VideoScript> {
  const spec = await readFile(paths.tiktokSpec, "utf8");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(spec),
    messages: [{ role: "user", content: buildUserPrompt(car, format, layer) }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const jsonStr = extractJson(text);
  return finalize(JSON.parse(jsonStr), car);
}

/** モデル出力からJSON本体を抜く(コードフェンス等を許容) */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export interface GenerateOptions {
  format: VideoFormat;
  layer: TargetLayer;
  mock?: boolean;
}

/** 1台分の台本生成(mock指定 or APIキー無しならモックにフォールバック) */
export async function generateScript(
  car: Car,
  opts: GenerateOptions,
): Promise<VideoScript> {
  const useMock = opts.mock || !process.env.ANTHROPIC_API_KEY;
  if (useMock) {
    return finalize(buildMockScript(car, opts.format, opts.layer), car);
  }
  return generateViaApi(car, opts.format, opts.layer);
}
