# Runbook — 外車TikTok集客自動化

プラン: `/root/.claude/plans/twitter-snoopy-glacier.md`(承認済)

## 構成
npm workspaces モノレポ。`content/` がデータ層(JSON/ファイルのDB)。各 `packages/*` がステージ。
`video-id`(例 `20260621-inv-lexus-rx450h-2021-01`)が全フォルダを貫く結合キー。

```
content/inventory/cars.json     # 在庫(手入力の源泉)
content/brand/tiktok-spec.md     # 伸ばす型(台本生成に注入)
content/brand/reading-dict.json  # 車種名などTTS読み辞書
content/car-photos/<carId>/      # 実車写真(01.jpg, 02.jpg…)
content/scripts/<videoId>.json   # 生成された台本(script-gen 出力)
content/audio/<videoId>/         # VOICEVOX音声 + timings.json
content/captions/<videoId>.srt   # 字幕
content/visuals/<videoId>/       # 漫画フレーム/合成画像
content/renders/<videoId>.mp4    # 最終動画(Remotion出力)
```

## できあがっている所(この環境で動く)
### Phase 0: 基盤
- workspaces / `@app/shared`(zod型・状態機械・パス) / `content/` 雛形

### 台本生成(動画の頭脳)
```bash
npm install
# モック(APIキー不要・オフライン)で全在庫×2本(在庫/買取)を生成
npm run gen:scripts -- --mock
# 本番(Claude API)。環境変数が必要
export ANTHROPIC_API_KEY=sk-...
npm run gen:scripts                       # 全在庫
npm run gen:scripts -- --car lexus-rx450h-2021-01 --format manga-inventory --layer B_buyer
```
出力: `content/scripts/<videoId>.json`(zod検証済・tiktok-spec準拠の秒単位台本)。
モデルは `SCRIPT_GEN_MODEL`(既定 `claude-sonnet-4-6`)で変更可。

## これから(ローカルPC/GPUが要るので各自の環境で)
### Phase 1〜2: 動画化
1. **TTS(音声)**: ローカルVOICEVOX(Docker `voicevox/voicevox_engine`, :50021)。`/audio_query`のmora単位タイミングで `content/audio/<id>/` と `timings.json` を出力 → 字幕の秒も確定。
2. **ビジュアル**: ローカルStable Diffusion(A1111/ComfyUI, :7860)で漫画フレーム、`sharp`で実車写真を1080x1920に整形・合成。
3. **字幕**: timingsから `captions/<id>.srt`。
4. **組立**: Remotion(1080x1920)で `renders/<id>.mp4`。`@remotion/renderer`でバッチ。音楽は焼かない(トレンド音は投稿時に手付け)。
5. **確認ゲート**: review-ui で承認/却下(approvedのみ予約へ)。
6. **予約投稿**: Metricool(無料)/Buffer/Publer に承認済みを投入。完全自動公開はしない(規約/BAN対策)。

### Phase 3: LINE集客
- LINE公式アカウント(無料Communicationプランで開始)+ Messaging APIチャネル。
- `packages/line-bot`: @line/bot-sdk webhook(follow→同意→ステップ配信→タグ)、LIFFで来店予約/買取査定。
- ノーコード代替: エルメ/Lステップ無料枠。

#### LIFFフォーム(来店予約 / 買取査定) ← 実装済み
React/バンドラは使わず、LIFF公式SDK(CDN)+静的HTMLを同じ Hono が配信する(1サービス完結)。

- ルート(`packages/line-bot/src/server.ts` にマウント):
  - `GET /liff/booking` / `GET /liff/appraisal` … フォームHTML(`liff.init` のIDを環境変数で差し込み)
  - `POST /api/booking` / `POST /api/appraisal` … アクセストークンで本人確認 → `data/submissions.json` に保存 → リードにタグ(`booking_requested`/`buyback_inquiry`) → オーナーへLINE通知
- 写真: フォームには持たせない(blobストレージ不要・低コスト)。送信後にトークへ直接送ってもらう案内をフォーム内に表示。
- セキュリティ: クライアントの `userId` は信用せず、`liff.getAccessToken()` を `api.line.me/v2/profile` で検証して本人を確定。

