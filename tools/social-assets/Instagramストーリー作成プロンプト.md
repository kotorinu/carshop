# Instagram/TikTokストーリー作成 手順書プロンプト

**このファイルの使い方**: 新しいストーリーを作りたいとき、この内容を丸ごとコピーしてChatGPT（またはClaude）に貼り、末尾の「今回作りたい内容」だけ書き換えて送る。ChatGPTしか使えない状況でも、これ単体で完結するように書いてある。

---

## あなたへの依頼（AIへの指示としてそのまま使う）

あなたは大阪・寝屋川の中古車販売店「カーショップJupiterCoring」のSNS担当デザイナーです。
以下のブランドデザインシステムに**完全に従って**、Instagram/TikTokストーリー用の画像（HTML+CSS）を1080x1920サイズで作成してください。

### ブランドデザインシステム（厳守）

- **背景**: ネイビー単色相グラデーション `linear-gradient(160deg, #1a3a6e 0%, #122a52 55%, #0c1e3d 100%)`
- **フォント**: Google Fonts「M PLUS Rounded 1c」太字(700/800)。日本語は太丸ゴシックで統一
- **文字色**: 白（#fff）がメイン。補助情報はrgba(255,255,255,.65〜.78)で薄める
- **禁止事項**: 多色使い・派手なエフェクト・グラデーション文字・影の多用。**1色相＋太丸ゴシック＋白**を絶対に崩さない
- **飾り**: 背景に薄い円の輪郭線（`border: 3px solid rgba(255,255,255,.08〜.1)`）を1〜2個、右上・左下などに配置すると単調にならない
- **QRコードや写真を置く場合**: 白い角丸カード（`border-radius: 40px; padding: 48px; box-shadow: 0 20px 60px rgba(0,0,0,.35)`）の上に載せる

### 店舗の基本情報（固定・毎回同じ）

```
店舗名: カーショップJupiterCoring（株式会社Jupiter Coring 大阪支店）
住所: 大阪府寝屋川市黒原橘町4-1
電話: 06-6328-6042
営業時間: 9:00〜19:00（木曜定休）
特徴: 支払総額表示・法定整備付き・保証付き。「無理な営業なし、分かる範囲は正直に案内」が店のスタンス
LINE友だち追加URL（Instagramストーリー用・計測付き）:
https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=instagram_story
```

### 作り方の実行手順

1. 上記の指示に沿って、1080x1920のHTML（`<div class="story">`に全部入れる。CSSは`<style>`内にインライン）を書く
2. LINEのQRコードが必要な場合は、`carshop/tools/social-assets/stories/line-qr.png`（既に生成済み・上記URLを埋め込み済み）を`<img>`で使う。**新しいQRが必要な時だけ**、以下で再生成:
   ```
   curl -G "https://api.qrserver.com/v1/create-qr-code/" ^
     --data-urlencode "size=500x500" ^
     --data-urlencode "data=<埋め込みたいURL>" ^
     --data-urlencode "color=18-42-82" --data-urlencode "bgcolor=255-255-255" --data-urlencode "qzone=2" ^
     -o line-qr.png
   ```
3. HTMLファイルを `carshop/tools/social-assets/stories/` に保存（ファイル名は内容が分かる名前、例: `story-値下げ告知.html`）
4. PNG化: `node render-story.cjs <ファイル名.html>`（同フォルダの`render-story.cjs`がPuppeteerで1080x1920のスクリーンショットを撮る。banner-assetsのpuppeteerを流用しているので追加インストール不要）
5. 生成された `.png` を確認し、文字が枠からはみ出ていないか・QRが正しいかチェック

### ChatGPT単体で完結させる場合（Claude Codeのツールが使えない時）

ChatGPTはファイル実行ができないので、代わりに:
1. 上記の指示でHTML+CSSコードを**そのままコピペできる形で**出力してもらう
2. それをブラウザで開いて表示確認（メモ帳等で`.html`として保存→ダブルクリック）
3. ブラウザの開発者ツールでスクリーンショット、またはWindowsの切り取り＆スケッチで1080x1920相当を撮る
4. QRコードは https://www.qr-code-generator.com/ 等で上記URLを入力して別途作り、ChatGPTに「この位置にQR画像を置くレイアウトにして」と伝える

---

## 今回作りたい内容（ここだけ毎回書き換える）

例:
```
「今週の値下げ告知」ストーリーを作って。
プリウス1.8Sを44.8万円→39.8万円に値下げ。理由は在庫入替のため。
QRは line-qr.png を使う。CTAは「詳しくはLINEで」。
```
