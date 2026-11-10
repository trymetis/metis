---
title: Workspace activity
description: See who changed roles, removed members, sent, accepted, declined or revoked invites, detached mailboxes, calendars, drives and address books, or created, changed or deleted workflows in a workspace.
---

The **Activity** page of a workspace lists security-relevant changes made in it: who changed what, and when. Only the workspace's owner and admins can see it.

This page is part of the workspace's settings. It is not the **Activity** page of **Workflows**, which shows workflow runs.

## Open the Activity page

There are three ways to open it:

- **From the workspace menu.** Click the workspace tile at the top of the left rail and choose **Activity**.
- **From the workspace settings.** Open the workspace menu and choose **General**. In the list on the left, click **Activity**. It is the last item, below **Contacts**.
- **From search.** Open [workspace search](/guide/search/search-your-workspace) and type "activity". The words "audit", "log" and "history" also work. Pick **Workspace settings: Activity**.

Members do not see **Activity** in the workspace menu, in the settings list or in search. If a member opens the page's address, the page says "Only workspace owners and admins can see activity." They see no rows, no search box and no filter.

The page says "Role changes, ownership transfers, removed members, invites, workflow changes and detached mailboxes, calendars, drives and address books in this workspace." If nothing has been recorded yet, it says "Nothing has happened in this workspace yet."

## What it lists

