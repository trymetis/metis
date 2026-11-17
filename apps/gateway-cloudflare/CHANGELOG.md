# Changelog

Notable changes to the Cloudflare Email gateway, the Worker that receives and sends a domain's mail through Cloudflare Email Routing and Email Sending, released under `gateway-cloudflare-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Upgrade notes

- The schema adds a `sender_names` table; `metis add gateway-cloudflare` applies it when it deploys the release; a gateway deployed by hand needs `bun run db:apply` before the new Worker runs.

### Added

- A mailbox can carry a sender name: mail it sends goes out as `From: Name <address>` and its Sent copy shows the name. Set it when creating the token (`POST /v1/tokens` with `name`) and change or remove it with `PATCH /v1/tokens` without a new token; `GET /v1/tokens` lists each address's name.

### Fixed

- Attachments arrive intact: they were delivered as their base64 text, so recipients could not open them (a PDF showed as damaged).

## Releases

- [0.1.0](../../releases/gateway-cloudflare-v0.1.0.md) - 2026-11-13
