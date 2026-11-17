FROM golang:1.27-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS build
WORKDIR /src
COPY apps/cli/go.mod apps/cli/go.sum apps/cli/
COPY e2e/fakes/go.mod e2e/fakes/go.sum e2e/fakes/
WORKDIR /src/e2e/fakes
RUN go mod download
COPY apps/cli/ /src/apps/cli/
COPY e2e/fakes/ /src/e2e/fakes/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fakes .

FROM scratch
COPY --from=build /out/fakes /fakes
COPY e2e/tls/mcp-client/ /tls/mcp-client/
COPY e2e/tls/resend/ /tls/resend/
COPY e2e/tls/ses/ /tls/ses/
COPY e2e/tls/sh/ /tls/sh/
COPY e2e/tls/github-raw/ /tls/github-raw/
COPY e2e/tls/cloudflare/ /tls/cloudflare/
COPY e2e/tls/registry/ /tls/registry/
COPY apps/web/package.json /release/
COPY releases/ /release/releases/
COPY apps/gateway-cloudflare/schema.sql apps/gateway-cloudflare/wrangler.jsonc /repo/apps/gateway-cloudflare/
COPY apps/gateway-ses/schema.sql /repo/apps/gateway-ses/
ENTRYPOINT ["/fakes"]
CMD ["serve"]
