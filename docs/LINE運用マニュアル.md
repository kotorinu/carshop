# カーショップJupiterCoring LINE運用マニュアル

最終更新: 2026-07-19。わからなくなったらこのファイルをClaude（AI）に見せれば全部わかる。

## 毎日やること（合計1〜2分）

| いつ | やること | 方法 |
|---|---|---|
| 通知が来たら | お客様に返信する | LINEに「【運営通知】」が届く（査定申込み・未対応チャット）→ **LINE公式アカウントアプリ**（スマホ）を開いて返信。30分以内の返信が理想（成約率に直結） |
| 朝イチ | 未読チェック | LINE公式アカウントアプリのチャット一覧を見るだけ |

**返信のコツ**: 査定は「概算◯◯万円です。現車を見せていただければ正式なお値段を出せます。今週だと◯日か◯日はいかがですか？」と**来店日時の二択で締める**。

## 週1回やること（15分・Claudeと一緒に）

Claudeに「**今週のLINE見せて**」と言うだけで以下が出てくる:
1. KPIサマリ（友だち数・流入元・タグ内訳・フォーム回答・未対応）
2. 対応が必要なことの提案（配信・値下げ連動など）

在庫が変わったら（売約・新入庫）: Claudeに「**在庫更新して**」と言う → カルーセルが最新化される。

配信したいとき: Claudeに「**TikTok経由の人に◯◯を配信して**」→ 下書きを作って確認後に送信。

## システムの仕組み（何がどう動いているか）

- **お客様がLINEに何を送っても必ず何かが返る**（無視ゼロ設計）:
  - 「査定」→ 査定フォームのカード ／「在庫」→ 12台カルーセル ／「予約」「来店」→ RESERVA予約カード ／「アクセス」「営業時間」→ 店舗情報 ／ それ以外 → 「営業時間内に必ずお返事します」＋電話番号
- **友だち追加の瞬間**: 「クルマ、買うのも売るのも。」カード＋3ボタンが自動送信 → 以降Day1/3/5/7に育成メッセージが自動配信
- **ボタンを押す・キーワードを送るたびにタグが付く**（int:査定・int:購入・st:来店予約・src:tiktok等）→ 後からセグメント配信に使える

## ⚠️ 通知の重要な注意（PCについて）

査定フォームの新着通知は**このPC（LAPTOP-B763L63R）が起動している間だけ**15分毎にチェックされます（タスク名: carshop-line-notify）。
- **PCがオフの間**: フォーム回答の通知は届かない（PCを点けたら15分以内にまとめて届く）。お客様の**チャットメッセージ**はPCと無関係にLINE公式アプリへ通知される
- 確認コマンド（PowerShell）: `schtasks /Query /TN carshop-line-notify`
- 手動で今すぐチェック: `node C:\Users\jupit\workspace\carshop\tools\line-harness-seed\notify-owner.mjs`

## 各媒体に貼るリンク（流入元が自動計測される）

| 媒体 | 貼るURL |
|---|---|
| TikTokプロフィール | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=tiktok |
| Instagramプロフィール | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=instagram |
| ジモティ | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=jimoty |
| メルカリ | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=mercari |
| 店頭QR（印刷用） | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=tenpo |
| 紹介・口コミ | https://carshop-line-harness.jupitercoring.workers.dev/auth/line?ref=intro |

## 月次の目安（LINE公式アカウントの無料枠）

無料200通/月（コミュニケーションプラン）。ステップ配信は1人あたり5通なので、**月40人まで**の新規友だちなら無料枠内。超えそうならライトプラン（5,000通・月5,500円）へ。自動応答（査定・在庫など）は**無料枠を消費しない**。

## 困ったとき

- 何かおかしい → Claudeに「LINEの◯◯がおかしい」と言う（設定は全部APIで確認・修正できる）
- 全部の技術詳細 → `carshop/docs/line-harness-crm-plan.md`
- システム全体を人に説明したい → `carshop/docs/LINE集客システム全体像.md`
