# 名刺 (緒方琴音 / Kotoiro AI)

AI活用・業務効率化のポジショニング用の名刺データ。白×青、顔写真+QR(ポートフォリオ誘導)。

## 生成方法
```
cd meishi
npm install
node generate.js
```

## 出力 (build/)
- `front.png` / `back.png` … 表/裏 印刷用 (350dpi, 91×55mm + 塗り足し3mm)
- `meishi_print.pdf` … 入稿用PDF (2ページ, 塗り足し込み)
- `preview.png` … 確認用プレビュー

## 仕様
- 仕上がりサイズ: 91 × 55mm (日本標準)
- 塗り足し(bleed): 上下左右 3mm
- QRコード誘導先: https://portfolio-hp-two.vercel.app/
- ネット印刷(ラクスル/プリントパック等)にそのまま入稿可
