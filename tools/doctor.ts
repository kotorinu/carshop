/**
 * 環境チェック(初心者向け)。
 * 使い方: npm run doctor
 * 何が足りないかを日本語で✅/⚠️表示する。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { paths, CarSchema, REPO_ROOT, type Car } from "@app/shared";

const ok = (m: string) => console.log(`✅ ${m}`);
const warn = (m: string) => console.log(`⚠️  ${m}`);

async function main() {
  console.log("=== 環境チェック ===\n");

  // Node バージョン
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok(`Node.js ${process.versions.node}`);
  else warn(`Node.js ${process.versions.node} … 20以上を推奨(https://nodejs.org の LTS)`);

  // 依存インストール
  if (existsSync(path.join(REPO_ROOT, "node_modules", "remotion")))
    ok("依存パッケージ(npm install 済み)");
  else warn("依存が未インストール … ターミナルで `npm install` を実行してください");

  // ANTHROPIC_API_KEY(任意)
  if (process.env.ANTHROPIC_API_KEY) ok("ANTHROPIC_API_KEY あり(本番の台本生成が使えます)");
  else warn("ANTHROPIC_API_KEY なし … `--mock` で動きます(台本は簡易版)。本番品質にしたい時だけ設定");

  // VOICEVOX(任意)
  const vv = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
  try {
    const r = await fetch(`${vv}/version`);
    if (r.ok) ok(`VOICEVOX 起動中(${vv})`);
    else warn(`VOICEVOX 応答が不正(${vv})`);
  } catch {
    warn(`VOICEVOX 未起動 … 声を入れたい時だけ VOICEVOXアプリを起動(${vv})。無くても字幕付き動画は作れます`);
  }

  // 在庫と写真
  if (!existsSync(paths.carsJson)) {
    warn("content/inventory/cars.json が見つかりません");
  } else {
    const cars: Car[] = JSON.parse(readFileSync(paths.carsJson, "utf8")).map((c: unknown) =>
      CarSchema.parse(c),
    );
    ok(`在庫 ${cars.length} 台を読み込みました`);
    for (const car of cars) {
      const dir = paths.carPhotosDir(car.id);
      const n = existsSync(dir)
        ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length
        : 0;
      if (n >= 2) ok(`  ${car.id}: 実車写真 ${n} 枚`);
      else warn(`  ${car.id}: 実車写真 ${n} 枚 … content/car-photos/${car.id}/ に 01.jpg などを2枚以上`);
    }
  }

  console.log("\n次の一歩: `npm run make -- --car <車のid> --mock --preview` で静止プレビュー、");
  console.log("          `npm run make -- --car <車のid>` でMP4を書き出し(初回はChromeを自動取得)。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
