---
date: 2026-11-17
---

### Upgrade notes

- The schema adds a `sender_names` table; the container applies it at start.

### Added

- A mailbox can carry a sender name: mail it sends goes out as `From: Name <address>` and its Sent copy shows the name. Set it when creating the token (`POST /v1/tokens` with `name`) and change or remove it with `PATCH /v1/tokens` without a new token; `GET /v1/tokens` lists each address's name.
