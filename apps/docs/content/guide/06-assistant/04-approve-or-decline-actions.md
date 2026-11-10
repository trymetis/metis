---
title: Approve or decline actions
description: How the assistant asks before it sends, deletes or changes something, and which actions need your approval.
---

The assistants can read and search on their own. Before they do something sensitive, such as sending an email or deleting a file, they stop and ask you. Nothing happens until you approve.

## What an approval looks like

When the assistant wants to take a sensitive action, an approval box appears joined to the top of the box where you type your messages. The box has:

- A shield icon and a title that says what will happen, for example "Approve sending "Quarterly report" to sam@example.com from you@example.com". If the action has no title of its own, it says "Approve this before it runs".
- A one-line summary from the assistant of what it is about to do.
- The details of what will run, as labelled fields, for example **Mailbox**, **To** and **Subject**. If there are many fields, you can scroll them.
  - **Mailbox** shows the email address, and **Drive** shows the drive's name.
  - On some drives, a file or folder shows as its path, such as docs/report.pdf.
  - A list of emails or other records shows as a count, such as "3 items".
  - A list of addresses or words shows its first 3 entries, then "+2 more" (or however many are left).
  - Long values are cut short with "…". IDs are not shown.
- The hint "Or type a message below to decline with a reason." It does not show on touch screens.
- Two buttons: **Decline** and **Approve**. When you point at them, they show "Decline (Esc)" and "Approve (Enter)".

<img src="/images/assistant/approval-card.webp" alt="An assistant chat with the approval box above the message box, showing what will run and the Decline and Approve buttons" class="dark:hidden" />
<img src="/images/assistant/approval-card-dark.webp" alt="An assistant chat with the approval box above the message box, showing what will run and the Decline and Approve buttons" class="hidden dark:block" />

Only one approval waits at a time. If the assistant plans several actions that each need approval, it asks for them one after another. When you answer one, the assistant carries on, and the next request appears in the same box.

## Answer an approval

- **Approve:** click **Approve**, or press **Enter**.
- **Decline:** click **Decline**, or press **Escape**.
- **Decline with a reason:** type your reason in the message box and send it. This declines the approval and gives the assistant your text as the reason. It is not sent as a new chat message.

**Enter** and **Escape** work from anywhere on the page, but not while you are typing in a text box or an editor.

After you answer, the assistant carries on by itself.

## Tool calls in the chat

Each thing the assistant does, such as a search or a sent email, shows as a row in its reply. These rows are called tool calls. Each row has an icon and a short status text:

- While an approval waits, the row says "Waiting for your approval", with a shield icon.
- After you approve, it says "Approved, running...", then the result. For example, a sent email shows "Sent "Quarterly report" to sam@example.com".
- After you decline, it says "Declined, nothing changed" in red.
- If a step fails, it shows the reason in red, or "That step didn't work".

A row with details has a small arrow right after its text. Click it to see what the step was given and, once it is done, what it returned.

Tool calls that come one after another in a reply form a group. When the group has more than one call, only the last row shows. Above it, a line such as "4 tool calls" opens the earlier rows. That line adds "· 1 failed" (or however many) when some calls failed, and shows a spinner while a call is still running.

## What needs approval

The Workspace Assistant asks before every action in this table. The side panels can do only some of these actions, and they ask in the same way:

- **Mail AI** asks only before deleting emails. It cannot send.
- **Calendar AI** asks before adding, changing or deleting events and before replying to invitations.
- **Drive AI** asks before creating folders, renaming, moving and deleting.
- **Contacts AI** asks before creating, changing and deleting contacts.

