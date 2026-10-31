---
title: Security activity
description: See the security-relevant changes you made, and the changes other people made to your place in a workspace.
---

The **Security activity** card lists security-relevant changes that involve you. Check it to make sure every change is one you expected.

It shows two kinds of change:

- **Changes you made.** For example, you turned off two-factor authentication, approved an MCP client, removed a member or sent an invite.
- **Changes other people made to you.** Someone changed your role in a workspace, removed you from a workspace, made you the owner of a workspace, or detached your mailbox, calendar or drive from a workspace.

Metis Suite records only the changes in the [list below](#what-is-recorded). Each one is recorded after it succeeds. Signing in and everyday use, such as reading mail or opening files, are not recorded. The content of your mail, events and files is never recorded.

To find out each time someone signs in to your account, use [sign-in alerts](/guide/account/sign-in-alerts) instead. They send you an email for every sign-in.

## Open Security activity

1. Open your user menu (the round button with your initials at the bottom of the left rail) and click **Settings**.
2. Click **Security**.
3. Scroll down to the **Security activity** card. It is below **Disable two-factor authentication** and above **Delete account**.

The card says "Security-relevant changes you made, and changes other people made to your membership. Your server’s operator decides how long these are kept." If nothing has been recorded yet, it says "No security activity yet."

## What each row shows

Each row is one change:

- **What happened**, such as **Member role changed** or **Workspace invite sent**.
- **A badge** if the change came from an AI tool: **Workspace Assistant** when the assistant made it for you, or **MCP client** when an outside AI app made it. A change you made yourself in the app has no badge.
- **What it was about**, such as an email address or a client's name. Some rows add more:
  - a role change shows the old and new role, for example "member → admin";
  - a workspace invite shows the role, "as admin" or "as member";
  - an MCP client row lists the sensitive tools that were turned on;
  - a removed mailbox, calendar or drive says "access revoked at the provider" when Metis Suite also took back its access at the provider.
- **Who made the change**: "by" and their email address. If the account no longer exists and its address is unknown, the row says "by a deleted account".
- **The workspace**, when the change happened in one. Changes in a workspace that was deleted later still show its name.
- **When** it happened (date and time).
- **Where it came from**: the network address (IP address) and the device, such as "Chrome 130 on Windows", when Metis Suite knows them.

The newest change is at the top. The card shows 50 rows at a time. Click **Load more** to see older ones. You cannot edit or delete rows.

## Search and filter

Above the list are a search box ("Search events") and a list of event types, which starts at **All events**. Use them to find one change without scrolling.

<img src="/images/account/security-activity.webp" alt="The Security activity card with the search box, the event type list set to All events, and the empty state" class="dark:hidden" />
<img src="/images/account/security-activity-dark.webp" alt="The Security activity card with the search box, the event type list set to All events, and the empty state" class="hidden dark:block" />

### Search

Type in the search box. The list updates shortly after you stop typing. While it loads, a small spinner shows at the right of the box, and the old list stays on screen until the new one is ready.

Search looks through all your security activity, not only the rows already on screen. **Load more** then shows older matches, 50 at a time, newest first.

Search finds rows where your text appears in:

- the row title, such as **Member removed** or **Drive detached**;
- what the change was about, such as an email address or a client's name;
- the email address of the person who made the change;
- the workspace's name;
- the IP address.

Search does not look at:

- the extra details on a row: the role change ("member → admin"), the invite role ("as admin"), the sensitive tools, or "access revoked at the provider";
- the device, such as "Chrome 130 on Windows";
- the date and time;
- the **Workspace Assistant** and **MCP client** badges. Typing "MCP client" still finds rows whose title contains it, such as **MCP client approved**;
- "a deleted account".

How the text is matched:

- Your whole text is matched as one phrase, anywhere inside a field. For example, "invite rev" finds **Workspace invite revoked**. Words are not matched one by one, so "revoked invite" does not find it.
- Spaces at the start and end are ignored.
- Upper and lower case count as the same for the letters A to Z. Other letters, such as letters with accents, must match in case too.
- You can type up to 200 characters.

To clear the search, empty the search box.

### Filter by event type

Pick a type to show only those rows:

- **Two-factor authentication disabled**
- **Sign-in alerts turned off**
- **MCP client added**
- **MCP client approved**
- **MCP client re-enabled**
- **Sensitive MCP tools turned on**
- **Account disconnected**
- **Resource removed**
- **Resource detached from a workspace**
- **Member role changed**
- **Member removed**
- **Ownership transferred**
- **Workspace deleted**
- **Workspace invite sent**
- **Workspace invite revoked**
- **Sign-up invite sent**
- **Sign-up invite revoked**
- **Instance upgrade undone**

Rows name the kind of resource, such as **Mailbox removed** or **Drive detached**. The list uses one type for all three kinds:

- **Resource removed** shows every removed mailbox, calendar and drive.
- **Resource detached from a workspace** shows every detached mailbox, calendar and drive.

To clear the filter, pick **All events**.

### Search and filter together

When you use both, a row must match both. If no row matches, the card says "No events match your search."

There is no filter by date. Search and filter only narrow the list. They never show changes you could not already see here.

## What is recorded

| Row title                                                       | Recorded when                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Account deleted**                                             | Someone deletes their Metis Suite account. Only the owner of your Metis Suite server sees this row. See [Delete your account](/guide/account/delete-your-account).                                                                                                 |
| **Two-factor authentication disabled**                          | Someone clicks **Disable 2FA** and confirms. See [Two-factor authentication](/guide/account/two-factor-authentication#turn-two-factor-authentication-off-and-on-again).                                                                                            |
| **Sign-in alerts turned off**                                   | Someone turns off the **Sign-in alerts** switch. Turning it back on is not recorded. See [Sign-in alerts](/guide/account/sign-in-alerts#turn-sign-in-alerts-off-or-on).                                                                                            |
| **MCP client added**                                            | Someone adds an MCP client by hand under **Settings**, **MCP clients**.                                                                                                                                                                                            |
| **MCP client approved**                                         | Someone approves an AI app's request to connect.                                                                                                                                                                                                                   |
| **MCP client re-enabled**                                       | Someone turns a client that was off back on.                                                                                                                                                                                                                       |
| **Sensitive MCP tools turned on**                               | Someone turns on one or more sensitive tools for a client. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).                                                                                                                                          |
| **Account disconnected**                                        | Someone disconnects a connected account.                                                                                                                                                                                                                           |
| **Mailbox removed**, **Calendar removed**, **Drive removed**    | Someone deletes a mailbox, calendar or drive from their account settings. See [Manage your connected accounts](/guide/workspaces/manage-connected-accounts).                                                                                                       |
| **Mailbox detached**, **Calendar detached**, **Drive detached** | Someone takes a mailbox, calendar or drive out of one workspace. This can happen in account settings, on the workspace's **Mailboxes**, **Calendars** or **Drives** page, or with **Detach from this workspace** in search.                                        |
| **Member role changed**                                         | The owner changes a member's role.                                                                                                                                                                                                                                 |
| **Member removed**                                              | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                                |
| **Ownership transferred**                                       | The owner makes another member the owner.                                                                                                                                                                                                                          |
| **Workspace deleted**                                           | The owner deletes a workspace.                                                                                                                                                                                                                                     |
| **Workspace invite sent**, **Workspace invite revoked**         | An owner or admin invites someone to a workspace, or cancels a pending invite. See [Members and roles](/guide/workspaces/members-and-roles).                                                                                                                       |
| **Sign-up invite sent**, **Sign-up invite revoked**             | Someone invites a person to create an account, or revokes that invite. See [Invite people to Metis Suite](/guide/account/invite-people).                                                                                                                           |
| **Instance upgrade undone**                                     | The owner of your Metis Suite server undoes the last upgrade of the server. The row shows the version it left and the version it returned to. Only that owner sees this row. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo#undo-the-last-upgrade). |

You see a row only if you made the change or it was made to you.

## Who else can see these changes

- **Workspace owners and admins** see the changes made in their workspace on its **Activity** page, without IP addresses or devices. See [Workspace activity](/guide/workspaces/workspace-activity).
- **The owner of your Metis Suite server** sees every recorded change by every user, with IP addresses and devices.

## How long rows are kept

The person who runs your Metis Suite server decides how long rows are kept. Older rows are deleted after that time.

To keep your own copy, [export your data](/guide/account/export-your-data). The file holds every row of your security activity.

## If you see a change you did not make

Act quickly:

- Sign out every browser you do not recognize. See [Manage signed-in devices](/guide/account/signed-in-devices).
- Change your password. See [Change or reset your password](/guide/account/change-or-reset-your-password).
- Check your MCP clients, and turn off or remove any you do not know. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).
- If the change happened in a workspace, tell its owner or an admin.

A [sign-in alert](/guide/account/sign-in-alerts) can warn you sooner. If you get one for a sign-in you did not make, follow the same steps. If you see **Sign-in alerts turned off** and you did not turn them off, turn them back on.
