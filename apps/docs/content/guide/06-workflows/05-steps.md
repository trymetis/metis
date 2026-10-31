---
title: Steps
description: Every step you can add to a workflow, what it does and the settings it has, plus the templates in the New workflow menu.
---

This page lists every step you can add, grouped the way the step palette groups them. For triggers, see [Triggers](/guide/workflows/triggers). To add, connect and remove steps, see [Use the editor](/guide/workflows/use-the-editor).

Most settings can be a fixed value or an expression that uses values from earlier steps. Settings such as **Message**, **Event** and **File** start as `item`, which means "the item that reached this step". See [Expressions](/guide/workflows/expressions).

Steps that send or create something are marked **Sends or creates** below and in the Inspector. Metis Suite never repeats them. If it cannot tell whether one went through, for example because the provider did not answer, the step is marked "Needs review" instead, so nothing is sent or created twice.

Fields that take email addresses accept several, separated by commas, for example `ada@example.com, team@example.com`.

## Mail

| Step                             | Description on screen                                                                   | Settings                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Get a message**                | "Loads one message, with its body and attachments."                                     | **Mailbox**, **Message id**                                                                                                           |
| **List a folder**                | "Passes on the newest messages in a folder, one item each."                             | **Mailbox**, **Folder** (Inbox to start with), **At most** (1 to 100, 25 to start with)                                               |
| **Search mail**                  | "Passes on the messages a search finds, one item each."                                 | **Mailbox**, **Search** (for example `from:billing@example.com`), **At most** (1 to 100, 25 to start with)                            |
| **Get the thread**               | "Loads every message in a message's conversation."                                      | **Message**                                                                                                                           |
| **Mark as read**                 | "Marks a message read or unread."                                                       | **Message**, **Read** (on to start with; turn it off to mark unread)                                                                  |
| **Star**                         | "Stars or unstars a message."                                                           | **Message**, **Starred** (on to start with; turn it off to remove the star)                                                           |
| **Label**                        | "Puts a label on a message, or takes one off."                                          | **Message**, **Label**, **Action** (**Add** or **Remove**)                                                                            |
| **Mute the thread**              | "Mutes the message's conversation for the workflow's owner."                            | **Message**                                                                                                                           |
| **Archive**                      | "Moves a message out of the inbox."                                                     | **Message**                                                                                                                           |
| **Move to trash**                | "Moves a message to the trash."                                                         | **Message**                                                                                                                           |
| **Move to Inbox**                | "Moves a message back to the inbox, from the archive, the trash or spam."               | **Message**                                                                                                                           |
| **Create a draft**               | "Saves a draft in a mailbox without sending it."                                        | **From**, **To**, **Cc**, **Bcc**, **Subject**, **Message**, **Attachments**                                                          |
| **Send mail** (sends or creates) | "Sends a new message. A send is never repeated; an unclear outcome waits for a person." | The same as **Create a draft**                                                                                                        |
| **Reply** (sends or creates)     | "Replies to a message from the mailbox it arrived in."                                  | **Message**, **Reply** (the text), **Reply to everyone** (off to start with)                                                          |
| **Forward** (sends or creates)   | "Forwards a message, with its attachments, from the mailbox it arrived in."             | **Message**, **To**, **Note**                                                                                                         |
| **Add a Bcc**                    | "Adds an address to an outgoing message's Bcc, unless it is already a recipient."       | **Address**. Works only after **Before mail is sent**. See [Add a BCC to outgoing mail](/guide/workflows/add-a-bcc-to-outgoing-mail). |

Good to know:

- **Label** offers the built-in labels and the custom labels of every mailbox in the workspace. If the label does not exist in the message's mailbox, the step fails with "There is no label "X" in that mailbox", where X is the label. A message has one label at a time, so **Remove** takes off the message's label, whichever label it is, not only the one you picked.
- **Attachments** on **Create a draft** and **Send mail** takes a list of file contents, for example from **Download a file**.
- **Mute the thread** mutes the conversation for the person the workflow runs as.
- To move a message, use **Archive**, **Move to trash** or **Move to Inbox**. On Cloudflare Email and Resend mailboxes, **Move to Inbox** returns the message to the folder it was in before it was archived or deleted, which may not be the Inbox.

