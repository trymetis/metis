FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-resend --docker

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f
WORKDIR /app
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production \
 && find node_modules -path '*libsql*' -name '*-gnu*' -prune -exec rm -rf {} +
COPY --from=pruner /app/out/full/ .
COPY e2e/tls/ca.crt /e2e/tls/ca.crt
WORKDIR /app/apps/gateway-resend
CMD ["sh", "-c", "bun run scripts/apply-schema.ts && exec bun run src/server.ts"]
