#!/usr/bin/env bash
# Usage (details: https://docs.trymetis.email/self-hosting/install/install-with-bootstrap):
#   sudo -E bash bootstrap.sh                  deploy from exported env vars
#   sudo -E bash bootstrap.sh --interactive    prompt for anything not exported
#   sudo bash bootstrap.sh domain example.com  HTTPS via Caddy once DNS points here
#   bash bootstrap.sh sqld-auth                print a sqld key + token pair
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/metis-suite}"
APP_PORT="${APP_PORT:-3000}"
COMPOSE_URL="${COMPOSE_URL:-}"
SH_URL="https://sh.trymetis.email"
RELEASE_VERSION=""
SQLD_NAMESPACES=(app mastra)
LEGACY_SQLD_URLS=("http://sqld:8080" "http://sqld-mastra:8080")
SQLD_URL="http://app.sqld:8080"
SQLD_MASTRA_URL="http://mastra.sqld:8080"
RELEASE_REPO="trymetis/metis"
RELEASE_IMAGE_VARS=(APP_IMAGE PREFLIGHT_IMAGE WORKER_IMAGE UPDATER_IMAGE)
PASSTHROUGH_VARS=(
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET
  ZOHO_CLIENT_ID ZOHO_CLIENT_SECRET ZOHO_REGION
  METIS_IMAP_SERVERS METIS_CALDAV_SERVERS METIS_CARDDAV_SERVERS METIS_CLOUDFLARE_SERVERS METIS_RESEND_SERVERS
  METIS_S3_SERVERS METIS_WEBDAV_SERVERS METIS_FTP_SERVERS METIS_SFTP_SERVERS
  METIS_DRIVE_RELAY_MAX_MB METIS_DRIVE_RELAY_CONCURRENCY
  METIS_MAIL_IMAGE_PROXY METIS_MAIL_IMAGE_PROXY_MAX_MB
  METIS_LLM_DRIVER METIS_LLM_BASE_URL METIS_LLM_NAME METIS_LLM_API_KEY METIS_LLM_STRUCTURED_OUTPUTS
  METIS_LLM_CHAT_MODEL METIS_LLM_SMART_REPLY_MODEL METIS_LLM_CLASSIFIER_MODEL METIS_LLM_SUMMARY_MODEL
  METIS_LLM_SUMMARY_VISION OPENAI_API_KEY ANTHROPIC_API_KEY
  METIS_DECISION_DRIVER METIS_DECISION_MODEL METIS_DECISION_BASE_URL METIS_DECISION_API_KEY
  METIS_DECISION_CLASSIFIER METIS_DECISION_CLASSIFIER_BATCH METIS_DECISION_SUMMARY_GATE
  METIS_DECISION_WORKFLOW_NODE
  METIS_PHISHING_DETECTION_DRIVER BACKEND_URL
  METIS_MAIL_DRIVER MAIL_FROM MAIL_FROM_AUTH MAIL_FROM_INVITE RESEND_API_KEY
  SMTP_URL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_SECURE SMTP_PLAIN
  CONSOLE_MAIL_URL CONSOLE_MAIL_TOKEN
  METIS_CACHE_DRIVER METIS_CACHE_URL METIS_CACHE_TOKEN
  METIS_WORKFLOW_RUNNER_DRIVER METIS_WORKFLOW_CADENCE_SEC METIS_WORKFLOW_TICK_BUDGET_MS
  METIS_WORKFLOW_BATCH_SIZE METIS_WORKFLOW_CONCURRENCY METIS_WORKFLOW_REDIS_URL
  METIS_WORKFLOW_QUEUE_PREFIX CRON_SECRET
  METIS_SIGNUP_DISABLED METIS_TERMS_URL METIS_PRIVACY_URL METIS_LEGAL_VERSION
)

INTERACTIVE=0
CMD="deploy"
DOMAIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interactive|-i) INTERACTIVE=1 ;;
    domain)
      CMD="domain"
      DOMAIN="${2:-}"
      shift
      ;;
    deploy) CMD="deploy" ;;
    sqld-auth) CMD="sqld-auth" ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

