---
title: Limits and troubleshooting
description: What the assistant's on-screen messages mean and how to fix the common problems.
---

Use this page when an assistant does not appear, refuses to help, or shows an error.

## The assistant is missing

| What you see                                                                                    | Why                                                         | What to do                                                           |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| No **Workspace AI** in the left rail, and no robot buttons in mail, calendar, drive or contacts | AI is not set up on your Metis Suite server                 | Ask the person who runs your server. You cannot turn it on yourself. |
| No **MCP clients** in your settings                                                             | AI is not set up on your Metis Suite server                 | Same as above. MCP clients need AI on the server.                    |
| The `@` list does not offer an item you expect                                                  | AI is off for that mailbox, calendar, drive or address book | Ask its owner to turn AI on for it in this workspace.                |

## The assistant is turned off

| Message                                                                                                                                            | Why                                                                                               | What to do                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assistant turned off**, with "This workspace has AI turned off, so the assistant is unavailable here."                                           | The workspace has AI set to **Off**                                                               | An owner or admin can allow AI under **Workspace settings**, **General**, **AI & privacy**. Click **Workspace settings** to go there.                                            |
| **Assistant turned off**, with "AI is turned off for this mailbox, so the assistant has nothing it can read." (or calendar, drive or address book) | The owner of this mailbox, calendar, drive or address book has not turned AI on in this workspace | If it is yours, click the button under the message (**Your mailboxes**, **Your calendars**, **Your drives** or **Your address books**) and turn AI on. Otherwise, ask its owner. |
| "AI is off for every mailbox, calendar, drive and address book here" under the Workspace Assistant title                                           | No mailbox, calendar, drive or address book in this workspace has AI turned on                    | Turn AI on for at least one of them.                                                                                                                                             |
| "AI is turned off for this workspace" (or "for this mailbox", "for this calendar", "for this drive", "for this address book") in the error box     | AI was turned off while you were chatting                                                         | Ask an owner, admin or the item's owner to turn it back on.                                                                                                                      |

For how the switches work, see [How AI works in Metis Suite](/guide/assistant/how-ai-works).

## A reply fails

When a reply fails, the chat shows a box titled "Workspace Assistant hit a problem", "Mail AI hit a problem", "Calendar AI hit a problem", "Drive AI hit a problem" or "Contacts AI hit a problem". The box shows the reason and a **Retry** button.

| Message                                                         | Why                                                                                                                                                                                                            | What to do                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| The reason includes "Too many requests. Please slow down."      | You sent many messages in a short time. Each person has a limit on how many messages they can send per minute. The Mail, Calendar, Drive and Contacts AI panels share one limit, and Workspace AI has its own. | Wait a minute, then click **Retry**.  |
| "The assistant is busy right now. Wait a moment and try again." | The AI service your server uses has too many requests right now                                                                                                                                                | Wait a moment, then click **Retry**.  |
| "The assistant is unavailable right now. Try again later."      | The AI service your server uses refused the request. This usually needs a fix on the server.                                                                                                                   | Tell the person who runs your server. |

If one step in a reply fails but the rest work, that step shows the reason, or "That step didn't work". When the steps are grouped, the group's line also says how many failed, such as "· 1 failed". See [Tool calls in the chat](/guide/assistant/approve-or-decline-actions#tool-calls-in-the-chat).

## Other things to know

- **Panel conversations disappear.** The Mail, Calendar, Drive and Contacts AI panels do not save conversations. Use [Workspace AI](/guide/assistant/use-workspace-ai) when you want to come back to a conversation.
- **Mail AI will not send.** Mail AI cannot send email or save drafts. Ask Workspace AI instead.
- **Drive AI cannot move a file to another drive.** It can only move files within the same drive.
- **Conversations cannot be renamed.** The assistant gives each conversation a short title for you.
- **Deleted conversations cannot be brought back.** Deleting your account or the workspace also deletes its conversations.

For problems with outside AI apps, see [Manage MCP clients](/guide/assistant/manage-mcp-clients).
