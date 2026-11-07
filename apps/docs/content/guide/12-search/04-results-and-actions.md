---
title: Results and actions
description: What each kind of search result shows in its row and in the preview, and every action you can run on it.
---

This page lists every kind of result workspace search can show, in the order the groups appear, with the actions for each one. The first action in each list is the one that runs when you click the row or press **Enter**. To open the full list, see [Open a result or act on it](/guide/search/search-your-workspace#open-a-result-or-act-on-it).

Groups appear in this order: **Suggestions**, **Saved searches**, **Recent searches**, **Mail**, **Events**, **Files**, **Chats**, **Members**, **Contacts**, **Workflows**, **Workflow runs**, **Mailboxes**, **Calendars**, **Drives**, **Address books**, **Mail folders**, **Labels**, **Connections**, **Subscriptions**, **Commands**, **Settings** and **Workspaces**.

Actions whose name starts with **Filter by** or **Search** replace what is in the box with a new search, such as `from:` and the sender, and keep search open.

**Ask the assistant** opens **Workspace AI** with a new message that already holds the item as a chip. The message is not sent, so you can type your question first. You see this action only when AI is on for your instance, for the workspace and for the mailbox, calendar or drive the item is in. See [Use Workspace AI](/guide/assistant/use-workspace-ai).

## Mail

Each row shows the subject, the sender and the start of the message, and the date. A badge marks mail that is **scheduled**, **snoozed**, saved for **readlater** or **muted**.

The preview shows the subject, **From**, **To**, **Date** (**Sends** for a scheduled message), **Snoozed until** for snoozed mail, **Mailbox**, and the message text.

| Action                           | What it does                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| **Open**                         | Opens the message in its mailbox. Snoozed mail opens in **Snoozed**. |
| **Reply**                        | Opens a reply to the sender.                                         |
| **Archive**                      | Archives the message. Not shown for mail that is already archived.   |
| **Star** or **Unstar**           | Stars or unstars the message.                                        |
| **Mark read** or **Mark unread** | Marks the message read or unread.                                    |
| **Snooze until tomorrow**        | Snoozes the message until 8:00 tomorrow.                             |
| **Snooze until next week**       | Snoozes the message until 8:00 next Monday.                          |
| **Add a label**                  | Lets you pick a label to add.                                        |
| **Ask the assistant**            | Starts a Workspace AI message about this email.                      |
| **Filter by sender**             | Searches for mail from the same sender.                              |

For a scheduled message, the actions are different:

| Action              | What it does                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Open**            | Opens it in the **Scheduled** folder.                                                                   |
| **Cancel the send** | Asks "Cancel this scheduled send?" ("The message will not be sent."). Click **Cancel send** to confirm. |
| **Retry the send**  | Shown only when Metis Suite could not confirm whether the message was sent. Tries the send again.       |

When there are more messages, **Load more** at the end of the group shows the next ones.

## Events

Each row shows the title, the calendar and the location, and when it starts.

The preview shows **When**, **Where**, **Calendar** (the calendar's name and the [account name](/guide/calendar/views-and-navigation#how-calendar-accounts-are-named), for example "Work · Google Calendar · you@example.com"), **Organizer**, **Guests**, **Your answer**, **Meeting** (the meeting link) and the description.

| Action                              | What it does                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Open**                            | Opens the event in the calendar, on its date.                                                         |
| **Going**, **Maybe**, **Not going** | Sends your answer to the invitation.                                                                  |
| **Edit**                            | Opens the event for editing.                                                                          |
| **Delete**                          | Asks you to confirm, then deletes the event at the calendar provider. It cannot be brought back here. |
| **Ask the assistant**               | Starts a Workspace AI message about this event.                                                       |
| **Search with the attendees**       | Searches for events that any of this event's guests or its organizer are invited to.                  |

## Files

Each row shows the file's icon and name, its drive's short name, and when it last changed. A badge marks pinned folders.

The preview shows **Kind**, **Size**, **Changed**, **Folder**, **Drive** and **Pinned**.

| Action                         | What it does                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Preview** or **Open folder** | Opens the drive. A file opens with its preview showing.                                                           |
| **Download**                   | Downloads the file. Files only.                                                                                   |
| **Rename**                     | Asks for a new name.                                                                                              |
| **Move**                       | Opens **Move** and the item's name, where you pick a folder. Click **Move here** to move it.                      |
| **Pin** or **Unpin**           | Pins or unpins the folder. Folders only.                                                                          |
| **Delete**                     | Asks you to confirm. Google Drive and OneDrive move the item to the trash. Every other drive deletes it for good. |
| **Attach to a new mail**       | Opens a new message with a link to the file. Only for files that have a web link.                                 |
| **Ask the assistant**          | Starts a Workspace AI message about this file. Files only.                                                        |
| **Filter by folder**           | Searches the folder the file is in.                                                                               |

The row shows the name of the folder the file is in, and **Filter by folder** appears, only when your search uses `drive-folder:`. When there are more files, **Load more** at the end of the group shows the next ones.

## Chats

Your own Workspace AI conversations. The preview shows the last 6 messages, each marked **You** or **Assistant**.

| Action     | What it does                                                         |
| ---------- | -------------------------------------------------------------------- |
| **Open**   | Opens the conversation in Workspace AI.                              |
| **Rename** | Asks for a new title.                                                |
| **Delete** | Asks you to confirm, then deletes the chat and its history for good. |

## Members

Each row shows the member's name, email address and when they joined. Owners and admins also see pending invites, marked with an **invited** badge.

The preview shows **Email**, **Role** and **Joined** (or **Invited** and **Expires** for an invite). For a member, it also shows **Recent mail with them** and **Upcoming events with them**.

| Action                                    | What it does                                                                    | Who sees it                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| **Email**                                 | Opens a new message to them.                                                    | Everyone                                      |
| **Invite to an event**                    | Opens a new one-hour event at the next full hour, with them as a guest.         | Everyone                                      |
| **Search everything with** and their name | Searches for mail from or to them, and events they are invited to or organized. | Everyone                                      |
| **Ask the assistant**                     | Starts a Workspace AI message about this person.                                | Everyone, when AI is on                       |
| **Copy email**                            | Copies their email address.                                                     | Everyone                                      |
| **Make admin** or **Make member**         | Changes their role. **Make admin** asks for your authenticator code.            | The owner                                     |
| **Transfer ownership**                    | Makes them the owner. Asks for your authenticator code.                         | The owner                                     |
| **Remove from workspace**                 | Asks you to confirm, then removes them.                                         | Owners and admins. Never shown for the owner. |

For a pending invite, the actions are **Copy email** and, for owners and admins, **Revoke the invite**.

## Contacts

Your saved [contacts](/guide/contacts) come first, then people from your recent sent and received mail. New people from your mail can take up to 10 minutes to show. See [Who sees what, and limits](/guide/search/limits#contacts).

Each saved contact has one row, even when it has several email addresses. Saved contacts without an email address show too. Your words match a saved contact's name, every email address, every phone number, its organization and its job title.

For a saved contact, the preview shows **Organization**, **Phone** and **Address book**. When the contact has an email address, the preview also shows **Email**, **Recent mail with them** and **Upcoming events with them**. People from your mail show only the email part.

| Action                                    | What it does                                                                    | When you see it                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| **Open contact**                          | Opens the contact in Contacts.                                                  | Saved contacts only                       |
| **Search everything with** and their name | Searches for mail from or to them, and events they are invited to or organized. | When there is an email address            |
| **Email**                                 | Opens a new message to them.                                                    | When there is an email address            |
| **Invite to an event**                    | Opens a new one-hour event at the next full hour, with them as a guest.         | When there is an email address            |
| **Copy email**                            | Copies their email address.                                                     | When there is an email address            |
| **Copy phone number**                     | Copies their first phone number.                                                | When the saved contact has a phone number |

A saved contact with no email address has only **Open contact** and, if it has a phone number, **Copy phone number**.

## Workflows and workflow runs

For a workflow, the preview shows **State** (on or off), **Last run** and **Changed**.

| Action                      | What it does                       |
| --------------------------- | ---------------------------------- |
| **Open the builder**        | Opens the workflow in the builder. |
| **Turn on** or **Turn off** | Turns the workflow on or off.      |
| **Run now**                 | Starts a run.                      |
| **Open history**            | Opens the workflow history.        |

For a workflow run, the preview shows **Status**, **Started** and any **Error**. The actions are **Open the run**, **Resume** (for a blocked or failed run) and **Cancel** (for a pending, running or blocked run).

## Mailboxes, calendars, drives and address books

For a mailbox, a calendar account, a drive or an address book account, the preview shows **Provider**, **Slug** (its short name in the page address) and whether **AI** is on. For a drive or an address book account, it also shows **Server**.

A drive's row shows its [drive name](/guide/drive/browse-your-files#how-drives-are-named), with its type on the line under it. You can also find a drive by its account's email address.

A calendar account's row shows its [account name](/guide/calendar/views-and-navigation#how-calendar-accounts-are-named), with its type on the line under it: "Google Calendar", "Outlook Calendar", "Zoho Calendar" or "CalDAV". You can also find a calendar account by its email address.

An address book account's row shows its [account name](/guide/contacts/browse-your-contacts#how-accounts-are-named), with its type on the line under it: "Google Contacts", "Outlook Contacts", "Zoho Contacts" or "CardDAV". You can also find it by its email address or its short name. Type `type:addressbook` to see only address books.

<img src="/images/search/address-books.webp" alt="Search showing address book results, with an address book account's preview" class="dark:hidden" />
<img src="/images/search/address-books-dark.webp" alt="Search showing address book results, with an address book account's preview" class="hidden dark:block" />

| Action                                                                  | What it does                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Open**                                                                | Opens it.                                                                                                                                        |
| **Workspace settings**                                                  | Opens the workspace's **Mailboxes**, **Calendars**, **Drives** or **Contacts** settings page. For an address book, its row is highlighted there. |
| **Detach from this workspace**                                          | Asks you to confirm, then takes it out of this workspace. It keeps working in every other workspace. Owners and admins only.                     |
| **Filter by this mailbox**, **calendar**, **drive** or **address book** | Searches only there.                                                                                                                             |

For a drive or a calendar account, the question you confirm names it, for example "Detach Acme files?" or "Detach Google Calendar · you@example.com?". For a mailbox, it names the mailbox's email address. For an address book account, it names the account and says "It stops being part of this workspace. The address book keeps working everywhere else." Click **Detach**, and you see "Detached".

Search also finds each calendar inside a calendar account, if the workspace shows it. Its row shows the calendar's name, with the account's name on the line under it. Its preview shows **Color** and, under **Account**, the account's name. The actions are:

| Action                      | What it does                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Show in the calendar**    | Opens the calendar.                                                                         |
| **Show only this one**      | Opens the calendar and hides the account's other calendars in the sidebar, in this browser. |
| **Hide**                    | Opens the calendar and hides this one in the sidebar, in this browser.                      |
| **Filter by this calendar** | Searches only this calendar.                                                                |

Search also finds each address book inside an address book account, if the workspace shows it. Its row shows the address book's name, with the account's name on the line under it. Its preview shows **Account**. The actions are:

| Action                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| **Show in Contacts**    | Opens that address book in Contacts.             |
| **Filter by this book** | Searches only the contacts in this address book. |

## Mail folders and labels

Search finds each folder of each mailbox. The actions are **Open** and **Filter by this folder**.

For labels, search finds the built-in labels, shown as "Every mailbox", and the custom labels of each mailbox.

| Action                   | What it does                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open**                 | Opens the label filter, which lists mail with the label from every folder. A built-in label opens in **All inboxes**, across every mailbox, even when you have only one. A custom label opens in the Inbox of its own mailbox. Both show the **Filtered by:** banner. |
| **Filter by this label** | Searches for mail with the label.                                                                                                                                                                                                                                     |
| **Delete the label**     | Custom labels only. Asks you to confirm. Messages keep their content, and the label is removed from them.                                                                                                                                                             |

## Connections

Your own connected accounts that this workspace uses. A badge reads "needs reconnecting" when an account has stopped working.

| Action                    | What it does                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open connections**      | Opens **Settings**, then **Connections**.                                                                                                                                               |
| **Reconnect**             | Shown when the account needs reconnecting. Opens **Settings**, then **Connections**, where you reconnect it. See [Fix an account that stops working](/guide/workspaces/fix-an-account). |
| **Delete the connection** | Asks you to confirm, then removes the whole account: every mailbox, calendar, drive and address book it backs, in every workspace.                                                      |

## Subscriptions

Senders you get regular mail from, such as newsletters. They show only when your search has `type:subscription`. Search looks through the newest inbox mail of each mailbox.

The actions are **Open in Subscriptions**, **Unsubscribe** (asks you to confirm first) and **Filter by sender**. See [Unsubscribe](/guide/mail/unsubscribe).

## Commands, settings and workspaces

| Group          | What you find                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commands**   | **Compose mail**, **New event**, **New folder**, **Upload files**, **New chat** (when AI is on), **New workflow**, **Switch to dark mode** or **Switch to light mode**, **Go to mail**, **Go to calendar**, **Go to drive**, **Go to contacts** and **Go to members** (which opens the workspace's **Members** settings page). Your saved searches show here too, as "Saved search:" and a name.                                                                                                                           |
| **Settings**   | **Account**, **Privacy**, **Workspaces**, **Connections**, **Mailboxes**, **Calendars**, **Drives**, **Address books**, **MCP clients** (when AI is on), **Invites**, **Security**, **Workspace settings: General**, **Workspace settings: Members**, **Workspace settings: Mailboxes**, **Workspace settings: Calendars**, **Workspace settings: Drives**, **Workspace settings: Contacts**, **Workspace settings: Activity** (if you are an owner or admin of the workspace), and **Dashboard** if you own the instance. |
| **Workspaces** | "Switch to" and the name of each of your other workspaces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Pick a command or a settings page to run it or go there.
