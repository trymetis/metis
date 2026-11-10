---
title: Security activity
description: See the security-relevant changes you made, and the changes other people made to your place in a workspace.
---

The **Security activity** card lists security-relevant changes that involve you. Check it to make sure every change is one you expected.

It shows two kinds of change:

- **Changes you made.** For example, you turned off two-factor authentication, approved an MCP client, removed a member or sent an invite.
- **Changes other people made to you.** Someone changed your role in a workspace, removed you from a workspace, made you the owner of a workspace, changed your instance role, banned or unbanned your account, or detached your mailbox, calendar, drive or address book from a workspace.

Metis Suite records only the changes in the [list below](#what-is-recorded). Each one is recorded after it succeeds. Signing in and everyday use, such as reading mail or opening files, are not recorded. The content of your mail, events, files and contacts is never recorded.

To find out each time someone signs in to your account, use [sign-in alerts](/guide/account/sign-in-alerts) instead. They send you an email for every sign-in.

## Open Security activity

1. Open your user menu (the round button with your initials at the bottom of the left rail) and click **Settings**.
2. Click **Security**.
3. Scroll down to the **Security activity** card. It is below **Disable two-factor authentication** and above **Delete account**.

The card says "Security-relevant changes you made, and changes other people made to your membership. Your server’s operator decides how long these are kept." If nothing has been recorded yet, it says "No security activity yet."

## What each row shows

Each row is one change, shown on two lines.

The first line is one sentence. It starts with who made the change and says what they did. For example:

- "Alice Martin changed Bob Lee's role from member to admin"
- "Alice Martin invited carol@example.com to Design as an admin"
- "Alice Martin revoked the invite for carol@example.com to Design"
- "Alice Martin removed the drive alice@example.com and revoked its access at the provider"
- "Alice Martin turned off sign-in alerts"

The table under [What is recorded](#what-is-recorded) shows how each kind of row reads.

How people are named in the sentence:

- **The person who made the change, and a member it was done to,** are shown by the name on their account today.
- **If the account has no name, or it was deleted,** the row shows their email address instead.
- **If neither is known,** the row says "A deleted account" (or "a deleted account" in the middle of the sentence).
- **Invited people, MCP clients, mailboxes, calendars, drives, connected accounts and workflows** are shown as they were named when the change was made, such as an email address, a client's name or a workflow's name.

The second line is smaller and lighter. It lists these parts, separated by a dot (·), leaving out any that do not apply:

- **The workspace**, when the change happened in one. Changes in a workspace that was deleted later still show its name.
- **Where the change came from**, if it came from an AI tool: **Workspace Assistant** when the assistant made it for you, or **MCP client** when an outside AI app made it. A change you made yourself in the app shows nothing here.
- **When** it happened (date and time).
- **The network address** (IP address) and **the device**, such as "Chrome 130 on Windows", when Metis Suite knows them.

The newest change is at the top. The card shows 50 rows at a time. Click **Load more** to see older ones. You cannot edit or delete rows.

## Search and filter

Above the list are a search box ("Search events") and a list of event types, which starts at **All events**. Use them to find one change without scrolling.

<img src="/images/account/security-activity.webp" alt="The Security activity card with its title and text, the search box, the event type list set to All events, and the first events" class="dark:hidden" />
<img src="/images/account/security-activity-dark.webp" alt="The Security activity card with its title and text, the search box, the event type list set to All events, and the first events" class="hidden dark:block" />

### Search

Type in the search box. The list updates shortly after you stop typing. While it loads, a small spinner shows at the right of the box, and the old list stays on screen until the new one is ready.

Search looks through all your security activity, not only the rows already on screen. **Load more** then shows older matches, 50 at a time, newest first.

Search finds rows where your text appears in:

- the event type, such as **Member removed** or **Workspace invite revoked**. These are the names in the [event type list](#filter-by-event-type);
- the fixed words of the sentence, without the names, email addresses, workspaces, roles, tools or versions in it. For example, "revoked the invite", "turned off", "role from" and "accepted the invite" all find rows, but "role from member" does not;
- what the change was about: the invited person's or member's email address, the client's name, the email address of the mailbox, calendar, drive or address book, the workflow's name, or the versions of an undone upgrade;
- the email address of the person who made the change. Their name is not searched;
- the workspace's name;
- the IP address.

A search for the sentence's words finds every change of that type, not only rows that read exactly like your text. For example, "revoked its access at the provider" finds every removed mailbox, calendar, drive and address book, also the ones whose access was not revoked. Names such as "Address book removed" or "Address book detached" find every removed or detached address book.

Search does not look at:

- people's names. Search for their email address instead;
- the roles and the names of tools in a sentence, such as "member to admin";
- the notes at the end of a workflow row, such as "which runs as ben@example.com" or "which can add a Bcc to mail members send";
- the device, such as "Chrome 130 on Windows";
- the date and time;
- the words **Workspace Assistant** and **MCP client** on the second line. Typing "MCP client" still finds rows whose event type or sentence contains it, such as **MCP client approved** or "added the MCP client";
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
- **Mail footer changed**
- **Workspace invite sent**
- **Workspace invite revoked**
- **Sign-up invite sent**
- **Sign-up invite revoked**
- **Invite sent**
- **Invite accepted**
- **Invite declined**
- **Invite revoked**
- **Invite link shown**
- **Instance role granted**
- **Instance role revoked**
- **User banned**
- **User unbanned**
- **User removed**
- **Instance upgrade undone**
- **Workflow created**
- **Workflow edited**
- **Workflow turned on**
- **Workflow turned off**
- **Workflow deleted**

A row's sentence names the kind of resource, such as "removed the mailbox", "detached the drive" or "removed the address book". The list uses one type for all four kinds:

- **Resource removed** shows every removed mailbox, calendar, drive and address book.
- **Resource detached from a workspace** shows every detached mailbox, calendar, drive and address book.

To clear the filter, pick **All events**.

### Search and filter together

When you use both, a row must match both. If no row matches, the card says "No events match your search."

There is no filter by date. Search and filter only narrow the list. They never show changes you could not already see here.

## What is recorded

The **Event type** column holds the names in the [event type list](#filter-by-event-type). **Account deleted** is only in the list of the dashboard's audit log. Search also finds rows by these names. They do not appear on the rows themselves. In the **The row reads** column, "…" stands for the person who made the change.

| Event type                             | The row reads                                                                          | Recorded when                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account deleted**                    | "… deleted their account"                                                              | Someone deletes their Metis Suite account. If workspaces were deleted with it, the row adds how many, for example "and 2 workspaces with it". Only the dashboard's audit log shows this row. See [Delete your account](/guide/account/delete-your-account).                                                               |
| **Two-factor authentication disabled** | "… turned off two-factor authentication"                                               | Someone clicks **Disable 2FA** and confirms. See [Two-factor authentication](/guide/account/two-factor-authentication#turn-two-factor-authentication-off-and-on-again).                                                                                                                                                   |
| **Sign-in alerts turned off**          | "… turned off sign-in alerts"                                                          | Someone turns off the **Sign-in alerts** switch. Turning it back on is not recorded. See [Sign-in alerts](/guide/account/sign-in-alerts#turn-sign-in-alerts-off-or-on).                                                                                                                                                   |
| **MCP client added**                   | "… added the MCP client Notes App"                                                     | Someone adds an MCP client by hand under **Settings**, **MCP clients**.                                                                                                                                                                                                                                                   |
| **MCP client approved**                | "… approved the MCP client Notes App"                                                  | Someone approves an AI app's request to connect. If sensitive tools were turned on too, the row adds "with sensitive tools" and their names.                                                                                                                                                                              |
| **MCP client re-enabled**              | "… re-enabled the MCP client Notes App"                                                | Someone turns a client that was off back on.                                                                                                                                                                                                                                                                              |
| **Sensitive MCP tools turned on**      | "… turned on sensitive tools for Notes App", followed by the tools' names              | Someone turns on one or more sensitive tools for a client. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).                                                                                                                                                                                                 |
| **Account disconnected**               | "… disconnected alice@example.com"                                                     | Someone disconnects a connected account.                                                                                                                                                                                                                                                                                  |
| **Resource removed**                   | "… removed the drive alice@example.com"                                                | Someone deletes a mailbox, calendar, drive or address book from their account settings. If Metis Suite also took back its access at the provider, the row adds "and revoked its access at the provider". See [Manage your connected accounts](/guide/workspaces/manage-connected-accounts).                               |
| **Resource detached from a workspace** | "… detached the calendar alice@example.com from Design"                                | Someone takes a mailbox, calendar, drive or address book out of one workspace. This can happen in account settings, on the workspace's **Mailboxes**, **Calendars**, **Drives** or **Contacts** page, or with **Detach from this workspace** in search.                                                                   |
| **Member role changed**                | "… changed Bob Lee's role from member to admin"                                        | The owner changes a member's role.                                                                                                                                                                                                                                                                                        |
| **Member removed**                     | "… removed Bob Lee from Design"                                                        | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                                                                                       |
| **Ownership transferred**              | "… transferred ownership of Design to Bob Lee"                                         | The owner makes another member the owner.                                                                                                                                                                                                                                                                                 |
| **Workspace deleted**                  | "… deleted the workspace Design"                                                       | The owner deletes a workspace.                                                                                                                                                                                                                                                                                            |
| **Mail footer changed**                | "… changed the mail footer in Design" or "… turned off the mail footer in Design"      | A workspace owner or admin changes the mail footer's text or turns it on or off. If the footer is on after the change, the row reads "changed". If it is off, the row reads "turned off". Saving with nothing changed is not recorded. See [The workspace mail footer](/guide/mail/signatures#the-workspace-mail-footer). |
| **Workspace invite sent**              | "… invited carol@example.com to Design as an admin"                                    | Shows on older rows only. New invites are recorded as **Invite sent**.                                                                                                                                                                                                                                                    |
| **Workspace invite revoked**           | "… revoked the invite for carol@example.com to Design"                                 | Shows on older rows only. New revokes are recorded as **Invite revoked**.                                                                                                                                                                                                                                                 |
| **Sign-up invite sent**                | "… sent a sign-up invite to carol@example.com"                                         | Shows on older rows only. New invites are recorded as **Invite sent**.                                                                                                                                                                                                                                                    |
| **Sign-up invite revoked**             | "… revoked the sign-up invite for carol@example.com"                                   | Shows on older rows only. New revokes are recorded as **Invite revoked**.                                                                                                                                                                                                                                                 |
| **Invite sent**                        | "… invited carol@example.com to Design as an admin"                                    | Someone sends an invite. A workspace invite names the workspace and the role. An account invite names the instance role it gives when that role is admin or observer, for example "… invited carol@example.com as an instance observer". See [How invites work](/guide/account/invite-people).                            |
| **Invite accepted**                    | "… accepted the invite to Design as a member"                                          | Someone accepts a workspace invite, or creates their account from an invite. The row starts with that person's name.                                                                                                                                                                                                      |
| **Invite declined**                    | "… declined the invite to Design as a member"                                          | Someone declines a workspace invite. The row starts with that person's name.                                                                                                                                                                                                                                              |
| **Invite revoked**                     | "… revoked the invite for carol@example.com to Design"                                 | Someone cancels a pending invite. For an account invite, the row names no workspace.                                                                                                                                                                                                                                      |
| **Invite link shown**                  | "… was shown the invite link for carol@example.com because the email couldn't be sent" | The invite email could not be sent, so the instance owner was shown the invite link to send it themselves.                                                                                                                                                                                                                |
| **Instance role granted**              | "… made Bob Lee an instance admin (was observer)"                                      | The instance owner or an instance admin makes someone an admin or observer, or switches them between the two. The parentheses show the role they had, if they were an admin or observer before. It is also recorded when someone creates their account from an invite that makes them an admin or observer.               |
| **Instance role revoked**              | "… removed Bob Lee's instance role (observer)"                                         | The instance owner or an instance admin makes someone a user, so they no longer reach the dashboard. The parentheses show the role they had.                                                                                                                                                                              |
| **User banned**                        | "… banned Bob Lee until 2026-11-16 (Spam)"                                             | The instance owner or an instance admin bans an account in the dashboard. The date (year, month and day, in UTC) shows only for a ban with an end date. The reason in parentheses shows only if one was given.                                                                                                            |
| **User unbanned**                      | "… unbanned Bob Lee"                                                                   | The instance owner or an instance admin lifts a ban in the dashboard. A ban that ends by itself is not recorded.                                                                                                                                                                                                          |
| **User removed**                       | "… removed the user bob@example.com"                                                   | The instance owner or an instance admin removes someone's account in the dashboard.                                                                                                                                                                                                                                       |
| **Instance upgrade undone**            | "… undid the last upgrade (0.2.3 → 0.2.2)"                                             | The instance owner or an instance admin undoes the last upgrade of the server. The parentheses hold the version the undo left and the version it returned to. Only the person who undid it sees this row here. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo#undo-the-last-upgrade).                      |
| **Workflow created**                   | "… created the workflow Forward invoices"                                              | Someone creates a workflow. See [the notes a workflow row can end with](#workflow-rows).                                                                                                                                                                                                                                  |
| **Workflow edited**                    | "… edited the workflow Forward invoices"                                               | Someone saves changes to a workflow.                                                                                                                                                                                                                                                                                      |
| **Workflow turned on**                 | "… turned on the workflow Forward invoices"                                            | Someone turns a workflow on.                                                                                                                                                                                                                                                                                              |
| **Workflow turned off**                | "… turned off the workflow Forward invoices"                                           | Someone turns a workflow off.                                                                                                                                                                                                                                                                                             |
| **Workflow deleted**                   | "… deleted the workflow Forward invoices"                                              | Someone deletes a workflow.                                                                                                                                                                                                                                                                                               |

You see a row only if you made the change or it was made to you.

### Workflow rows

A workflow row can end with one or two notes:

- ", which runs as ben@example.com" when the workflow runs as someone other than the person who made the change. See [Who a workflow runs as](/guide/workflows/how-workflows-work#who-a-workflow-runs-as).
- ", which can add a Bcc to mail members send" when the workflow starts with **Before mail is sent**. See [Add a BCC to outgoing mail](/guide/workflows/add-a-bcc-to-outgoing-mail).

With both, the row reads, for example, "Ana Lopez edited the workflow Forward invoices, which runs as ben@example.com and which can add a Bcc to mail members send". The person a workflow runs as sees the row in their own Security activity only if they made the change. Workspace owners and admins see every workflow row of their workspace on its **Activity** page.

## Who else can see these changes

- **Workspace owners and admins** see the changes made in their workspace on its **Activity** page, without IP addresses or devices. See [Workspace activity](/guide/workspaces/workspace-activity).
- **The instance owner, instance admins and instance observers** see every recorded change by every user in the dashboard's audit log, with IP addresses and devices.

## How long rows are kept

The person who runs your Metis Suite server decides how long rows are kept. Older rows are deleted after that time.

To keep your own copy, [export your data](/guide/account/export-your-data). The file holds every row of your security activity.

## If you see a change you did not make

Act quickly:

- Sign out every browser you do not recognize. See [Manage signed-in devices](/guide/account/signed-in-devices).
- Change your password. See [Change or reset your password](/guide/account/change-or-reset-your-password).
- Check your MCP clients, and turn off or remove any you do not know. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).
- If the change happened in a workspace, tell its owner or an admin.

A [sign-in alert](/guide/account/sign-in-alerts) can warn you sooner. If you get one for a sign-in you did not make, follow the same steps. If you see a row that says someone "turned off sign-in alerts" and you did not turn them off, turn them back on.