info() { printf '\033[1;34m[info]\033[0m  %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
die()  { printf '\033[1;31m[err ]\033[0m  %s\n' "$*" >&2; exit 1; }

ask() {
  local prompt="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$prompt" "$default" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  local value; read -r value
  printf '%s' "${value:-$default}"
}

gen_secret() {
  if command -v openssl &>/dev/null; then
    openssl rand -base64 40 | tr -d '+/=' | head -c 40
  else
    head -c 40 /dev/urandom | base64 | tr -d '+/=' | head -c 40
  fi
}

mask_preview() {
  local value="$1"
  if [[ ${#value} -le 5 ]]; then
    printf '%s...' "$value"
  else
    printf '%.5s...' "$value"
  fi
}

log_using() {
  local name="$1" value="$2"
  info "Using ${name}=$(mask_preview "$value")"
}

log_generated() {
  local name="$1" value="$2"
  info "Generated ${name}=$(mask_preview "$value")"
}

log_generated_full() {
  local name="$1" value="$2"
  info "Generated ${name}=${value}"
}

resolve_var() {
  local name="$1" prompt="$2" default="${3:-}"
  local current="${!name:-}"

  if [[ -n "$current" ]]; then
    log_using "$name" "$current"
    return
  fi

  if [[ $INTERACTIVE -eq 1 ]]; then
    local value; value=$(ask "$prompt" "$default")
    printf -v "$name" '%s' "${value:-$default}"
    if [[ -n "${!name}" ]]; then log_using "$name" "${!name}"; fi
    return
  fi

  printf -v "$name" '%s' "$default"
  if [[ -n "$default" ]]; then log_using "$name" "$default"; fi
}

resolve_secret_var() {
  local name="$1" prompt="$2"
  local current="${!name:-}"

  if [[ -n "$current" ]]; then
    log_using "$name" "$current"
    return
  fi

  if [[ $INTERACTIVE -eq 1 ]]; then
    local value; value=$(ask "$prompt (blank = auto-generate)" "")
    if [[ -z "$value" ]]; then
      value=$(gen_secret)
      printf -v "$name" '%s' "$value"
      log_generated "$name" "$value"
    else
      printf -v "$name" '%s' "$value"
      log_using "$name" "$value"
    fi
    return
  fi

  local value; value=$(gen_secret)
  printf -v "$name" '%s' "$value"
  log_generated "$name" "$value"
}

resolve_setup_code() {
  local current="${METIS_SETUP_CODE:-}"

  if [[ -n "$current" ]]; then
    log_using METIS_SETUP_CODE "$current"
    return
  fi

  if [[ $INTERACTIVE -eq 1 ]]; then
    local value; value=$(ask "METIS_SETUP_CODE (blank = auto-generate)" "")
    if [[ -n "$value" ]]; then
      METIS_SETUP_CODE="$value"
      log_using METIS_SETUP_CODE "$value"
      return
    fi
  fi

  METIS_SETUP_CODE=$(gen_secret)
  log_generated_full METIS_SETUP_CODE "$METIS_SETUP_CODE"
}

b64url() {
  base64 -w0 | tr '+/' '-_' | tr -d '='
}

gen_sqld_auth() {
  local dir header payload
  dir=$(mktemp -d)
  if ! openssl genpkey -algorithm ed25519 -out "$dir/key.pem" 2>/dev/null; then
    rm -rf "$dir"
    die "openssl could not generate an Ed25519 key for sqld (OpenSSL 3 is required)"
  fi
  SQLD_AUTH_JWT_KEY=$(openssl pkey -in "$dir/key.pem" -pubout -outform DER | tail -c 32 | b64url)
  header=$(printf '{"alg":"EdDSA","typ":"JWT"}' | b64url)
  payload=$(printf '{"a":"rw"}' | b64url)
  printf '%s.%s' "$header" "$payload" > "$dir/signing"
  SQLD_AUTH_TOKEN="${header}.${payload}.$(openssl pkeyutl -sign -inkey "$dir/key.pem" -rawin -in "$dir/signing" | b64url)"
  rm -rf "$dir"
}

resolve_database() {
  resolve_var METIS_DB_DRIVER "METIS_DB_DRIVER (sqld | turso)" "sqld"
  local app_default="" mastra_default=""
  if [[ "$METIS_DB_DRIVER" == "sqld" ]]; then
    app_default="$SQLD_URL"
    mastra_default="$SQLD_MASTRA_URL"
  fi
  resolve_var DATABASE_URL "DATABASE_URL (Enter = the stack's sqld, app namespace)" "$app_default"
  resolve_var MASTRA_DATABASE_URL "MASTRA_DATABASE_URL (Enter = the stack's sqld, mastra namespace)" "$mastra_default"

  if [[ "$METIS_DB_DRIVER" != "sqld" || "$DATABASE_URL" != "$SQLD_URL" ]]; then
    resolve_var DATABASE_AUTH_TOKEN "DATABASE_AUTH_TOKEN" ""
    resolve_var MASTRA_DATABASE_AUTH_TOKEN "MASTRA_DATABASE_AUTH_TOKEN" ""
    SQLD_AUTH_JWT_KEY=""
    SQLD_ADMIN_KEY=""
    return
  fi

  resolve_secret_var SQLD_ADMIN_KEY "SQLD_ADMIN_KEY (sqld admin API)"

  if [[ -n "${SQLD_AUTH_JWT_KEY:-}" ]]; then
    log_using SQLD_AUTH_JWT_KEY "$SQLD_AUTH_JWT_KEY"
    resolve_var DATABASE_AUTH_TOKEN "DATABASE_AUTH_TOKEN" ""
    resolve_var MASTRA_DATABASE_AUTH_TOKEN "MASTRA_DATABASE_AUTH_TOKEN" ""
    return
  fi

  gen_sqld_auth
  DATABASE_AUTH_TOKEN="$SQLD_AUTH_TOKEN"
  MASTRA_DATABASE_AUTH_TOKEN="$SQLD_AUTH_TOKEN"
  log_generated SQLD_AUTH_JWT_KEY "$SQLD_AUTH_JWT_KEY"
  log_generated DATABASE_AUTH_TOKEN "$DATABASE_AUTH_TOKEN"
  log_generated MASTRA_DATABASE_AUTH_TOKEN "$MASTRA_DATABASE_AUTH_TOKEN"
}

read_env_value() {
  local name="$1" env_file="$INSTALL_DIR/.env"
  [[ -f "$env_file" ]] || return 0
  sed -n "s/^${name}=//p" "$env_file" | head -n 1
}

require_root() {
  [[ $EUID -eq 0 ]] || die "Run as root (or with sudo)"
}

resolve_encryption_key() {
  if [[ -n "${METIS_ENCRYPTION_KEY:-}" ]]; then
    log_using METIS_ENCRYPTION_KEY "$METIS_ENCRYPTION_KEY"
    return
  fi
  METIS_ENCRYPTION_KEY=$(openssl rand -base64 32)
  log_generated METIS_ENCRYPTION_KEY "$METIS_ENCRYPTION_KEY"
  warn "Back up METIS_ENCRYPTION_KEY from $INSTALL_DIR/.env — losing it means reconnecting every mailbox, calendar and drive"
}

install_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') already installed"
    if ! docker compose version &>/dev/null; then
      info "Installing the Docker Compose plugin..."
      apt-get install -y -qq docker-compose-plugin 2>/dev/null \
        || apt-get install -y -qq docker-compose-v2 \
        || die "Docker Compose v2 is required — install docker-compose-plugin"
    fi
    ok "$(docker compose version)"
    return
  fi
  info "Installing Docker Engine..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  ok "Docker installed"
}

setup_env() {
  local env_file="$INSTALL_DIR/.env"
  mkdir -p "$INSTALL_DIR"

  if [[ -f "$env_file" ]]; then
    if [[ $INTERACTIVE -eq 1 ]]; then
      local ans; ans=$(ask "Re-configure .env? (y/N)" "n")
      [[ "$ans" =~ ^[Yy]$ ]] || { ok "Keeping existing .env"; return; }
    else
      ok "Existing .env found — skipping (delete it to regenerate)"
      return
    fi
  fi

  if [[ $INTERACTIVE -eq 1 ]]; then
    info "Configuring environment (Enter = accept default)..."
  else
    info "Configuring environment..."
  fi
  echo

  resolve_var METIS_DOMAIN "METIS_DOMAIN (blank = no domain yet, local access only)" ""
  local default_url="http://localhost:${APP_PORT}"
  [[ -n "$METIS_DOMAIN" ]] && default_url="https://${METIS_DOMAIN}"
  resolve_var BETTER_AUTH_URL "BETTER_AUTH_URL" "$default_url"
  resolve_secret_var BETTER_AUTH_SECRET "BETTER_AUTH_SECRET"
  resolve_encryption_key

  echo; info "--- Database ---"
  resolve_database

  resolve_secret_var METIS_DRIVE_RELAY_SECRET "METIS_DRIVE_RELAY_SECRET"

  echo; info "--- First-run setup ---"
  resolve_setup_code
  resolve_var METIS_OWNER_EMAIL \
    "METIS_OWNER_EMAIL (blank = /setup accepts any email and /dashboard is off)" ""

  cat > "$env_file" <<EOF
METIS_DOMAIN=${METIS_DOMAIN}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
METIS_ENCRYPTION_KEY=${METIS_ENCRYPTION_KEY}
METIS_DB_DRIVER=${METIS_DB_DRIVER}
DATABASE_URL=${DATABASE_URL}
DATABASE_AUTH_TOKEN=${DATABASE_AUTH_TOKEN}
SQLD_AUTH_JWT_KEY=${SQLD_AUTH_JWT_KEY}
SQLD_ADMIN_KEY=${SQLD_ADMIN_KEY}
MASTRA_DATABASE_URL=${MASTRA_DATABASE_URL}
MASTRA_DATABASE_AUTH_TOKEN=${MASTRA_DATABASE_AUTH_TOKEN}
METIS_DRIVE_RELAY_SECRET=${METIS_DRIVE_RELAY_SECRET}
METIS_SETUP_CODE=${METIS_SETUP_CODE}
METIS_OWNER_EMAIL=${METIS_OWNER_EMAIL}
EOF

  local name
  for name in "${PASSTHROUGH_VARS[@]}"; do
    [[ -n "${!name:-}" ]] || continue
    printf '%s=%s\n' "$name" "${!name}" >> "$env_file"
    log_using "$name" "${!name}"
  done

  chmod 600 "$env_file"
  ok ".env written"
}

stack_runs_sqld() {
  [[ "$(read_env_value METIS_DB_DRIVER)" == "sqld" && "$(read_env_value DATABASE_URL)" == "$SQLD_URL" ]]
}

compose_profiles() {
  local profiles=()
  if stack_runs_sqld; then profiles+=(sqld); fi
  if [[ -n "$(read_env_value METIS_DOMAIN)" ]]; then profiles+=(proxy); fi
  local IFS=,
  printf '%s' "${profiles[*]}"
}

release_image() {
  local name="$1" version="$2" suffix=""
  case "$name" in
    PREFLIGHT_IMAGE) suffix="-preflight" ;;
    WORKER_IMAGE) suffix="-worker" ;;
    UPDATER_IMAGE) suffix="-updater" ;;
  esac
  printf 'ghcr.io/%s:%s%s' "$RELEASE_REPO" "$version" "$suffix"
}

