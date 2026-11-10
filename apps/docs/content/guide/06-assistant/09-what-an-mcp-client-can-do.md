---
title: What an MCP client can do
description: The tools an MCP client can use, which ones are sensitive, and the rules every client follows.
---

An MCP client can use the same kinds of tools as the Workspace Assistant, plus a few for your workspaces and your account. You choose which tools each client may use on its page under **Settings**, **MCP clients**. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).

## Rules every client follows

- **It acts as you.** A client can only reach what you can reach yourself.
- **It works in one workspace at a time.** Each request for mail, calendars, drives, contacts or workflows names a workspace. The client finds your workspaces with **List workspaces**. If it asks for a workspace it cannot reach, the request is refused with a list of the workspaces it can reach.
- **AI switches apply.** A client cannot reach a workspace with AI off, or a mailbox, calendar, drive or address book with AI off. See [How AI works in Metis Suite](/guide/assistant/how-ai-works).
- **Hidden workspaces are out of reach.** A workspace you turned off for this client cannot be used.
- **There is no approval card.** A sensitive tool works only after you turn it on for that client. Once it is on, the client can use it without asking you.
- **Some actions follow workspace roles.** For example, only workspace owners and admins can delete workflows or remove members, whether they use a client or not.
- **It cannot change its own access.** No tool changes your AI switches or any client's settings.
- **Requests are limited.** If a client sends too many requests in a minute, it is told to wait and try again.

## Non-sensitive tools

These are on for a new client. They read and organize your mail, calendars, drives and contacts.

| Group                 | What the client can do                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspaces**        | List your workspaces, and open one to see its members and the mailboxes, calendars, drives and address books with AI on there                                                                                                                                       |
| **Account**           | List your connected accounts with their mailboxes, calendars, drives and address books, and see which accounts are unavailable. If you are the instance owner, an instance admin or an instance observer, also list the account invites (**List sign-up invites**). |
| **Mailboxes**         | List mailboxes                                                                                                                                                                                                                                                      |
| **Messages**          | See a combined inbox, list emails, read an email or a whole conversation, read the original source, list and read attachments, summarize a conversation, and check an email for phishing (when phishing detection is on for that mailbox in the workspace)          |
| **Search**            | Search mail                                                                                                                                                                                                                                                         |
| **Actions**           | Mark as read or unread, star, archive and restore emails                                                                                                                                                                                                            |
| **Labels**            | List labels, set or clear labels, and create a label                                                                                                                                                                                                                |
| **Drafts**            | Create and update drafts                                                                                                                                                                                                                                            |
| **Snooze & schedule** | Snooze, unsnooze and cancel a snooze, list snoozed emails, and list scheduled emails                                                                                                                                                                                |
| **Triage**            | Mute and unmute conversations, use Read later, and find newsletters                                                                                                                                                                                                 |
| **Workflows**         | List workflows and runs, open a run, list the workflow triggers and steps with their settings, and try an Ask step on recent mail (when your server offers Ask and Branch steps)                                                                                    |
| **Calendar**          | List calendars and events, and read an event with attendee responses                                                                                                                                                                                                |
| **Contacts**          | List address books, search saved contacts by name, email address, phone number or organization, and read a contact                                                                                                                                                  |
| **People**            | List members and their roles, and find mail, events and files linked to a member                                                                                                                                                                                    |
| **Drive**             | List drives, browse folders, search files, read file details and text files, see storage use, and pin or unpin folders                                                                                                                                              |
| **Workspace admin**   | List pending workspace invitations (owners and admins only)                                                                                                                                                                                                         |
| **Signatures**        | List the workspace's signatures and mail footer, and, for a mailbox, its signatures and your own signatures for it, with which ones you can change (**List signatures**)                                                                                            |

## Sensitive tools

These are off for a new client. Turn on only the ones you need.

