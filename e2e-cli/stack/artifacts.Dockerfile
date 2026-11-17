FROM golang:1.27-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS cli
WORKDIR /src
COPY apps/cli/go.mod apps/cli/go.sum ./
RUN go mod download
COPY apps/cli/ ./
ARG CLI_VERSION
ARG CLI_NEXT_VERSION
ARG E2E_CA
ARG TARGETARCH
RUN set -eu; \
    for version in "$CLI_VERSION" "$CLI_NEXT_VERSION"; do \
      CGO_ENABLED=0 GOARCH="$TARGETARCH" go build -buildvcs=false -trimpath -tags e2e \
        -ldflags "-s -w -X github.com/trymetis/metis/apps/cli/internal/version.Version=$version -X main.e2eCA=$E2E_CA" \
        -o "/out/cli/v$version/metis-linux-$TARGETARCH" ./cmd/metis; \
      (cd "/out/cli/v$version" && sha256sum "metis-linux-$TARGETARCH" > SHA256SUMS); \
    done; \
    cp "/out/cli/v$CLI_NEXT_VERSION/metis-linux-$TARGETARCH" "/out/cli/v$CLI_NEXT_VERSION/SHA256SUMS" /out/cli/

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS cloudflare-pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-cloudflare --docker

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS cloudflare-deps
WORKDIR /app
COPY --from=cloudflare-pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=cloudflare-pruner /app/out/full/ .

FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS cloudflare
COPY --from=cloudflare-deps /app /app
WORKDIR /app/apps/gateway-cloudflare
ENV WRANGLER_SEND_METRICS=false
RUN node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir dist

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS ses-pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-ses --docker

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS ses
WORKDIR /app
COPY --from=ses-pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=ses-pruner /app/out/full/ .
WORKDIR /app/apps/gateway-ses
RUN bun run build

FROM oven/bun:1-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS zips
RUN apk add --no-cache zip
ARG GATEWAY_CLOUDFLARE_VERSION
ARG GATEWAY_SES_VERSION
COPY --from=cloudflare /app/apps/gateway-cloudflare/dist/index.js /app/apps/gateway-cloudflare/dist/index.js.map /work/cloudflare/
COPY --from=ses /app/apps/gateway-ses/dist/index.mjs /work/ses/
RUN set -eu; \
    cloudflare="/out/gateway-cloudflare/v$GATEWAY_CLOUDFLARE_VERSION"; \
    ses="/out/gateway-ses/v$GATEWAY_SES_VERSION"; \
    mkdir -p "$cloudflare" "$ses"; \
    (cd /work/cloudflare && zip -qX "$cloudflare/gateway-cloudflare.zip" index.js index.js.map); \
    (cd /work/ses && zip -qX "$ses/gateway-ses.zip" index.mjs); \
    (cd "$cloudflare" && sha256sum gateway-cloudflare.zip > SHA256SUMS); \
    (cd "$ses" && sha256sum gateway-ses.zip > SHA256SUMS)

FROM scratch
COPY --from=cli /out/ /
COPY --from=zips /out/ /
