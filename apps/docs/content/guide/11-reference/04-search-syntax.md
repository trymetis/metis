---
title: Search syntax
description: Every word, operator and filter you can type in workspace search, the values each filter takes, and the problem messages search shows.
---

This page lists what you can type in the workspace search box. To learn how to use search, see [Search your workspace](/guide/search/search-your-workspace).

## Words and operators

| You type                     | It means                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `invoice`                    | A word with no filter. It is free text: it matches the places listed under [Free text](#free-text). |
| `"quarterly report"`         | A phrase in quotes. It matches those words together, in that order. Case does not matter.           |
| `invoice march`              | A space means AND. Results must match both.                                                         |
| `invoice AND march`          | The same as a space.                                                                                |
| `invoice OR receipt`         | Results may match either one.                                                                       |
| `NOT draft` or `-draft`      | Leaves out results that match.                                                                      |
| `(invoice OR receipt) march` | Parentheses group parts of a search. You can nest them at most 5 levels deep.                       |

- **Filters** are a key, a colon and a value, such as `from:sam`. Keys are not case-sensitive.
- **Values with a fixed list of choices must match one choice exactly.** Case does not matter. For example, `is:read` never matches unread mail.
- **Comparisons** (`>`, `>=`, `<`, `<=`) work only on dates and sizes, for example `size:>10mb` or `modified:<2026-01-01`.
- **A search is one line, up to 500 characters.** Line breaks you paste become spaces.
- **A filter that does not apply to a kind of result leaves that kind out.** For example, `from:sam` searches only mail, because events, files and the rest have no sender.

## Free text

A word with no filter matches different things for each kind of result.

| Kind            | Free text matches                                                                          |
| --------------- | ------------------------------------------------------------------------------------------ |
| Mail            | The subject, preview, sender and recipients, using your mail provider's own search         |
| Events          | The title, description, location, guests and organizer                                     |
| Files           | The file or folder name. On Google Drive, also the text inside files.                      |
| Chats           | The title, and the message text of your 40 most recent chats                               |
| Saved contacts  | The name, every email address, every phone number, the organization and the job title      |
| Address books   | The account name, email address and short name, or the address book's name and its account |
| Everything else | The name or email address                                                                  |

## Filters

| Filter           | What it matches                                                                                                                  | Applies to                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type:`          | One kind of result. See [Types](#types).                                                                                         | Everything                                                                                                            |
| `after:`         | On or after a date                                                                                                               | Mail, events, files, chats, members, workflows, workflow runs, subscriptions                                          |
| `before:`        | Before a date                                                                                                                    | The same as `after:`                                                                                                  |
| `on:`            | During one day, month or year                                                                                                    | The same as `after:`                                                                                                  |
| `mailbox:`       | One mailbox, by its short name in the page address or its email address                                                          | Mail, mail folders, labels, mailboxes                                                                                 |
| `calendar:`      | One calendar account                                                                                                             | Events, calendars                                                                                                     |
| `drive:`         | One drive                                                                                                                        | Files, drives                                                                                                         |
| `addressbook:`   | One address book account, by its short name in the page address or its email address                                             | Contacts, address books                                                                                               |
| `book:`          | One address book inside an account, by its name. Put names with spaces in quotes: `book:"Work contacts"`                         | Contacts, address books                                                                                               |
| `from:`          | Sent by                                                                                                                          | Mail, subscriptions                                                                                                   |
| `to:`            | Sent to                                                                                                                          | Mail                                                                                                                  |
| `cc:`            | Copied to                                                                                                                        | Mail                                                                                                                  |
| `subject:`       | Words in the subject line                                                                                                        | Mail                                                                                                                  |
| `filename:`      | The name of an attached file                                                                                                     | Mail                                                                                                                  |
| `has:attachment` | Mail with an attachment                                                                                                          | Mail                                                                                                                  |
| `mail-folder:`   | One mail folder: `inbox`, `sent`, `drafts`, `starred`, `trash`, `archive` or `spam`                                              | Mail                                                                                                                  |
| `label:`         | Mail with a label                                                                                                                | Mail                                                                                                                  |
| `attendee:`      | An invited guest                                                                                                                 | Events                                                                                                                |
| `organizer:`     | The person who organized it                                                                                                      | Events                                                                                                                |
| `location:`      | Where it happens                                                                                                                 | Events                                                                                                                |
| `title:`         | The title, or a contact's job title                                                                                              | Events, chats, contacts                                                                                               |
| `sub-calendar:`  | One calendar inside a calendar account, by its name                                                                              | Events, calendars                                                                                                     |
| `name:`          | The name                                                                                                                         | Files, members, contacts, workflows, mailboxes, calendars, drives, address books, mail folders, labels, subscriptions |
| `ext:`           | The file extension, such as `pdf`                                                                                                | Files                                                                                                                 |
| `kind:`          | The kind of file. See [File kinds](#file-kinds).                                                                                 | Files                                                                                                                 |
| `size:`          | The file size. See [Sizes](#sizes).                                                                                              | Files                                                                                                                 |
| `modified:`      | When the file last changed. `modified:2026-01` means during that month. Add `>` or `<` to compare, as in `modified:>2026-01-01`. | Files                                                                                                                 |
| `drive-folder:`  | The name of the folder the file is in. It matches the folder's name, not a path.                                                 | Files                                                                                                                 |
| `email:`         | The email address                                                                                                                | Members, contacts, connections                                                                                        |
| `phone:`         | A saved contact's phone number                                                                                                   | Contacts                                                                                                              |
| `organization:`  | A saved contact's company or organization                                                                                        | Contacts                                                                                                              |
| `role:`          | The workspace role: `owner`, `admin` or `member`                                                                                 | Members                                                                                                               |
| `workflow:`      | The name of the workflow a run belongs to                                                                                        | Workflow runs                                                                                                         |
| `status:`        | The run's status: `pending`, `running`, `completed`, `partial`, `failed`, `blocked` or `cancelled`                               | Workflow runs                                                                                                         |
| `provider:`      | The provider. See [Providers](#providers).                                                                                       | Mailboxes, calendars, drives, address books, connections                                                              |
| `is:`            | A state. See [States](#states).                                                                                                  | Mail, events, files, members, workflows, connections                                                                  |

The keys `in:` and `folder:` do not exist. Search marks them and shows "Use mail-folder: or drive-folder:".

## Types

`type:` takes one of these values.

| Value          | Finds                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `mail`         | Email messages                                                                                              |
| `event`        | Calendar events                                                                                             |
| `file`         | Files and folders in your drives                                                                            |
| `chat`         | Your own Workspace AI chats                                                                                 |
| `member`       | Members of the workspace, and pending invites if you are an owner or admin                                  |
| `contact`      | Your saved contacts first, then people from your recent sent and received mail                              |
| `workflow`     | Workflows                                                                                                   |
| `run`          | Workflow runs                                                                                               |
| `mailbox`      | The workspace's mailboxes                                                                                   |
| `calendar`     | The workspace's calendar accounts and the calendars inside them                                             |
| `drive`        | The workspace's drives                                                                                      |
| `addressbook`  | The workspace's address book accounts and the address books inside them that it shows                       |
| `mail-folder`  | The folders of each mailbox                                                                                 |
| `label`        | Mail labels                                                                                                 |
| `connection`   | Your own connected accounts that this workspace uses                                                        |
| `subscription` | Senders you get regular mail from, such as newsletters. They appear only when you type `type:subscription`. |
| `command`      | Commands, such as **Compose mail**                                                                          |
| `setting`      | Settings pages                                                                                              |
| `workspace`    | Your other workspaces                                                                                       |

## States

`is:` takes these values. Each one applies to one kind of result.

| Kind        | Values                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| Mail        | `unread`, `read`, `starred`, `scheduled`, `snoozed`, `readlater`, `muted` |
| Events      | `accepted`, `declined`, `tentative` (your answer)                         |
| Files       | `pinned`                                                                  |
| Members     | `invited` (pending invites)                                               |
| Workflows   | `enabled`, `disabled`                                                     |
| Connections | `quarantined` (the account needs reconnecting)                            |

## File kinds

`kind:` takes `folder`, `file`, `image`, `pdf`, `document`, `spreadsheet`, `presentation`, `video`, `audio`, `archive` or `text`.

## Providers

`provider:` takes `google`, `microsoft`, `zoho`, `imap`, `caldav`, `carddav`, `cloudflare`, `resend`, `ses`, `s3`, `webdav`, `ftp` or `sftp`.

## Dates

`after:`, `before:`, `on:` and `modified:` take a date.

| Value                            | Means                                      |
| -------------------------------- | ------------------------------------------ |
| `today`, `yesterday`, `tomorrow` | That day                                   |
| `7d`, `2w`, `3m`, `1y`           | That many days, weeks, months or years ago |
| `2026-01-31`                     | One day                                    |
| `2026-01`                        | One month                                  |
| `2026`                           | One year                                   |

- `after:` means on or after the start of that day, month or year. `after:7d` means the last 7 days.
- `before:` means before the start of that day, month or year.
- `on:` means during that day, month or year. With a relative value such as `on:7d`, it means that one day.
- For a range, use both: `after:2026-01-01 before:2026-02-01`.
- Dates use your own time zone.

What the date is depends on the kind of result:

| Kind          | The date search uses                        |
| ------------- | ------------------------------------------- |
| Mail          | When it was sent or received                |
| Events        | When the event starts                       |
| Files         | When the file last changed                  |
| Chats         | When the chat was last updated              |
| Members       | When they joined, or when they were invited |
| Workflows     | When the workflow last changed              |
| Workflow runs | When the run started                        |
| Subscriptions | When the latest message arrived             |

## Sizes

`size:` takes a number and a unit: `b`, `kb`, `mb`, `gb` or `tb`. Each unit is 1024 times the one before.

| You type      | Finds files         |
| ------------- | ------------------- |
| `size:5mb`    | Of at least 5 MB    |
| `size:>10mb`  | Larger than 10 MB   |
| `size:<100kb` | Smaller than 100 KB |

## Problem messages

When part of a search cannot be used, search underlines it with a wavy red line and shows the first problem in red under the box. In these messages, `key` stands for the key you typed.

| Message                                                 | What to do                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| "This part of the search can't be read"                 | Check the underlined part for a stray character or a missing value. |
| "Finish the search: close every quote and parenthesis." | Add the closing `"` or `)`.                                         |
| "Use mail-folder: or drive-folder:"                     | Replace `in:` or `folder:` with `mail-folder:` or `drive-folder:`.  |
| "There is no key: filter"                               | Check the spelling, or pick a key from the suggestions.             |
| "Add a value after key:"                                | Type a value after the colon.                                       |
| "key: does not compare with < or >"                     | Remove the `<` or `>`. Only dates and sizes compare.                |
| "key: does not take a range"                            | Remove the range. For dates, use `after:` and `before:`.            |
| "key: does not take a pattern"                          | Use a word instead.                                                 |
| "key: takes" and a list of values                       | Use one of the values listed.                                       |
| "key: takes a date such as 2026-01-31, today or 7d"     | Use one of the [date formats](#dates).                              |
| "key: takes a size such as 5mb or 200kb"                | Use one of the [size formats](#sizes).                              |
| "Searches are limited to 500 characters"                | Make the search shorter.                                            |
| "Parentheses nest at most 5 levels deep"                | Use fewer levels of parentheses.                                    |
