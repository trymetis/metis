---
date: 2026-10-26
---

### Upgrade notes

- Run `bootstrap.sh` again before your next upgrade from the dashboard. Only bootstrap updates the updater, and this release's updater is the one that snapshots the database and can undo an upgrade.
- Preflight now applies database migrations. An existing database is recorded as already at the baseline the first time preflight runs; nothing else changes in it.
- `METIS_INIT_SQL` is gone. A database with no schema gets it from the migrations the preflight image ships.

### Added

- Database migrations, applied in order by preflight on every deploy and upgrade. Preflight refuses a database that a newer release already migrated.
- Before an upgrade, the updater stops the app and snapshots the stack's sqld database. If the upgrade fails, it restores the snapshot and switches back.
- **Undo last upgrade** on Dashboard → Updates returns to the previous release and its database snapshot, once. It needs your authenticator code and is recorded in the audit log. Scheduled work that ran after the upgrade is due again in the restored database: a scheduled message sent since then is sent a second time.
- Release notes for each newer release on Dashboard → Updates.
- The workflow builder is a palette, canvas and inspector editor with summary cards, live validation, undo, step names and skip. Runs show on the canvas, a test run has no side effects, and the run history sits on the same card.
- Search and filters on the audit log pages.
- Workspace owners and admins reach the workspace's **Activity** from the workspace menu and from the search dialog.
- A failed mail list shows an error with a retry button.

### Changed

- Dashboard → Updates offers only releases newer than the one running. Downgrading to an older release is no longer possible; use Undo last upgrade instead.
- Mail, calendar and drive requests are rate-limited per user.
- The company address in the footer of emails Metis Suite sends is updated.

### Fixed

- The built-in maintenance workflows (pruning MCP clients and audit events) are set up one after the other instead of both at once.
- The scheduled-send badge refreshes only when a send is due.
