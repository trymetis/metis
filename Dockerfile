FROM oven/bun:1-alpine AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/web --docker

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS tools
WORKDIR /app
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/web
RUN bun build scripts/workflow-worker.ts --target=node --conditions=react-server --external @libsql/client --external libsql --external bullmq --external ioredis --external ssh2 --external ssh2-sftp-client --external @opentelemetry/api --outfile workflow-worker.mjs
RUN bun run scripts/licenses.ts

# next build runs on node: bun segfaults on Next 16 + Turbopack builds in a
# container (oven-sh/bun#36866, #25864)
FROM node:26-alpine AS builder
WORKDIR /app
ARG NEXT_BUILD_OUTPUT
ENV NEXT_BUILD_OUTPUT=${NEXT_BUILD_OUTPUT}
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/web
RUN cp .env.example .env
ENV NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/next/dist/bin/next build && rm -f .next/standalone/.env .next/standalone/apps/web/.env

FROM node:26-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/ .
COPY --from=tools /app/apps/web/workflow-worker.mjs ./apps/web/workflow-worker.mjs
COPY --from=tools /app/apps/web/THIRD_PARTY_LICENSES.txt ./THIRD_PARTY_LICENSES.txt
COPY LICENSE NOTICE ./
WORKDIR /app/apps/web
CMD ["node", "workflow-worker.mjs"]

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=tools /app/apps/web/THIRD_PARTY_LICENSES.txt ./THIRD_PARTY_LICENSES.txt
COPY LICENSE NOTICE ./

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
