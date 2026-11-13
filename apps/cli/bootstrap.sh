#!/bin/sh
set -eu
base="https://sh.trymetis.email/cli"
[ -n "${METIS_CLI_VERSION:-}" ] && base="$base/v${METIS_CLI_VERSION#v}"
case "$(uname -m)" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "[bootstrap] unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
[ "$(id -u)" -eq 0 ] || { echo "[bootstrap] run as root: sudo sh $0" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$base/metis-linux-$arch" -o "$tmp/metis-linux-$arch"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
(cd "$tmp" && grep " metis-linux-$arch\$" SHA256SUMS | sha256sum -c -) > /dev/null
install -m 0755 "$tmp/metis-linux-$arch" /usr/local/bin/metis
rm -rf "$tmp"
trap - EXIT
exec /usr/local/bin/metis setup "$@"
