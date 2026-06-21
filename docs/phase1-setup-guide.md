# はじめての動画づくり 手順書(初心者向け・自動パイプライン)

このツールは **在庫データ → TikTok用のタテ動画(台本・字幕・組み立て)** を自動で作ります。
このページの通りに進めれば、パソコンで最初の数本を書き出して、TikTokに手動で投稿できます。
Mac / Windows どちらでもOK。**コマンドはコピペ**で大丈夫です。

> ポイント：最初は **`--mock`** を付ければ、APIキーも声(VOICEVOX)も無しで動きます。まず1本出すのが目標。

---

## 0. 全体の流れ(5分で把握)
1. リポジトリ(プログラム一式)をパソコンに入れる
2. Node.js を入れる
3. `npm install`(部品のダウンロード・最初の1回だけ)
4. `npm run doctor`(準備チェック)
5. 実車写真を入れる
6. `npm run make`(動画を作る) → `content/renders/` にできる
7. TikTokに手動で投稿(トレンド音 + プロフにLINE)

---

## 1. リポジトリをパソコンに入れる(GitHub Desktop が簡単)
1. **GitHub Desktop** をインストール → https://desktop.github.com/
2. 起動して GitHub アカウントでログイン(`kotorinu`)。
3. 上メニュー **File → Clone repository** → `kotorinu/todo-app` を選ぶ → **Clone**。
4. 画面上の **Current branch** を `claude/car-sales-tiktok-automation-2isobs` に切り替える。
   - これで最新のプログラムが手元に来ます。

> ※「carshop」リポジトリに入れたい場合は、Clone する時に `kotorinu/carshop` を選べばOKです(後述)。

---

## 2. Node.js を入れる
1. https://nodejs.org → **LTS版**(緑のボタン)をダウンロードしてインストール。
2. 確認:後の手順でターミナルに `node -v` と打って `v20` や `v22` と出ればOK。

---

## 3. ターミナルを開いて準備
GitHub Desktop で **Repository → Open in Terminal**(Windowsは Open in Command Prompt)を開き、次を順に実行:

```bash
npm install
npm run doctor
```
- `npm install` … 部品をダウンロード(最初の1回だけ、数分)。
- `npm run doctor` … 何が足りないかを日本語で教えてくれます(✅/⚠️)。

---

## 4. 自分の在庫に書き換える(任意・あとででもOK)
`content/inventory/cars.json` をテキストエディタ(VS Code / メモ帳 / テキストエディット)で開くと、車のサンプルが入っています。1台ぶんはこんな形です:

```json
{
  "id": "lexus-rx450h-2021-01",
  "maker": "レクサス",
  "model": "RX450h version L",
  "year": 2021,
  "mileageKm": 32000,
  "priceJpy": 5980000,
  "marketPriceJpy": 6500000,
  "features": ["本革シート", "サンルーフ"],
  "sellingPoints": ["ワンオーナー", "大阪で現車確認OK"],
  "photos": ["01.jpg", "02.jpg"]
}
```
- `id` は英数字で自由(後で写真フォルダ名に使います)。
- 価格は「円」で数字だけ。`,`(カンマ)の付け忘れに注意。
- まずはサンプルのままでも動きます。

---

## 5. 実車写真を入れる
`content/car-photos/<id>/` に写真を入れます。**フォルダ名は cars.json の `id` と同じ**にします。
例:`content/car-photos/lexus-rx450h-2021-01/01.jpg`, `02.jpg`(2枚以上推奨)。

- スマホで撮った写真をパソコンに送って、このフォルダにコピーするだけ。
- 写真が無くても動画は作れます(その部分は「実車写真」の枠で表示されます)。

---

## 6. 動画を作る(ワンコマンド)
ターミナルで、作りたい車の `id` を指定して実行:

```bash
# まずは静止プレビュー(Chrome不要・すぐ確認できる)
npm run make -- --car lexus-rx450h-2021-01 --mock --preview

# 本番のMP4を書き出す(初回はChromeを自動ダウンロード)
npm run make -- --car lexus-rx450h-2021-01 --mock
```
- できあがりは **`content/renders/` フォルダ**(`.mp4` と確認用 `.preview.png`)。
- 1台につき「在庫紹介」と「買取」の2本ができます。

> `--mock` を外すと、ANTHROPIC_API_KEY を使った本番台本になります(任意・後述)。

---

## 7.(任意)声を入れる:VOICEVOX
ナレーション音声を付けたい時だけ:
1. **VOICEVOX** をインストール → https://voicevox.hiroshiba.jp/ (無料・商用利用可)
2. アプリを起動したまま、もう一度 `npm run make -- --car <id>` を実行。
   - 自動で音声付きになります(起動していなければ字幕のみ)。

## 8.(任意)本番品質の台本:Claude APIキー
1. https://console.anthropic.com でキーを取得。
2. `.env.example` を **`.env`** という名前でコピーし、`ANTHROPIC_API_KEY=` に貼り付け。
3. `--mock` を付けずに `npm run make -- --car <id>` を実行。

---

## 9. TikTokに投稿(手動)
1. できた `.mp4` をスマホに送る(AirDrop / Googleフォト / LINEのKeepなど)。
2. TikTokアプリで動画を読み込み、**トレンド音を1つ付ける**(リーチが伸びます)。
3. キャプション本文にキーワード+ハッシュタグ3〜5個(例:`#外車買取 #大阪外車店 #中古車販売`)。
4. **プロフィール**に LINE のURLを設定(誘導先)。最初のコメントに「プロフのLINEから無料査定」をピン留め。
5. 投稿のおすすめ時間:平日 7:00 / 12:00、週末 10:00(日本時間)。

> 台本の狙い(フック/CTA/構成)は `content/brand/tiktok-spec.md` にまとまっています。

---

## 10. 困ったとき(よくあるつまずき)
- **`npm: command not found`** → Node.js が未インストール。手順2をやり直す。
- **`make` でエラー** → まず `npm install` を実行したか確認 → `npm run doctor` で原因を見る。
- **MP4ができない / Chrome関連のエラー** → ネットに繋がっているか確認(初回はChromeを自動取得)。社内ネット等でブロックされる場合は別回線で。
- **日本語が□になる** → パソコンに日本語フォントが必要(通常は最初から入っています)。
- **JSONエラー** → `cars.json` のカンマ/カッコの付け忘れ。サンプルに戻して少しずつ編集。

困ったらこの画面のエラー文をそのまま共有してください。一緒に直します。
