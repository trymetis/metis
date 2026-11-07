---
title: What an MCP client can do
description: The tools an MCP client can use, which ones are sensitive, and the rules every client follows.
---

An MCP client can use the same kinds of tools as the Workspace Assistant, plus a few for your workspaces and your account. You choose which tools each client may use on its page under **Settings**, **MCP clients**. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).

## Rules every client follows

- **It acts as you.** A client can only reach what you can reach yourself.
- **It works in one workspace at a time.** Each request names a workspace. The client finds your workspaces with **List workspaces**. If it asks for a workspace it cannot reach, the request is refused with a list of the workspaces it can reach.
- **AI switches apply.** A client cannot reach a workspace with AI off, or a mailbox, calendar, drive or address book with AI off. See [How AI works in Metis Suite](/guide/assistant/how-ai-works).
- **Hidden workspaces are out of reach.** A workspace you turned off for this client cannot be used.
- **There is no approval card.** A sensitive tool works only after you turn it on for that client. Once it is on, the client can use it without asking you.
- **Some actions follow workspace roles.** For example, only workspace owners and admins can delete workflows or remove members, whether they use a client or not.
- **It cannot change its own access.** No tool changes your AI switches or any client's settings.
- **Requests are limited.** If a client sends too many requests in a minute, it is told to wait and try again.

## Non-sensitive tools

These are on for a new client. They read and organize your mail, calendars, drives and contacts.

| Group                 | What the client can do                                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspaces**        | List your workspaces, and open one to see its members and the mailboxes, calendars, drives and address books with AI on there                                                                                                                              |
| **Account**           | List your connected accounts with their mailboxes, calendars, drives and address books, see which accounts are unavailable, and list your sign-up invitations                                                                                              |
| **Mailboxes**         | List mailboxes                                                                                                                                                                                                                                             |
| **Messages**          | See a combined inbox, list emails, read an email or a whole conversation, read the original source, list and read attachments, summarize a conversation, and check an email for phishing (when phishing detection is on for that mailbox in the workspace) |
| **Search**            | Search mail                                                                                                                                                                                                                                                |
| **Actions**           | Mark as read or unread, star, archive and restore emails                                                                                                                                                                                                   |
| **Labels**            | List labels, set or clear labels, and create a label                                                                                                                                                                                                       |
| **Drafts**            | Create and update drafts                                                                                                                                                                                                                                   |
| **Snooze & schedule** | Snooze, unsnooze and cancel a snooze, list snoozed emails, and list scheduled emails                                                                                                                                                                       |
| **Triage**            | Mute and unmute conversations, use Read later, and find newsletters                                                                                                                                                                                        |
| **Workflows**         | List workflows and runs, open a run, list the workflow triggers and steps with their settings, and try an Ask step on recent mail (when your server offers Ask and Branch steps)                                                                           |
| **Calendar**          | List calendars and events, and read an event with attendee responses                                                                                                                                                                                       |
| **Contacts**          | List address books, search saved contacts by name, email address, phone number or organization, and read a contact                                                                                                                                         |
| **People**            | List members and their roles, and find mail, events and files linked to a member                                                                                                                                                                           |
| **Drive**             | List drives, browse folders, search files, read file details and text files, see storage use, and pin or unpin folders                                                                                                                                     |
| **Workspace admin**   | List pending workspace invitations (owners and admins only)                                                                                                                                                                                                |

## Sensitive tools

These are off for a new client. Turn on only the ones you need.

| Group                 | Tools                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspaces**        | **Create workspace**, **Attach to workspace**                                                                                                             |
| **Account**           | **Send sign-up invite**, **Revoke sign-up invite**                                                                                                        |
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

When a client creates, changes or deletes an event, or responds to an invitation, the attendees are notified. A contact a client creates, changes or deletes is changed at your provider, the same as in Contacts. A client can move files only within the same drive. **Attach to workspace** adds one of your own mailboxes, calendars, drives or address books to a workspace, with AI off for it there. What a client attaches is visible to every member of that workspace. An address book it attaches shows no contacts until someone switches its address books on. See [Show and hide address books](/guide/contacts/show-and-hide-address-books).

## Tools for the server owner

If you are the owner of your Metis Suite server, your clients also see tools in the **Instance (owner)** and **System (owner)** groups. They give read-only views of the server, such as totals, AI usage, people, workspaces, settings and warnings. **Audit log** reads the server's audit log of security-relevant changes, 50 at a time, without IP addresses or devices. Each event comes with a one-sentence description of the change, the same one the dashboard shows. Secret settings are only reported as set or not set. **Run health check** is a sensitive tool. Other people never see these tools.

## What a client can never do

Like the in-app assistants, an MCP client cannot upload files or create share links. It cannot change AI switches, calendar visibility, drive folders or which address books a workspace shows. It cannot change member roles, send workspace invitations, or do anything that needs your two-factor code. See [What the assistant can do](/guide/assistant/what-the-assistant-can-do).
