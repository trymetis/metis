#!/bin/sh
set -eu

wrangler() {
  node /app/apps/gateway-cloudflare/node_modules/wrangler/bin/wrangler.js "$@"
}

wrangler d1 execute metis-suite --local --persist-to /data \
  -c /e2e/wrangler.jsonc --file=/app/apps/gateway-cloudflare/schema.sql

exec node /app/apps/gateway-cloudflare/node_modules/wrangler/bin/wrangler.js dev \
  -c /e2e/wrangler.jsonc \
  --ip 0.0.0.0 --port 8787 \
  --local-protocol https \
  --https-key-path /e2e/tls/gateway-cloudflare/cert.key \
  --https-cert-path /e2e/tls/gateway-cloudflare/cert.crt \
  --persist-to /data \
  --show-interactive-dev-session=false \
  --var "MAIL_DOMAIN:${MAIL_DOMAIN}" \
  --var "API_TOKEN:${API_TOKEN}"
