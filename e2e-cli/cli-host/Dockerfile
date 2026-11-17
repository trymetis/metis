FROM docker:29.0.0-dind@sha256:96789d56621ae702a2f8aa316c87a1a1875dd3f02bf67cdcb56a524a09fa3af9

ARG TARGETARCH
RUN apk add --no-cache bash curl socat sqlite \
  && case "$TARGETARCH" in \
    amd64) file=ttyd.x86_64 sum=8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55 ;; \
    arm64) file=ttyd.aarch64 sum=b38acadd89d1d396a0f5649aa52c539edbad07f4bc7348b27b4f4b7219dd4165 ;; \
    *) echo "unsupported architecture $TARGETARCH" >&2; exit 1 ;; \
  esac \
  && curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/1.7.7/$file" \
  && echo "$sum  /usr/local/bin/ttyd" | sha256sum -c - \
  && chmod 0755 /usr/local/bin/ttyd

COPY --chmod=644 e2e/tls/ca.crt /usr/local/share/ca-certificates/metis-e2e.crt
RUN update-ca-certificates \
  && for host in ghcr.io registry-1.docker.io gcr.io registry.localhost; do \
    mkdir -p "/etc/docker/certs.d/$host" \
    && cp /usr/local/share/ca-certificates/metis-e2e.crt "/etc/docker/certs.d/$host/ca.crt"; \
  done

ENV DOCKER_TLS_CERTDIR=""
COPY --chmod=755 e2e-cli/cli-host/start.sh /usr/local/bin/start-cli-host
HEALTHCHECK --interval=2s --timeout=5s --retries=60 CMD docker info > /dev/null
ENTRYPOINT ["/usr/local/bin/start-cli-host"]
