# 動画制作担当（carshop / TikTokショート）

このファイルは「動画制作担当」のロール定義。`packages/video-pipeline/` 配下のRemotion実装・字幕・エンドカードの作業時、必ずこの基準に従う。

（このリポジトリはWhisper/moviepyではなく Remotion(React/CSS) で字幕を焼き込む）

## 役割
在庫データ(content/inventory/cars.json)とAI選定済み実車写真から、TikTok用タテ動画(1080×1920・**15〜30秒**)を量産する。
完了率70%を狙う、豪華で読みやすい動画を作る。漫画調は使わない（実写ショーケース型）。

## 判断基準（毎回チェック）
- 冒頭2秒で離脱されないか（数字入りフック＋ヒーロー外観）
- 70%まで見られるテンポか（**カット2〜4秒ごと**。同じ画が4秒以上続いたら失敗）
- テロップは一瞬で読めるか（極太・白・黒縁・短い・数字ゴールド）
- 価格・スペックが正確か（景表法・古物商）。self-reviewの静的チェック+人間ゲートで止める

## ビジュアル素材の優先順位
1. **Klingクリップ**（`content/clips/<carId>/<photo>.mp4`・写真から生成した動く5秒動画）→ `ClipPlayer`
2. **実車写真のKen-Burns**（`content/car-photos/<carId>/`）→ `KenBurns`（scale 1.1→1.3・シーンごとに方向反転）
3. プレースホルダ（写真なし時の開発用）
- どちらにも**暗幕グラデ**（上0.25/下0.72・`DarkOverlay`）を重ねて文字を読めるようにする
- 漫画ハーフトーン/コミック枠は使用禁止。旧mangaシーンは `BrandPanel`（濃紺グラデ）で描画

## スタイルパラメータ（重要）
見た目のツマミは全て `content/brand/style-params.json` に外出しされている。
**ハードコードせずここを参照・調整すること**。自己採点ループ(tools/self-review.ts)が
このJSONをホワイトリスト範囲内で自動調整して品質を反復改善する。
Remotionはfsを読めないため render.ts / preview-still.ts が読み込んで inputProps で渡す。

## シーン構成（15〜30秒・mock.tsとtiktok-spec.mdが定義）

### 在庫紹介 B_buyer（15〜19秒・ウォークアラウンド型）
| 秒 | 役割 | 写真役割 | 演出 |
|---|---|---|---|
| 0–2 | フック「この◯◯が598万円」 | hero | `Hook`(112px・数字ゴールド・spring) |
| 2–5 | 年式/走行 | move | `Caption` |
| 5–9 | 装備 | interior | `Caption` |
| 9–12 | 正直な一言(信頼) | detail | `Caption` |
| 12–15 | **価格リビール** | hero | `PriceReveal`(148px・ドン拡大) |
| 15–19 | エンドカード | — | `EndCard`(3〜4秒で切る) |

### 買取 A_seller（20〜27秒）
フック(損失警告2s) → 問題提起(4s) → 実車例+相場(6s) → 証拠(5s) → CTA(6s) → エンドカード(4s)

## 実装コンポーネント（MangaInventory.tsx）
- `Hook` — 0〜2秒の極太フック。上34%位置・数字は1.3倍ゴールド
- `GoldText` — 数字/価格/単位(万円/km/年式)を自動検出してゴールドグラデ+拡大
- `PriceReveal` — `scene.priceReveal: true` のシーンで価格を"ドン"(spring damping80/stiffness200)
- `SpecBar` — 上部に「¥598万 ／ 2021年式 ／ 3.2万km」常時表示(在庫系のみ・topPx=300で上15%安全域の外)
- `Caption` — 通常字幕。下31%位置(下25%安全域の外)・数字ゴールド
- `ClipPlayer` / `KenBurns` / `DarkOverlay` — 素材再生+暗幕
- `EndCard` — 濃紺+店名+LINE QR+CTA。「大阪・中古車」表記(「外車専門」禁止)
- `SfxPop` — シーン頭0.5秒の割込みテキスト(ポンッ/ドン)

## 字幕・テロップ設定（style-params.jsonの既定値）
- フォント：Noto Sans JP Bold（無ければ IPAPGothic フォールバック）
- 文字色：白 #FFFFFF、縁取り：#0b1b30 8px（WebkitTextStroke + paintOrder:"stroke fill"）
- 背景：rgba(12,35,64,0.5)・角丸16px（暗幕が効いていれば省略可）
- 安全域：**上15%(288px)・下25%(480px)はテキスト禁止**（TikTok UI）。字幕は下31%位置
- 1回の表示：最大2行・1〜2秒。1テロップに次の文を含めない
- 文字サイズ：フック=112px(90〜150可変)、通常=68px(52〜84可変)、スペックバー=38px

## ★ゴールド演出（差別化の肝）
- 対象: 価格・年式・走行・「◯◯万円」の数字**だけ**。地の文は白（やりすぎ禁止）
- グラデ: `linear-gradient(180deg, #FFE9A8 0%, #E9C45A 50%, #B8893B 100%)`
- Remotion: `WebkitBackgroundClip:"text"` + `WebkitTextFillColor:"transparent"`（`GoldText`が自動適用）
- preview-still(SVG): `fill="url(#gold)"` の linearGradient（`goldTspans`が自動適用）

## 技術メモ
- FPS=30, 1080×1920。シーンは `Sequence` で `startSec*30` から配置
- Chrome必須のMP4=render.ts（このリモート環境は `/opt/pw-browsers/chromium`）。Chrome不要の確認=preview-still.ts
- 音楽は焼き込まない（トレンド音は投稿時に手付け）
- 音声(VOICEVOX)があれば `content/audio/<videoId>/` — 現状レンダーには未合成（Phase2）

## 出力ルール
- 動画：`content/renders/<videoId>.mp4`（15〜30秒, H.264）
- 確認用：`<videoId>.preview.png`（フック/価格ドン/エンドカードの3枚帯）
- 採点：`<videoId>.review.md`（自己採点ループの出力=人間ゲート資料）

## 検証手順
1. `npm run make -- --car <id> --mock --preview` → preview.png で構成確認（30秒）
2. `npm run make -- --car <id> --mock` → MP4で動き確認（2〜3分）
3. `npm run self-review -- --video <id> --mp4` → AI採点80点+静的チェック0エラーまで
4. 人間ゲート: 価格・年式・読み・誇大表現・「外車専門」無しを目視

## デフォルト動作
- 「動画作って」だけでも `.claude/skills/buzz-video/SKILL.md` のルーティンを全自動適用
- 写真選定は selection.json(AI選定)→無ければファイル名順先頭

## 日次タスク
- 自動生成後、伸びた動画のフック/構成の知見を `content/brand/tiktok-spec.md` に反映する
- 月1で `docs/research/tiktok-buzz-research.md` を再調査・更新
