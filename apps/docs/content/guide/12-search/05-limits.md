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
- By default, you can run at least 60 searches a minute. The person who runs your server can change this limit. Each **Load more** counts as a search. Search also runs each time you pause while typing.
- Past the limit, the dialog shows "Some places could not be searched:" followed by "Too many searches. Try again in 20 seconds.", or the time left. The message can show more than once, separated by dots. Wait for that time (at most 1 minute), then search again.
- If you reach the limit while clicking **Load more**, the results you already have stay, and the same message shows. Wait for that time, then click **Load more** again.

## Suggestions

Some keys suggest values from your workspace after you type the colon: `mailbox:`, `calendar:`, `drive:`, `addressbook:`, `book:`, `sub-calendar:`, `label:`, `workflow:`, `from:`, `to:`, `cc:`, `attendee:`, `organizer:` and `email:`. The **In a resource** menu lists values from your workspace too. These suggestions have a limit, by default 240 a minute. The person who runs your server can change it. Opening **In a resource** very often can also reach this limit.

- **While you type:** past the limit, a line at the top of the results says "Too many suggestions. Try again in 20 seconds.", or the time left. No values are suggested for that key, but you can still type the value yourself and search.
- **After the wait:** the suggestions appear on their own and the line goes away. If they still cannot load after trying again 5 times, the line stays. Type the value again to try once more.
- **In a resource:** past the limit, the same line shows at the top of the menu, and the menu lists only the groups it could load. It does not try again on its own. Wait for the time shown (at most 1 minute), then close the menu and open it again.

For `from:`, `to:`, `cc:`, `attendee:`, `organizer:` and `email:`, people from your mail share the limit on address suggestions in the composer (by default 20 a minute, see [Compose and send](/guide/mail/compose-and-send#write-a-new-message)). **Contacts** results use the same limit. Past it, people from your mail are left out with no message. Saved contacts still show. After a minute, search again (or type the value again).

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

- Each time, search reads the newest 100 messages in each inbox, or the newest 50 in a Zoho Mail inbox.
- New subscriptions show in search as soon as the mail is in your inbox.
- Searches can use up the scan limit of each mailbox they read. See [Unsubscribe from mailing lists](/guide/mail/unsubscribe#limits).
- Past the limit, the dialog shows, for example, "Some places could not be searched: subscription (Too many scans. Try again in 3 minutes.)". Wait for that time (at most 5 minutes), then search again.

## Chats and workflow runs

- Search reads the message text of your 40 most recent chats. Older chats are found by their title only.
- Search looks at the 50 most recent workflow runs.
