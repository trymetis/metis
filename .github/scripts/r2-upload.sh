#!/usr/bin/env bash
set -euo pipefail

directory="$1"
version_path="$2"
latest_path="$3"
shift 3
files=("$@")

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_DEFAULT_REGION=auto

notes=$(bun run --silent release:notes "${TRACK}-v${VERSION}")

cd "$directory"

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "::error::$f is missing"; exit 1; }
done
sha256sum "${files[@]}" > SHA256SUMS
cat SHA256SUMS

printf '%s\n' "$notes" > release.md

if [[ "${VERSION_MANIFEST:-}" == true ]]; then
  printf '%s\n' "$VERSION" > version.txt
  cat version.txt
fi

if aws s3api head-object --endpoint-url "$endpoint" --bucket "$R2_BUCKET" --key "${version_path}SHA256SUMS" > /dev/null 2>&1; then
  echo "::error::${version_path} is already published"
  exit 1
fi

put() {
  local path="$1" cache="$2" f="$3"
  shift 3
  aws s3 cp "$f" "s3://${R2_BUCKET}/${path}${f}" --endpoint-url "$endpoint" --cache-control "$cache" "$@"
}

manifest() {
  [[ -f version.txt ]] || return 0
  put "$1" "$2" version.txt --content-type "text/plain; charset=utf-8"
}

release_notes() {
  put "$1" "$2" release.md --content-type "text/markdown; charset=utf-8"
}

checksums() {
  put "$1" "$2" SHA256SUMS --content-type "text/plain; charset=utf-8"
}

upload() {
  local path="$1" cache="$2" f
  for f in "${files[@]}"; do
    put "$path" "$cache" "$f"
  done
}

immutable="public, max-age=31536000, immutable"
upload "$version_path" "$immutable"
release_notes "$version_path" "$immutable"
checksums "$version_path" "$immutable"
if [[ "$LATEST" == true ]]; then
  upload "$latest_path" "public, max-age=300"
  checksums "$latest_path" "public, max-age=300"
  manifest "$latest_path" "public, max-age=300"
fi
