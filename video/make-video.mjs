// 車両動画ジェネレータ(HyperFrames版 v2)
// content/scripts/<videoId>.json + content/car-photos/<carId>/ から
// TikTok縦動画(1080x1920)を焼き切る。VOICEVOX/Stable Diffusion不要。
//
//   node video/make-video.mjs <videoId>            # 1本レンダリング
//   node video/make-video.mjs <videoId> --draft    # 低画質で高速確認
//   node video/make-video.mjs --list               # 台本一覧
//
// 台本の書き方(v2):
//   caption内の【word】→ アクセント色で強調表示
//   visualType: carPhoto(interrupt: punch/panLeft/panRight/colorShift)
//              | priceReveal(priceLabel/priceValue/priceUnit/priceNote)
//              | lineCta | textCard(bigText, \n改行可)
//   theme: "kaitori" で赤基調(買取用)。既定は金基調(在庫用)
//   chip: {line1,line2} 写真シーン左上の車両情報チップ
// 旧形式(visualType: manga)も自動変換で動く。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "video", "config.json"), "utf8"));

const OVERLAP = 0.18; // シーン間クロスフェード秒(高エネルギー=短く)

const THEMES = {
  default: { accent: "#E8B84B", accentDim: "rgba(232,184,75,", danger: "#FF5A5A" },
  kaitori: { accent: "#FF453A", accentDim: "rgba(255,69,58,", danger: "#FF5A5A" },
};

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// 【強調】→ <em>
function rich(s) {
  return esc(s).replace(/【([^】]*)】/g, "<em>$1</em>");
}

