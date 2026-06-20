// 名刺ジェネレータ: 緒方琴音 / Kotoiro AI
// 写真とQRコードを実際に埋め込み、印刷用(塗り足し3mm)のPNG/PDFを出力する
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const DPI = 350;
const mm = (v) => Math.round((v * DPI) / 25.4); // mm -> px

// 仕上がり 91x55mm + 塗り足し(bleed) 3mm
const BLEED = 3;
const TRIM_W = 91, TRIM_H = 55;
const FULL_W = mm(TRIM_W + BLEED * 2);
const FULL_H = mm(TRIM_H + BLEED * 2);
const OFF = mm(BLEED); // 塗り足し分のオフセット(=trim原点)

// 色
const C = {
  navy: '#0C2340',
  blue: '#1A6FE0',
  blueDeep: '#0E4FB0',
  gray: '#5B6B7B',
  light: '#EAF2FD',
  white: '#FFFFFF',
};

const JP = `IPAPGothic, 'IPA Pゴシック', IPAGothic, sans-serif`;
const LAT = `'Liberation Sans', 'DejaVu Sans', sans-serif`;

// trim座標(mm)で書いた要素を、bleedオフセット込みのpx中心に変換するヘルパ
const X = (xmm) => mm(xmm) + OFF;
const Y = (ymm) => mm(ymm) + OFF;

// 疑似ボールド(stroke重ね描き)
function bold(w) { return `stroke-width="${w}" paint-order="stroke" stroke-linejoin="round"`; }

const OUT = path.join(__dirname, 'build');
fs.mkdirSync(OUT, { recursive: true });

// ---------- 表面(FRONT) ----------
function frontSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FULL_W}" height="${FULL_H}" viewBox="0 0 ${FULL_W} ${FULL_H}">
  <rect x="0" y="0" width="${FULL_W}" height="${FULL_H}" fill="${C.white}"/>
  <!-- 左の薄い円アクセント(写真の背面) -->
  <circle cx="${X(24)}" cy="${Y(23)}" r="${mm(16.5)}" fill="${C.light}"/>
  <!-- 下部の濃紺バンド(catch) -->
  <rect x="0" y="${Y(46)}" width="${FULL_W}" height="${FULL_H - Y(46)}" fill="${C.navy}"/>
  <rect x="0" y="${Y(46)}" width="${FULL_W}" height="${mm(0.9)}" fill="${C.blue}"/>

  <!-- ブランド -->
  <circle cx="${X(45.6)}" cy="${Y(9.4)}" r="${mm(1.1)}" fill="${C.blue}"/>
  <text x="${X(48)}" y="${Y(10.7)}" font-family="${LAT}" font-size="${mm(4.0)}" fill="${C.blue}" ${bold(mm(0.18))} stroke="${C.blue}" letter-spacing="0.5">Kotoiro AI</text>

  <!-- 氏名 -->
  <text x="${X(45)}" y="${Y(23)}" font-family="${JP}" font-size="${mm(8.2)}" fill="${C.navy}" ${bold(mm(0.5))} stroke="${C.navy}" letter-spacing="2">緒方 琴音</text>
  <text x="${X(45.5)}" y="${Y(28.2)}" font-family="${JP}" font-size="${mm(3.0)}" fill="${C.gray}" letter-spacing="2">おがた ことね</text>

  <!-- 区切り線 -->
  <rect x="${X(45)}" y="${Y(31.2)}" width="${mm(40)}" height="${mm(0.4)}" fill="${C.blue}" opacity="0.5"/>

  <!-- 肩書き -->
  <text x="${X(45)}" y="${Y(36.2)}" font-family="${JP}" font-size="${mm(3.1)}" fill="${C.navy}" ${bold(mm(0.12))} stroke="${C.navy}">現役フロントエンドエンジニア</text>
  <text x="${X(45)}" y="${Y(41.4)}" font-family="${JP}" font-size="${mm(3.3)}" fill="${C.blue}" ${bold(mm(0.14))} stroke="${C.blue}">AI活用 ・ 業務効率化</text>

  <!-- catch -->
  <text x="${X(45.5)}" y="${Y(50.4)}" font-family="${JP}" font-size="${mm(3.3)}" fill="${C.white}" ${bold(mm(0.13))} stroke="${C.white}">業務効率化に、伴走します。</text>
  <text x="${X(45.5)}" y="${Y(54.6)}" font-family="${JP}" font-size="${mm(2.6)}" fill="#BFD6F2">小さなお悩みも、ぜひお聞かせください。</text>
