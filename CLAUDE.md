# カーショップ Jupiter Coring 大阪支店 — TikTok集客自動化

## プロジェクト概要
大阪の中古車店（Jupiter Coring 大阪支店）の在庫を TikTok 用縦動画(1080×1920)に自動変換するツール。
誘導先=LINE一本。目的=「リーチ→LINE友だち追加→買取査定・来店」を最大化すること。

## パイプライン

```
content/inventory/cars.json  →  台本生成(script-gen)  →  字幕/音声(tts)  →  動画(Remotion)  →  確認 → 手動投稿
```

## 主なコマンド
- `npm run doctor`                                      — 環境チェック（所要 5〜10秒）
- `npm run make -- --car <id> --mock --preview`         — 静止プレビューPNG（所要 10〜20秒、Chrome不要）
- `npm run make -- --car <id> --mock`                   — MP4（所要 60〜180秒、初回はChrome自動DL）
- `npm run pick:photos -- --car <id>`                   — AI写真並べ替え（要APIキー、所要 15〜30秒）

## ステップ別所要時間の目安

| ステップ | コマンド | 所要時間 |
|---|---|---|
| 台本生成(mock) | `gen:scripts --mock` | 1〜3秒 |
| 台本生成(Claude API) | `gen:scripts` | 10〜30秒 |
| 字幕SRT（VOICEVOXなし） | `gen:tts` | 1秒以内 |
| 字幕SRT＋音声（VOICEVOXあり） | `gen:tts` | 15〜40秒 |
| 静止プレビューPNG | `preview` | 5〜10秒 |
| MP4レンダー | `render` | 60〜180秒（動画長さによる） |

## 動画検証のやり方（重要）

### Step 1: 静止プレビューで構成を確認（Chrome不要・まずこれ）

```bash
npm run make -- --car <id> --mock --preview
```

`content/renders/<videoId>.preview.png` に3コマが横並びで出力される（540×960の3枚帯）。
- 左：フック（0〜1秒目の字幕・文字サイズ・背景）
- 中：実車写真シーン（Ken-Burns合成はここでは静止だが文字位置が分かる）
- 右：エンドカード（QR・店名・CTA）

確認ポイント：
- テロップが安全域（上15%・下25%は禁止）に収まっているか
- 文字サイズ・縁取りが読めるか
- エンドカードのQRと店名が正しいか

### Step 2: MP4で動きを確認（要Chrome）

```bash
npm run make -- --car <id> --mock
```

このリモート実行環境ではChromiumが `/opt/pw-browsers/chromium` に入っている。
Remotionがデフォルトで自動検出するが、見つからない場合は環境変数で指定：

```bash
PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium npm run make -- --car <id> --mock
```

出力先: `content/renders/<videoId>.mp4`（約25〜40秒の動画）

確認ポイント：
- 冒頭0〜1秒でフックが出るか
- 3〜5秒ごとにカット/ズーム割込みがあるか（テンポ維持）
- 価格・年式・走行の数字が正しいか（景表法）
- エンドカード（最後5〜10秒）でQRが見えるか
- 全体が25〜40秒に収まっているか

### Step 3: 人間ゲート（焼き込み前チェックリスト）

焼き込み（MP4確定）前に以下を必ず目視確認：

- [ ] 価格表示が `cars.json` と一致する
- [ ] 年式・走行距離が正しい
- [ ] 車種名の読み（VOICEVOX）が自然
- [ ] 誇大・断定表現がない（「日本一安い」「絶対得する」等は禁止）
- [ ] 「外車専門」表記がない（「大阪・中古車」に統一）

## ハードルール（厳守）
1. TikTokへの完全自動投稿はしない（BAN回避）。生成→人間が確認→手動 or 予約投稿。
2. 動画の価格・スペックは `content/inventory/cars.json` の実データを正確に使う（景表法・古物商法）。
3. LINE配信は同意＋配信停止導線＋記録（特電法/APPI）。
4. レンダーに音楽を焼き込まない（トレンド音は投稿時にアプリで手付け）。
5. `content/car-photos/<id>/` に写真を置く（`content/inventory/` ではない）。

## 動画スタイル方針
- **実写ショーケース型**。漫画パネル・AIイラストは使わない。
- 実車写真を全画面 Ken-Burns で表示し、上に暗幕グラデを重ねて文字を読みやすくする。
- 数字・価格はゴールドグラデ強調。
- 詳細は `packages/video-pipeline/CLAUDE.md` に従う。

## 重要ファイル
| ファイル | 役割 |
|----------|------|
| `content/inventory/cars.json` | 在庫データ(10台) |
| `content/car-photos/<id>/` | 実車写真 |
| `content/car-photos/<id>/order.json` | AI選別済み写真順序 |
| `content/brand/tiktok-spec.md` | 台本生成の基準仕様 |
| `packages/script-gen/src/mock.ts` | APIキーなし台本生成 |
| `packages/video-pipeline/src/remotion/MangaInventory.tsx` | Remotionコンポジション |
| `.env` | 店名/LINE URL等の設定 |
| `.github/workflows/daily-videos.yml` | 毎日自動生成(GitHub Actions) |

## フェーズ別ロードマップ
- **Phase1(今)**: 手動撮影→自動動画生成→手動TikTok投稿
- **Phase2**: Metricool/Buffer で予約投稿
- **Phase3**: LINE Messaging API → Railway bot → LIFF来店予約/買取査定
- **Phase4**: 数値分析で勝ち型を `tiktok-spec.md` に反映