| Group                 | Tools                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspaces**        | **Create workspace**, **Attach to workspace**                                                                                                             |
| **Account**           | **Send sign-up invite**, **Revoke sign-up invite** (only if you are the instance owner or an instance admin)                                              |
| **Actions**           | **Delete emails**, **Send email**                                                                                                                         |
| **Labels**            | **Delete label**                                                                                                                                          |
| **Drafts**            | **Delete draft**                                                                                                                                          |
| **Snooze & schedule** | **Schedule email**, **Cancel scheduled**, **Retry scheduled**                                                                                             |
| **Triage**            | **Unsubscribe**                                                                                                                                           |
| **Workflows**         | **Create workflow**, **Update workflow**, **Toggle workflow**, **Delete workflow**, **Run workflow now**, **Cancel workflow run**, **Retry workflow run** |
| **Calendar**          | **Create event**, **Update event**, **Delete event**, **Respond to invite**                                                                               |
| **Contacts**          | **Create contact**, **Edit contact**, **Delete contact**                                                                                                  |
| **Drive**             | **Create folder**, **Rename file**, **Move file**, **Delete file**                                                                                        |
| **Workspace admin**   | **Revoke invite**, **Remove member**, **Change accent color**                                                                                             |
| **Signatures**        | **Save signature**, **Delete signature**, **Set mail footer**                                                                                             |

**Save signature** adds or edits a workspace signature (owners and admins only), a mailbox's signature (only the person who connected the mailbox) or your own signature for a mailbox. It can make the signature the default for new messages, for replies and forwards, or both. When a client edits a signature without setting the defaults, the signature keeps the ones it has. A new signature is not a default unless the client sets one. **Delete signature** follows the same rules. **Set mail footer** sets or turns off the workspace's mail footer, and only works for workspace owners and admins. Signatures and footers saved by a client are cleaned up and limited the same way as on the **Signatures** page. A footer change shows on the workspace's [Activity](/guide/workspaces/workspace-activity) page, marked **MCP client**.

When a client uses **Send email**, **Schedule email** or **Create draft**, your default signature for new messages is added after the text, unless the client asks for none. **Update draft** never adds a signature. Email sent with **Send email** or **Schedule email** also gets the workspace's mail footer, when it is on. Drafts do not. See [Signatures and the mail footer](/guide/mail/signatures).

When a client creates, changes or deletes an event, or responds to an invitation, the attendees are notified. A contact a client creates, changes or deletes is changed at your provider, the same as in Contacts. A client can move files only within the same drive. **Attach to workspace** adds one of your own mailboxes, calendars, drives or address books to a workspace, with AI off for it there. What a client attaches is visible to every member of that workspace. An address book it attaches shows no contacts until someone switches its address books on. See [Show and hide address books](/guide/contacts/show-and-hide-address-books).

## Account invites

**List sign-up invites** appears if you are the instance owner, an instance admin or an instance observer. For each account invite, it returns the email, the instance role it gives, who sent it, when it expires and whether it expired, plus how many invites it found. The client can narrow the list by email, by role (admin, observer or none) and by status (pending or expired). **Send sign-up invite** and **Revoke sign-up invite** appear only if you are the instance owner or an instance admin. An invite sent by a client always makes the new account a plain user, never an admin or observer. If the invite email cannot be sent, no invite is created, and the client is never given an invite link. See [How invites work](/guide/account/invite-people).

## Tools for the instance dashboard

If you are the instance owner, an instance admin or an instance observer, your clients also see tools in the **Instance (dashboard)** and **System (dashboard)** groups. They give read-only views of the server, such as totals, AI usage, people, workspaces, settings and warnings.

- **Instance people** counts the accounts, how many have two-factor authentication on, how many are banned, and the pending account and workspace invites. It also lists the newest accounts.
- **Instance users** lists every account. For each one, it gives the name, email, instance role (owner, admin, observer or user), creation date and last sign-in. It also says whether two-factor authentication is on, how many workspaces the account owns, and whether the account is banned, with the reason and, for a ban with an end date, when it ends. The client can narrow the list by name or email, by role, by status (active or banned) and by two-factor authentication (on or off). Pending account invites are listed by **List sign-up invites** instead. The client cannot change instance roles, ban or remove users. That is done in the dashboard, under **Accounts**, **Users**.
- **Audit log** reads the server's audit log of security-relevant changes, 50 at a time, without IP addresses or devices. Each event comes with a one-sentence description of the change, the same one the dashboard shows.
- Secret settings are only reported as set or not set.

**Run health check** is a sensitive tool. Only the instance owner and instance admins see it. Users with no access to the dashboard never see any of these tools.

## What a client can never do

Like the in-app assistants, an MCP client cannot upload files or create share links. It cannot change AI switches, calendar visibility, drive folders or which address books a workspace shows. It cannot change member roles, send workspace invitations, or do anything that needs your two-factor code. See [What the assistant can do](/guide/assistant/what-the-assistant-can-do).
