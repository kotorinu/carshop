// カーセンサー同期済みの実在庫(kotokoto-company-site/data/cars.json)を
// carshop の content/inventory/cars.json に取り込み、実車写真もダウンロードする。
//
//   node video/sync-inventory.mjs --list           # 実在庫の一覧(選ぶ用)
//   node video/sync-inventory.mjs <csId|キーワード>  # 1台取り込み(写真10枚まで)
//   node video/sync-inventory.mjs --all            # 販売中を全台取り込み(写真は各6枚)
//
// 取り込み後は台本を書いて `npm run make:video -- <videoId>` で動画化。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
// ライブ(Vercel配信・毎日cron同期)を正とし、取得失敗時のみローカルrepoにフォールバックする。
// ローカルはgit pullを忘れると古くなる(実際に20日ズレた事故あり)ため、直接は信用しない。
const SOURCE_URL = process.env.KOTOKOTO_CARS_URL
  ?? "https://kotokoto-company-site.vercel.app/data/cars.json";
const SOURCE = process.env.KOTOKOTO_CARS_JSON
  ?? "C:/Users/jupit/workspace/kotokoto-company-site/data/cars.json";

async function loadSource() {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cars = await res.json();
    console.log(`在庫ソース: ライブ (${SOURCE_URL})`);
    return cars;
  } catch (e) {
    if (!fs.existsSync(SOURCE)) {
      console.error(`ライブ取得失敗(${e.message})かつローカルも見つかりません: ${SOURCE}`);
      process.exit(1);
    }
    console.warn(`⚠ ライブ取得失敗(${e.message}) → ローカルにフォールバック: ${SOURCE}`);
    return JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  }
}

function slugify(car) {
  const name = `${car.maker}-${car.name}`.toLowerCase()
    .replace(/メルセデスａｍｇ|メルセデスamg/g, "amg")
    .replace(/[^a-z0-9぀-ヿ一-龯]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${name}-${car.csId ?? "local"}`.slice(0, 60);
}

function toInventory(car) {
  return {
    id: slugify(car),
    csId: car.csId ?? null,
    maker: car.maker ?? "",
    model: [car.name, car.grade].filter(Boolean).join(" "),
    year: car.year ?? null,
    mileageKm: car.mileage != null ? Math.round(car.mileage * 10000) : null,
    priceJpy: car.price != null ? Math.round(car.price * 10000) : null,
    body: car.body ?? null,
    color: car.color ?? null,
    inspection: car.inspection ?? null,
    features: (car.features ?? []).slice(0, 10),
    sellingPoints: [
      car.year ? `${car.year}年式` : null,
      car.mileage != null ? `走行${car.mileage}万km` : null,
      "大阪・寝屋川で現車確認OK",
    ].filter(Boolean),
    photos: [],
    sourceNote: `カーセンサー実在庫(${car.csId ?? "?"})と同期 ${new Date().toISOString().slice(0, 10)}`,
  };
}

async function downloadPhotos(car, entry, maxPhotos) {
  const dir = path.join(CONTENT, "car-photos", entry.id);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const url of (car.images ?? []).slice(0, maxPhotos)) {
    const file = String(n + 1).padStart(2, "0") + ".jpg";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      if (!r.ok) continue;
      fs.writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer()));
      entry.photos.push(file);
      n++;
    } catch { /* skip */ }
  }
  return n;
}

function upsert(inventory, entry) {
  const i = inventory.findIndex((x) => x.id === entry.id || (entry.csId && x.csId === entry.csId));
  if (i >= 0) inventory[i] = { ...inventory[i], ...entry };
  else inventory.push(entry);
}

async function main() {
  const argv = process.argv.slice(2);
  const source = await loadSource();
  const onSale = source.filter((c) => !c.sold);

  if (argv.length === 0 || argv.includes("--list")) {
    console.log(`実在庫(販売中 ${onSale.length}台) — 「node video/sync-inventory.mjs <csId>」で取り込み:`);
    for (const c of onSale) {
      console.log(`  ${c.csId}  ${c.maker} ${c.name} ${c.grade ?? ""}  ${c.price}万円 / ${c.year ?? "?"}年式 / 走行${c.mileage}万km / 写真${(c.images ?? []).length}枚`);
    }
    return;
  }

  const invPath = path.join(CONTENT, "inventory", "cars.json");
  const inventory = fs.existsSync(invPath) ? JSON.parse(fs.readFileSync(invPath, "utf8")) : [];

  const targets = argv.includes("--all")
    ? onSale
    : onSale.filter((c) => {
        const key = argv.find((a) => !a.startsWith("--")) ?? "";
        return c.csId === key || `${c.maker}${c.name}${c.grade ?? ""}`.includes(key);
      });
  if (!targets.length) {
    console.error("該当する車が見つかりません。--list で一覧を確認してください。");
    process.exit(1);
  }
  const maxPhotos = argv.includes("--all") ? 6 : 10;
  for (const car of targets) {
    const entry = toInventory(car);
    const n = await downloadPhotos(car, entry, maxPhotos);
    upsert(inventory, entry);
    console.log(`✔ ${entry.id}  (${car.maker} ${car.name} ${car.price}万円, 写真${n}枚)`);
  }
  fs.writeFileSync(invPath, JSON.stringify(inventory, null, 2) + "\n", "utf8");
  console.log(`\ncontent/inventory/cars.json 更新: 計${inventory.length}台`);
  console.log("次: 台本を作って npm run make:video -- <videoId>");
}

main().catch((e) => { console.error(e); process.exit(1); });
