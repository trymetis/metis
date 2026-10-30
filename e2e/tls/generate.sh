#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

days=36500

if [[ ! -f tls/ca.key ]]; then
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out tls/ca.key
  openssl req -x509 -new -key tls/ca.key -sha256 -days "$days" -subj "/CN=Metis e2e CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign" \
    -out tls/ca.crt
fi

issue() {
  local key="$1" crt="$2" cn="$3" sans="$4"
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$key"
  openssl req -new -key "$key" -subj "/CN=$cn" -out "$work/req.csr"
  printf 'basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$sans" >"$work/ext.cnf"
  openssl x509 -req -in "$work/req.csr" -CA tls/ca.crt -CAkey tls/ca.key -CAcreateserial \
    -CAserial "$work/ca.srl" -sha256 -days "$days" -extfile "$work/ext.cnf" -out "$crt"
}

issue mcp-client/tls/mcp-client.key mcp-client/tls/mcp-client.crt mcp.quillmate.app \
  "DNS:mcp.quillmate.app,DNS:mcp-private.quillmate.app"
issue gateway-cloudflare/tls/gateway.key gateway-cloudflare/tls/gateway.crt gateway.localhost \
  "DNS:gateway.localhost,DNS:localhost"
issue resend/tls/api.resend.com.key resend/tls/api.resend.com.crt api.resend.com \
  "DNS:api.resend.com"
issue harness/tls/models.key harness/tls/models.crt openrouter.ai \
  "DNS:openrouter.ai,DNS:api.typesafe.ai"
issue "$work/resend-gateway.key" "$work/resend-gateway.crt" resend-gateway.localhost \
  "DNS:resend-gateway.localhost,DNS:localhost"
cat "$work/resend-gateway.crt" "$work/resend-gateway.key" >proxy/tls/resend-gateway.pem

echo "[tls] issued certificates under $(cat tls/ca.crt | openssl x509 -noout -subject)"
