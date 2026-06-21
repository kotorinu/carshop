import type { VideoScript } from "@app/shared";

/** 秒 → SRTタイム "HH:MM:SS,mmm" */
export function toSrtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(milli, 3)}`;
}

/**
 * 台本のシーン(秒タイミング)から焼き込み用SRTを作る。
 * VOICEVOXのmoraタイミングがあれば endSec を上書きして精度を上げられるが、
 * まずは台本の start/end で十分(オフラインでも生成可)。
 */
export function buildSrt(script: VideoScript): string {
  return script.scenes
    .map((s, i) => {
      return `${i + 1}\n${toSrtTime(s.startSec)} --> ${toSrtTime(s.endSec)}\n${s.caption}\n`;
    })
    .join("\n");
}
