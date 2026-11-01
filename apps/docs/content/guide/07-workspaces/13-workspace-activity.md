---
title: Workspace activity
description: See who changed roles, removed members, sent or revoked invites, or detached mailboxes, calendars and drives in a workspace.
---

The **Activity** page of a workspace lists security-relevant changes made in it: who changed what, and when. Only the workspace's owner and admins can see it.

This page is part of the workspace's settings. It is not the **Activity** page of **Workflows**, which shows workflow runs.

## Open the Activity page

There are three ways to open it:

- **From the workspace menu.** Click the workspace tile at the top of the left rail and choose **Activity**.
- **From the workspace settings.** Open the workspace menu and choose **General**. In the list on the left, click **Activity**. It is the last item, below **Drives**.
- **From search.** Open [workspace search](/guide/search/search-your-workspace) and type "activity". The words "audit", "log" and "history" also work. Pick **Workspace settings: Activity**.

Members do not see **Activity** in the workspace menu, in the settings list or in search. If a member opens the page's address, the page says "Only workspace owners and admins can see activity." They see no rows, no search box and no filter.

The page says "Role changes, ownership transfers, removed members, invites and detached mailboxes, calendars and drives in this workspace." If nothing has been recorded yet, it says "Nothing has happened in this workspace yet."

## What it lists

The **Event type** column holds the names in the [event type list](#filter-by-event-type). Search also finds rows by these names. They do not appear on the rows themselves. In the **The row reads** column, "…" stands for the person who made the change.

| Event type                             | The row reads                                           | Recorded when                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member role changed**                | "… changed Bob Lee's role from member to admin"         | The owner changes a member's role.                                                                                                                                                                                                                              |
| **Member removed**                     | "… removed Bob Lee from Design"                         | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                             |
| **Ownership transferred**              | "… transferred ownership of Design to Bob Lee"          | The owner makes another member the owner.                                                                                                                                                                                                                       |
| **Workspace invite sent**              | "… invited carol@example.com to Design as an admin"     | An owner or admin invites someone.                                                                                                                                                                                                                              |
| **Workspace invite revoked**           | "… revoked the invite for carol@example.com to Design"  | An owner or admin cancels a pending invite.                                                                                                                                                                                                                     |
| **Resource detached from a workspace** | "… detached the calendar alice@example.com from Design" | Someone takes a mailbox, calendar or drive out of this workspace. This can happen on the workspace's **Mailboxes**, **Calendars** or **Drives** page, with **Detach from this workspace** in search, or in the account settings of the person who connected it. |

Each change is recorded after it succeeds. Some changes that affect the workspace are not listed here:

- A mailbox, calendar or drive that its owner deletes from their account settings.
- An account that its owner disconnects.
- Deleting the workspace itself.

The person who made one of these changes sees it in their own [Security activity](/guide/account/security-activity).

## What each row shows

Each row is one change, shown on two lines.

The first line is one sentence. It starts with who made the change and says what they did, for example "Alice Martin removed Bob Lee from Design". Many sentences name the workspace.

How people are named in the sentence:

- **The person who made the change, and a member it was done to,** are shown by the name on their account today.
- **If the account has no name, or it was deleted,** the row shows their email address instead.
- **If neither is known,** the row says "A deleted account" (or "a deleted account" in the middle of the sentence).
- **Invited people, mailboxes, calendars and drives** are shown as they were named when the change was made, such as an email address.

The second line is smaller and lighter. It shows:

- **Where the change came from**, if it came from an AI tool: **Workspace Assistant** or **MCP client**, followed by a dot (·). A change made in the app shows nothing here.
- **When** it happened (date and time).

This page does not show IP addresses or devices.

The newest change is at the top. The page shows 50 rows at a time. Click **Load more** to see older ones. You cannot edit or delete rows. The person who runs your Metis Suite server decides how long rows are kept.

## Search and filter

Above the list are a search box ("Search events") and a list of event types, which starts at **All events**. Use them to find one change without scrolling.

<img src="/images/workspaces/workspace-activity.webp" alt="The workspace Activity page with the search box, the event type list set to All events, and the empty state" class="dark:hidden" />
<img src="/images/workspaces/workspace-activity-dark.webp" alt="The workspace Activity page with the search box, the event type list set to All events, and the empty state" class="hidden dark:block" />

### Search

Type in the search box. The list updates shortly after you stop typing. While it loads, a small spinner shows at the right of the box, and the old list stays on screen until the new one is ready.

Search looks through every row this page can show, not only the rows already on screen. **Load more** then shows older matches, 50 at a time, newest first.

Search finds rows where your text appears in:

- the event type, such as **Member removed** or **Workspace invite revoked**. These are the names in the [event type list](#filter-by-event-type);
- the fixed words of the sentence, without the names, email addresses, workspaces or roles in it. For example, "revoked the invite" and "role from" find rows, but "role from member" does not;
- what the change was about: the member's or the invited person's email address, or the email address of the mailbox, calendar or drive;
- the email address of the person who made the change. Their name is not searched;
- the workspace's name. Every row on this page belongs to this workspace, so typing the workspace's name shows every row.

A search for the sentence's words finds every change of that type, not only rows that read exactly like your text. For example, "detached the drive" finds every detached drive.

Search does not look at people's names, the roles in a sentence (such as "member to admin"), the date and time, the words **Workspace Assistant** and **MCP client** on the second line, or "a deleted account".

How the text is matched:

- Your whole text is matched as one phrase, anywhere inside a field. For example, "invite rev" finds **Workspace invite revoked**. Words are not matched one by one, so "revoked invite" does not find it.
- Spaces at the start and end are ignored.
- Upper and lower case count as the same for the letters A to Z. Other letters, such as letters with accents, must match in case too.
- You can type up to 200 characters.

To clear the search, empty the search box.

### Filter by event type

Pick a type to show only those rows:

- **Resource detached from a workspace**
- **Member role changed**
- **Member removed**
- **Ownership transferred**
- **Workspace invite sent**
- **Workspace invite revoked**

A row's sentence names the kind of resource, such as "detached the drive", but the list has one type for all three: **Resource detached from a workspace**. Pick it to see every detached mailbox, calendar and drive.

To clear the filter, pick **All events**.

### Search and filter together

When you use both, a row must match both. If no row matches, the page says "No events match your search."

There is no filter by date. Search and filter only narrow the list. They never show changes this page does not already show.

To see the changes you made yourself across all your workspaces, open your [Security activity](/guide/account/security-activity).
