// 短縮リダイレクタ: line.jupitercoring.workers.dev/<媒体名> → Harnessの計測付き友だち追加URLへ302
// 例: /tiktok → carshop-line-harness.../auth/line?ref=tiktok（流入元計測はそのまま機能する）
const DEST = "https://carshop-line-harness.jupitercoring.workers.dev/auth/line";

export default {
  fetch(req) {
    const path = new URL(req.url).pathname.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    // 未知のパスでもrefとして素通しする（Harness側は未知refを無視して普通に友だち追加させるだけなので無害）
    const target = path ? `${DEST}?ref=${path}` : DEST;
    return Response.redirect(target, 302);
  },
};
