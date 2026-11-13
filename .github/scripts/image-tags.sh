#!/usr/bin/env bash
set -euo pipefail

image="ghcr.io/${IMAGE_NAME:-$GITHUB_REPOSITORY}"
{
  echo "tags<<EOF"
  echo "${image}:${GITHUB_SHA}${SUFFIX}"
  if [[ "$LATEST" == true ]]; then
    echo "${image}:latest${SUFFIX}"
  fi
  if [[ -n "$VERSION" ]]; then
    echo "${image}:${VERSION}${SUFFIX}"
  fi
  echo "EOF"
} >> "$GITHUB_OUTPUT"
