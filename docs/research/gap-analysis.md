# ギャップ分析 — 当パイプライン vs プロ製品（2026年7月調査）

> コード全体の監査と、プロ製品の実調査に基づく「足りないもの」の精査結果。
> P0は本コミットで修正済み。P1/P2は優先順に実装する。

## 1. 調査したプロ製品と当パイプラインの位置づけ

| 製品 | 得意領域 | 当パイプラインとの関係 |
|---|---|---|
| [Submagic](https://www.submagic.co/) | 単語単位アニメ字幕(99%精度)・自動ズーム・遷移SE・B-roll挿入。2026年3月からTikTok直接投稿 | 字幕演出とSEで差がある(P1)。投稿自動化はPhase2(P2) |
| [OpusClip](https://www.ngram.com/blog/opus-clip-vs-submagic) | 長尺→ショート切り出し+バイラリティスコアでクリップ選抜 | 「スコアで競わせる」発想はフックA/Bに応用可能(P2) |
| [AutoShorts.ai](https://autoshorts.ai/) 等 | 毎日自動生成→自動投稿のフルオート | BAN回避のため完全自動投稿はしない方針(ハードルール)。下書き投入までが落とし所 |
| [Creatomate](https://creatomate.com/) / [Shotstack](https://shotstack.io/) / [JSON2Video](https://json2video.com/) | JSONテンプレ駆動のデータ→動画レンダリングAPI | **構成は同型**(cars.json→台本JSON→Remotion)。方向性は正しい。JSON2Videoの「シーン長=最長要素に自動追従」は音声対応(P0-1)の参考 |
| Phyron / Spyne(車業界特化) | 在庫写真の自動リフレーム・背景処理→広告動画 | 9:16前処理(P0-4)が該当。生成AIに渡す前に縦構図へ |

**結論**: 「データ駆動テンプレ→レンダー→自己採点」という骨格はプロのアーキテクチャと同型で妥当。
差は①音まわり ②字幕演出の粒度 ③投稿・分析の運用自動化 ④法令表示の網羅、の4領域に集中している。

## 2. ギャップ一覧

### P0 — 致命的（本コミットで修正済み）

| # | ギャップ | 問題 | 修正 |
|---|---|---|---|
| 1 | **音声がMP4に未合成** | VOICEVOXがwav+timings.jsonを作るのに`MangaInventory.tsx`に`<Audio>`が無く動画が**無音**だった | `setup.ts`が`content/audio/<videoId>/`を検出し`audioByScene`をpropsで渡し、シーンごとに`<Audio>`を配置 |
| 2 | **支払総額表示なし（法令）** | 中古車広告は公正競争規約で**支払総額表示**が必要(2023年10月〜)。車両本体価格しか出していなかった | `CarSchema`に`totalPaymentJpy`追加、SpecBarを「総額◯◯万円」表示に、self-reviewの価格照合にも追加 |
| 3 | **Klingクリップ5秒 vs シーン最大6秒** | 5秒超のシーンで`<Video>`が終端で止まる | `loop`指定 |
| 4 | **写真を4:3のままKlingへ送信** | 4:3クリップ→縦画面で大幅クロップ(被写体が切れる) | 送信前にsharpで1080×1920(attention crop)に前処理 |

### P1 — プロ比で差が大きい（次に実装すべき）

| # | ギャップ | 内容 | 実装の当て |
|---|---|---|---|
| 5 | カラオケ式ワードレベル字幕 | Submagic等は単語単位アニメが標準。当方はシーン単位(2〜4秒/枚)。VOICEVOX `audio_query`の**モーラ単位タイミングが既にあるのに未活用** | timings.jsonにモーラ配列を保存→Remotionで語ごとにポップ |
| 6 | `reading-dict.json`未参照 | 「RX450h」等の車種名をVOICEVOXが誤読する。辞書ファイルは存在するがどのコードも読んでいない | `tts/cli.ts`でナレーションに辞書置換をかけてからaudio_query |
| 7 | 遷移SE(効果音) | sfxフィールド(ドン/ポンッ)が視覚のみ。Submagicは遷移SEを自動挿入 | 音楽は焼かない方針のまま、フリーSE(価格ドン等)だけ`<Audio>`追加 |
| 8 | doctor未更新 | KLINGキー・Chromium検出・pick:photos案内が無い | 本コミットで修正済み |

### P2 — 運用スケール（ロードマップ）

| # | ギャップ | 内容 |
|---|---|---|
| 9 | 予約投稿連携 | Phase2のまま未着手。人間ゲート維持なら「Metricool/Buffer下書き投入」or TikTok Content Posting APIのdraftまで自動化 |
| 10 | レビューUI | runbook記載の review-ui が実在しない。preview.png+review.mdを一覧する静的HTMLで十分 |
| 11 | フックA/B | 台本生成でフック2〜3案→self-review採点で選抜(OpusClipのバイラリティスコアの内製版) |
| 12 | 分析フィードバック | 再生/完了率→`tiktok-spec.md`反映がPhase4のまま手動。まず投稿実績CSV+月次見直しのテンプレから |
| 13 | 全在庫バッチ | 旧CLAUDE.mdが参照していた`.github/workflows/daily-videos.yml`は実在しない。`make --all`かworkflow追加 |

## 3. 推奨順序

1. ~~P0(本コミット)~~ → 済
2. **P1-6 読み辞書**(30分・誤読は信頼を直撃) → **P1-5 カラオケ字幕**(半日・見た目の差が最大) → P1-7 SE(1時間)
3. 実写真・APIキー投入後に self-review フルループを回して style-params を焼き込む
4. P2は投稿本数が週5本を超えて回り始めてから(先に作ると過剰装備)

## Sources
- [Opus Clip vs Submagic (2026) — ngram](https://www.ngram.com/blog/opus-clip-vs-submagic)
- [Submagic — Edit shorts 10x faster with AI](https://www.submagic.co/)
- [AutoShorts.ai — Faceless Video Generator](https://autoshorts.ai/)
- [Best Video APIs for Developers in 2026: Shotstack vs Creatomate vs JSON2Video](https://samautomation.work/blog/best-video-apis-developers-2026/)
- [The Best Video Generation APIs — Creatomate](https://creatomate.com/blog/the-best-video-generation-apis)
- [Top AI Video Clipping Tools 2026 — reap.video](https://reap.video/reports/state-of-top-ai-video-clipping-tools-2026)
- 中古車の支払総額表示: 自動車公正取引協議会の公正競争規約改正(2023年10月施行)
