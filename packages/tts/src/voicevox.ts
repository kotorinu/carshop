/**
 * ローカルVOICEVOXエンジン(既定 http://127.0.0.1:50021)のクライアント。
 * Docker: `docker run --rm -p 50021:50021 voicevox/voicevox_engine`
 */
const BASE = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";

/** エンジンが起動しているか */
export async function isAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/version`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

/** audio_query を取得(mora単位のタイミングを含む) */
export async function audioQuery(text: string, speaker: number): Promise<any> {
  const r = await fetch(
    `${BASE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
    { method: "POST" },
  );
  if (!r.ok) throw new Error(`audio_query失敗: ${r.status}`);
  return r.json();
}

/** audio_query から発話長(秒)を概算 */
export function queryDurationSec(query: any): number {
  let total = query.prePhonemeLength ?? 0;
  for (const ap of query.accent_phrases ?? []) {
    for (const mora of ap.moras ?? []) {
      total += (mora.consonant_length ?? 0) + (mora.vowel_length ?? 0);
    }
    if (ap.pause_mora) {
      total += ap.pause_mora.vowel_length ?? 0;
    }
  }
  total += query.postPhonemeLength ?? 0;
  return total / (query.speedScale ?? 1);
}

/** synthesis でwav(Buffer)を生成 */
export async function synthesis(query: any, speaker: number): Promise<Buffer> {
  const r = await fetch(`${BASE}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!r.ok) throw new Error(`synthesis失敗: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
