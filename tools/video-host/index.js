// 完成動画の配信(Cloudflare Workers + R2)。
// Railway(有料)から移設したもの。R2はエグレス無料・10GBまで無料で、
// 動画6MB×数十本ならタダで収まる。
//
//   PUT  /admin/videos/<name>.mp4?token=ADMIN_TOKEN  … アップロード
//   GET  /videos/<name>.mp4                          … 公開配信(LINEが取得)
//   GET  /version                                    … 稼働確認
//
// LINEのプレイヤーはRange(部分リクエスト)で取りに来るため206に対応する
// (これが無いとLINE上で「動画を再生できません」になる)。

const ALLOWED = /^[a-zA-Z0-9_.-]+\.(mp4|jpg)$/;

function contentType(name) {
  return name.endsWith(".jpg") ? "image/jpeg" : "video/mp4";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/version") {
      return Response.json({ service: "carshop-video-host", storage: "r2", ok: true });
    }

    // アップロード(ADMIN_TOKENで保護)
    const put = path.match(/^\/admin\/videos\/([^/]+)$/);
    if (put && request.method === "PUT") {
      if (!env.ADMIN_TOKEN || url.searchParams.get("token") !== env.ADMIN_TOKEN) {
        return new Response("unauthorized", { status: 401 });
      }
      const name = decodeURIComponent(put[1]);
      if (!ALLOWED.test(name)) return new Response("invalid filename", { status: 400 });
      await env.VIDEOS.put(name, request.body, {
        httpMetadata: { contentType: contentType(name) },
      });
      return Response.json({ ok: true, url: `${url.origin}/videos/${name}` });
    }

    // 配信(公開・認証なし。LINEのサーバーが直接取りに来るため)
    const get = path.match(/^\/videos\/([^/]+)$/);
    if (get && (request.method === "GET" || request.method === "HEAD")) {
      const name = decodeURIComponent(get[1]);
      if (!ALLOWED.test(name)) return new Response("invalid filename", { status: 400 });

      const range = request.headers.get("range");
      const parsed = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;

      // R2にoffset/lengthを渡して必要な範囲だけ読む(全体をメモリに載せない)
      const options = {};
      if (parsed) {
        const start = parsed[1] ? Number(parsed[1]) : undefined;
        const end = parsed[2] ? Number(parsed[2]) : undefined;
        options.range =
          start !== undefined && end !== undefined ? { offset: start, length: end - start + 1 }
          : start !== undefined ? { offset: start }
          : { suffix: end };
      }

      // アップロード直後はごく稀に取得できないことがある(実測で発生)。
      // LINEは取得に1回でも失敗すると「動画を再生できません」になるため、
      // null のときだけ一度だけ間を置いて取り直す。
      let object = await env.VIDEOS.get(name, options);
      if (!object) {
        await new Promise((r) => setTimeout(r, 150));
        object = await env.VIDEOS.get(name, options);
      }
      if (!object) return new Response("not found", { status: 404 });

      const size = object.size;
      const headers = {
        "Content-Type": object.httpMetadata?.contentType ?? contentType(name),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      };

      if (!parsed) {
        return new Response(request.method === "HEAD" ? null : object.body, {
          status: 200,
          headers: { ...headers, "Content-Length": String(size) },
        });
      }

      const r = object.range;
      const start = r.offset ?? (size - r.suffix);
      const length = r.length ?? (size - start);
      return new Response(request.method === "HEAD" ? null : object.body, {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(length),
          "Content-Range": `bytes ${start}-${start + length - 1}/${size}`,
        },
      });
    }

    return new Response("not found", { status: 404 });
  },
};
