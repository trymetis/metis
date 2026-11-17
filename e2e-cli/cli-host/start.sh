#!/bin/sh
set -eu
resolv="$(sed 's/ ndots:[0-9]*//' /etc/resolv.conf)"
printf '%s\n' "$resolv" > /etc/resolv.conf
socat TCP-LISTEN:3100,fork,reuseaddr,backlog=1024 "TCP:127.0.0.1:${APP_PORT:?set by compose}" &
exec dockerd-entrypoint.sh dockerd \
  --host=unix:///var/run/docker.sock \
  --bip=10.212.0.1/24 \
  --default-address-pool base=10.213.0.0/16,size=24
