---
title: Who sees what, and limits
description: Which results each member of a workspace sees in search, and where search stops looking for each kind of mailbox, calendar and drive.
---

## Who can use search

Every member of a workspace can use search, whatever their role. Search shows only what you could already see in the workspace:

- Every mailbox, calendar, drive and address book in the workspace, and the contacts in the address books it shows. Resources that are not in the workspace do not show. See [Roles and permissions](/guide/reference/roles-and-permissions#who-can-see-each-resource).
- Drive folders, calendars and address books that the workspace hides stay hidden in search too.
- **Chats** are only your own Workspace AI conversations.
- **Connections** are only your own connected accounts that this workspace uses.
- Pending invites show only to owners and admins.

Actions in search follow the same rules as everywhere else. For example, only the owner sees **Make admin**, and only owners and admins see **Detach from this workspace**.

## How many results you get

- **Mail** and **Files** show a first set of results and **Load more** for the rest.
- Every other group except **Commands**, **Settings** and **Workspaces** shows at most 8 results, or 16 for **Calendars** and **Address books**. Add words or filters to find one that is not shown.
- If you search a great many times in a short while, search asks you to wait: **Some places could not be searched** then shows "Too many searches. Please wait a moment." Wait a moment, then search again.

## Events

- Search looks at events from one year ago to one year ahead, unless you use `after:`, `before:` or `on:`.
- Search looks at up to 250 events in each calendar (in each account, for CalDAV) before it applies the rest of your filters. On a busy calendar, add `after:` and `before:` to find older or later events.
- On **CalDAV** calendars, the first word of your search matches only the title and description.
- On **Zoho** calendars, the first word of your search matches the title, description and location.

## Calendars

- **Calendars inside an account** that you add, rename or delete at your provider can take up to a minute to change in search. Adding or removing a calendar account, or changing which calendars the workspace shows, appears in search at once.

## Mail

- **Mailboxes connected over IMAP** show **Load more** only when you name one folder with `mail-folder:`, such as `mail-folder:inbox`. Without a folder, they return one set of the newest matches from Inbox, Archive and Sent, with no **Load more**. With `mail-folder:starred`, they also return one set of the newest matches, with no **Load more**.
- **Cloudflare Email, Resend and Amazon SES mailboxes** search for one word at a time.
- **Outlook and Zoho mailboxes** filter by folder reliably only when `mail-folder:` stands on its own in the search, and not inside `OR`, `NOT` or parentheses.
- **Read later** and **muted** results show the subject and sender as they were when you marked them.

## Contacts

- **Contacts** are your saved contacts first, then people from your recent sent and received mail. Saved contacts without an email address show too. The `phone:` and `organization:` filters, and `title:` for contacts, match saved contacts only, never people from your mail. Someone you just emailed usually shows at once. Other new people from your mail, such as someone who just emailed you, can take up to 10 minutes to show.

## Files

- **S3, WebDAV, FTP, FTPS, SFTP and OneDrive drives** need at least one word in the search, such as part of a file name. A search with only filters, such as `type:file kind:pdf`, finds nothing on them.
- **Google Drive** also finds files with only `kind:` or date filters.
- **S3, WebDAV, FTP, FTPS and SFTP drives** can be up to 30 seconds behind in search, for example for a file added, renamed or deleted outside Metis. Opening the folder always shows what is there now.
- `drive-folder:` matches the name of the folder a file is in, not a path such as `Projects/2026`.

## Subscriptions

- **Subscriptions** can be searched only a few times every few minutes. Each time, search reads the newest 50 messages in each inbox.
- If **Some places could not be searched** lists subscription, wait a few minutes, then search again.

## Chats and workflow runs

- Search reads the message text of your 40 most recent chats. Older chats are found by their title only.
- Search looks at the 50 most recent workflow runs.
