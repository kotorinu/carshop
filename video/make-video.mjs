// 車両動画ジェネレータ(HyperFrames版)
// content/scripts/<videoId>.json + content/car-photos/<carId>/ から
// TikTok縦動画(1080x1920)を焼き切る。VOICEVOX/Stable Diffusion不要。
//
//   node video/make-video.mjs <videoId>            # 1本レンダリング
//   node video/make-video.mjs <videoId> --draft    # 低画質で高速確認
//   node video/make-video.mjs --list               # 台本一覧
//
// 出力: content/renders/<videoId>.mp4
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "video", "config.json"), "utf8"));

const OVERLAP = 0.25; // シーン間クロスフェード秒

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function listScripts() {
  const dir = path.join(CONTENT, "scripts");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

// 写真を build にコピー。無ければプレースホルダSVGを生成して警告。
function resolvePhoto(carId, photoRef, buildDir, car, warnings) {
  const src = path.join(CONTENT, "car-photos", carId, photoRef);
  const assetsDir = path.join(buildDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  if (fs.existsSync(src)) {
    const dest = path.join(assetsDir, photoRef);
    fs.copyFileSync(src, dest);
    return { src: `assets/${photoRef}`, placeholder: false };
  }
  warnings.add(photoRef);
  const name = `placeholder-${photoRef.replace(/\.[a-z]+$/i, "")}.svg`;
  const label = `${car?.maker ?? ""} ${car?.model ?? ""}`.trim() || carId;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1a1d26"/><stop offset="1" stop-color="#0a0a0c"/>
  </linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <text x="540" y="900" font-family="sans-serif" font-size="140" text-anchor="middle" fill="#2e3340">&#128663;</text>
  <text x="540" y="1020" font-family="sans-serif" font-size="44" font-weight="bold" text-anchor="middle" fill="#4a5164">${esc(label)}</text>
  <text x="540" y="1090" font-family="sans-serif" font-size="34" text-anchor="middle" fill="#3a3f4e">実車写真(${esc(photoRef)})をここに</text>
</svg>`;
  fs.writeFileSync(path.join(assetsDir, name), svg, "utf8");
  return { src: `assets/${name}`, placeholder: true };
}

// caption「相場650万円 → 598万円」を価格リビール用に分解
function parsePriceReveal(caption) {
  const m = caption.match(/^(.*?)(?:→|➡|⇒)(.*)$/);
  if (!m) return null;
  const before = m[1].trim();
  const after = m[2].trim();
  if (!/[0-9０-９]/.test(after)) return null;
  return { before, after };
}

function classifyScene(scene, isLast) {
  if (scene.visualType === "carPhoto") return "photo";
  if (isLast || /LINE|ライン/i.test(scene.caption + (scene.narration ?? ""))) return "line";
  if (parsePriceReveal(scene.caption)) return "price";
  return "card";
}

// Ken Burnsの原点をシーンごとに変える(決定的)
const ORIGINS = ["50% 40%", "30% 60%", "70% 35%", "45% 70%", "60% 50%"];

function buildSceneHtml(scene, i, ctx) {
  const kind = classifyScene(scene, i === ctx.lastIndex);
  const id = `s${i}`;
  const start = i === 0 ? 0 : scene.startSec - OVERLAP;
  const dur = scene.endSec - start;
  const track = (i % 2) + 1;
  const attrs = `id="${id}" class="clip scene scene-${kind}" data-start="${start}" data-duration="${dur.toFixed(2)}" data-track-index="${track}" style="z-index:${10 + i}"`;
  const cap = esc(scene.caption);

  if (kind === "photo") {
    const photo = ctx.photoFor(scene.photoRef ?? "01.jpg");
    return `<div ${attrs}>
      <div class="fx">
        <div class="photo-wrap"><img class="photo" src="${photo.src}?scene=${i}" alt=""></div>
        <div class="scrim"></div>
        <div class="flash"></div>
        ${i === 0 && scene.caption.trim() === (ctx.script.hookText ?? "").trim() ? "" : `<div class="caption-zone"><div class="caption">${cap}</div></div>`}
        ${i === 0 ? `<div class="hook-badge">${esc(ctx.script.hookText)}</div>` : ""}
      </div>
    </div>`;
  }
  if (kind === "price") {
    const p = parsePriceReveal(scene.caption);
    return `<div ${attrs}>
      <div class="fx">
        <div class="bg-type" data-layout-allow-overflow>PRICE</div>
        <div class="glow"></div>
        <div class="price-stack">
          <div class="price-before"><span class="strike">${esc(p.before)}</span></div>
          <div class="price-arrow">▼</div>
          <div class="price-after">${esc(p.after)}</div>
          <div class="price-note">支払総額・法定整備付き・保証付き</div>
        </div>
      </div>
    </div>`;
  }
  if (kind === "line") {
    return `<div ${attrs}>
      <div class="fx">
        <div class="glow glow-green"></div>
        <div class="line-card">
          <div class="line-kicker">${esc(ctx.config.area)}の外車専門</div>
          <div class="line-shop">${esc(ctx.config.shopName)}</div>
          <img class="line-qr" src="assets/line-qr.png" alt="LINE QR">
          <div class="line-cta">${cap}</div>
          <div class="line-sub">${esc(ctx.script.cta)}</div>
          <div class="line-addr">${esc(ctx.config.address)}／${esc(ctx.config.hours)}</div>
        </div>
      </div>
    </div>`;
  }
  // 汎用テキストカード
  return `<div ${attrs}>
    <div class="fx">
      <div class="bg-type" data-layout-allow-overflow>${esc((ctx.car?.maker ?? "CAR").toUpperCase().slice(0, 6))}</div>
      <div class="glow"></div>
      <div class="card-rule"></div>
      <div class="card-text">${cap}</div>
      ${scene.sfx ? `<div class="sfx-badge">${esc(scene.sfx)}</div>` : ""}
    </div>
  </div>`;
}

function buildTweens(scene, i, ctx) {
  const kind = classifyScene(scene, i === ctx.lastIndex);
  const id = `#s${i}`;
  const start = i === 0 ? 0 : scene.startSec - OVERLAP;
  const dur = scene.endSec - start;
  const t = [];
  // 入場クロスフェード(トランジション)。先頭シーンはフェード不要で即表示。
  if (i > 0) {
    t.push(`tl.fromTo("${id} .fx",{opacity:0},{opacity:1,duration:${OVERLAP},ease:"none"},${start.toFixed(2)});`);
  }
  const inAt = (start + (i === 0 ? 0.15 : OVERLAP)).toFixed(2);

  if (kind === "photo") {
    const zoom = scene.interrupt === "zoom" ? 1.12 : 1.06;
    const origin = ORIGINS[i % ORIGINS.length];
    t.push(`tl.set("${id} .photo",{transformOrigin:"${origin}"},${start.toFixed(2)});`);
    t.push(`tl.fromTo("${id} .photo",{scale:1.02},{scale:${zoom},duration:${dur.toFixed(2)},ease:"none"},${start.toFixed(2)});`);
    if (!(i === 0 && scene.caption.trim() === (ctx.script.hookText ?? "").trim())) {
      t.push(`tl.fromTo("${id} .caption",{y:26,opacity:0,scale:0.94},{y:0,opacity:1,scale:1,duration:0.38,ease:"back.out(1.6)"},${inAt});`);
    }
    if (i === 0) {
      t.push(`tl.fromTo("${id} .hook-badge",{scale:1.5,opacity:0},{scale:1,opacity:1,duration:0.3,ease:"expo.out"},0.1);`);
    }
    if (scene.interrupt === "colorShift" || scene.interrupt === "textPop") {
      t.push(`tl.fromTo("${id} .flash",{opacity:0.75},{opacity:0,duration:0.45,ease:"power2.out"},${inAt});`);
    }
  } else if (kind === "price") {
    t.push(`tl.fromTo("${id} .price-before",{x:-70,opacity:0},{x:0,opacity:1,duration:0.45,ease:"power3.out"},${inAt});`);
    t.push(`tl.fromTo("${id} .strike",{backgroundSize:"0% 6px"},{backgroundSize:"100% 6px",duration:0.35,ease:"power2.inOut"},${(+inAt + 0.5).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .price-arrow",{y:-18,opacity:0},{y:0,opacity:1,duration:0.3,ease:"power2.out"},${(+inAt + 0.7).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .price-after",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"expo.out"},${(+inAt + 0.95).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .price-note",{opacity:0},{opacity:1,duration:0.4,ease:"sine.out"},${(+inAt + 1.35).toFixed(2)});`);
    t.push(`tl.to("${id} .price-after",{textShadow:"0 0 60px rgba(232,184,75,0.85)",duration:0.5,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((dur - 2) / 1) - 1)}},${(+inAt + 1.5).toFixed(2)});`);
  } else if (kind === "line") {
    t.push(`tl.fromTo("${id} .line-kicker",{y:-22,opacity:0},{y:0,opacity:1,duration:0.4,ease:"power2.out"},${inAt});`);
    t.push(`tl.fromTo("${id} .line-shop",{y:24,opacity:0},{y:0,opacity:1,duration:0.5,ease:"power3.out"},${(+inAt + 0.12).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .line-qr",{scale:0.6,opacity:0},{scale:1,opacity:1,duration:0.55,ease:"back.out(1.4)"},${(+inAt + 0.3).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .line-cta",{y:30,opacity:0},{y:0,opacity:1,duration:0.45,ease:"expo.out"},${(+inAt + 0.55).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .line-sub",{opacity:0},{opacity:1,duration:0.4,ease:"sine.out"},${(+inAt + 0.8).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .line-addr",{opacity:0},{opacity:1,duration:0.4,ease:"sine.out"},${(+inAt + 0.95).toFixed(2)});`);
  } else {
    t.push(`tl.fromTo("${id} .card-rule",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.inOut"},${inAt});`);
    t.push(`tl.fromTo("${id} .card-text",{x:46,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power3.out"},${(+inAt + 0.15).toFixed(2)});`);
    t.push(`tl.fromTo("${id} .bg-type",{x:-40},{x:40,duration:${dur.toFixed(2)},ease:"none"},${start.toFixed(2)});`);
    if (scene.sfx) {
      t.push(`tl.fromTo("${id} .sfx-badge",{scale:2,opacity:0,rotation:-8},{scale:1,opacity:1,rotation:-8,duration:0.28,ease:"expo.out"},${(+inAt + 0.4).toFixed(2)});`);
    }
  }
  return t.join("\n      ");
}

function buildHtml(script, ctx) {
  const total = script.scenes[script.scenes.length - 1].endSec;
  const scenesHtml = script.scenes.map((s, i) => buildSceneHtml(s, i, ctx)).join("\n    ");
  const tweens = script.scenes.map((s, i) => buildTweens(s, i, ctx)).join("\n      ");
  const C = ctx.config;
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${esc(script.videoId)}</title>
<style>
  html,body{margin:0;padding:0;background:#000;}
  #comp-root{
    position:relative;width:1080px;height:1920px;overflow:hidden;background:${C.bg};
    font-family:"Noto Sans JP",sans-serif;
    color:#fff;
  }
  .scene{position:absolute;inset:0;}
  .fx{position:absolute;inset:0;}
  /* --- 写真シーン --- */
  .photo-wrap{position:absolute;inset:0;overflow:hidden;}
  .photo{width:100%;height:100%;object-fit:cover;}
  .scrim{position:absolute;inset:0;background:
    linear-gradient(to bottom, rgba(10,10,12,0.55) 0%, rgba(10,10,12,0) 22%, rgba(10,10,12,0) 55%, rgba(10,10,12,0.82) 100%);}
  .flash{position:absolute;inset:0;background:${C.accent};opacity:0;mix-blend-mode:overlay;}
  .caption-zone{position:absolute;left:0;right:0;bottom:520px;display:flex;justify-content:center;padding:0 70px;}
  .caption{
    font-size:76px;font-weight:900;line-height:1.28;text-align:center;letter-spacing:0.01em;
    text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,0 6px 22px rgba(0,0,0,0.65);
    font-variant-numeric:tabular-nums;
  }
  .hook-badge{
    position:absolute;top:340px;left:70px;right:70px;text-align:center;
    font-size:96px;font-weight:900;line-height:1.22;color:#fff;
    text-shadow:-5px -5px 0 #000,5px -5px 0 #000,-5px 5px 0 #000,5px 5px 0 #000,0 8px 30px rgba(0,0,0,0.7);
  }
  /* --- カード系シーン共通 --- */
  .bg-type{
    position:absolute;top:44%;left:-60px;right:-60px;text-align:center;
    font-size:340px;font-weight:900;letter-spacing:0.04em;color:rgba(255,255,255,0.045);
    transform:translateY(-50%);white-space:nowrap;
  }
  .glow{position:absolute;left:50%;top:52%;width:1400px;height:1400px;transform:translate(-50%,-50%);
    background:radial-gradient(circle, rgba(232,184,75,0.16) 0%, rgba(232,184,75,0) 60%);}
  .glow-green{background:radial-gradient(circle, rgba(6,199,85,0.20) 0%, rgba(6,199,85,0) 60%);}
  /* 価格リビール */
  .price-stack{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;
    justify-content:center;align-items:center;gap:38px;padding:300px 80px 500px;box-sizing:border-box;}
  .price-before{font-size:84px;font-weight:800;color:#9aa0ae;font-variant-numeric:tabular-nums;}
  .strike{background:linear-gradient(#ff5a5a,#ff5a5a) no-repeat left 58%/0% 6px;padding:0 6px;}
  .price-arrow{font-size:64px;color:${C.accent};}
  .price-after{font-size:150px;font-weight:900;color:${C.accent};letter-spacing:-0.01em;
    font-variant-numeric:tabular-nums;text-shadow:0 0 0 rgba(232,184,75,0);}
  .price-note{font-size:38px;font-weight:700;color:#c8cdd8;}
  /* LINEカード */
  .line-card{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;
    justify-content:center;align-items:center;gap:30px;padding:300px 90px 500px;box-sizing:border-box;text-align:center;}
  .line-kicker{font-size:42px;font-weight:700;color:${C.accent};letter-spacing:0.14em;}
  .line-shop{font-size:92px;font-weight:900;line-height:1.15;}
  .line-qr{width:390px;height:390px;border-radius:28px;background:#fff;padding:22px;box-sizing:border-box;
    box-shadow:0 24px 70px rgba(0,0,0,0.55);}
  .line-cta{font-size:66px;font-weight:900;color:${C.lineGreen};
    text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000;}
  .line-sub{font-size:40px;font-weight:700;color:#e8eaf0;}
  .line-addr{font-size:30px;color:#8b91a0;}
  /* 汎用カード */
  .card-rule{position:absolute;top:820px;left:110px;width:220px;height:10px;background:${C.accent};transform-origin:left center;}
  .card-text{position:absolute;top:870px;left:110px;right:110px;font-size:88px;font-weight:900;line-height:1.3;}
  .sfx-badge{position:absolute;top:640px;right:110px;font-size:54px;font-weight:900;color:#0a0a0c;
    background:${C.accent};padding:16px 34px;border-radius:999px;transform:rotate(-8deg);}
</style>
</head>
<body>
  <div id="comp-root" data-composition-id="root" data-width="1080" data-height="1920" data-start="0" data-duration="${total}">
    ${scenesHtml}
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tweens}
      window.__timelines["root"] = tl;
    </script>
  </div>
</body>
</html>`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--list") || argv.length === 0) {
    console.log("台本一覧(content/scripts/):");
    for (const id of listScripts()) console.log("  " + id);
    console.log("\n使い方: node video/make-video.mjs <videoId> [--draft] [--no-render]");
    return;
  }
  const videoId = argv.find((a) => !a.startsWith("--"));
  const draft = argv.includes("--draft");
  const noRender = argv.includes("--no-render");

  const scriptPath = path.join(CONTENT, "scripts", `${videoId}.json`);
  if (!fs.existsSync(scriptPath)) {
    console.error(`台本が見つかりません: ${scriptPath}`);
    process.exit(1);
  }
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const cars = JSON.parse(fs.readFileSync(path.join(CONTENT, "inventory", "cars.json"), "utf8"));
  const car = cars.find((c) => c.id === script.carId);

  const buildDir = path.join(ROOT, "video", "build", videoId);
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  // LINE QR(実URLは video/config.json の lineUrl)
  const assetsDir = path.join(buildDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  await QRCode.toFile(path.join(assetsDir, "line-qr.png"), CONFIG.lineUrl, {
    width: 800, margin: 1, color: { dark: "#000000", light: "#ffffff" },
  });

  const warnings = new Set();
  const photoCache = new Map();
  const ctx = {
    script, car, config: CONFIG, lastIndex: script.scenes.length - 1,
    photoFor(ref) {
      if (!photoCache.has(ref)) photoCache.set(ref, resolvePhoto(script.carId, ref, buildDir, car, warnings));
      return photoCache.get(ref);
    },
  };

  fs.writeFileSync(path.join(buildDir, "index.html"), buildHtml(script, ctx), "utf8");
  console.log(`✔ composition生成: ${path.relative(ROOT, buildDir)}\\index.html`);
  if (warnings.size) {
    console.warn(`⚠ 実車写真が未配置のため仮画像で生成: ${[...warnings].join(", ")}`);
    console.warn(`  → content/car-photos/${script.carId}/ にJPGを置いて再実行すると本番品質になります`);
  }
  if (CONFIG.lineUrl.includes("your-line-id")) {
    console.warn("⚠ video/config.json の lineUrl が仮のままです(QRがダミー)");
  }
  if (noRender) return;

  const outDir = path.join(CONTENT, "renders");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${videoId}.mp4`);
  const q = draft ? "draft" : "standard";
  console.log(`▶ lint...`);
  execSync(`npx hyperframes lint "${buildDir}"`, { stdio: "inherit", cwd: ROOT });
  console.log(`▶ render (${q})...`);
  execSync(`npx hyperframes render "${buildDir}" --quality ${q} --output "${out}"`, { stdio: "inherit", cwd: ROOT });
  console.log(`✅ 完成: ${path.relative(ROOT, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
