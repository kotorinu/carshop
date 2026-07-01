# カーショップ Jupiter Coring 大阪支店 — TikTok集客自動化

## プロジェクト概要
大阪の中古車店（Jupiter Coring 大阪支店）の在庫を TikTok 用縦動画(1080×1920・**15〜30秒**)に自動変換するツール。
誘導先=LINE一本。目的=「リーチ→LINE友だち追加→買取査定・来店」を最大化すること。
バズの根拠は `docs/research/tiktok-buzz-research.md`（実調査・月1更新）。

## パイプライン

```
content/car-photos/<id>/ (写真=素材プール・全部は使わない)
  → ⓪ AI写真選定(pick:photos)  … 役割別ベスト3〜4枚を選ぶ(hero/move/interior/detail)
  → ① 台本生成(script-gen)     … 15〜30秒・実写ショーケース型
  → ② AIクリップ(gen:clips)    … Klingで写真→動く5秒クリップ(選定写真のみ)
  → ③ 字幕/音声(tts)
  → ④ 動画(Remotion)           … クリップ>Ken-Burns。数字ゴールド・価格ドン・スペックバー
  → ⑤ 自己採点ループ(self-review) … AI採点→style-params調整→再レンダー(80点まで)
  → 人間ゲート → 手動投稿
```

## 主なコマンド
- `npm run make -- --car <id> --auto`                   — フルパイプライン+自己採点（推奨）
- `npm run make -- --car <id> --mock --preview`         — 静止プレビューPNG（キー不要、10〜20秒）
- `npm run make -- --car <id> --mock`                   — MP4（キー不要、60〜180秒）
- `npm run pick:photos -- --car <id>`                   — AI写真選定のみ（要APIキー、15〜30秒）
- `npm run self-review -- --video <videoId> --mp4`      — 自己採点ループのみ（1周1〜3分）
- `npm run doctor`                                      — 環境チェック（5〜10秒）

詳しい手順・人間ゲート・投稿ルーティンは `.claude/skills/buzz-video/SKILL.md` に従う。

## ステップ別所要時間の目安

| ステップ | コマンド | 所要時間 |
|---|---|---|
| 写真AI選定 | `pick:photos` | 15〜30秒 |
| 台本生成(mock) | `gen:scripts --mock` | 1〜3秒 |
| 台本生成(Claude API) | `gen:scripts` | 10〜30秒 |
| Klingクリップ(1本) | `gen:clips` | 2〜6分 |
| 字幕SRT（VOICEVOXなし） | `gen:tts` | 1秒以内 |
| 字幕SRT＋音声（VOICEVOXあり） | `gen:tts` | 15〜40秒 |
| 静止プレビューPNG | `preview` | 5〜10秒 |
| MP4レンダー | `render` | 60〜180秒 |
| 自己採点1周 | `self-review` | 1〜3分（+レンダー時間） |

## 動画検証のやり方（重要）

### Step 1: 静止プレビューで構成を確認（Chrome不要・まずこれ）

```bash
npm run make -- --car <id> --mock --preview
```

`content/renders/<videoId>.preview.png` に3コマ横並び（フック/価格ドン/エンドカード）。
- テロップが安全域（上15%・下25%は禁止）に収まっているか
- 数字がゴールドで強調されているか
- エンドカードのQRと店名が正しいか

### Step 2: MP4で動きを確認（要Chrome）

```bash
npm run make -- --car <id> --mock
# Chromiumが見つからない場合:
PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium npm run make -- --car <id> --mock
```

- 冒頭0〜2秒でフックが"ドン"と出るか
- カットが2〜4秒ごとに割り込むか（同じ画が4秒以上続いたら失敗）
- 価格リビールでゴールドの数字が拡大するか
- 全体が15〜30秒に収まっているか

### Step 3: 自己採点 + 人間ゲート

```bash
npm run self-review -- --video <videoId> --mp4   # AI採点(要APIキー)。キー無しでも静的チェックは走る
```

`content/renders/<videoId>.review.md` を確認してから、目視チェック:
- [ ] 価格・年式・走行が `cars.json` と一致（景表法）
- [ ] 車種名の読み（VOICEVOX）が自然
- [ ] 誇大・断定表現がない（「日本一安い」「絶対得する」等は禁止）
- [ ] 「外車専門」表記がない（「大阪・中古車」に統一）

## ハードルール（厳守）
1. TikTokへの完全自動投稿はしない（BAN回避）。生成→人間が確認→手動 or 予約投稿。
2. 動画の価格・スペックは `content/inventory/cars.json` の実データを正確に使う（景表法・古物商法）。self-reviewの静的チェックが照合するが、最終確認は人間。
3. LINE配信は同意＋配信停止導線＋記録（特電法/APPI）。
4. レンダーに音楽を焼き込まない（トレンド音は投稿時にアプリで手付け）。
5. `content/car-photos/<id>/` に写真を置く（`content/inventory/` ではない）。
6. 写真は素材プール。**全部使わない** — AI選定の役割別ベストだけ使う。
7. Klingクリップは選定写真のみ生成（コスト保護）。自己採点ループ内での再生成禁止。

## 動画スタイル方針
- **実写ショーケース型**。漫画パネル・AIイラストは使わない。
- Klingクリップ（写真→動く5秒動画）を最優先、無ければ Ken-Burns 強め＋暗幕グラデ。
- 数字・価格はゴールドグラデ強調、価格は"ドン"とリビール。上部にスペックバー常時表示。
- 見た目のツマミは `content/brand/style-params.json`（自己採点ループが自動調整する）。
- 詳細は `packages/video-pipeline/CLAUDE.md` に従う。

## 重要ファイル
| ファイル | 役割 |
|----------|------|
| `content/inventory/cars.json` | 在庫データ |
| `content/car-photos/<id>/` | 実車写真（素材プール） |
| `content/car-photos/<id>/selection.json` | AI選定結果（役割別ベスト） |
| `content/brand/tiktok-spec.md` | 台本生成の基準仕様（研究反映・AIに注入） |
| `content/brand/style-params.json` | スタイルのツマミ（自己採点ループが調整） |
| `content/clips/<id>/` | Kling生成クリップ |
| `content/renders/<videoId>.review.md` | 自己採点レポート（人間ゲート資料） |
| `docs/research/tiktok-buzz-research.md` | バズ研究（根拠・月1更新） |
| `.claude/skills/buzz-video/SKILL.md` | 動画生成ルーティンの全手順 |
| `packages/video-pipeline/src/remotion/MangaInventory.tsx` | Remotionコンポジション |
| `.env` | 店名/LINE URL/APIキー等の設定 |

## 必要な環境変数(.env)
| 変数 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | 台本生成・写真選定・自己採点（無ければmock/静的チェックのみ） |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | 写真→動画クリップ生成（無ければKen-Burns） |
| `SHOP_NAME` / `SHOP_AREA` / `LINE_URL` | エンドカードの店名/エリア/QR |

## フェーズ別ロードマップ
- **Phase1(今)**: 手動撮影→自動動画生成(AI選定+Kling+自己採点)→手動TikTok投稿
- **Phase2**: Metricool/Buffer で予約投稿
- **Phase3**: LINE Messaging API → Railway bot → LIFF来店予約/買取査定
- **Phase4**: 数値分析で勝ち型を `tiktok-spec.md` に反映
