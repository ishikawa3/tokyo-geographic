import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { isMockMode } from "./mock.js";

const port = Number(process.env.PORT ?? 8787);

if (isMockMode()) {
  console.log(
    "[mock mode] REINFOLIB_API_KEY not set (or MOCK=1) — serving fixture data. " +
      "See .env.example to enable the real reinfolib API.",
  );
}

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`server listening on http://localhost:${info.port}`);
});