## Calendar

| Step                                            | Description on screen                                                              | Settings                                                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **List events**                                 | "Passes on the events between two times, one item each."                           | **Calendar**, **Only in calendar**, **From** (now, to start with), **Until** (a week from now, to start with), **Matching**, **At most** (1 to 250, 50 to start with) |
| **Get an event**                                | "Loads one event."                                                                 | **Calendar**, **Calendar id**, **Event id**                                                                                                                           |
| **Create an event** (sends or creates)          | "Adds an event to a calendar, inviting any attendees. A create is never repeated." | **Calendar**, **In calendar** ("Leave empty for the primary calendar."), **Title**, **Description**, **Location**, **Starts**, **Ends**, **All day**, **Attendees**   |
| **Update an event**                             | "Changes the fields you fill in and keeps the rest."                               | **Event**, **Title**, **Description**, **Location**, **Starts**, **Ends**, **All day**, **Attendees**                                                                 |
| **Delete an event**                             | "Deletes an event, cancelling it for its attendees."                               | **Event**                                                                                                                                                             |
| **Respond to an invitation** (sends or creates) | "Accepts, declines or tentatively accepts an event, telling its organizer."        | **Event**, **Response** (**Accept**, **Maybe** or **Decline**; **Accept** to start with)                                                                              |
| **Find free time**                              | "Finds the open slots of a given length in a calendar between two times."          | **Calendar**, **From**, **Until**, **Length (minutes)** (5 to 1440, 30 to start with), **Day starts** (09:00), **Day ends** (17:00), **Time zone**                    |
| **Add an invitation file** (sends or creates)   | "Creates the event in an .ics attachment or file in a calendar."                   | **Invitation** ("An attachment or a drive file holding an .ics invitation."), **Calendar**, **In calendar**                                                           |

**Find free time** passes on whether it found a slot (`found`), the first slot (`first`) and every slot (`slots`).

## Drive

| Step                                              | Description on screen                                                                       | Settings                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Save attachment to a drive** (sends or creates) | "Copies a mail attachment into a drive folder."                                             | **Attachment**, **Drive**, **Folder** (for example `/Invoices`), **File name** ("Leave empty to keep the attachment's name.") |
| **Save message to a drive** (sends or creates)    | "Saves a message as an .eml file in a drive folder."                                        | **Message**, **Drive**, **Folder**, **File name** ("Leave empty to name it after the subject.")                               |
| **List a folder**                                 | "Passes on the files in a drive folder, one item each."                                     | **Drive**, **Folder** ("Leave empty for the top of the drive."), **At most** (1 to 500, 100 to start with)                    |
| **Search files**                                  | "Passes on the files a search finds, one item each."                                        | **Drive**, **Search**, **At most** (1 to 200, 50 to start with)                                                               |
| **Get a file**                                    | "Loads one file's details."                                                                 | **Drive**, **File id**                                                                                                        |
| **Read a file**                                   | "Reads a text file's contents, for AI or conditions to use."                                | **File**. Passes on the text (`text`), cut at 20,000 characters, and whether it was cut (`truncated`).                        |
| **Download a file**                               | "Keeps a file's contents for this run, to attach to mail or save elsewhere."                | **File**. A file larger than 10 MB is refused with "That file is larger than 10 MB".                                          |
| **Create a file** (sends or creates)              | "Writes text, or kept file contents, to a new file in a folder. A write is never repeated." | **Drive**, **Folder**, **File name**, **Text**, **Or file contents**                                                          |
| **Create a folder**                               | "Creates a folder, or reuses one with the same name."                                       | **Drive**, **Inside**, **Name**                                                                                               |
| **Move a file**                                   | "Moves a file to another folder of the same drive."                                         | **File**, **To folder**                                                                                                       |
| **Rename a file**                                 | "Gives a file a new name."                                                                  | **File**, **New name**                                                                                                        |
| **Copy a file** (sends or creates)                | "Copies a file into a folder, of this drive or another. A copy is never repeated."          | **File**, **To drive**, **To folder**, **Name** ("Leave empty to keep the name.")                                             |
| **Delete a file**                                 | "Deletes a file or folder."                                                                 | **File**                                                                                                                      |

