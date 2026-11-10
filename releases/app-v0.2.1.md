---
date: 2026-10-30
---

### Upgrade notes

- Contains a database migration that removes unused billing columns from the user and workspace tables: the subscription status, product and update time, the payment provider's customer and subscription ids, and the workspace plan. Undo last upgrade restores the database from before it; installs on Turso or an external sqld should back up first.

### Fixed

- IMAP mail whose `Date` header cannot be read now shows and sorts by the time the server received it, instead of the unreadable header text.
