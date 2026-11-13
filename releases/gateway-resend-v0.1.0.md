---
date: 2026-11-13
---

### Upgrade notes

- The gateway stores its mail in libSQL instead of Postgres, so a gateway that ran on Postgres starts with no mail and no mailbox tokens: create each address's token again. With `POLL_INTERVAL_SEC` set, the gateway then fetches the mail Resend still holds for that address; Resend keeps received mail for 30 days. Point `DATABASE_URL` at a libSQL database (sqld, Turso or a local file) and set `DATABASE_AUTH_TOKEN` when it needs one; `DB_SCHEMA` is gone.

### Added

- Each release is published as the image `ghcr.io/trymetis/metis-gateway-resend`, tagged with its version, and `metis add gateway-resend` runs the newest release on a server.

### Changed

- Raw mail and attachments are kept in a directory (`BLOB_DIR`) or S3-compatible storage, instead of Postgres.

### Fixed

- List previews show the message's visible text instead of raw HTML, CSS and codes like `&nbsp;`.
