# Changelog

Notable changes to the Metis Suite server: the app, worker, preflight and updater images, `compose.yml` and `bootstrap.sh`, released together under `app-v<version>` tags. The desktop and mobile apps have their own changelogs in [`apps/desktop/`](apps/desktop/CHANGELOG.md) and [`apps/mobile/`](apps/mobile/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

## 0.2.1 - 2026-10-30

### Upgrade notes

- Contains a database migration that removes unused billing columns from the user and workspace tables: the subscription status, product and update time, the payment provider's customer and subscription ids, and the workspace plan. Undo last upgrade restores the database from before it; installs on Turso or an external sqld should back up first.

### Fixed

- IMAP mail whose `Date` header cannot be read now shows and sorts by the time the server received it, instead of the unreadable header text.

## 0.2.0 - 2026-10-28

### Upgrade notes

- Run `bootstrap.sh` again before you upgrade from the dashboard. Only bootstrap updates the updater, and this release's updater reads each release's notes from `sh.trymetis.email`.
- Contains a database migration that rebuilds the workflow tables for the new workflow engine. Undo last upgrade restores the database from before it; installs on Turso or an external sqld should back up first.
- The upgrade moves every workflow to the new workflow engine. Rules become steps with expressions, so each workflow keeps doing what it did. A workflow that cannot be moved is turned off, and the editor says why.
- Runs from before the upgrade stay in the run history but cannot be retried. Runs that were queued or running when you upgraded are marked failed; run those workflows again.
- Scheduled sends and snoozes carry over and still go out or come back at their time. One that came due during the upgrade goes out or comes back right after it.
- To get changes from Microsoft and from Google calendars and drives pushed to your instance instead of checked every few minutes, set **Public URL for webhooks and push** under Dashboard → System → Workflow runner. Gmail mailboxes are always checked every few minutes.

### Added

- Workflows: triggers for calendar events (created, updated, cancelled, invitations, answers, starting soon, ended), files added or changed in a drive folder, mail sent, starred or labelled, webhooks, being called by another workflow, and app events (a run failed, phishing found, an AI label applied, a member joined).
- Workflows: calendar steps (list, get, create, update, delete, answer, find free time, add an invitation file) and drive steps (list, search, read text, write, create folders, move, rename, copy, delete, save an attachment or a whole message).
- Workflows: waits and people in the loop. Delay, wait until a time, wait for a reply, answer or file, ask members to approve, call another workflow, and return a result.
- Workflows: Loop and End loop repeat the steps between them for each entry of a list and collect what each gives back.
- Workflows: AI steps that write, extract fields, summarize, sort into categories, and an agent that reads your mail, calendar and drive to answer a task. The agent can only read.
- Workflows: expressions for any setting, with type checks as you type, If, Switch, Filter, Split, Aggregate and Set steps, and a choice of what happens when a step fails.
- Workflows: conditions can be built as rows of a field, a comparison and a value, in groups that match all or any, and switched to an expression and back.
- Workflows: run limits per workflow (how many at once, and at most once per period or after a quiet spell), and a time zone that dates in expressions, new events and the agent use.
- Workflows: a Revisions panel in the editor that shows what each save changed, and what you changed since the last save.
- Workflows: a step that sends, creates an event, answers an invitation or writes a file and never got a reply from the provider can be resolved from the run history: confirm it from what the provider shows, or close it without retrying.
- Workflows: test runs on a recent item, a pinned sample, a pasted event or typed inputs; replaying a past run, from any step; and each step's input and output in the editor and the run history.
- Workflows: a list of the approvals waiting for you, with approve and deny in the run history and the Runs panel.
- Dashboard (System → Workflow runner): how long workflow step data and run history are kept, the public URL for webhooks and push, and trusted proxies.
- Workspace AI and MCP: `listWorkflowSteps` lists every workflow step and its settings, and `applyWorkflows` takes the inputs a manual run declares.

### Changed

- Workflows: every template is new, and the data export lists the calendars and drives each workflow uses beside its mailboxes.
- Workflows: step data is kept 7 days and run history 90 days by default, and a daily maintenance workflow removes what is older.
- Workflows: new mail in Gmail, Outlook and IMAP folders is picked up from the provider's change history, and Google and Microsoft calendars and drives are re-read only when they changed.
- Snooze: a message snoozed from the archive or the trash goes back there when it wakes, not to the inbox.
- Updates: the updater reads each release's notes from `sh.trymetis.email` instead of GitHub, so the Updates page needs no access to `api.github.com`.

### Fixed

- Gmail: moving a message back to the inbox from the archive or spam, and a snoozed message waking up, put it back in the inbox.

## 0.1.2 - 2026-10-27

### Changed

- Navigation on phones: Mail, Calendar, Drive, Workflows, Workspace AI, Settings, Workspace settings and the Dashboard open their side menu from a button in the page's own title bar.
- Page headers: each page's action button sits beside its title, with the description underneath.

### Fixed

- Mail on phones: the message toolbar, Compose, search, summary cards and the Scheduled and Subscriptions views fit the screen.
- Calendar: event fields have room on both sides, and Schedule view dates stay readable on every screen.
- Drive on phones: file names get the width of the row.
- Workflows: the run history, run details and editor fit phones, and the Runs panel opens when you tap its tab.
- Settings and the Dashboard on phones: forms, menus, headers and wide tables fit the screen, and the section bar stays at the top.
- Text fields on touch devices: normal-sized text, without iPhones zooming in when a field is tapped.
- Styling: hover hints no longer stick on touch screens, and **Sign out** and **Add client** match the rest of the app.

## 0.1.1 - 2026-10-26

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

## 0.1.0 - 2026-10-24

Initial public release.
