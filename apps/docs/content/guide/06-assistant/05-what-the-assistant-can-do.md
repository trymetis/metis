---
title: What the assistant can do
description: A plain list of what Workspace AI and the Mail, Calendar, Drive and Contacts AI panels can read and change, and what they never do.
---

This page lists what each assistant can do. The assistants can only reach mailboxes, calendars, drives and address books that have AI turned on. Actions marked **(approval)** wait for you to press **Approve** first. See [Approve or decline actions](/guide/assistant/approve-or-decline-actions).

## Workspace AI

The Workspace Assistant can do everything below, across all the mailboxes, calendars, drives and address books in your workspace that have AI turned on.

### Mail

- See your mailboxes and a combined inbox across them
- List the emails in a folder, and search one mailbox or all of them
- Read an email or a whole conversation, including its headers and original source
- List an email's attachments and read the text inside them (for example a PDF, a calendar invitation, a contact card or a forwarded email)
- Summarize a conversation
- Check an email for phishing (when phishing detection is on for that mailbox in this workspace)
- Mark as read or unread, star, archive and restore
- Delete emails **(approval)**
- List labels, set or clear a label on one or many emails, and create a label
- Delete a label **(approval)**
- Create and update drafts
- Delete a draft **(approval)**
- Send an email **(approval)**
- Snooze, unsnooze and cancel a snooze, and list snoozed emails
- Schedule an email to send later **(approval)**, list scheduled emails, call one back **(approval)** or retry one **(approval)**
- Mute or unmute a conversation, and list muted conversations
- Add to, remove from and list Read later
- Find newsletters you receive, and unsubscribe from them **(approval)**

When the assistant sends an email, schedules one or creates a draft, it adds your default signature for new messages after the text. It leaves the signature out if you ask for none, and may leave it out when the text already ends with a sign-off. Updating a draft never adds a signature. Email it sends or schedules also gets the workspace's mail footer, when it is on. Drafts do not. See [Signatures and the mail footer](/guide/mail/signatures).

When phishing detection is off for a mailbox, the check reports that phishing detection is turned off for this mailbox. If your Metis Suite server has no phishing detection, the assistant cannot check for phishing.

### Signatures

- List the workspace's signatures and mail footer, and, for a mailbox, its signatures and your own signatures for it. The list says which ones you can change.
- Add or edit a signature **(approval)**: a workspace signature (owners and admins only), a mailbox's signature (only the person who connected the mailbox) or your own signature for a mailbox. It can make the signature the default for new messages, for replies and forwards, or both. If you do not mention the defaults when changing a signature, it keeps the ones it has. A new signature is not a default unless you ask.
- Delete a signature **(approval)**. The same people can delete a signature as can change it.
- Set or turn off the workspace's mail footer **(approval)**. Only workspace owners and admins can do this.

Signatures and footers saved by the assistant are cleaned up and limited the same way as on the **Signatures** page. A footer change shows on the workspace's [Activity](/guide/workspaces/workspace-activity) page, marked **Workspace Assistant**. See [Signatures and the mail footer](/guide/mail/signatures).

### Calendar

- List your calendars and events
- Read an event, including who has accepted or declined
- Add, change and delete events **(approval)**
- Reply to an invitation with yes, no or maybe **(approval)**

When the assistant changes an event or replies to an invitation, the other attendees are notified.

### Drive

- List your drives, browse folders and see storage use
- Search all your drives by file name or content
- Read file details and the text of plain text files
- Create a folder, rename, and move within the same drive **(approval)**
- Delete a file or folder **(approval)**. In Google Drive and OneDrive, the item goes to that service's trash. On other drives, it is deleted for good.
- Pin and unpin folders **(approval)**. Pins are personal, so only you see them.

### Contacts

- List your address books
- Search your saved contacts by name, email address, phone number or organization, and open one in full
- Create, change and delete contacts **(approval)**

Contact search finds saved contacts only. People you have only exchanged mail with are found by searching your mail.

### People

- List the members of the workspace and their roles
- Find mail you exchanged with a member, a member's events, and files on drives a member connected

### Workflows

- List workflows and their runs, and open a run to see what happened
- Read the list of workflow triggers and steps, with their settings
- Create, change and turn on or off a workflow **(approval)**
- Delete a workflow **(approval)**. Only workspace owners and admins can delete workflows.
- Run a workflow now, filling in the inputs its **Run by hand** trigger asks for **(approval)**
- Cancel a run or retry its failed steps **(approval)**
- Try an Ask step on recent mail, to see how it would sort it (when your server offers Ask and Branch steps)

See [Workflows](/guide/workflows) for what workflows are.

### Workspace administration

Only for workspace owners and admins:

- List pending invitations, and revoke one **(approval)**
- Remove a member **(approval)**
- Change the workspace accent color **(approval)**

## Mail AI, Calendar AI, Drive AI and Contacts AI

The side panels can do less than the Workspace Assistant. Each one works only with the mailbox, calendar, drive or address book you have open.

| Panel           | Can read                                                                                                           | Can change                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Mail AI**     | List and search emails, read an email, check an email for phishing (when phishing detection is on for the mailbox) | Star or unstar, set a label that already exists, delete emails **(approval)**  |
| **Calendar AI** | List calendars and events, read an event                                                                           | Add, change and delete events, reply to invitations (all **approval**)         |
| **Drive AI**    | List drives, browse folders, search files, read file details and plain text files                                  | Create a folder, rename, move within the same drive, delete (all **approval**) |
| **Contacts AI** | List address books and groups, search contacts, read a contact                                                     | Create, change and delete contacts (all **approval**)                          |

Mail AI cannot send email or save drafts. When you ask it to draft a reply, it writes the text in the chat.

## What the assistants never do

On purpose, no assistant can:

- Upload files or create share links
- Turn AI on or off
- Change calendar visibility, which drive folders a workspace sees, or which address books a workspace shows
- Add or remove mailboxes, calendars, drives and address books from a workspace, or join a workspace
- Change MCP client settings
- Change member roles, send workspace invitations or change the workspace logo
- Do anything that needs your two-factor code
- Decide what happened to a send, or another change, whose outcome is unclear. You resolve that yourself: a scheduled message in the mailbox (see [Mail](/guide/mail)), and a workflow step from the run's details (see [Resolve a step with an unconfirmed outcome](/guide/workflows/cancel-and-retry-runs#resolve-a-step-with-an-unconfirmed-outcome)).
