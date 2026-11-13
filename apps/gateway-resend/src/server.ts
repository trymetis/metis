import { handleRequest } from "./app";
import { env } from "./env";
import { startPolling } from "./poll";

const server = Bun.serve({
  port: env.port,
  idleTimeout: 120,
  fetch: handleRequest,
});

console.log(
  `[metis-resend] listening on :${server.port} for @${env.mailDomain} (blobs: ${
    env.blob ? "object storage" : env.blobDir
  })`,
);

startPolling(env.pollIntervalSec);