</svg>`;
}

// ---------- 裏面(BACK) ----------
function backSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FULL_W}" height="${FULL_H}" viewBox="0 0 ${FULL_W} ${FULL_H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E2E55"/>
      <stop offset="1" stop-color="#0A1E3C"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${FULL_W}" height="${FULL_H}" fill="url(#g)"/>
  <!-- 装飾の細いライン -->
  <rect x="0" y="${Y(0)}" width="${FULL_W}" height="${mm(1.2)}" fill="${C.blue}"/>

  <!-- ブランド -->
  <text x="${X(8)}" y="${Y(13)}" font-family="${LAT}" font-size="${mm(5.6)}" fill="${C.white}" ${bold(mm(0.25))} stroke="${C.white}" letter-spacing="0.5">Kotoiro AI</text>
  <text x="${X(8.5)}" y="${Y(18.6)}" font-family="${JP}" font-size="${mm(2.9)}" fill="#9FC2F2" letter-spacing="1">AI活用 ・ 業務効率化サポート</text>

  <!-- サービス -->
  <g font-family="${JP}" font-size="${mm(2.9)}" fill="${C.white}">
    <circle cx="${X(9)}" cy="${Y(27.4)}" r="${mm(0.9)}" fill="${C.blue}"/>
    <text x="${X(11.5)}" y="${Y(28.4)}">AIチャットボット構築</text>
    <circle cx="${X(9)}" cy="${Y(33.2)}" r="${mm(0.9)}" fill="${C.blue}"/>
    <text x="${X(11.5)}" y="${Y(34.2)}">業務自動化ツールの開発</text>
    <circle cx="${X(9)}" cy="${Y(39.0)}" r="${mm(0.9)}" fill="${C.blue}"/>
    <text x="${X(11.5)}" y="${Y(40.0)}">AI活用・業務効率化コンサル</text>
  </g>

  <!-- 連絡先 -->
  <text x="${X(8)}" y="${Y(48.6)}" font-family="${LAT}" font-size="${mm(2.7)}" fill="#CFE0F5">koto.tama.yellow@gmail.com</text>
  <text x="${X(8)}" y="${Y(52.6)}" font-family="${LAT}" font-size="${mm(2.7)}" fill="#CFE0F5">portfolio-hp-two.vercel.app</text>

  <!-- QR 白カード -->
  <rect x="${X(63.5)}" y="${Y(13)}" width="${mm(22)}" height="${mm(22)}" rx="${mm(2)}" fill="${C.white}"/>
  <text x="${X(74.5)}" y="${Y(39)}" text-anchor="middle" font-family="${JP}" font-size="${mm(2.5)}" fill="${C.white}">ポートフォリオ</text>
  <text x="${X(74.5)}" y="${Y(42.6)}" text-anchor="middle" font-family="${JP}" font-size="${mm(2.5)}" fill="#9FC2F2">スマホで読み取り</text>
</svg>`;
}

// 円形マスクした写真を作る
async function circlePhoto(diaMm) {
  const d = mm(diaMm);
  const src = path.join(__dirname, 'assets', 'photo.webp');
  const resized = await sharp(src).resize(d, d, { fit: 'cover', position: 'top' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${d}" height="${d}"><circle cx="${d/2}" cy="${d/2}" r="${d/2}" fill="#fff"/></svg>`
  );
  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function main() {
  // QR (ポートフォリオへ)
  const qrBuf = await QRCode.toBuffer('https://portfolio-hp-two.vercel.app/', {
    errorCorrectionLevel: 'M', margin: 1, width: mm(19),
    color: { dark: '#0C2340', light: '#FFFFFF' },
  });

  // 写真(円)
  const photoDia = 28;
  const photoBuf = await circlePhoto(photoDia);

  // 細い青リング(写真の縁)
  const ringD = mm(photoDia) + mm(1.6);
  const ring = Buffer.from(`<svg width="${ringD}" height="${ringD}"><circle cx="${ringD/2}" cy="${ringD/2}" r="${ringD/2 - mm(0.4)}" fill="none" stroke="${C.blue}" stroke-width="${mm(0.8)}"/></svg>`);

  // FRONT 合成
  const photoCx = X(24), photoCy = Y(23);
  await sharp(Buffer.from(frontSVG()))
    .composite([
      { input: ring, left: Math.round(photoCx - ringD/2), top: Math.round(photoCy - ringD/2) },
      { input: photoBuf, left: Math.round(photoCx - mm(photoDia)/2), top: Math.round(photoCy - mm(photoDia)/2) },
    ])
    .png()
    .toFile(path.join(OUT, 'front.png'));

  // BACK 合成 (QRを白カード中央へ)
  const qrSize = mm(19);
  const qrLeft = Math.round(X(63.5) + (mm(22) - qrSize) / 2);
  const qrTop = Math.round(Y(13) + (mm(22) - qrSize) / 2);
  await sharp(Buffer.from(backSVG()))
    .composite([{ input: qrBuf, left: qrLeft, top: qrTop }])
    .png()
    .toFile(path.join(OUT, 'back.png'));

  // プレビュー(2面を並べた確認用画像)
  const scale = 0.5;
  const pf = await sharp(path.join(OUT, 'front.png')).resize(Math.round(FULL_W*scale)).png().toBuffer();
  const pb = await sharp(path.join(OUT, 'back.png')).resize(Math.round(FULL_W*scale)).png().toBuffer();
  const gap = 40, pad = 50;
  const pw = Math.round(FULL_W*scale), ph = Math.round(FULL_H*scale);
  await sharp({ create: { width: pw + pad*2, height: ph*2 + gap + pad*2, channels: 3, background: '#D7DCE3' } })
    .composite([
      { input: pf, left: pad, top: pad },
      { input: pb, left: pad, top: pad + ph + gap },
    ])
    .png()
    .toFile(path.join(OUT, 'preview.png'));

  // 印刷用PDF (塗り足し込み, 2ページ)
  const ptW = (TRIM_W + BLEED*2) * 2.83465; // mm->pt
  const ptH = (TRIM_H + BLEED*2) * 2.83465;
  const doc = new PDFDocument({ size: [ptW, ptH], margin: 0 });
  const pdfPath = path.join(OUT, 'meishi_print.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.image(path.join(OUT, 'front.png'), 0, 0, { width: ptW, height: ptH });
  doc.addPage({ size: [ptW, ptH], margin: 0 });
  doc.image(path.join(OUT, 'back.png'), 0, 0, { width: ptW, height: ptH });
  doc.end();

  console.log('done:', FULL_W + 'x' + FULL_H, 'px @', DPI, 'dpi (trim 91x55mm + bleed 3mm)');
}

main().catch((e) => { console.error(e); process.exit(1); });