latest_release() {
  local token url body headers tags=""
  token=$(curl -fsS "https://ghcr.io/token?scope=repository:${RELEASE_REPO}:pull" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || return 1
  [[ -n "$token" ]] || return 1
  headers=$(mktemp)
  url="https://ghcr.io/v2/${RELEASE_REPO}/tags/list?n=1000"
  while [[ -n "$url" ]]; do
    body=$(curl -fsS -D "$headers" -H "Authorization: Bearer ${token}" "$url") \
      || { rm -f "$headers"; return 1; }
    tags+="${body}"$'\n'
    url=$(sed -n 's/^[Ll]ink: *<\([^>]*\)>.*rel="next".*/\1/p' "$headers" | tr -d '\r')
    [[ -z "$url" || "$url" == http* ]] || url="https://ghcr.io${url}"
  done
  rm -f "$headers"
  grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' <<<"$tags" | tr -d '"' | sort -V | tail -n 1
}

pin_release() {
  local version="${METIS_VERSION:-}"
  version="${version#v}"
  if [[ -n "$version" ]]; then
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
      || die "METIS_VERSION=${METIS_VERSION} is not a release version such as 1.0.0"
  else
    info "Looking up the latest release of ghcr.io/${RELEASE_REPO}..."
    version=$(latest_release) || version=""
    if [[ -z "$version" ]]; then
      warn "No release found in ghcr.io/${RELEASE_REPO} — pinning the rolling latest tags"
      version="latest"
    fi
  fi

  local name value
  for name in "${RELEASE_IMAGE_VARS[@]}"; do
    value="${!name:-}"
    [[ -n "$value" ]] || value=$(release_image "$name" "$version")
    set_env_value "$name" "$value"
    info "Pinned ${name}=${value}"
  done
  RELEASE_VERSION="$version"
  ok "Release pinned in .env (${version})"
}

compose() {
  APP_PORT="$APP_PORT" \
    METIS_INSTALL_DIR="$INSTALL_DIR" \
    COMPOSE_PROFILES="${COMPOSE_PROFILES_OVERRIDE:-$(compose_profiles)}" \
    docker compose \
    --project-directory "$INSTALL_DIR" \
    -f "$INSTALL_DIR/compose.yml" \
    --env-file "$INSTALL_DIR/.env" \
    "$@"
}

compose_hint() {
  printf 'docker compose --project-directory %s' "$INSTALL_DIR"
}

fetch_compose() {
  local target="$INSTALL_DIR/compose.yml"
  local url="$COMPOSE_URL"
  if [[ -z "$url" ]]; then
    if [[ "$RELEASE_VERSION" == latest ]]; then
      url="${SH_URL}/compose.yml"
    else
      url="${SH_URL}/v${RELEASE_VERSION}/compose.yml"
    fi
  fi
  info "Fetching compose.yml from $url..."
  curl -fsSL "$url" -o "$target.new" \
    || { rm -f "$target.new"; die "Could not download $url — set COMPOSE_URL"; }
  mv "$target.new" "$target"
  compose config --quiet || die "$target is not a valid compose file"
  ok "compose.yml ready"
}

retire_inactive_services() {
  local profiles; profiles=",$(compose_profiles),"
  local services=()
  [[ "$profiles" == *",sqld,"* ]] || services+=(sqld)
  [[ "$profiles" == *",proxy,"* ]] || services+=(caddy)
  [[ ${#services[@]} -gt 0 ]] || return 0
  COMPOSE_PROFILES_OVERRIDE="sqld,proxy" compose rm --stop --force "${services[@]}" >/dev/null 2>&1 || true
}

refuse_legacy_database_urls() {
  local name value legacy
  for name in DATABASE_URL MASTRA_DATABASE_URL; do
    value=$(read_env_value "$name")
    for legacy in "${LEGACY_SQLD_URLS[@]}"; do
      [[ "$value" == "$legacy" ]] || continue
      die "$INSTALL_DIR/.env sets ${name}=${value}, the two-sqld stack this compose file no longer runs. Set DATABASE_URL=${SQLD_URL} and MASTRA_DATABASE_URL=${SQLD_MASTRA_URL}; data in the old metis_sqld_mastra volume is not carried over."
    done
  done
}

create_sqld_namespaces() {
  local key; key=$(read_env_value SQLD_ADMIN_KEY)
  [[ -n "$key" ]] \
    || die "$INSTALL_DIR/.env has no SQLD_ADMIN_KEY — add one (openssl rand -base64 32) and run bootstrap again"
  info "Starting sqld..."
  compose up -d --wait sqld \
    || die "sqld did not become healthy — see: $(compose_hint) logs sqld"
  local admin; admin=$(compose port sqld 9090 | head -n 1)
  [[ -n "$admin" ]] || die "Could not find sqld's admin port — see: $(compose_hint) ps sqld"
  local ns response
  for ns in "${SQLD_NAMESPACES[@]}"; do
    response=$(curl -sS -X POST "http://${admin}/v1/namespaces/${ns}/create" \
      -H "authorization: basic ${key}" \
      -H 'content-type: application/json' -d '{}' -w '\n%{http_code}') \
      || die "Could not reach sqld's admin API on ${admin}"
    case "$(tail -n 1 <<<"$response")" in
      200) ok "Created the sqld namespace '${ns}'" ;;
      *) [[ "$response" == *"already exists"* ]] \
           || die "Could not create the sqld namespace '${ns}': $(head -n 1 <<<"$response")" ;;
    esac
  done
}

deploy_stack() {
  refuse_legacy_database_urls
  local profiles; profiles=$(compose_profiles)
  info "Pulling images..."
  compose pull

  retire_inactive_services

  if stack_runs_sqld; then create_sqld_namespaces; fi

  info "Starting the stack (profiles: ${profiles:-none}); preflight runs before the app..."
  compose up -d --remove-orphans \
    || die "The stack did not start — see: $(compose_hint) logs preflight"
  ok "Stack running"
  info "Workflows run inside the app ('internal'). Providers, AI, mail and the runner are set under Dashboard → System."
  info "Upgrades to later releases are applied from Dashboard → System → Updates."
}

print_status() {
  local url; url=$(read_env_value BETTER_AUTH_URL)
  local domain; domain=$(read_env_value METIS_DOMAIN)
  echo
  info "App is running at: ${url}"
  info "Status:  $(compose_hint) ps"
  info "Logs:    $(compose_hint) logs -f app"

  if [[ -z "$domain" ]]; then
    echo
    info "No domain yet: the app listens on 127.0.0.1:${APP_PORT} only. From your machine:"
    info "  ssh -L ${APP_PORT}:127.0.0.1:${APP_PORT} <user>@<this-server>   then open ${url}"
  fi

  local setup_code; setup_code=$(read_env_value METIS_SETUP_CODE)
  if [[ -n "$setup_code" ]]; then
    echo
    info "Create the first account at: ${url}/setup"
    info "Setup code: ${setup_code}"
    info "Kept in $INSTALL_DIR/.env; it stops working once an account exists."
  fi

  if [[ -z "$domain" ]]; then
    echo
    info "To serve it on a domain with HTTPS once DNS points here:"
    info "  sudo bash $0 domain <yourdomain.com>"
  fi
}

cmd_deploy() {
  require_root
  apt-get update -qq
  apt-get install -y -qq curl openssl

  install_docker
  setup_env
  pin_release
  fetch_compose
  deploy_stack
  print_status
}

cmd_domain() {
  [[ -n "$DOMAIN" ]] || die "Usage: $0 domain <yourdomain.com>"
  require_root

  local env_file="$INSTALL_DIR/.env"
  [[ -f "$env_file" && -f "$INSTALL_DIR/compose.yml" ]] \
    || die "No deployment in $INSTALL_DIR — run: sudo -E bash $0"

  set_env_value METIS_DOMAIN "$DOMAIN"
  set_env_value BETTER_AUTH_URL "https://${DOMAIN}"
  ok "METIS_DOMAIN=${DOMAIN}, BETTER_AUTH_URL=https://${DOMAIN}"

  deploy_stack
  ok "Live at https://${DOMAIN} — Caddy obtains the certificate on the first request; ports 80 and 443 must be reachable"
}

set_env_value() {
  local name="$1" value="$2" env_file="$INSTALL_DIR/.env"
  if grep -q "^${name}=" "$env_file"; then
    sed -i "s|^${name}=.*|${name}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$name" "$value" >> "$env_file"
  fi
}

case "$CMD" in
  deploy) cmd_deploy ;;
  sqld-auth)
    gen_sqld_auth
    printf 'SQLD_AUTH_JWT_KEY=%s\nDATABASE_AUTH_TOKEN=%s\nMASTRA_DATABASE_AUTH_TOKEN=%s\n' \
      "$SQLD_AUTH_JWT_KEY" "$SQLD_AUTH_TOKEN" "$SQLD_AUTH_TOKEN"
    ;;
  domain) cmd_domain ;;
  *)      die "Usage: $0 [--interactive] [deploy|domain <yourdomain.com>|sqld-auth]" ;;
esac
