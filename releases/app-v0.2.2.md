---
date: 2026-11-05
---

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
