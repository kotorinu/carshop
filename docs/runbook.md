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

## メモ
- コミット署名はこの実行環境では付与できない(署名キーが空)。author/committerは noreply で統一。
- 法令: 動画の価格/スペックは確認ゲートで必ずチェック(古物/景表法)。LINEは同意+配信停止+記録(特電法/APPI)。
