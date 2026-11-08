# Changelog

Notable changes to the Metis Suite server: the app, worker, preflight and updater images, `compose.yml` and `bootstrap.sh`, released together under `app-v<version>` tags. The desktop and mobile apps have their own changelogs in [`apps/desktop/`](apps/desktop/CHANGELOG.md) and [`apps/mobile/`](apps/mobile/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

## 0.3.1 - 2026-11-08

### Fixed

- Archiving, deleting or restoring an email keeps its thread summary instead of building a new one, so moving mail no longer calls your model again, and a summary can no longer be built while the email is still moving without its AI label.

## 0.3.0 - 2026-11-07

### Upgrade notes

- Contains a database migration that adds the address book tables and lets workflows reference an address book.
- To offer contacts from Google, Microsoft or Zoho, add the contacts scope to your OAuth app: `https://www.googleapis.com/auth/contacts` (and enable the People API) for Google, `Contacts.ReadWrite` for Microsoft, `ZohoContacts.contactapi.ALL` for Zoho. Accounts already connected ask for it when someone adds their address book.
- CardDAV servers are a new server list (Dashboard → System → CardDAV, `METIS_CARDDAV_SERVERS`). Like the other server lists, `bootstrap.sh` writes `METIS_CARDDAV_SERVERS` into `.env` when it is set in the shell you run it from; on an existing install, add it to `.env` yourself or use the dashboard.
- Contains a database migration that records when an MCP client's authorizations were last revoked and who saved each workflow revision.
- Workspace invites now work only for the account they were sent to, and the address in `METIS_OWNER_EMAIL` can no longer be invited or delete its own account. To hand over ownership, change `METIS_OWNER_EMAIL` first.

### Added

- Contacts: connect a Google, Outlook, Zoho or CardDAV address book to a workspace, choose which of its books the workspace sees, and browse, filter, create, edit and delete contacts in the new Contacts section (rail icon, `/p/`), with its own AI panel. Click anyone in an open email for a menu that opens or saves them as a contact, emails them, invites them or searches everything with them, or save a summary's Contact card to an address book; the Contact card's `.vcf` button is now **Download**. Compose suggestions and search list saved contacts first. Workspace search finds address books and their books (`type:addressbook`, `addressbook:`, `book:`) and contacts by phone, organization or job title, including contacts with no email, and a contact's card downloads it as a `.vcf`. The assistant and MCP clients read and write contacts behind the address book's AI switch: every assistant write waits for approval, and MCP contact writes stay off until turned on for the client. New workflow Contacts steps list, search, get, create, update and delete contacts as the workflow's creator. The `searchContacts` tool now searches saved contacts.

### Changed

- Workspace members moved to Settings → Members, which lists everyone; owners and admins invite and remove people, and the owner changes roles and transfers ownership. The separate Members page and member profiles are gone; a member chip in the assistant opens a member panel beside the chat.
- Dashboard: the Instance page's description names its **Mail cache** and **Proxies** sections too.
- Connecting a Google, Microsoft or Zoho account now ends on a confirmation page that names the Metis Suite account it goes into and the workspace to add it to; nothing is connected until you click **Connect**, and **Cancel** leaves the provider untouched. The workspace is filled in only when you started from inside the app.
- Sign-up invites are only ever delivered by email: when the email can't be sent, no invite is created and the link is no longer shown.
- Revoking an MCP client's authorizations now stops its access tokens on the next request instead of up to an hour later.
- Workflows: creating, editing, turning on or off and deleting a workflow is recorded in the workspace's Activity, noting when it runs as someone else or can add a Bcc. Run details and the Revisions sheet show who saved each revision, and the send toast lists any Bcc a workflow added to your message.
- Mail: email CSS is now parsed rather than pattern-matched, so escaped or commented-out image references are blocked or proxied like any other, and broken CSS a parser can't read is dropped.

### Fixed

- A mailbox, calendar, drive or address book added with a server login now shows up in the lists right away, without reloading the page.
- With AI turned off for a mailbox, opening an email no longer shows "Couldn't summarize this thread."; the summary and the smart replies are left out instead.

### Security

- The Zoho connect callback accepts only Zoho's own accounts servers, so the instance's Zoho client secret can no longer be sent to another host.
- A workspace member can no longer list the names of drive folders hidden from them.
- The assistant, workflow agents and MCP clients can no longer run phishing analysis on a mailbox whose phishing detection is turned off.
- A webhook body can no longer make a workflow load a mail message by id.

## 0.2.2 - 2026-11-05

### Upgrade notes

- Contains a database migration that adds the **Mail cache** setting (Dashboard → System → Instance, `METIS_MAIL_CACHE_DAYS`, default 30 days) to the instance settings table. After upgrading, a daily job clears stored copies of message bodies not opened for that long.
- Contains a database migration that adds the **Trusted proxies** setting (Dashboard → System → Instance → **Proxies**, `METIS_TRUSTED_PROXIES`) to the instance settings table.
- Rate limits, sign-in limits and the audit log's IP now use the rightmost `X-Forwarded-For` address instead of `X-Real-IP`, `cf-connecting-ip` or the leftmost entry. Behind the bundled Caddy or one load balancer nothing changes. Behind Cloudflare in front of Caddy, list Cloudflare's address ranges under **Proxies**, or every visitor through one Cloudflare server shares one rate limit; behind another CDN in front of the bundled Caddy, visitors share the CDN server's address either way.
- Contains a database migration that adds the **Allow unencrypted** setting for the SMTP mailer to the instance settings table.
- An IMAP server entry, or the SMTP mailer, set to connect without implicit TLS now refuses a server that does not offer STARTTLS. If that server is a local one without TLS, turn on **Allow unencrypted** for it in Dashboard → System (`"plain": true` on that side of the entry in `METIS_IMAP_SERVERS`, or `SMTP_PLAIN=true`).

### Changed

- Drive: searching an S3, WebDAV, FTP, FTPS or SFTP drive reuses what it listed in the last 30 seconds, stored in the instance's cache, so typing in the search box or the AI @ list no longer lists the drive again for every pause. Uploads, new folders, renames, moves and deletes made through Metis clear it, on every server process when the cache is Redis or Upstash; a file added, renamed or deleted outside Metis can take up to 30 seconds to show in search, and opening the folder always shows what is there now.
- Calendar: a CalDAV calendar account shows its server's name, and Google, Outlook and Zoho calendar accounts show their type and email, for example "Google Calendar · ana@example.com", in the page title, search, the All calendars sidebar, the event dialog, the schedule view, workflow steps, the AI @ list and mail's Add to calendar menu. Two CalDAV servers used to read as the same address. The calendar switcher is unchanged.
- Drive: a relayed S3 download or upload sends one fewer request to the bucket, which lowers the request bill on S3 and S3-compatible stores.
- Emails from the instance (sign-in links, verification, invites, sign-in alerts, password resets) have a new minimal black-and-white design in DM Sans, served from the instance itself, with a dark version for mail apps in dark mode.
- Sign-in, setup, password reset, two-factor, invite and desktop/mobile app sign-in pages are fully black and white: checkboxes, code fields, focus rings and buttons no longer pick up the amber or workspace brand color.
- Activity and audit logs show each event as one sentence that names who did it, such as "Alice Martin revoked the invite for carol@example.com to Design", with the workspace, time and device on a line under it. Searching by the sentence's wording finds the event.
- Drive: a file or folder with no modified date or size leaves that cell empty instead of showing a dash.
- Workflows: the step palette floats over the canvas instead of taking a column beside it. It starts closed as an icon in the canvas's top-left corner; the icon opens it with its search box and closes it again. The zoom, Fit View, Tidy up the layout and minimap buttons move to a row in the canvas's top-right corner, so the open palette never covers them.
- Workflows: an Ask step's questions start collapsed to their number, type and text, so a step with several questions stays short; click a question to edit it and **Collapse** to fold it again. A new question opens ready to type.
- Mail: Zoho mailboxes stop writing a server log line for every region probe and account lookup.
- Mail: **Print** and **View original** open in a new tab instead of a pop-up window, so a pop-up blocker no longer stops them. View original shows a summary with the SPF, DKIM and DMARC results, a **Download original** button for the `.eml` file and **Copy to clipboard**. Both now open in the mobile app too; on mobile, Print shows the print page without a print dialog.
- Compose: the **Link** button takes the address in a small field above the toolbar, with **Remove link** when the cursor is on a link, instead of the browser's prompt. An address without `https://` gets it added, an email address becomes an email link and a phone number a phone link.
- Mail: the message toolbar drops its Reply button, since the Reply bar under the message does the same, and shows Draft apology, Print and View original as buttons instead of in a **More actions** menu.

### Added

- Dashboard: **Mail cache** on the Instance page sets how many days a message's body stays stored after it was last opened (30 by default). A daily job clears older bodies; subjects, senders, AI labels, summaries and phishing checks are kept, and an old message's body is fetched again when it is opened.
- Dashboard: when a save's check fails, **Save anyway** stores the changes after a new authenticator code, and **Restore anyway** does the same for a version in History.
- Mail: the toolbar **Snooze** menu has **Pick date & time…** to snooze until any future time.
- Workflows: text conditions can use **matches pattern** to test a field against a regular expression; the editor flags a pattern that is not valid.
- Drive: an S3 server whose transfers are relayed has a **Part size** setting (`partSize` in `METIS_S3_SERVERS`), such as `32 MB`, between 5 MB and 5 GB. Relayed uploads go to the bucket in parts of that size; the default rises from 8 MB to 32 MB, so a large upload needs a quarter of the requests.
- Dashboard: every settings card has **Reset to environment**, which shows what would change and puts that section back to the values from the environment and config file. A reset that would remove a server or sign-in provider still in use is refused unless you tick **Reset anyway and quarantine these connections**. Resets show in History as **Reset**.

### Fixed

- AI assistants and MCP clients: asking for a file, folder or calendar the workspace hides now answers "We couldn't find that." instead of "That didn't go through. Try again.", so the assistant no longer retries something it cannot see.
- Mail: adding or deleting a custom label lets AI labels try again on messages it was unsure about, instead of skipping them for up to a week.
- Mail: address suggestions include people you just emailed, instead of only after up to 10 minutes, and are the same on every server process.
- Search: a calendar shown, hidden, added to or removed from a workspace shows up correctly in search at once, instead of after up to a minute.
- Mail: the message list stays fast with thousands of messages loaded, because it draws only the messages near what is on screen. Moving to the next or previous message from the reading pane scrolls the list to keep it in view.
- Drive: an S3 drive connected with a folder prefix and limited to some folders in a workspace showed nothing inside those folders, and its search found nothing. Checking which folder a file is in on S3, WebDAV, FTP and SFTP drives no longer sends a request per file, so searching a limited S3 drive no longer sends a burst of billed requests that a rate-limited bucket throttles.
- Rate limits, sign-in and two-factor limits, and the audit log's IP address could be fooled by a caller sending its own `X-Real-IP`, `cf-connecting-ip` or `X-Forwarded-For` header, getting a fresh limit on every request. The address now comes from the nearest proxy, and webhook **Only from these IPs** checks accept `X-Forwarded-For` entries with a port (AWS load balancers can add one) and no longer fall back to `X-Real-IP`.
- Mail: a Zoho mailbox reads and sends through the Zoho account with the mailbox's address. A Zoho login that also holds another account, such as an external IMAP account added to Zoho Mail, could show that account's folders and send with an empty From address.
- Dashboard: saving a server list or a sign-in provider checks only the servers you added or whose connection settings you changed, so one unreachable server no longer blocks every other edit to the list, and removing a server is never refused. Servers you did not touch show what the last deploy check reported about them.
- Drive: searching a drive that a workspace limits to some folders no longer drops results silently when the drive fails to answer while Metis checks which folder a result is in. The drive page shows "Couldn't search all of …", the search dialog, the AI assistants and MCP clients name the drive, including when they search every drive at once or a member's drives (a drive that failed outright used to be skipped there without a word), and a workflow's drive search step fails and retries instead of continuing with part of the list.
- AI assistants (workspace, mail, calendar and drive) no longer stop partway through a request after five steps with no answer. Looking up tools no longer counts toward the limit, and when a request does reach the limit the assistant answers with what it found so far.
- Dashboard: a server added with **Add server** starts with its default settings shown, such as implicit TLS on and port 993 for IMAP, instead of showing switches off that were then saved as on.
- IMAP accounts and the SMTP mailer no longer fall back to sending the password and mail unencrypted when a server on a non-TLS port does not offer STARTTLS, or when someone on the network removes the offer; the connection fails instead.
- Drive: drives are named after their server (S3, WebDAV, FTP, SFTP) or as "Google Drive · <email>" and "OneDrive · <email>" in All drives, the breadcrumb, the browser tab, search and its suggestions, the drive picker, the assistant's @ picker and workflow steps, instead of all showing the same email address; pinned folders in All drives show their drive under the folder name.
- Mail, calendar and drive pages show the mailbox, calendar or drive in the browser tab title, which was missing.
- Calendar: Year view marks each day that has events with a dot, instead of showing every month empty.
- Calendar: Google and Microsoft calendars show every event in a view, instead of stopping after each calendar's first 250 events.
- Calendar: moving or resizing an event by dragging shows an error when the change could not be saved, instead of leaving the event in its old place without a word.
- Mail: **Pick date & time…** for Send later and Snooze accepts any future time, such as ten minutes from now; it starts at the next whole hour but no longer refuses an earlier time with **OK**.
- Workflows: Microsoft push follows a changed **Public URL for webhooks and push** at its next renewal, instead of notifying the old address until the URL is cleared and set again, and a Microsoft subscription that no longer exists is created again instead of failing at every renewal.
- Compose: pressing Enter after typing a saved contact's full address adds it as a recipient, instead of clearing the text; with a suggestion highlighted, Enter still picks the suggestion.

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
