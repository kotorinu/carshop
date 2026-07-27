# carshop × LINE Harness — Lステップ代替CRM 導入計画

作成: 2026-07-11（Claude Code）。状況が変わったらこのファイルを更新する。

## 何を作るか

Jupiter Coring の LINE 公式アカウントに、**LINE Harness OSS**（https://github.com/Shudesu/line-harness-oss ・MIT）を導入し、
Lステップ相当（顧客管理・タグ・ステップ配信・セグメント配信・リッチメニュー・フォーム）を **月額0円**（Cloudflare無料枠）で運用する。

- 管理画面: Cloudflare Pages（Next.js）
- 本体: Cloudflare Worker（webhook受信 + cron配信）+ D1 SQLite
- Claude Code から MCP server（`@line-harness/mcp-server`）で全操作可能 → 日々の運用はAIに任せられる

## 現在の状態（2026-07-11）

| 項目 | 状態 |
|---|---|
| LINE Harness リポジトリ | ✅ クローン済み `workspace/line-harness-oss`（v0.14.1）・依存インストール済み |
| Node / pnpm | ✅ Node v25.5.0 / pnpm導入済み |
| 車用LINE公式アカウント | ✅ **カーショップJupiterCoring @777mfasy**（友だち3人・コミュニケーションプラン） |
| Messaging API | ✅ **有効化済み**。Channel ID 2010502073。Secret取得済み（carshop/.env に保管）。認証情報はトークン発行APIで実弾検証済み |
| 旧carshop bot | ⚠️ **Railwayで本番稼働中**（carshop-line-bot-production.up.railway.app）。webhookは現在Railway向き（active）。Harness切替時にwebhook URLを差し替え→その後Railway停止 |
| 長期チャネルアクセストークン | ✅ **取得済み**（2026-07-18琴音さん発行・bot infoで検証済み・carshop/.env） |
| LINE Loginチャネル | ✅ **既存の「Lログイン」を流用**（ID 2010502252・エルメ由来・カーショップJupiterCoringプロバイダー配下・公開済み。Secret取得済み→carshop/.env） |
| LIFF | ✅ **作成済み `2010502252-ahtpIdmQ`**（2026-07-18 API経由。Full/aggressive/openid+profile+chat_message.write。エンドポイントはhttps://example.com仮置き→デプロイ後PUT /liff/v1/appsで差し替え）。エルメ用LIFF2つは温存 |
| Cloudflareアカウント + R2 | ✅ **作成・R2有効化済み**。アカウントID `5ce62e8f19a2ffc522201cc1c80e4fa7`（carshop/.env） |
| Cloudflare APIトークン | ❌ 琴音さんが発行中。**R2専用トークンではなく汎用のアカウントAPIトークン**（Workers/D1/Pages/R2編集権限のカスタムトークン）が必要 |
| 残確認 | Lログインチャネルの「LINEログイン設定」タブ→リンクされたボットが @777mfasy か（aggressiveの友だち追加に必要。エルメが同OAで使っていたのでほぼ確実にOK） |

## セットアップの流れ

公式CLI `npx create-line-harness` が一括実行（D1作成→デプロイ→LIFF→管理画面Owner作成）。
CLIが要求する入力と、誰がやるか:

| 入力 | 取得元 | 担当 |
|---|---|---|
| Cloudflare認証（wrangler login） | ブラウザOAuth | 琴音さん（拡張許可後はClaude代行可） |
| R2有効化 | CFダッシュボード（**クレカ登録必要**・10GBまで無料） | 琴音さんのみ |
| プロジェクト名 | 任意 → `carshop-line-harness` 推奨 | Claude |
| Messaging API Channel ID / Secret / アクセストークン | manager.line.biz + developers.line.biz | Claude代行可（拡張許可後） |
| LINE Login チャネルID | developers.line.biz で新規作成 | Claude代行可（規約同意クリックは要承認） |
| LIFF ID | Loginチャネル→LIFFタブ→追加（Full / scope: openid, profile, chat_message.write / 友だち追加: Aggressive / **公開済みにする**） | Claude代行可 |

注意: LINE公式アカウントの**応答設定は「Webhook: ON」**にする。あいさつメッセージ・応答メッセージはHarness側に寄せてOFF。

## 初期CRM設計 → **seedスクリプト実装済み・ローカル検証済み（2026-07-14）**

デプロイ後に `node carshop/tools/line-harness-seed/seed.mjs --richmenu` を1回実行するだけで、下記の設計が全部投入される（冪等・再実行OK）。ローカルのHarness Worker（vite dev + D1 local）で全項目の投入・冪等性・UTF-8整合を検証済み。