## Logic

| Step             | Description on screen                                                                            | Settings and outputs                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **If**           | "Sends each item to Yes or No by a condition."                                                   | **Condition**. Outputs **Yes** and **No**.                                                                                                              |
| **Switch**       | "Sends each item to the first case whose condition holds, or to Otherwise."                      | **Cases**: each with a name (up to 40 characters) and a condition. Click **+ Case** to add one, up to 20. One output for each case, plus **Otherwise**. |
| **Filter**       | "Lets through only the items a condition holds for."                                             | **Keep when**. The card says "Keep" and the condition.                                                                                                  |
| **Split**        | "Turns a list into items, so the steps after it run once for each entry."                        | **List** (the message's attachments, to start with)                                                                                                     |
| **Aggregate**    | "Waits for every item to arrive, then passes on one list: of all of them, or one list per key."  | **Group by** ("Leave empty for a single list of everything."). Passes on the key (`key`), the number of items (`count`) and the items (`items`).        |
| **Merge**        | "Combines several branches into one, passing each item on once even if it arrives by two paths." | Inputs "Branch 1", "Branch 2" and so on, up to 16                                                                                                       |
| **Wait for all** | "Waits until every branch into it has finished, then passes on all their items at once."         | The same inputs as **Merge**                                                                                                                            |
| **Set fields**   | "Builds a new item from named values, for the steps after it to use."                            | **Fields**: up to 30 rows of a name and a value. Click **+ Value** to add one.                                                                          |
| **Stop**         | "Ends this item's path here, with an optional note in the run history."                          | **Note**. No outputs.                                                                                                                                   |

Good to know:

- **If** and **Filter** let you build the condition from rows of a field, a comparison and a value, or write it as an expression. **Switch** cases are always expressions, for example `item.from.endsWith("@example.com")`. See [Expressions](/guide/workflows/expressions#build-a-condition-from-rows).
- A step after an **Aggregate** can read only the **Aggregate**, not the steps before it.
- With **Wait for all**, a branch that found nothing counts as finished. A branch that failed, was blocked or is still waiting holds back everything after the **Wait for all**.

<img src="/images/workflows/combine-workflow.webp" alt="A workflow where two Filter steps join in a Merge step before a Label step" class="dark:hidden" />
<img src="/images/workflows/combine-workflow-dark.webp" alt="A workflow where two Filter steps join in a Merge step before a Label step" class="hidden dark:block" />

## Waits and flow

While a run waits at one of these steps, its status is **waiting**.

| Step                 | Description on screen                                                                                          | Settings and outputs                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delay**            | "Waits for a while before passing the item on. The run is paused while it waits, however long the wait."       | **Wait** (1 to start with) and **Unit** (**Minutes**, **Hours** or **Days**; **Hours** to start with)                                                       |
| **Wait until**       | "Waits until a date and time, then passes the item on."                                                        | **Until**                                                                                                                                                   |
| **Wait for**         | "Waits for something to happen, checking every few minutes, and goes on through Timed out when it doesn't."    | **Wait for**, **Give up after** (3 to start with), **Unit** (**Days** to start with). Outputs **Happened** and **Timed out**.                               |
| **Ask for approval** | "Asks chosen members to approve or deny in the app, and waits for the first answer or the deadline."           | **Approvers**, **Request**, **Deadline**, **Unit**. Outputs **Approved**, **Denied** and **No answer**. See [Ask for approval](/guide/workflows/approvals). |
| **Call workflow**    | "Runs another workflow with inputs, waits for it, and passes on what it returns."                              | **Workflow**, **Inputs**                                                                                                                                    |
| **Loop**             | "Runs the steps up to End loop once for each entry of a list, then End loop collects what they give back."     | **For each of** (a list, required). Output **Each entry**. See [Loop and End loop](#loop-and-end-loop).                                                     |
| **End loop**         | "Waits for every entry of its Loop, then passes on one item per looped item with the entries that reached it." | No settings. Passes on the entries that reached it (`results`) and how many there were (`count`).                                                           |
| **Return**           | "Sets what this workflow gives back to the workflow that called it."                                           | **Return**: rows of a name and a value. The card says "Gives back" and the names, or "Gives back nothing".                                                  |

### Wait for

Under **Wait for**, choose what to wait for:

- **A reply in the thread** (the default): a reply to the message in **Message**. A reply sent from the mailbox itself does not count.
- **A reply to an invitation**: an answer to the event in **Event**.
- **A file in a folder**: a file in the **Folder** of the **Drive** you pick.

It checks every few minutes. When the thing happens, the item goes on through **Happened**. When the time under **Give up after** passes first, it goes on through **Timed out**.

### Call workflow

The workflow you call needs a **When called** trigger. In the **Workflow** list, a workflow without one shows "(not callable)" after its name. If you pick one anyway, the step shows "That workflow needs a When called trigger". When you pick a workflow, **Inputs** fills in with the names of the inputs it declares.

- If the called workflow is turned off, the run is blocked with "The called workflow is turned off".
- If the called workflow fails, the step fails too.

### Loop and End loop

**Loop** and **End loop** work as a pair. The steps between them run once for each entry of a list. **End loop** then gathers the results back together.

1. Add a **Loop** step. In **For each of**, give it a list, for example the message's attachments (`item.attachments`).
2. Connect the steps that should run for each entry to the **Each entry** output. Each of them sees one entry as its item.
3. Add an **End loop** step after the last of those steps.

For each item that reached the **Loop**, **End loop** passes on one item. It holds the entries that reached the **End loop** (`results`) and how many there were (`count`). An entry that a **Filter** or an **If** stopped on the way is not in `results`.

Good to know:

- **Every End loop needs one Loop before it.** Otherwise the step shows "End loop needs exactly one Loop before it", and the workflow cannot be saved.
- **Loops can sit inside loops.** Close the inner loop with its own **End loop** before the **End loop** of the outer one.
- **End loop takes one incoming connection.** If the steps inside the loop split into branches, join them with a **Merge** step before the **End loop**.
- **After End loop, expressions read less.** A step after an **End loop** can read the steps before the **Loop** and the **End loop** itself, but not the steps inside the loop.
- **At most 100 entries.** A longer list makes the **Loop** fail with "A loop runs at most 100 times".
- **Call workflow inside a loop.** A **Call workflow** step inside a loop starts one run of the called workflow for each entry, and **End loop** waits for all of them.

In the run history, the **Loop** row shows how many entries it passed on, for example "3 entries" or "1 entry". The **End loop** row shows, for example, "2 item(s) collected", or "nothing reached its Loop" when no item reached the **Loop**. If an item reaches an **End loop** without coming through its **Loop**, the step fails with "End loop got an item that did not come through its Loop".

## AI

These steps use an AI model. They need AI to be on for every mailbox, calendar and drive the step reads, and for the ones earlier steps read. Otherwise the step shows "Turn AI on for every mailbox, calendar and drive this step reads", and the workflow cannot be saved. If an AI switch is turned off later, runs that reach the step are blocked, with a reason such as "AI is turned off for this mailbox".

| Step               | Description on screen                                                                                           | Settings                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Ask**            | "Asks the decision model your questions about each item. Connect each question to a Branch step."               | See [Let AI decide with Ask and Branch](/guide/workflows/ask-and-branch).                                                                |
| **Branch**         | "Routes each item by the answer to the question it is connected to."                                            | See [Let AI decide with Ask and Branch](/guide/workflows/ask-and-branch).                                                                |
| **Write with AI**  | "Writes text, or fills in fields you declare, from a prompt."                                                   | **Prompt**, **Gives back** (**Text** or **Fields**), **Fields**                                                                          |
| **Extract fields** | "Reads mail, an attachment or a file's text and fills in the fields you declare."                               | **From** (`item` to start with), **Instructions**, **Fields**                                                                            |
| **Summarize**      | "Summarizes mail, a thread, a file's text or any value."                                                        | **Summarize** (`item` to start with), **Length** (**A sentence**, **A paragraph** or **A few paragraphs**)                               |
| **Classify**       | "Puts each item in one of the categories you describe, or Other."                                               | **Classify**, **Instructions**, **Categories** (2 to 20). One output for each category, plus **Other**.                                  |
| **Agent**          | "Gives a task to an agent that can read, but never change, mail, calendars or files, and passes on its answer." | **Agent**, **Task**, a **Mailbox**, **Calendar** or **Drive**, **Most tool calls**, **Time limit (minutes)**, **Gives back**, **Fields** |

**Ask** and **Branch** appear only if your server offers them.

Good to know:

- **Fields** lists the values you want back. Each field has a name, a type (**Text**, **Number**, **Yes / no**, **Date** or **List of text**) and an optional description. See [Declared fields](/guide/workflows/expressions#declared-fields).
- **Write with AI** passes on the text (`text`), the fields (`data`) and whether the answer was complete (`complete`). **Extract fields** passes on `data` and `complete`. **Summarize** passes on `summary`.
- **Classify** categories each have a name (up to 40 characters) and an optional note on when it applies. With fewer than two, the step shows "Add at least two categories". It passes on the category (`category`, `label`) and how sure the model was (`confidence`).
- **Agent** offers **Mailbox agent** (the default), **Calendar agent**, **Drive agent** and **Workspace agent**. Leave the mailbox, calendar or drive empty to use the one the item comes from. **Most tool calls** goes from 1 to 20 (8 to start with), and **Time limit (minutes)** from 1 to 30 (5 to start with). If the agent runs out of either, its text says "The agent ran out of tool calls or time before it finished." It passes on `text`, `data`, `sources` and `complete`.

### AI cannot choose recipients on its own

When a step's recipients or target come from an AI step, the workflow needs an **Ask for approval** step between them. Otherwise the step shows, for example, "To comes from AI; add an Ask for approval step before this one", and the workflow cannot be saved. This applies to:

- **To**, **Cc** and **Bcc** of **Send mail**
- **To** of **Forward**
- **Folder** of **Save attachment to a drive**, **Save message to a drive** and **Create a file**
- **To folder** of **Copy a file**
- **Attendees** of **Create an event**

## Templates

The **New workflow** menu starts you from a ready-made set of steps, laid out from left to right:

| Template                                      | Steps                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start from a manual trigger**               | A single **Run by hand** trigger.                                                                                                                                                                       |
| **Label mail from a sender**                  | **Mail arrives**, an **If** on the sender, and **Label** on **Yes**. Pick a label before you save.                                                                                                      |
| **Save invoice PDFs to a drive**              | **Mail arrives** (only for messages with "invoice" in the subject and an attachment), **Split** the attachments, **Filter** the PDF files, and **Save attachment to a drive** in the "Invoices" folder. |
| **Add mailed invitations to a calendar**      | **Mail arrives** (only for messages with attachments), **Split** the attachments, **Filter** the `.ics` files, and **Add an invitation file**.                                                          |
| **Draft a reply with AI, send once approved** | **Mail arrives**, **Write with AI** a short reply, **Ask for approval**, and **Reply** on **Approved**. Pick the approvers before you save.                                                             |
| **Follow up when nobody replies**             | **Mail is sent**, **Wait for** a reply for 3 days, and **Create a draft** of a follow-up on **Timed out**.                                                                                              |
| **Morning brief of today's meetings**         | **On a schedule** at 8:00 on weekdays, **List events** for the next 24 hours, **Aggregate**, **Summarize**, and **Send mail** to your first mailbox's address.                                          |
| **Meeting prep from mail and files**          | **Event starting** in 30 minutes, an **Agent** that prepares for the meeting, and **Send mail** to your first mailbox's address.                                                                        |
| **Two mailboxes, one shared action**          | **On a schedule**, **List a folder** in two mailboxes, **Merge**, and **Label**.                                                                                                                        |
| **Two mailboxes, act once both are read**     | The same, with **Wait for all** instead of **Merge**.                                                                                                                                                   |

A template fills in your workspace's first mailbox, calendar or drive, and your browser's time zone. If the workspace has only one mailbox, the two-mailbox templates use it for both branches. A template opens with no name, enabled, and not saved. Some templates leave a setting for you to fill in, so the editor shows a problem until you do. Change any step before you save.

If the workflow you have open has unsaved changes, picking a template first asks "Discard unsaved changes?". See [Manage workflows](/guide/workflows/manage-workflows#unsaved-changes).