**セットアップ手順(オーナー):**
1. Railway に `@app/line-bot` をデプロイ(`npm start`)。公開URLを `https://<host>` とする。
2. LINE Developers → 同じプロバイダで **LIFFアプリを2つ** 追加:
   - 予約用: エンドポイントURL = `https://<host>/liff/booking`、サイズ Full、`profile` スコープ
   - 査定用: エンドポイントURL = `https://<host>/liff/appraisal`
3. 各LIFFの **LIFF ID** を控える。`.env` に設定:
   - `LIFF_BOOKING_ID` / `LIFF_APPRAISAL_ID` … `liff.init` 用(HTMLに差し込まれる)
   - `LIFF_BOOKING_URL` / `LIFF_APPRAISAL_URL` … `https://liff.line.me/<LIFF ID>`(bot のメッセージに載る)
   - `OWNER_LINE_USER_ID` … 新着リードを受け取るオーナー自身のuserId(未設定ならサーバーログに出るだけ)
4. デプロイし直して、トークの「来店予約」「無料査定」メニューからフォームが開けば完了。

#### LIFFフォームのローカル検証
```bash
# LIFF IDを仮で渡して起動(実際の送信はLINEアプリ内でのみ通る)
PORT=3939 LIFF_BOOKING_ID=dummy npm -w @app/line-bot run start
curl localhost:3939/liff/booking            # HTMLが返る(LIFF IDが差し込まれている)
curl -X POST localhost:3939/api/booking -H 'content-type: application/json' -d '{"token":"x"}'
# → 401 認証失敗(トークン検証が効いている = 正常)
```

## コマンド早見表
```bash
npm run gen:scripts -- --mock          # 台本生成(オフライン)
npm run gen:tts -- --video <videoId>   # 字幕SRT(+VOICEVOXがあれば音声)
npm run preview -- --video <videoId>   # 静止プレビュー(Chrome不要・sharp)
npm run render -- --video <videoId>    # 本番MP4(要Chrome/ネット = 各自PC/CI)
npm -w @app/line-bot run dev           # LINE webhook+LIFFサーバ(開発・watch)
npm -w @app/line-bot run start         # 本番起動(Railwayはこれ)
npm -w @app/line-bot run send-steps -- --dry   # ステップ配信 dry-run
npm run typecheck
```

## 必要な環境変数(.env)
| 変数 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | 台本生成(無ければmock) |
| `SCRIPT_GEN_MODEL` | 台本モデル(既定 claude-sonnet-4-6) |
| `VOICEVOX_URL` | VOICEVOXエンジン(既定 127.0.0.1:50021) |
| `LINE_URL` | プロフ誘導/エンドカードQRの先(lin.ee/...) |
| `SHOP_NAME` / `SHOP_AREA` | エンドカードの店名/エリア |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API |
| `LIFF_BOOKING_URL` / `LIFF_APPRAISAL_URL` | フォームを開くURL(botのメッセージに載る) |
| `LIFF_BOOKING_ID` / `LIFF_APPRAISAL_ID` | `liff.init` 用ID(フォームHTMLに差し込む) |
| `OWNER_LINE_USER_ID` | 新着リード(予約/査定)のLINE通知先(オーナー自身) |

## 実装済みパッケージ
- `@app/shared` 型・状態機械・パス
- `@app/script-gen` 台本生成(API/mock)
- `@app/tts` VOICEVOXクライアント + SRT字幕
- `@app/video-pipeline` Remotion組立(MangaInventory)+ 静止プレビュー
- `@app/line-bot` webhook(follow→同意→メニュー→タグ)+ ステップ配信ランナー + LIFFフォーム(来店予約/買取査定)

## メモ
- コミット署名はこの実行環境では付与できない(署名キーが空)。author/committerは noreply で統一。
- 法令: 動画の価格/スペックは確認ゲートで必ずチェック(古物/景表法)。LINEは同意+配信停止+記録(特電法/APPI)。
