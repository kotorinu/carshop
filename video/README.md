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

## 仕組み

- `content/scripts/<videoId>.json`(script-genの出力)の秒単位シーンをそのまま映像化
- `visualType: "carPhoto"` → 実車写真＋Ken Burns＋字幕(TikTok安全域準拠)
- `visualType: "manga"` → タイポグラフィカードに自動変換
  - キャプションに「→」+数字 → 価格リビール演出(取り消し線→金色ドン)
  - LINE関連 → QR付きエンドカード
- 写真が無いシーンは仮画像で生成される(警告が出る)。写真を置いて再実行すれば本番品質
- 音はあえて入れない設計(tiktok-spec: トレンド音は投稿時に手付けするのが伸びる)

## トラブル時

```powershell
npx hyperframes doctor   # 環境診断(Chrome/FFmpeg/メモリ)
```
