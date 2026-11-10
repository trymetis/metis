---
date: 2026-10-28
---

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
