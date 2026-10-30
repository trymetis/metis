import { env } from "../lib/env";
import { consoleMailRoutes } from "./console-mail";
import { handleLlm, listHits, listMisses, listModels, llmSeedCount } from "./llm";
import { pixelRoutes } from "./pixels";
import { loadEnrollment, totpRoutes } from "./totp";

const PORT = 8080;
const MODELS_PORT = 443;
const MODELS_TLS = new URL("./tls/", import.meta.url);

const enrollment = await loadEnrollment();

const modelRoutes = {
  "/v1/models": { GET: listModels },
  "/api/v1/models": { GET: listModels },
  "/v1/*": { POST: handleLlm },
  "/api/v1/*": { POST: handleLlm },
};

Bun.serve({
  port: MODELS_PORT,
  hostname: "0.0.0.0",
  idleTimeout: 255,
  tls: {
    cert: Bun.file(new URL("models.crt", MODELS_TLS)),
    key: Bun.file(new URL("models.key", MODELS_TLS)),
  },
  routes: modelRoutes,
  fetch: () => new Response("not found\n", { status: 404 }),
});

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 255,
  routes: {
    "/health": new Response("ok\n"),
    ...modelRoutes,
    "/llm-misses": { GET: listMisses },
    "/llm-hits": { GET: listHits },
    ...totpRoutes(enrollment),
    ...pixelRoutes(),
    ...consoleMailRoutes(env.consoleMail.token),
  },
  fetch: () =>
    new Response(
      "GET /health | /totp | /totp.json | /backup-codes | /account | /llm-misses | /llm-hits | GET /v1/models | POST /v1/* | /pixel/* | GET, DELETE /pixel-hits | POST /console-mail | GET, DELETE /console-mail-hits\n",
      { status: 404 },
    ),
});

console.log(
  JSON.stringify(
    {
      ready: `http://0.0.0.0:${PORT}`,
      signIn: "http://localhost:3000",
      email: enrollment.email,
      password: enrollment.password,
      totp: "curl -s http://localhost:8099/totp",
      llmSeeds: llmSeedCount(),
      mail: `/w/${enrollment.workspaceSlug}/m/${enrollment.mailboxSlug}/inbox`,
      calendar: `/w/${enrollment.workspaceSlug}/c/${enrollment.calendarSlug}`,
      drives: Object.fromEntries(
        Object.entries(enrollment.driveSlugs).map(([kind, slug]) => [
          kind,
          `/w/${enrollment.workspaceSlug}/d/${slug}`,
        ]),
      ),
    },
    null,
    2,
  ),
);