| Area      | Action                           | The approval says                                                                                                                                                                          |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mail      | Delete emails                    | "Approve deleting 3 emails from you@example.com"                                                                                                                                           |
| Mail      | Send an email                    | "Approve sending "Subject" to someone@example.com from you@example.com"                                                                                                                    |
| Mail      | Schedule an email                | "Approve scheduling "Subject" to someone@example.com from you@example.com"                                                                                                                 |
| Mail      | Call back a scheduled email      | "Approve calling back this scheduled email"                                                                                                                                                |
| Mail      | Retry a scheduled email          | Asks to retry the scheduled email, and notes that a send that already went out won't repeat                                                                                                |
| Mail      | Unsubscribe from newsletters     | "Approve unsubscribing from 2 senders for you@example.com"                                                                                                                                 |
| Mail      | Delete a label                   | "Approve deleting the label "Receipts""                                                                                                                                                    |
| Mail      | Delete a draft                   | "Approve deleting this draft from you@example.com"                                                                                                                                         |
| Mail      | Add or edit a signature          | "Approve adding the workspace signature "Legal"", "Approve editing the mailbox signature "Work" for you@example.com" or "Approve adding the personal signature "Work" for you@example.com" |
| Mail      | Delete a signature               | "Approve deleting a personal signature for you@example.com", "Approve deleting a mailbox signature for you@example.com" or "Approve deleting a workspace signature"                        |
| Mail      | Change the workspace mail footer | "Approve changing the workspace mail footer" or "Approve turning off the workspace mail footer"                                                                                            |
| Calendar  | Add an event                     | "Approve adding "Team lunch" to your calendar"                                                                                                                                             |
| Calendar  | Change an event                  | "Approve changing "Team lunch""                                                                                                                                                            |
| Calendar  | Delete an event                  | "Approve deleting Team lunch"                                                                                                                                                              |
| Calendar  | Reply to an invitation           | "Approve replying "Yes" to this invite" (or "No", or "Maybe")                                                                                                                              |
| Drive     | Create a folder                  | "Approve creating the folder "Invoices""                                                                                                                                                   |
| Drive     | Rename a file or folder          | "Approve renaming this to "Invoices 2026""                                                                                                                                                 |
| Drive     | Move a file or folder            | "Approve moving report.pdf"                                                                                                                                                                |
| Drive     | Delete a file or folder          | Asks to delete the item, and warns that it can't be undone                                                                                                                                 |
| Drive     | Pin a folder                     | "Approve pinning "Invoices""                                                                                                                                                               |
| Drive     | Unpin a folder                   | "Approve removing this folder pin"                                                                                                                                                         |
| Contacts  | Create a contact                 | "Approve saving Sam Lee as a contact"                                                                                                                                                      |
| Contacts  | Change a contact                 | "Approve changing" followed by the contact and what changes                                                                                                                                |
| Contacts  | Delete a contact                 | Asks to delete the contact, and warns that it can't be undone                                                                                                                              |
| Workflows | Create or change a workflow      | "Approve creating the workflow "Name"" or "Approve changing the workflow "Name""                                                                                                           |
| Workflows | Turn a workflow on or off        | "Approve turning this workflow on" or "Approve turning this workflow off"                                                                                                                  |
| Workflows | Delete a workflow                | Asks to delete the workflow, and warns that it can't be undone                                                                                                                             |
| Workflows | Run a workflow now               | Asks to run the workflow now, and warns that its steps may change or send mail, events or files                                                                                            |
| Workflows | Cancel a run                     | Asks to cancel the run, and warns that a step already in progress can't be called back                                                                                                     |
| Workflows | Retry a run                      | Asks to retry the failed steps, and notes that completed steps won't run again                                                                                                             |
| Workspace | Remove a member                  | Asks to remove the member, and warns that "their mailboxes, calendars, drives and address books leave the workspace"                                                                       |
| Workspace | Revoke an invitation             | "Approve revoking this workspace invite"                                                                                                                                                   |
| Workspace | Change the accent color          | "Approve changing the workspace accent color to blue for everyone"                                                                                                                         |

The names, addresses and numbers in the table are examples. Your approval shows the real ones. The workspace actions are only available to workspace owners and admins.

When the assistant adds, changes or deletes an event, or replies to an invitation, the other attendees are notified as usual. Deleting a file in Google Drive or OneDrive moves it to that service's trash. On other drives, deleting removes the file for good.

## What runs without approval

The Workspace Assistant does these things straight away, because they are easy to undo or change nothing:

- Read, search and summarize anything it is allowed to read
- Mark as read or unread, star, archive and restore emails
- Set or clear labels, create a new label, and rename or recolor a custom label
- Create or update a draft (the assistant says "Saved a draft", and nothing is sent)
- Snooze, unsnooze or cancel a snooze
- Mute or unmute a thread
- Add to or remove from Read later

## Approvals and MCP clients

Outside AI apps that you connect through MCP never ask for your approval. Instead, sensitive actions are turned off for each client until you switch them on yourself. See [What an MCP client can do](/guide/assistant/what-an-mcp-client-can-do).
