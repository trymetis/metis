---
date: 2026-11-17
---

### Upgrade notes

- The schema adds a `sender_names` table; `metis add gateway-cloudflare` applies it when it deploys the release; a gateway deployed by hand needs `bun run db:apply` before the new Worker runs.

### Added

- A mailbox can carry a sender name: mail it sends goes out as `From: Name <address>` and its Sent copy shows the name. Set it when creating the token (`POST /v1/tokens` with `name`) and change or remove it with `PATCH /v1/tokens` without a new token; `GET /v1/tokens` lists each address's name.

### Fixed

- Attachments arrive intact: they were delivered as their base64 text, so recipients could not open them (a PDF showed as damaged).