The **Event type** column holds the names in the [event type list](#filter-by-event-type). Search also finds rows by these names. They do not appear on the rows themselves. In the **The row reads** column, "…" stands for the person who made the change.

| Event type                             | The row reads                                                                          | Recorded when                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member role changed**                | "… changed Bob Lee's role from member to admin"                                        | The owner changes a member's role.                                                                                                                                                                                                                                                          |
| **Member removed**                     | "… removed Bob Lee from Design"                                                        | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                                                         |
| **Ownership transferred**              | "… transferred ownership of Design to Bob Lee"                                         | The owner makes another member the owner.                                                                                                                                                                                                                                                   |
| **Workspace invite sent**              | "… invited carol@example.com to Design as an admin"                                    | Shows on older rows only. New invites are recorded as **Invite sent**.                                                                                                                                                                                                                      |
| **Workspace invite revoked**           | "… revoked the invite for carol@example.com to Design"                                 | Shows on older rows only. New revokes are recorded as **Invite revoked**.                                                                                                                                                                                                                   |
| **Invite sent**                        | "… invited carol@example.com to Design as an admin"                                    | An owner or admin invites someone. See [Members and roles](/guide/workspaces/members-and-roles#invite-people).                                                                                                                                                                              |
| **Invite accepted**                    | "… accepted the invite to Design as a member"                                          | The invited person joins, either by accepting the invite or by creating their account from it. The row starts with their name.                                                                                                                                                              |
| **Invite declined**                    | "… declined the invite to Design as a member"                                          | The invited person declines the invite. The row starts with their name.                                                                                                                                                                                                                     |
| **Invite revoked**                     | "… revoked the invite for carol@example.com to Design"                                 | An owner or admin cancels a pending invite.                                                                                                                                                                                                                                                 |
| **Invite link shown**                  | "… was shown the invite link for carol@example.com because the email couldn't be sent" | The invite email could not be sent, so the instance owner, who sent the invite, was shown its link to send it themselves.                                                                                                                                                                   |
| **Resource detached from a workspace** | "… detached the calendar alice@example.com from Design"                                | Someone takes a mailbox, calendar, drive or address book out of this workspace. This can happen on the workspace's **Mailboxes**, **Calendars**, **Drives** or **Contacts** page, with **Detach from this workspace** in search, or in the account settings of the person who connected it. |
| **Workflow created**                   | "… created the workflow Forward invoices"                                              | Someone creates a workflow in this workspace.                                                                                                                                                                                                                                               |
| **Workflow edited**                    | "… edited the workflow Forward invoices"                                               | Someone saves changes to a workflow.                                                                                                                                                                                                                                                        |
| **Workflow turned on**                 | "… turned on the workflow Forward invoices"                                            | Someone turns a workflow on.                                                                                                                                                                                                                                                                |
| **Workflow turned off**                | "… turned off the workflow Forward invoices"                                           | Someone turns a workflow off.                                                                                                                                                                                                                                                               |
| **Workflow deleted**                   | "… deleted the workflow Forward invoices"                                              | Someone deletes a workflow.                                                                                                                                                                                                                                                                 |

A workflow row can end with one or two notes:

- ", which runs as ben@example.com" when the workflow runs as someone other than the person who made the change. See [Who a workflow runs as](/guide/workflows/how-workflows-work#who-a-workflow-runs-as).
- ", which can add a Bcc to mail members send" when the workflow starts with **Before mail is sent**. See [Add a BCC to outgoing mail](/guide/workflows/add-a-bcc-to-outgoing-mail).

With both, the row reads, for example, "Ana Lopez edited the workflow Forward invoices, which runs as ben@example.com and which can add a Bcc to mail members send".

Each change is recorded after it succeeds. Some changes that affect the workspace are not listed here:

- A mailbox, calendar, drive or address book that its owner deletes from their account settings.
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
- **Invited people, mailboxes, calendars, drives, address books and workflows** are shown as they were named when the change was made, such as an email address or a workflow's name.

The second line is smaller and lighter. It shows:

- **Where the change came from**, if it came from an AI tool: **Workspace Assistant** or **MCP client**, followed by a dot (·). A change made in the app shows nothing here.
- **When** it happened (date and time).

This page does not show IP addresses or devices.

The newest change is at the top. The page shows 50 rows at a time. Click **Load more** to see older ones. You cannot edit or delete rows. The person who runs your Metis Suite server decides how long rows are kept.

## Search and filter

Above the list are a search box ("Search events") and a list of event types, which starts at **All events**. Use them to find one change without scrolling.

<img src="/images/workspaces/workspace-activity.webp" alt="The workspace Activity page with its title and subtitle, the search box, the event type list set to All events, and the latest events" class="dark:hidden" />
<img src="/images/workspaces/workspace-activity-dark.webp" alt="The workspace Activity page with its title and subtitle, the search box, the event type list set to All events, and the latest events" class="hidden dark:block" />

### Search

Type in the search box. The list updates shortly after you stop typing. While it loads, a small spinner shows at the right of the box, and the old list stays on screen until the new one is ready.

Search looks through every row this page can show, not only the rows already on screen. **Load more** then shows older matches, 50 at a time, newest first.

Search finds rows where your text appears in:

- the event type, such as **Member removed** or **Workspace invite revoked**. These are the names in the [event type list](#filter-by-event-type);
- the fixed words of the sentence, without the names, email addresses, workspaces or roles in it. For example, "revoked the invite" and "role from" find rows, but "role from member" does not;
- what the change was about: the member's or the invited person's email address, the email address of the mailbox, calendar, drive or address book, or the workflow's name;
- the email address of the person who made the change. Their name is not searched;
- the workspace's name. Every row on this page belongs to this workspace, so typing the workspace's name shows every row.

A search for the sentence's words finds every change of that type, not only rows that read exactly like your text. For example, "detached the drive" finds every detached drive, and "detached the address book" finds every detached address book. Names such as "Address book detached" or "Drive detached" work too.

Search does not look at people's names, the roles in a sentence (such as "member to admin"), the notes at the end of a workflow row (such as "which runs as ben@example.com" or "which can add a Bcc to mail members send"), the date and time, the words **Workspace Assistant** and **MCP client** on the second line, or "a deleted account".

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
- **Invite sent**
- **Invite accepted**
- **Invite declined**
- **Invite revoked**
- **Invite link shown**
- **Workflow created**
- **Workflow edited**
- **Workflow turned on**
- **Workflow turned off**
- **Workflow deleted**

A row's sentence names the kind of resource, such as "detached the drive" or "detached the address book", but the list has one type for all four: **Resource detached from a workspace**. Pick it to see every detached mailbox, calendar, drive and address book.

To clear the filter, pick **All events**.

### Search and filter together

When you use both, a row must match both. If no row matches, the page says "No events match your search."

There is no filter by date. Search and filter only narrow the list. They never show changes this page does not already show.

To see the changes you made yourself across all your workspaces, open your [Security activity](/guide/account/security-activity).
