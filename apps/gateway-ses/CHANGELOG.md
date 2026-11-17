# Changelog

Notable changes to the Amazon SES mail gateway, the Lambda function that receives and sends a domain's mail through Amazon SES, released under `gateway-ses-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Upgrade notes

- The schema adds a `sender_names` table; `metis add gateway-ses` applies it when it deploys the release; a gateway deployed by hand needs `bun run db:apply` before the new function runs.

### Added

- A mailbox can carry a sender name: mail it sends goes out as `From: Name <address>` and its Sent copy shows the name. Set it when creating the token (`POST /v1/tokens` with `name`) and change or remove it with `PATCH /v1/tokens` without a new token; `GET /v1/tokens` lists each address's name.

## Releases

- [0.1.0](../../releases/gateway-ses-v0.1.0.md) - 2026-11-13