- リッチメニュー画像も生成済み: `carshop/tools/line-harness-seed/richmenu/richmenu.png`（2500x843・432KB・ネイビー1色相＋太丸ゴシック）
- 追加分（2026-07-18）: 配信テンプレート4種（在庫紹介/値下げ/売約報告/買取CP）＋**入口リンク5本**（`/auth/line?ref=tiktok|jimoty|mercari|tenpo|intro` → 流入元タグ自動付与）。デプロイ後、TikTokプロフィール等のリンクをこのURLに貼り替えることで媒体別の友だち追加数が計測できる
- 運用CLI: `broadcast.mjs`（タグ別セグメント配信。`--list-tags`で人数確認、デフォルト下書き・`--send`で送信）／`kpi.mjs`（週次KPIサマリ: 友だち数・タグ内訳・流入元・フォーム回答・未対応チャット）
- **Webhook実弾テスト済み**: 署名付きfollow/messageイベントをローカルWorkerに送信 → 友だち登録・Day0-7シナリオ自動登録・「査定」→`int:査定`タグ自動付与まで全て発火確認（2026-07-18）
- **RESERVA連携も実弾検証済み**: トラッキングリンク経由で `st:来店予約` タグ自動付与 → 302で実際のRESERVA URLへ遷移まで確認
- ローカル検証の起動構成: `.claude/launch.json` の `line-harness-worker`（port 8788）。DBは `packages/db/bootstrap.sql` を使うこと（**schema.sqlは古い**。create-line-harness本番セットアップは自動なので影響なし）
- 検証用ダミー環境変数: `line-harness-oss/apps/worker/.dev.vars`（ダミー値のみ・本番secretsは置かない）

### タグ
- 流入元: `src:tiktok` `src:jimoty` `src:mercari` `src:店頭` `src:紹介`
- 興味: `int:査定` `int:購入` `int:車種_<名前>`
- 状態: `st:未対応` `st:対応中` `st:来店予約` `st:成約` `st:配信停止`

### ステップ配信（既存 `carshop/packages/line-bot/src/flows/steps.ts` の5通を移植）
| Day | 内容 |
|---|---|
| 0 | 挨拶・店の紹介（外車専門・買取も販売も） |
| 1 | 今週の注目在庫3台 → 返信で車種名 |
| 3 | 外車を高く売るコツ3点 → LINE無料査定 |
| 5 | お客様の声・納車事例 + 来店予約特典 |
| 7 | 買取アップキャンペーン → 「査定」送信 or メニュー |

※ LINE公式の無料メッセージ枠は**月200通**（コミュニケーションプラン）。友だちが増えたらライトプラン(5,000通/月)へ。ステップは5通/人なので 40人/月 追加までが無料枠の目安。

### 自動応答（キーワード）
- 「査定」→ 査定フォーム（LIFF）リンク + `int:査定` タグ
- 「予約」「来店」→ 来店予約フォーム + `st:来店予約` タグ
- 車種名（在庫にあるもの）→ 該当在庫の紹介 + `int:車種_◯◯` タグ

### 来店予約 → **RESERVA** に一本化（2026-07-18決定）
自前のLIFF「希望日時を選ぶだけ」フォームは実際の空き枠と連動しておらず二重予約の恐れがあり、意味をなしていなかった。
既存の外部予約サービス **RESERVA**（https://reserva.be/jupitercoring）に一本化する:
- 実装は「RESERVA来店予約」という**トラッキングリンク**（`POST /api/tracked-links` → `st:来店予約`タグ紐付け）
- リッチメニューの「来店予約」ボタン・自動応答（「予約」「来店」）は全てこのトラッキングリンクのURLを案内
- クリックすると自動で `st:来店予約` タグが付き（実弾検証済み）、その後 302 で RESERVA の実際の予約ページへ飛ぶ
- RESERVA側の空き状況管理・確定通知はRESERVAに任せる。LINE側はあくまで「予約ページへの導線」と「予約意欲タグ付け」の役割

### フォーム（LIFF）
carshop既存の `appraisal.html` の項目を Harness のフォーム機能に移植:
- 無料査定: 車種 / 年式 / 走行距離 / 事故歴 / 名前 / 電話 / 備考

### リッチメニュー（3ボタン）
[無料査定] [在庫を見る] [来店予約]

### 通知
新規友だち追加・フォーム回答 → オーナーへLINE push（Harnessの通知ルール）

## ウェルカムファネル強化（2026-07-18 夜・本番適用済み）

実機テストで「テキスト1通だけでは集客にならない」との指摘を受け、バディカ式のボタン分岐ファネルに刷新:

