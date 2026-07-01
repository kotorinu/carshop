---
name: buzz-video
description: 実車写真からバズる中古車TikTok動画(15〜30秒)を自動生成するルーティン。写真アップ→選定→台本→クリップ→レンダー→自己採点→人間ゲート→投稿までの全手順。「動画作って」「〇〇の動画」「TikTok用に」と言われたら使う。
---

# バズ動画生成ルーティン（carshop / TikTokショート）

在庫1台の写真フォルダから、研究ベース（`docs/research/tiktok-buzz-research.md`）の
15〜30秒TikTok動画を生成し、AI自己採点で品質を上げてから人間ゲートに出す。

## 大原則

1. **写真は素材プール**。18枚あっても全部使わない。AIが役割別ベスト（hero/move/interior/detail）を3〜4枚選ぶ
2. **長さは15〜30秒**（在庫=15〜20秒、買取=20〜30秒）。完了率70%がバズの壁
3. **全シーン実写**。漫画調・AIイラスト禁止。Klingクリップ > Ken-Burns > プレースホルダの優先順
4. **数字はゴールド**、価格は"ドン"とリビール。フックに数字を入れる
5. **完全自動投稿はしない**。人間ゲート（価格・年式・表現の目視）を必ず通す

## フルパイプライン（1コマンド）

```bash
# 全部入り: 写真選定→台本→クリップ→MP4→自己採点ループ
npm run make -- --car <carId> --auto

# APIキーが無い時の開発モード（mock台本+静的チェックのみ）
npm run make -- --car <carId> --mock --preview
```

## ステップ個別実行（デバッグ・部分やり直し用）

| ステップ | コマンド | 前提 | 所要 |
|---|---|---|---|
| ⓪ 写真AI選定 | `npm run pick:photos -- --car <id>` | 写真 + ANTHROPIC_API_KEY | 15〜30秒 |
| ① 台本生成 | `npm run gen:scripts -- --car <id>` | ANTHROPIC_API_KEY（無ければmock） | 10〜30秒 |
| ② Klingクリップ | `npm run gen:clips -- --car <id>` | KLING_ACCESS_KEY/SECRET_KEY | 1本2〜6分 |
| ③ 字幕/音声 | `npm run gen:tts -- --video <videoId>` | VOICEVOXは任意 | 1〜40秒 |
| ④ MP4レンダー | `npm run render -- --video <videoId>` | Chrome（`/opt/pw-browsers/chromium`） | 60〜180秒 |
| ④' 静止プレビュー | `npm run preview -- --video <videoId>` | なし（Chrome不要） | 5〜10秒 |
| ⑤ 自己採点ループ | `npm run self-review -- --video <videoId> [--mp4]` | ANTHROPIC_API_KEY（無ければ静的チェックのみ） | 1周1〜3分 |

## 自己採点ループの仕組み

```
レンダー → Claude visionがルーブリック採点(100点満点)
→ 80点未満なら content/brand/style-params.json を安全範囲内で自動調整
→ 再レンダー → 再採点（最大5周）
→ content/renders/<videoId>.review.md にログ（人間ゲート資料）
```

- 採点項目: フック強度/可読性/安全域/テンポ/ゴールド演出/エンドカード/高級感
- **Klingクリップの再生成はループ内でやらない**（コスト保護）。差し替え提案だけレポートに出る
- 静的チェック（常時実行）: 15〜30秒か / カット2〜4秒か / 禁止語 / **価格がcars.jsonと一致するか（景表法）**

## 人間ゲート（焼き込み後・投稿前に必ず）

- [ ] `<videoId>.review.md` のエラー0件・スコア確認
- [ ] 価格・年式・走行が `cars.json` と一致（動画を再生して目視）
- [ ] 車種名の読み（VOICEVOX）が自然
- [ ] 誇大・断定表現なし（「日本一安い」「絶対得」禁止）
- [ ] 「外車専門」表記なし（「大阪・中古車」に統一）

## 投稿ルーティン（手動）

1. `content/renders/<videoId>.mp4` をスマホに転送
2. TikTokアプリで読み込み、**トレンド音を手付け**（レンダーには音楽を焼かない）
3. キャプション: 台本JSONの `hashtags`（3〜5個）+ 本文にキーワード
4. 投稿時間: 平日7:00/12:00・週末10:00軸、1日1〜3本
5. **投稿後30分はコメント返信に張り付く**（フォロワーファーストテストの初速対策）

## 新しい車を追加するとき

1. `content/inventory/cars.json` に1台分を追記（価格・年式・走行は正確に）
2. `content/car-photos/<carId>/` に写真を置く（何枚でもOK・多いほど選定が効く）
3. `npm run make -- --car <carId> --auto`

## 伸びた動画の知見の反映（日次/週次）

伸びた動画のフック/構成の学びは `content/brand/tiktok-spec.md`（台本AIに直接注入される）へ。
月1で `docs/research/tiktok-buzz-research.md` の再調査・更新。
