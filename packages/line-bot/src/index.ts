import { serve } from "@hono/node-server";
import { app } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`line-bot listening on :${info.port}`);
  console.log(`webhook URL を LINE Developers に登録: https://<your-host>/webhook`);
});
