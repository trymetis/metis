FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-ses --docker

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS schema
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile \
 && find node_modules -path '*libsql*' -name '*-gnu*' -prune -exec rm -rf {} +
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/gateway-ses
RUN bun run build
CMD ["bun", "run", "db:apply"]

FROM public.ecr.aws/lambda/nodejs:24@sha256:80215a499a6ea4a9d3409cdb04fa4f80b43a9334a786e57a457f70c47cb0b791 AS lambda
COPY --from=schema /app/apps/gateway-ses/dist/index.mjs /var/task/index.mjs
COPY e2e/tls/ca.crt /e2e/tls/ca.crt
CMD ["index.handler"]
