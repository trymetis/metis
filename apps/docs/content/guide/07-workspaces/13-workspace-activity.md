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

| Row title                                                       | Recorded when                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member role changed**                                         | The owner changes a member's role. The row shows the old and new role, for example "member → admin".                                                                                                                                                            |
| **Member removed**                                              | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                             |
| **Ownership transferred**                                       | The owner makes another member the owner.                                                                                                                                                                                                                       |
| **Workspace invite sent**                                       | An owner or admin invites someone. The row shows the role, "as admin" or "as member".                                                                                                                                                                           |
| **Workspace invite revoked**                                    | An owner or admin cancels a pending invite.                                                                                                                                                                                                                     |
| **Mailbox detached**, **Calendar detached**, **Drive detached** | Someone takes a mailbox, calendar or drive out of this workspace. This can happen on the workspace's **Mailboxes**, **Calendars** or **Drives** page, with **Detach from this workspace** in search, or in the account settings of the person who connected it. |

Each change is recorded after it succeeds. Some changes that affect the workspace are not listed here:

- A mailbox, calendar or drive that its owner deletes from their account settings.
- An account that its owner disconnects.
- Deleting the workspace itself.

The person who made one of these changes sees it in their own [Security activity](/guide/account/security-activity).

## What each row shows

- **What happened**, such as **Member removed**.
- **A badge** if the change came from an AI tool: **Workspace Assistant** or **MCP client**.
- **What it was about**, such as the member's or the invited person's email address.
- **Who made the change**: "by" and their email address.
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

- the row title, such as **Mailbox detached**;
- what the change was about, such as the member's or the invited person's email address;
- the email address of the person who made the change;
- the workspace's name. Every row on this page belongs to this workspace, so typing the workspace's name shows every row.

Search does not look at the role change ("member → admin"), the invite role ("as admin"), the date and time, or the **Workspace Assistant** and **MCP client** badges.

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

Rows say **Mailbox detached**, **Calendar detached** or **Drive detached**, but the list has one type for all three: **Resource detached from a workspace**. Pick it to see every detached mailbox, calendar and drive.

To clear the filter, pick **All events**.

### Search and filter together

When you use both, a row must match both. If no row matches, the page says "No events match your search."

There is no filter by date. Search and filter only narrow the list. They never show changes this page does not already show.

To see the changes you made yourself across all your workspaces, open your [Security activity](/guide/account/security-activity).