- **Day0**: follow瞬間に**hero画像付きFlexカード**が即時送信される（Harnessはstep1のdelay=0をreplyMessageで即送する実装）。hero=`richmenu/welcome-hero.png`（1040x676・richmenuと同一デザイン言語、`welcome-render.cjs`で再生成、R2: `/images/64f15828-….png`）。ボタン3つ: 車を探している→「購入相談」／売りたい→「査定」／店に行きたい→「予約」（全てmessageアクション→キーワード自動応答＋タグ自動化が発火する設計。uriボタンにしないのは意図タグを取るため）
- **自動応答のFlex化**: 査定（30秒フォームボタン＋直接返信案内）／購入相談（在庫ボタン＋予算返信促し・新規）／予約・来店（RESERVA予約ボタン＋店舗情報）。アクセス/営業時間はテキストのまま
- **自動化追加**: 「購入相談」→`int:購入`タグ
- Day1-7の【n/5】番号プレフィックスは除去済み
- 適用スクリプト: scratchpadの`upgrade-v2.mjs`（GET stepsは**`/api/scenarios/:id`にsteps同梱**。`/steps`単独GETは無い）
- **注意: seed.mjsはこの新仕様に未同期**（seed再実行しても既存スキップで本番は壊れないが、ゼロから再構築するとテキスト版Day0になる）→ 次回seed.mjsへ反映すること
- テスト友だちデータはD1から削除済み → ブロック→解除で再度Day0から体験可能

RESERVA確認済み（2026-07-18）: reserva.be/jupitercoring は「来店相談サイト」・メニュー「来店・購入相談」設定済みで来店予約用として機能する。琴音さん側で要確認: 受付時間が実営業（9:00-19:00木曜定休）と一致しているか・リマインダー通知ON

## 琴音さんにしかできないこと（残り）

1. **Chrome拡張で developers.line.biz を承認**: Claude拡張アイコン→設定→「承認済みのサイト」に追加、または私がそのドメインへの操作を試みた際に出る承認プロンプトを許可
   - 代替案: developers.line.biz は琴音さんご自身の手で開けるので、長期チャネルアクセストークンの発行だけ手動でやってもらい、値だけ私に渡してもらう形でも進行可能（下記参照）

上記どちらかが済めば、長期トークン発行〜Loginチャネル/LIFF〜デプロイ〜CRM初期投入まで進められる。

### developers.line.bizを手動で進める場合の依頼手順
1. https://developers.line.biz/console/ を開く
2. 「カーショップJupiterCoring」のプロバイダー → Messaging APIチャネルを選択
3. 「Messaging API設定」タブ → チャネルアクセストークン（長期）を発行 → その値を教えてもらう
4. 同じプロバイダーで LINEログインチャネルが既にあるか確認（無ければ新規作成）→ Channel IDを教えてもらう
5. LINEログインチャネル→LIFFタブ→追加（Full／scope: openid, profile, chat_message.write／友だち追加: Aggressive／エンドポイントは仮でOK、後で差し替え）→ LIFF IDを教えてもらう

## 切替（go-live）チェックリスト → **2026-07-18 本番稼働開始🎉**

1. ✅ デプロイ完了（対話CLIではなくwrangler手動デプロイ。`--env production` + `CLOUDFLARE_ENV=production`でvite build）
   - **Worker: https://carshop-line-harness.jupitercoring.workers.dev**（cron 5分毎+6時間毎）
   - D1: `carshop-line-crm`（2650b40f-…, bootstrap.sqlで69テーブル）／R2: `carshop-line-harness-images`／subdomain: `jupitercoring.workers.dev`（API経由で登録）
   - secrets 7個。**注意: PowerShellのパイプでsecret putするとCRLF混入で401になる → `wrangler secret bulk <json>` を使うこと**
2. ✅ seed投入完了（タグ10・シナリオ・フォーム・RESERVAリンク `/t/MktVwAt`・自動応答5・自動化3・テンプレ4・入口5・**リッチメニューをLINE実弾で設定**）
3. ✅ 応答設定は既に理想形だった（あいさつOFF・Webhook ON・応答メッセージ不使用）→ 変更不要
4. ✅ Webhook切替: Railway → Harness（endpoint設定・active=true・疎通テスト200）
5. ⬜ **コールバックURL追加（琴音さん・必須）**: Lログインチャネル→LINEログイン設定→コールバックURL に `https://carshop-line-harness.jupitercoring.workers.dev/auth/callback` を追加。**これ無しでは入口リンク（/auth/line?ref=）が動かない**
6. ⬜ リンクされたボット=@777mfasy 確認（同タブ下部）
7. ⬜ 実機テスト: 「査定」送信→自動応答＋タグ／友だち追加→Day0
8. ⬜ TikTokプロフィール等のリンク貼り替え（`/auth/line?ref=tiktok` 等。5と7の後に）
9. ⬜ 数日安定後、Railwayの旧botを停止（月$5節約）。`video/kpi-digest.mjs` のBOT_URL参照も要更新
10. ⬜ （任意）管理画面（Next.js→CF Pages）のデプロイ。当面はAPI/CLI（broadcast.mjs・kpi.mjs）とchat.line.bizで運用可

## 関連
- 本家wiki: `workspace/line-harness-oss/docs/wiki/`（21-Deployment.md, 24-MCP-Server.md が要点）
- 旧自前bot: `carshop/packages/line-bot/`（Harness稼働後は廃止予定。steps.tsの文面だけ移植）
- ⚠️ steps.tsの「外車専門店」文言は**誤り**（Jupiter Coringは中古車販売店）。2026-07-18に本番・hero画像・seed.mjsから外車表現を全除去済み。旧文言の再利用時は注意