function listScripts() {
  const dir = path.join(CONTENT, "scripts");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

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

function parsePriceReveal(caption) {
  const m = String(caption ?? "").match(/^(.*?)(?:→|➡|⇒)(.*)$/);
  if (!m) return null;
  if (!/[0-9０-９]/.test(m[2])) return null;
  return { before: m[1].trim(), after: m[2].trim() };
}

// 旧形式(manga等)を新visualTypeへ正規化
function normalizeScene(scene, isLast) {
  const s = { ...scene };
  if (s.visualType === "carPhoto" || s.visualType === "priceReveal" || s.visualType === "lineCta" || s.visualType === "textCard" || s.visualType === "videoClip") {
    if (s.visualType === "carPhoto" && !["punch", "panLeft", "panRight", "colorShift"].includes(s.interrupt)) {
      s.interrupt = s.interrupt === "zoom" ? "punch" : "panRight";
    }
    return s;
  }
  // 旧 manga → 内容から推定
  if (isLast || /LINE|ライン/i.test((s.caption ?? "") + (s.narration ?? ""))) { s.visualType = "lineCta"; return s; }
  const p = parsePriceReveal(s.caption);
  if (p) {
    const num = p.after.match(/([0-9,.]+)\s*(万円|万|円)?/);
    s.visualType = "priceReveal";
    s.priceLabel = p.before;
    s.priceValue = num ? parseFloat(num[1].replace(/,/g, "")) : null;
    s.priceUnit = num?.[2] ?? "万円";
    s.priceNote = "支払総額・法定整備付き・保証付き";
    return s;
  }
  s.visualType = "textCard";
  s.bigText = s.caption;
  return s;
}

const PAN_SET = ["punch", "panRight", "panLeft"];

function sceneTiming(scene, i) {
  const start = i === 0 ? 0 : scene.startSec - OVERLAP;
  return { start, dur: scene.endSec - start };
}

function buildSceneHtml(scene, i, ctx) {
  const id = `s${i}`;
  const { start, dur } = sceneTiming(scene, i);
  const track = (i % 2) + 1;
  const attrs = `id="${id}" class="clip scene scene-${scene.visualType}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${track}" style="z-index:${10 + i}"`;
  const cap = rich(scene.caption);
  const chip = ctx.script.chip
    ? `<div class="chip"><div class="chip-1">${esc(ctx.script.chip.line1)}</div><div class="chip-2">${esc(ctx.script.chip.line2)}</div></div>`
    : "";

  if (scene.visualType === "videoClip") {
    // AI生成クリップ(content/car-clips/<carId>/<clipRef>)。
    // HyperFramesの規則で<video>はタイムドdivに入れられないため、
    // 映像本体はトップレベルの別クリップ(track3)としてctx.extraClipsに登録し、
    // このシーンdivは字幕・チップ等のオーバーレイだけを持つ。
    ctx.extraClips.push(
      `<video id="${id}-clip" class="scene-video" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="3" src="${scene._clipSrc}" muted playsinline style="z-index:5"></video>`
    );
    return `<div ${attrs}>
      <div class="fx fx-overlay">
        <div class="vignette"></div>
        <div class="scrim"></div>
        <div class="flash"></div>
        ${chip}
        <div class="cap-zone"><div class="cap-bar"></div><div class="caption">${cap}</div></div>
        ${scene.sfx ? `<div class="sfx-badge">${esc(scene.sfx)}</div>` : ""}
      </div>
    </div>`;
  }
  if (scene.visualType === "carPhoto") {
    const photo = ctx.photoFor(scene.photoRef ?? "01.jpg");
    const isHook = i === 0;
    const showCaption = !(isHook && (scene.caption ?? "").trim() === (ctx.script.hookText ?? "").trim());
    return `<div ${attrs}>
      <div class="fx">
        <div class="photo-wrap"><img class="photo" src="${photo.src}?scene=${i}" alt=""></div>
        <div class="vignette"></div>
        <div class="scrim"></div>
        <div class="flash"></div>
        ${chip}
        ${isHook ? `<div class="hook"><div class="hook-text">${String(ctx.script.hookText ?? "").split(/\\n|\n/).map((l) => `<div class="hook-line">${rich(l)}</div>`).join("")}</div><div class="hook-bar"></div></div>` : ""}
        ${showCaption ? `<div class="cap-zone"><div class="cap-bar"></div><div class="caption">${cap}</div></div>` : ""}
        ${scene.sfx ? `<div class="sfx-badge">${esc(scene.sfx)}</div>` : ""}
      </div>
    </div>`;
  }
  if (scene.visualType === "priceReveal") {
    return `<div ${attrs}>
      <div class="fx">
        <div class="bg-type" data-layout-allow-overflow>PRICE</div>
        <div class="glow"></div>
        <div class="price-stack">
          <div class="price-label">${esc(scene.priceLabel ?? "支払総額")}</div>
          <div class="price-main"><span class="price-num" id="${id}-num">0</span><span class="price-unit">${esc(scene.priceUnit ?? "万円")}</span></div>
          <div class="price-under"></div>
          <div class="price-note">${esc(scene.priceNote ?? "")}</div>
        </div>
      </div>
    </div>`;
  }
  if (scene.visualType === "lineCta") {
    return `<div ${attrs}>
      <div class="fx">
        <div class="glow glow-green"></div>
        <div class="line-card">
          <div class="line-kicker">${esc(ctx.config.area)}の${esc(ctx.script.theme === "kaitori" ? "車買取" : "外車専門")}</div>
          <div class="line-shop">${esc(ctx.config.shopName)}</div>
          <img class="line-qr" src="assets/line-qr.png" alt="LINE QR">
          <div class="line-cta">${cap}</div>
          <div class="line-sub">${esc(ctx.script.cta)}</div>
          <div class="line-addr">${esc(ctx.config.address)}／${esc(ctx.config.hours)}</div>
        </div>
      </div>
    </div>`;
  }
  // textCard
  const lines = String(scene.bigText ?? scene.caption ?? "").split(/\\n|\n/).map((l) => `<div class="big-line">${rich(l)}</div>`).join("");
  return `<div ${attrs}>
    <div class="fx">
      <div class="glow"></div>
      <div class="card-slash"></div>
      <div class="big-stack">${lines}</div>
      ${scene.sfx ? `<div class="sfx-badge">${esc(scene.sfx)}</div>` : ""}
    </div>
  </div>`;
}

function buildTweens(scene, i, ctx) {
  const id = `#s${i}`;
  const { start, dur } = sceneTiming(scene, i);
  const t = [];
  const s2 = (n) => n.toFixed(2);
  if (i > 0) t.push(`tl.fromTo("${id} .fx",{opacity:0},{opacity:1,duration:${OVERLAP},ease:"none"},${s2(start)});`);
  const inAt = start + (i === 0 ? 0.1 : OVERLAP);

  if (scene.visualType === "videoClip") {
    t.push(`tl.fromTo("${id} .flash",{opacity:0.85},{opacity:0,duration:0.3,ease:"power2.out"},${s2(start)});`);
    t.push(`tl.fromTo("${id} .cap-bar",{scaleX:0},{scaleX:1,duration:0.26,ease:"power2.inOut"},${s2(inAt)});`);
    t.push(`tl.fromTo("${id} .caption",{x:34,opacity:0},{x:0,opacity:1,duration:0.32,ease:"power3.out"},${s2(inAt + 0.06)});`);
    if (ctx.script.chip) {
      t.push(`tl.fromTo("${id} .chip",{y:-16,opacity:0},{y:0,opacity:1,duration:0.3,ease:"power2.out"},${s2(inAt + 0.1)});`);
    }
    if (scene.sfx) {
      t.push(`tl.fromTo("${id} .sfx-badge",{scale:2.2,opacity:0,rotation:-8},{scale:1,opacity:1,rotation:-8,duration:0.26,ease:"expo.out"},${s2(inAt + 0.3)});`);
    }
    return t.join("\n      ");
  }
  if (scene.visualType === "carPhoto") {
    // 写真モーション: punch=パンチイン / pan=横流し(1本のfromToに統合し多重transform禁止則を守る)
    const kind = PAN_SET.includes(scene.interrupt) ? scene.interrupt : "punch";
    const origin = ["50% 42%", "38% 55%", "62% 45%"][i % 3];
    t.push(`tl.set("${id} .photo",{transformOrigin:"${origin}"},${s2(start)});`);
    if (kind === "punch") {
      t.push(`tl.fromTo("${id} .photo",{scale:1.18},{scale:1.03,duration:${s2(dur)},ease:"expo.out"},${s2(start)});`);
      t.push(`tl.fromTo("${id} .flash",{opacity:0.85},{opacity:0,duration:0.3,ease:"power2.out"},${s2(start)});`);
    } else {
      const dir = kind === "panLeft" ? [34, -34] : [-34, 34];
      t.push(`tl.fromTo("${id} .photo",{scale:1.1,x:${dir[0]}},{scale:1.1,x:${dir[1]},duration:${s2(dur)},ease:"none"},${s2(start)});`);
    }
    if (scene.interrupt === "colorShift") {
      t.push(`tl.fromTo("${id} .flash",{opacity:0.7},{opacity:0,duration:0.45,ease:"power2.out"},${s2(inAt)});`);
    }
    if (i === 0) {
      t.push(`tl.fromTo("${id} .hook-text",{y:44,opacity:0},{y:0,opacity:1,duration:0.34,ease:"expo.out"},0.06);`);
      t.push(`tl.fromTo("${id} .hook-bar",{scaleX:0},{scaleX:1,duration:0.3,ease:"power3.inOut"},0.3);`);
    }
    if (!(i === 0 && (scene.caption ?? "").trim() === (ctx.script.hookText ?? "").trim())) {
      t.push(`tl.fromTo("${id} .cap-bar",{scaleX:0},{scaleX:1,duration:0.26,ease:"power2.inOut"},${s2(inAt)});`);
      t.push(`tl.fromTo("${id} .caption",{x:34,opacity:0},{x:0,opacity:1,duration:0.32,ease:"power3.out"},${s2(inAt + 0.06)});`);
    }
    if (ctx.script.chip) {
      t.push(`tl.fromTo("${id} .chip",{y:-16,opacity:0},{y:0,opacity:1,duration:0.3,ease:"power2.out"},${s2(inAt + 0.1)});`);
    }
    if (scene.sfx) {
      t.push(`tl.fromTo("${id} .sfx-badge",{scale:2.2,opacity:0,rotation:-8},{scale:1,opacity:1,rotation:-8,duration:0.26,ease:"expo.out"},${s2(inAt + 0.3)});`);
    }
  } else if (scene.visualType === "priceReveal") {
    const val = scene.priceValue ?? 0;
    const decimals = String(val).includes(".") ? 1 : 0;
    t.push(`tl.fromTo("${id} .price-label",{y:-20,opacity:0},{y:0,opacity:1,duration:0.32,ease:"power2.out"},${s2(inAt)});`);
    t.push(`tl.fromTo("${id} .price-main",{scale:0.82,opacity:0},{scale:1,opacity:1,duration:0.4,ease:"back.out(1.5)"},${s2(inAt + 0.18)});`);
    // カウントアップ(タイムライン駆動=シーク可能で決定的)
    t.push(`{const o={v:0},el=document.querySelector("${id}-num");tl.to(o,{v:${val},duration:0.9,ease:"expo.out",onUpdate:()=>{el.textContent=o.v.toFixed(${decimals});}},${s2(inAt + 0.22)});}`);
    t.push(`tl.fromTo("${id} .price-under",{scaleX:0},{scaleX:1,duration:0.4,ease:"power3.inOut"},${s2(inAt + 0.7)});`);
    t.push(`tl.fromTo("${id} .price-note",{opacity:0,y:14},{opacity:1,y:0,duration:0.36,ease:"sine.out"},${s2(inAt + 0.95)});`);
    t.push(`tl.to("${id} .price-main",{textShadow:"0 0 70px ${ctx.theme.accentDim}0.9)",duration:0.5,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((dur - 1.6) / 1) * 2 - 1)}},${s2(inAt + 1.2)});`);
  } else if (scene.visualType === "lineCta") {
    t.push(`tl.fromTo("${id} .line-kicker",{y:-22,opacity:0},{y:0,opacity:1,duration:0.36,ease:"power2.out"},${s2(inAt)});`);
    t.push(`tl.fromTo("${id} .line-shop",{y:22,opacity:0},{y:0,opacity:1,duration:0.44,ease:"power3.out"},${s2(inAt + 0.1)});`);
    t.push(`tl.fromTo("${id} .line-qr",{scale:0.6,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"back.out(1.4)"},${s2(inAt + 0.26)});`);
    t.push(`tl.fromTo("${id} .line-cta",{y:26,opacity:0},{y:0,opacity:1,duration:0.4,ease:"expo.out"},${s2(inAt + 0.48)});`);
    t.push(`tl.fromTo("${id} .line-sub",{opacity:0},{opacity:1,duration:0.36,ease:"sine.out"},${s2(inAt + 0.7)});`);
    t.push(`tl.fromTo("${id} .line-addr",{opacity:0},{opacity:1,duration:0.36,ease:"sine.out"},${s2(inAt + 0.84)});`);
  } else {
    t.push(`tl.fromTo("${id} .card-slash",{xPercent:-130},{xPercent:0,duration:0.4,ease:"power4.out"},${s2(inAt)});`);
    t.push(`tl.fromTo("${id} .big-line",{y:40,opacity:0},{y:0,opacity:1,duration:0.4,stagger:0.12,ease:"power3.out"},${s2(inAt + 0.12)});`);
    if (scene.sfx) {
      t.push(`tl.fromTo("${id} .sfx-badge",{scale:2.2,opacity:0,rotation:-8},{scale:1,opacity:1,rotation:-8,duration:0.26,ease:"expo.out"},${s2(inAt + 0.5)});`);
    }
  }
  return t.join("\n      ");
}

function buildHtml(script, ctx) {
  const total = script.scenes[script.scenes.length - 1].endSec;
  const scenesHtml = script.scenes.map((s, i) => buildSceneHtml(s, i, ctx)).join("\n    ");
  const tweens = script.scenes.map((s, i) => buildTweens(s, i, ctx)).join("\n      ");
  const C = ctx.config;
  const A = ctx.theme.accent;
  const AD = ctx.theme.accentDim;
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${esc(script.videoId)}</title>
<style>
  html,body{margin:0;padding:0;background:#000;}
  #comp-root{
    position:relative;width:1080px;height:1920px;overflow:hidden;background:${C.bg};
    font-family:"Noto Sans JP",sans-serif;color:#fff;
  }
  .scene{position:absolute;inset:0;}
  .fx{position:absolute;inset:0;}
  .scene-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
  em{font-style:normal;color:${A};}
  /* --- 写真シーン --- */
  .photo-wrap{position:absolute;inset:0;overflow:hidden;}
  .photo{width:100%;height:100%;object-fit:cover;}
  .vignette{position:absolute;inset:0;background:radial-gradient(ellipse 120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);}
  .scrim{position:absolute;inset:0;background:
    linear-gradient(to bottom, rgba(6,6,8,0.5) 0%, rgba(6,6,8,0) 20%, rgba(6,6,8,0) 58%, rgba(6,6,8,0.88) 100%);}
  .flash{position:absolute;inset:0;background:#fff;opacity:0;}
  .chip{position:absolute;top:310px;left:56px;background:rgba(8,8,10,0.72);border-left:8px solid ${A};
    padding:18px 28px;border-radius:10px;backdrop-filter:blur(4px);}
  .chip-1{font-size:38px;font-weight:900;letter-spacing:0.02em;}
  .chip-2{font-size:28px;font-weight:700;color:#c9cdd8;margin-top:2px;font-variant-numeric:tabular-nums;}
  .hook{position:absolute;top:430px;left:60px;right:60px;text-align:center;}
  .hook-text{font-size:100px;font-weight:900;line-height:1.18;letter-spacing:-0.01em;
    text-shadow:-5px -5px 0 #000,5px -5px 0 #000,-5px 5px 0 #000,5px 5px 0 #000,0 10px 34px rgba(0,0,0,0.75);}
  .hook-bar{width:340px;height:12px;background:${A};margin:26px auto 0;transform-origin:center;border-radius:6px;
    box-shadow:0 4px 18px ${AD}0.6);}
  .cap-zone{position:absolute;left:56px;right:56px;bottom:560px;}
  .cap-bar{width:150px;height:10px;background:${A};transform-origin:left center;border-radius:5px;margin-bottom:20px;}
  .caption{
    font-size:80px;font-weight:900;line-height:1.24;letter-spacing:0;
    text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,0 8px 26px rgba(0,0,0,0.7);
    font-variant-numeric:tabular-nums;
  }
  .sfx-badge{position:absolute;top:330px;right:64px;font-size:46px;font-weight:900;color:#0a0a0c;
    background:${A};padding:14px 30px;border-radius:12px;transform:rotate(-8deg);
    box-shadow:0 10px 30px rgba(0,0,0,0.45);}
  /* --- カード系共通 --- */
  .bg-type{position:absolute;top:46%;left:-60px;right:-60px;text-align:center;font-size:330px;font-weight:900;
    letter-spacing:0.04em;color:rgba(255,255,255,0.05);transform:translateY(-50%);white-space:nowrap;}
  .glow{position:absolute;left:50%;top:52%;width:1500px;height:1500px;transform:translate(-50%,-50%);
    background:radial-gradient(circle, ${AD}0.18) 0%, ${AD}0) 60%);}
  .glow-green{background:radial-gradient(circle, rgba(6,199,85,0.20) 0%, rgba(6,199,85,0) 60%);}
  /* 価格 */
  .price-stack{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    gap:30px;padding:300px 80px 520px;box-sizing:border-box;text-align:center;}
  .price-label{font-size:56px;font-weight:800;color:#d4d8e2;letter-spacing:0.1em;}
  .price-main{font-weight:900;color:${A};font-variant-numeric:tabular-nums;letter-spacing:-0.015em;
    text-shadow:0 0 0 ${AD}0);line-height:1;}
  .price-num{font-size:210px;}
  .price-unit{font-size:100px;margin-left:8px;}
  .price-under{width:560px;height:12px;background:${A};border-radius:6px;transform-origin:center;
    box-shadow:0 6px 24px ${AD}0.55);}
  .price-note{font-size:42px;font-weight:700;color:#c8cdd8;}
  /* LINEカード */
  .line-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    gap:30px;padding:300px 90px 520px;box-sizing:border-box;text-align:center;}
  .line-kicker{font-size:44px;font-weight:800;color:${A};letter-spacing:0.14em;}
  .line-shop{font-size:96px;font-weight:900;line-height:1.12;}
  .line-qr{width:400px;height:400px;border-radius:28px;background:#fff;padding:22px;box-sizing:border-box;
    box-shadow:0 24px 70px rgba(0,0,0,0.55);}
  .line-cta{font-size:70px;font-weight:900;color:${C.lineGreen};
    text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000;}
  .line-sub{font-size:42px;font-weight:700;color:#e8eaf0;}
  .line-addr{font-size:30px;color:#8b91a0;}
  /* 汎用カード */
  .card-slash{position:absolute;top:46%;left:-8%;width:116%;height:340px;transform:translateY(-50%) skewY(-5deg);
    background:linear-gradient(90deg, ${AD}0.14) 0%, ${AD}0.05) 100%);border-top:6px solid ${A};}
  .big-stack{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;
    gap:14px;padding:300px 80px 520px;box-sizing:border-box;text-align:center;}
  .big-line{font-size:104px;font-weight:900;line-height:1.22;
    text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000;}
</style>
</head>
<body>
  <div id="comp-root" data-composition-id="root" data-width="1080" data-height="1920" data-start="0" data-duration="${total}">
    ${ctx.extraClips.join("\n    ")}
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
  script.scenes = script.scenes.map((s, i) => normalizeScene(s, i === script.scenes.length - 1));
  const cars = JSON.parse(fs.readFileSync(path.join(CONTENT, "inventory", "cars.json"), "utf8"));
  const car = cars.find((c) => c.id === script.carId);

  const buildDir = path.join(ROOT, "video", "build", videoId);
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  const assetsDir = path.join(buildDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  await QRCode.toFile(path.join(assetsDir, "line-qr.png"), CONFIG.lineUrl, {
    width: 800, margin: 1, color: { dark: "#000000", light: "#ffffff" },
  });

  // AI生成クリップ(videoClip)の解決。無ければ実写真にフォールバックし、生成用プロンプトを案内。
  const missingClips = [];
  for (const s of script.scenes) {
    if (s.visualType !== "videoClip") continue;
    const src = s.clipRef ? path.join(CONTENT, "car-clips", script.carId, s.clipRef) : null;
    if (src && fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(assetsDir, s.clipRef));
      s._clipSrc = `assets/${s.clipRef}`;
    } else {
      missingClips.push(s);
      s.visualType = "carPhoto";
      s.interrupt = s.interrupt ?? "punch";
    }
  }

  const warnings = new Set();
  const photoCache = new Map();
  const ctx = {
    script, car, config: CONFIG,
    theme: THEMES[script.theme] ?? THEMES.default,
    extraClips: [],
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
  for (const s of missingClips) {
    console.warn(`⚠ シーン${s.index}: AIクリップ未生成 → 実写真で代替しました`);
    console.warn(`  置き場所: content/car-clips/${script.carId}/${s.clipRef ?? "(clipRef未指定)"}`);
    if (s.genPrompt) {
      console.warn(`  生成手順: ${s.sourcePhoto ?? "01.jpg"} をKling/Runway等のimage-to-videoに入れて次のプロンプトで生成:`);
      console.warn(`  "${s.genPrompt}"`);
    }
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
