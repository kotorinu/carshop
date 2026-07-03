# 車両動画メーカー(HyperFrames版)

写真と台本JSONからTikTok縦動画(1080x1920)を**1コマンドで**作る。
VOICEVOX(Docker)・Stable Diffusion(GPU)・Remotionは**不要**。必要なのはNode 22+とFFmpegだけ。

## 毎日の使い方(これだけ)

1. 掲載サイト(カーセンサー/グーネット)から車の写真を保存して
   `content/car-photos/<carId>/01.jpg, 02.jpg...` に置く
2. 台本がまだ無ければ生成: `npm run gen:scripts -- --mock`(または本番 `npm run gen:scripts`)
3. 動画を焼く:

```powershell
npm run make:video -- 20260621-inv-lexus-rx450h-2021-01
```

→ `content/renders/<videoId>.mp4` ができる。TikTokアプリにアップして**トレンド音を手付け**して投稿。

```powershell
npm run make:video                 # 台本一覧を表示
npm run make:video -- <id> --draft # 低画質で高速プレビュー
```

## 最初に1回だけ設定

- `video/config.json` の `lineUrl` を店舗公式LINEの友だち追加URL(lin.ee/...)に変える
  → エンドカードのQRが本物になる
- 店名・住所・営業時間も同ファイルで変更可

## 仕組み(台本v2)

- `content/scripts/<videoId>.json` の秒単位シーンをそのまま映像化
- **caption内の【言葉】はアクセント色で強調**される
- `visualType`:
  - `carPhoto` — 実車写真。`interrupt`: `punch`(パンチイン+白フラッシュ) / `panLeft` / `panRight`
  - `priceReveal` — 価格カウントアップ(`priceLabel`/`priceValue`/`priceUnit`/`priceNote`)
  - `textCard` — 大文字カード(`bigText`、`\n`改行可)
  - `lineCta` — LINE QRエンドカード
- `theme: "kaitori"` で赤基調(買取用)。既定は金基調(在庫用)
- `chip: {line1, line2}` で写真シーン左上に車両情報チップ
- `hookText` は `\n` で改行位置を指定できる
- 旧形式(`visualType: "manga"`)も自動変換で動く
- 写真が無いシーンは仮画像+警告。音は入れない設計(トレンド音は投稿時に手付けが伸びる)

**尺の方針**: 在庫20〜24秒 / 買取16〜20秒。完了率(70%が拡散の壁)を最優先し、
1シーン2〜2.5秒のテンポで最後まで見させる。

## トラブル時

```powershell
npx hyperframes doctor   # 環境診断(Chrome/FFmpeg/メモリ)
```
