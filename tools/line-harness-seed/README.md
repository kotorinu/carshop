# line-harness-seed — carshop CRM初期設定の一発投入

LINE Harness デプロイ後に1回実行すると、carshop用のCRM初期設定（タグ・ステップ配信・フォーム・自動応答・自動化・リッチメニュー）を全部投入する。再実行しても重複しない（名前で既存チェック）。

全体計画: [../../docs/line-harness-crm-plan.md](../../docs/line-harness-crm-plan.md)

## 使い方

```bash
# 接続情報は ~/.line-harness/.line-harness-config.json から自動読込
# （create-line-harness 完了後ならそのまま動く）
node seed.mjs --dry-run        # 何が作られるか確認（API呼び出しなし）
node seed.mjs                  # 投入（リッチメニュー以外）
node seed.mjs --richmenu       # リッチメニュー込みで投入
```

環境変数で上書きも可能: `WORKER_URL` / `API_KEY` / `LIFF_ID` / `INVENTORY_URL`（在庫ボタンの飛び先。デフォルト https://kotokoto-gaisya.com/ ）/ `RESERVA_URL`（来店予約の飛び先。デフォルト https://reserva.be/jupitercoring ）

## 投入内容

| 種別 | 内容 |
|---|---|
| タグ 10個 | 流入元 `src:*` ／ 興味 `int:査定` `int:購入` ／ 状態 `st:来店予約` `st:成約` `st:配信停止` |
| シナリオ | 「新規友だち育成（Day0-7）」5通（旧 line-bot の steps.ts を移植）。Day1以降は `st:配信停止` タグ付きには送らない |
| フォーム 1個 | 無料査定（→ `int:査定` 自動タグ） |
| トラッキングリンク | 「RESERVA来店予約」→ 外部予約サービスRESERVAへの誘導リンク。クリックで `st:来店予約` 自動タグ（実際の空き枠管理はRESERVA任せ） |
| 自動応答 5個 | 査定／予約／来店／アクセス／営業時間（replyMessageなので通数カウント外・無料）。予約・来店はRESERVAリンクを案内 |
| 自動化 3個 | キーワード受信 → タグ自動付与 |
| リッチメニュー | 3ボタン（無料査定=「査定」送信／在庫を見る=会社サイト／来店予約=RESERVAへ直接遷移）。画像は `richmenu/richmenu.png` |

## ゼロから再構築するときの完全手順

```bash
node seed.mjs --richmenu          # 基本投入
node post-seed-flex.mjs           # Day0をhero付きFlex3ボタン化＋自動応答Flex化（要API_KEY環境変数）
node post-seed-hardening.mjs      # フォーム送信後メッセージ・Day3/5リンク・リッチメニューv2
wrangler d1 execute <db> --env production --remote --file fallback-reply.sql  # フォールバック応答（APIは空keyword不可のためD1直挿入）
```

hero画像を作り直すときは `richmenu/welcome-hero.html` を編集 → `node richmenu/welcome-render.cjs` → `POST /api/images` でR2にアップ → post-seed-flex.mjs のHERO定数を差し替え。

## 運用CLI

```bash
node broadcast.mjs --list-tags                                  # タグ一覧と人数
node broadcast.mjs --tag src:tiktok --title 在庫案内 --text "本文"  # セグメント配信の下書き作成
node broadcast.mjs --tag src:tiktok --title 在庫案内 --text "本文" --send      # 即時送信
node broadcast.mjs --all --title お知らせ --text "本文" --schedule "2026-07-20T10:00:00+09:00"  # 全員に予約配信
node kpi.mjs                                                    # 週次KPIサマリ（友だち数/タグ/流入元/フォーム/未対応）
```

| 追加投入されるもの | 内容 |
|---|---|
| 配信テンプレート 4種 | 在庫紹介（週次）/ 値下げ告知 / 売約報告 / 買取キャンペーン |
| 入口リンク 5本 | `/auth/line?ref=tiktok・jimoty・mercari・tenpo・intro` → 友だち追加時に流入元タグ自動付与。**各媒体のプロフィールにはこのURLを貼る** |

## リッチメニュー画像の再生成

デザインを変えたいときは `richmenu/richmenu.html` を編集して:

```bash
cd richmenu && node render.cjs   # → richmenu.png (2500x843)
```

puppeteer は banner-assets の node_modules を流用している。

## 停止した機能

**朝ルーティン便（毎朝5:30のリマインドLINE）— 2026-08-22 停止**

生成スクリプト `morning-routine-push.mjs`（`st:運営` タグ宛に7日分の予約配信を積むもの）は削除した。carshop側から新しい予約が積まれることはない。完全に止めるには残り2つの確認が必要:

1. **予約済みの配信** — Harnessに残っている「朝ルーティン便 ◯◯」の予約は管理画面から削除する（削除するまで予定日時に届く）
2. **秘書AI（line-fastapi-bot）の5:30朝礼** — 2026-07-20に朝ルーティン便はこちらへ統合済み。いま毎朝届いているのはこの経路なので、停止は line-fastapi-bot 側で行う

復活させるときは `git log -- tools/line-harness-seed/morning-routine-push.mjs` から復元できる。
