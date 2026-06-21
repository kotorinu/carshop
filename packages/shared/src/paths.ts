import path from "node:path";
import { fileURLToPath } from "node:url";

/** リポジトリルート(packages/shared/src から3つ上) */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export const CONTENT_DIR = path.join(REPO_ROOT, "content");

export const paths = {
  carsJson: path.join(CONTENT_DIR, "inventory", "cars.json"),
  tiktokSpec: path.join(CONTENT_DIR, "brand", "tiktok-spec.md"),
  readingDict: path.join(CONTENT_DIR, "brand", "reading-dict.json"),
  carPhotosDir: (carId: string) =>
    path.join(CONTENT_DIR, "car-photos", carId),
  scriptJson: (videoId: string) =>
    path.join(CONTENT_DIR, "scripts", `${videoId}.json`),
  audioDir: (videoId: string) => path.join(CONTENT_DIR, "audio", videoId),
  captionSrt: (videoId: string) =>
    path.join(CONTENT_DIR, "captions", `${videoId}.srt`),
  visualsDir: (videoId: string) =>
    path.join(CONTENT_DIR, "visuals", videoId),
  renderMp4: (videoId: string) =>
    path.join(CONTENT_DIR, "renders", `${videoId}.mp4`),
};
