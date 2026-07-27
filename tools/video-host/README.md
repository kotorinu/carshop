# 動画配信（Cloudflare Workers + R2）

完成したTikTok/リール用の動画を、スマホ（LINE）に送るための置き場。
**Railway（有料）から移設済み。ここは無料枠で収まる。**

- 公開URL: `https://carshop-videos.jupitercoring.workers.dev`
- 保管先: R2バケット `carshop-videos`（エグレス無料・10GBまで無料。動画6MB×19本＝約120MBなので余裕）
- 認証: `ADMIN_TOKEN`（Workerのsecret。`.env` と同じ値）

## なぜ無料になるのか

| | 旧: Railway | 新: Cloudflare |
|---|---|---|
| サーバー | 常時起動のコンテナ（有料） | Worker（リクエスト時だけ実行・10万req/日まで無料） |
| 保管 | コンテナの永続ボリューム | R2（10GB無料・**転送量無料**） |

## 使い方

```bash
# アップロード
curl -X PUT --data-binary "@content/renders/<videoId>.mp4" \
  "https://carshop-videos.jupitercoring.workers.dev/admin/videos/<videoId>.mp4?token=$ADMIN_TOKEN"

# 確認（LINEはRangeで取りに来るので206が返ることが重要）
curl -I -H "Range: bytes=0-1023" \
  "https://carshop-videos.jupitercoring.workers.dev/videos/<videoId>.mp4"
```

## デプロイ

```bash
npx wrangler deploy --config tools/video-host/wrangler.toml
```

secretの登録（初回のみ・設定ファイルに秘密を書かないこと）:

```bash
npx wrangler secret put ADMIN_TOKEN --config tools/video-host/wrangler.toml
```

## Railway を止めるとき

このWorkerに全動画を移設済み（2026-07-27）。Railwayの `carshop-line-bot` は
- LINEのWebhookは既にharness（Cloudflare Worker）に移っている
- LIFFフォームもharness側のフォームを使用
- 残る役割は動画配信のみ → **このWorkerが引き継いだので停止して問題ない**

Railwayダッシュボード → carshop-line-bot → Settings → Danger Zone から削除/停止。
