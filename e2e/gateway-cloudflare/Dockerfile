FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-cloudflare --docker

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4
WORKDIR /app
COPY --from=deps /app /app
COPY e2e/gateway-cloudflare/wrangler.jsonc e2e/gateway-cloudflare/start.sh /e2e/
COPY e2e/tls/gateway-cloudflare/ /e2e/tls/gateway-cloudflare/
COPY e2e/tls/ca.crt /e2e/tls/ca.crt
WORKDIR /app/apps/gateway-cloudflare
CMD ["sh", "/e2e/start.sh"]
