---
title: Add a BCC to outgoing mail
description: Build a workflow that copies the mail you send to another address, such as an archive.
---

A workflow that starts with **Before mail is sent** runs each time someone in the workspace sends a message from the mail app, just before it goes out. With an **Add a Bcc** step, it adds an address as a blind copy (BCC). The people you write to do not see a BCC address.

Use this to keep a copy of your sent mail in an archive mailbox, or to copy a team address on everything you send.

## Build the workflow

1. Click **Workflows** in the left rail.
2. Click **New workflow** and pick **Start from a manual trigger**. Remove its **Run by hand** trigger: point at the card and click **Remove step** (the **X**).
3. From the **Triggers** category of the step palette, click or drag **Before mail is sent** onto the canvas. You can also press **w** then **a** and search for it.
4. With the trigger selected, choose under **Only from** in the Inspector: one mailbox, so the copy is only added to mail sent from that address, or leave it empty for every mailbox.
5. From the **Mail** category of the step palette, add **Add a Bcc**.
6. With **Add a Bcc** selected, enter the address to copy under **Address** in the Inspector, for example `archive@demo.trymetis.email`.

   <img src="/images/workflows/bcc-steps.png" alt="The Before mail is sent and Add a Bcc cards on the canvas, with archive@example.com as the Bcc address" class="dark:hidden" />
   <img src="/images/workflows/bcc-steps-dark.png" alt="The Before mail is sent and Add a Bcc cards on the canvas, with archive@example.com as the Bcc address" class="hidden dark:block" />

   Until you connect them, the **Add a Bcc** card shows a problem, such as "Connect this step to a trigger".

7. Drag from the output on the right of **Before mail is sent** to the input on the left of **Add a Bcc**.
8. Name the workflow in the top bar, check that the switch says **Enabled**, and click **Create workflow**.

From now on, every message anyone in the workspace sends from the chosen mailboxes in the mail app, including scheduled messages, gets the extra BCC address.

## Copy only some messages

To add the BCC only to some messages, put an **If** or a **Filter** step between the trigger and **Add a Bcc**:

1. Add a **Filter** step.
2. Remove the connection from the trigger to **Add a Bcc**: click the line and press Delete.
3. Connect the trigger to **Filter**, then **Filter** to **Add a Bcc**.
4. In **Keep when**, set a condition on the message being sent. A new **Filter** opens its condition as rows: pick a **Field**, a **Comparison** and a **Value**. For example, to copy only mail that has `team@example.com` among its recipients, pick the `to` field, **includes** and `team@example.com`.

   For a condition the rows cannot express, click **Edit as expression** and type it. For example, to copy only mail to any `example.com` address:

   ```
   item.to.exists(a, a.endsWith("@example.com"))
   ```

The message being sent has these fields: `to`, `cc`, `bcc`, `subject`, `body` (the plain text) and `mailboxId`. See [Expressions](/guide/workflows/expressions#build-a-condition-from-rows) for how to build or write a condition.

## Good to know

- **Only mail sent from the mail app.** Messages sent from the chosen mailboxes in the mail app get the BCC, including scheduled messages. For a scheduled message, the BCC is worked out when you schedule it. Mail sent by the AI assistant, a connected AI client or a workflow's **Send mail**, **Reply** or **Forward** step does not.
- **Attachments are not visible here.** The message these workflows see has no attachments, so a condition on `item.attachments` never matches.
- **An address is never added twice.** If the address is already on the message as a recipient, Cc or BCC, it is not added again.
- **Only a few steps work here.** After **Before mail is sent**, you can use only **If**, **Switch**, **Filter**, **Stop** and **Add a Bcc**. Any other step shows a problem such as "Label cannot run before a message is sent", and the workflow cannot be saved. **Before mail is sent** must also be the workflow's only trigger.
- **It follows the creator's access.** A workflow adds its address only to mail sent from mailboxes its creator can reach in the workspace.
- **Several workflows can add addresses.** If more than one enabled workflow applies to a message, each one adds its address.
- **No runs in the history.** These workflows run as part of sending, so they do not appear under **Activity**.
- **Turned off means no copy.** A disabled workflow adds nothing.
- **Check the address yourself.** The step adds the address exactly as you typed it, so check it carefully.
