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
  local name="$1" cn="$2" sans="$3"
  local key="tls/$name/cert.key" crt="tls/$name/cert.crt"
  mkdir -p "tls/$name"
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out "$key"
  openssl req -new -key "$key" -subj "/CN=$cn" -out "$work/req.csr"
  printf 'basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$sans" >"$work/ext.cnf"
  openssl x509 -req -in "$work/req.csr" -CA tls/ca.crt -CAkey tls/ca.key -CAcreateserial \
    -CAserial "$work/ca.srl" -sha256 -days "$days" -extfile "$work/ext.cnf" -out "$crt"
}

issue mcp-client mcp.quillmate.app "DNS:mcp.quillmate.app,DNS:mcp-private.quillmate.app"
issue gateway-cloudflare gateway.localhost "DNS:gateway.localhost,DNS:localhost"
issue resend api.resend.com "DNS:api.resend.com"
issue replay openrouter.ai "DNS:openrouter.ai,DNS:api.typesafe.ai"
issue resend-gateway resend-gateway.localhost "DNS:resend-gateway.localhost,DNS:localhost"
issue ses email.us-east-1.amazonaws.com \
  "DNS:email.us-east-1.amazonaws.com,DNS:sts.us-east-1.amazonaws.com,DNS:iam.amazonaws.com,DNS:sqs.us-east-1.amazonaws.com,DNS:lambda.us-east-1.amazonaws.com,DNS:metis-ses-aws-demo-trymetis-email.s3.us-east-1.amazonaws.com"
issue ses-gateway ses-gateway.localhost "DNS:ses-gateway.localhost,DNS:localhost"
issue s3-amazonaws s3.us-east-1.amazonaws.com "DNS:s3.us-east-1.amazonaws.com"
issue registry ghcr.io \
  "DNS:ghcr.io,DNS:registry-1.docker.io,DNS:gcr.io,DNS:registry.localhost,DNS:localhost,IP:127.0.0.1"
issue sh sh.trymetis.email "DNS:sh.trymetis.email"
issue github-raw raw.githubusercontent.com "DNS:raw.githubusercontent.com"
issue cloudflare api.cloudflare.com "DNS:api.cloudflare.com"

echo "[tls] issued certificates under $(cat tls/ca.crt | openssl x509 -noout -subject)"
