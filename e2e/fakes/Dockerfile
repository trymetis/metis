FROM golang:1.27-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS build
WORKDIR /src
COPY apps/updater/go.mod apps/updater/go.sum apps/updater/
COPY e2e/fakes/go.mod e2e/fakes/go.sum e2e/fakes/
WORKDIR /src/e2e/fakes
RUN go mod download
COPY apps/updater/ /src/apps/updater/
COPY e2e/fakes/ /src/e2e/fakes/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fakes .

FROM scratch
COPY --from=build /out/fakes /fakes
COPY e2e/mcp-client/tls/ /tls/mcp-client/
COPY e2e/resend/tls/ /tls/resend/
COPY apps/web/package.json /release/
COPY releases/ /release/releases/
ENTRYPOINT ["/fakes"]
