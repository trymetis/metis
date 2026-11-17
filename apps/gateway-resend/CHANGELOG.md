# Changelog

Notable changes to the Resend mail gateway, the container that receives and sends a domain's mail through Resend, released under `gateway-resend-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Upgrade notes

- The schema adds a `sender_names` table; the container applies it at start.

### Added

- A mailbox can carry a sender name: mail it sends goes out as `From: Name <address>` and its Sent copy shows the name. Set it when creating the token (`POST /v1/tokens` with `name`) and change or remove it with `PATCH /v1/tokens` without a new token; `GET /v1/tokens` lists each address's name.

## Releases

- [0.1.0](../../releases/gateway-resend-v0.1.0.md) - 2026-11-13
