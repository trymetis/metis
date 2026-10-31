---
title: Manage workflows
description: Edit workflows, change their settings, turn them on and off, delete them, and change them from the Workspace Assistant.
---

This page covers the everyday changes you make to workflows that already exist.

## Edit a workflow

1. Click **Workflows** in the left rail, then click the workflow in the list.
2. Change the name in the top bar, or change the steps on the canvas.
3. Click **Save**, or press Ctrl + S (Cmd + S on a Mac).

The top bar shows the save status next to the **Enabled** switch: "Unsaved changes" after you change something, then "Saving" and "Saved".

Problems show as you edit, on the step's card, in the Inspector and on a red button in the top bar such as **2 problems**. If the workflow has problems when you save, you see "Fix the problem in this workflow before saving" or, for example, "Fix the 2 problems in this workflow before saving". The first step with a problem is selected, and nothing is saved. See [Limits](/guide/workflows/limits#problem-messages) for the messages you may see.

Each save keeps a new version, called a revision. Runs that already started finish on the version they started with, and later runs use the new one. To see what each save changed, see [See what each save changed](#see-what-each-save-changed).

<img src="/images/workflows/workflow-canvas.webp" alt="A saved workflow open in the editor, with its name, the Enabled switch, Saved, and the Test, Run now and Save buttons in the top bar" class="dark:hidden" />
<img src="/images/workflows/workflow-canvas-dark.webp" alt="A saved workflow open in the editor, with its name, the Enabled switch, Saved, and the Test, Run now and Save buttons in the top bar" class="hidden dark:block" />

See [Use the editor](/guide/workflows/use-the-editor) for how to add, connect and copy steps.

### Unsaved changes

If you open another workflow, pick a template, or click **Back to mail** while you have unsaved changes, the dialog **Discard unsaved changes?** asks first: "This workflow has changes you have not saved. They are lost if you leave it now." Click **Keep editing** to stay, or **Discard** to leave without saving.

If you reload or close the browser tab, your browser asks whether to leave the page. Other links, such as the left rail, do not ask, so save before you use them.

## Change the workflow settings

Click an empty part of the canvas so that no step is selected. The **Workflow settings** show in the Inspector, below the summary of the workflow.

<img src="/images/workflows/workflow-settings.webp" alt="The Workflow settings section in the Inspector, with Runs at the same time, Rate limit and Time zone" class="dark:hidden" />
<img src="/images/workflows/workflow-settings-dark.webp" alt="The Workflow settings section in the Inspector, with Runs at the same time, Rate limit and Time zone" class="hidden dark:block" />

| Setting                   | What it does                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runs at the same time** | How many runs of this workflow may run at once, from 1 to 20. "Leave empty for no limit. Extra runs wait their turn."                                                                                                                                                                                                   |
| **Rate limit**            | How often events may start a run. See below.                                                                                                                                                                                                                                                                            |
| **Time zone**             | "Used by date() and time() in expressions when no zone is given, and by Create an event, Find free time and the Agent step." When it is empty, a run uses the time zone of the **On a schedule** trigger that started it, or UTC. See [The workflow's time zone](/guide/workflows/expressions#the-workflows-time-zone). |

**Rate limit** has three choices:

- **Run for every event** (the default): every event starts a run.
- **Wait for a quiet spell, then run once**: each new event replaces the run that is still waiting to start, and pushes it back by the period. The workflow runs once, with the latest event, after no new event has come for the whole period. The runs it replaces show as cancelled.
- **Run at most once per period**: after a run starts, events in the rest of the period do not start a run.

With a limit, two more settings appear:

- **Per**: which events share the limit. It is an expression on the event. "all" (the default) puts every event under one limit. `trigger.threadId` gives each conversation its own limit, so a busy thread does not hold back the others.
- **Period in minutes**: from 1 to 10080 (one week). It starts at 60.

Click **Save** to keep your changes.

## See what each save changed

Each time you save a workflow, Metis Suite keeps that version as a revision. You can look back at what each save changed.

1. Open a saved workflow.
2. Click **More workflow actions** (**...**) at the right of the top bar, then click **Revisions**. A new workflow that was never saved does not have this item.
3. The **Revisions** panel opens: "Each save makes a revision. Pick one to see what it changed from the one before."
4. Click a revision in the list to see its changes below the list.

The list shows the latest 20 revisions, newest first. Each one is named, for example "Revision 3", with the date and time of the save. When the editor has changes you have not saved, an **Unsaved changes** entry comes first. It shows what you changed since the last save.

For each revision, you see what changed from the one before it:

- Steps that were added or removed.
- For each changed step, the settings that changed. The old value is struck through, with the new value below it.
- Connections that were added or removed.
- Changes to the **Workflow settings**.

If a save changed nothing in the steps or settings, you see "Nothing changed in the steps or settings." The workflow's name and the **Enabled** switch are not compared. The oldest revision in the list says "The first revision shown; nothing older to compare it with." A workflow that has none says "This workflow has no revisions yet."

Revisions are for reading only. You cannot go back to an older revision from this panel. To undo a change, edit the workflow and save it again.

## Turn a workflow off or on

1. Open the workflow.
2. Click the switch next to the name. It changes between **Enabled** and **Disabled**, and the top bar shows "Unsaved changes".
3. Click **Save**. The switch only takes effect when you save.

A disabled workflow has a grey icon and "off" after its name in the list.

While a workflow is off:

- Its triggers do not start runs: it does not watch mail, calendars or drives, does not run on its schedule, does not run when you send mail, and its webhook answers that it is not accepting events.
- Runs waiting to start, and runs that are waiting at a step, are cancelled when you save.
- Other workflows that call it are blocked with "The called workflow is turned off".
- Its run history stays.

When you turn it back on:

- Triggers that watch mail, calendars and drives start fresh. Changes that happened while the workflow was off are skipped.
- A schedule starts again from its next time. Times missed while the workflow was off do not run.

### Workflows turned off by the upgrade

When your server moved to the new workflow engine, it converted existing workflows to the new steps. A workflow it could not convert was turned off. Click an empty part of its canvas: the Inspector shows "Turned off:" and the reason, for example that the workflow could not be moved to the new workflow engine. Rebuild the workflow with the new steps, then turn it on and save.

## Delete a workflow

Only workspace owners and admins can delete workflows. Other members see **Delete workflow** too, but get the message "Only an admin can delete workflows".

1. Open the workflow.
2. Click **More workflow actions** (**...**) at the right of the top bar, then click **Delete workflow**. It is there once the workflow is saved.
3. The dialog **Delete this workflow?** names the workflow and explains what happens. Click **Delete** to confirm, or **Cancel** to keep it.

<img src="/images/workflows/delete-dialog.webp" alt="The Delete this workflow? dialog with its Cancel and Delete buttons" class="dark:hidden" />
<img src="/images/workflows/delete-dialog-dark.webp" alt="The Delete this workflow? dialog with its Cancel and Delete buttons" class="hidden dark:block" />

After you delete a workflow:

- It leaves the list and stops running. The editor opens the first workflow left in the list, or a new **Start from a manual trigger** template if there is none.
- Its queued and waiting runs are cancelled. A run already in progress finishes its current step.
- Its run history stays under **Activity**, but its runs can no longer be retried. The step inputs and outputs of its runs are cleared.
- Its webhook address stops working.

Deleting cannot be undone. To keep a workflow without it running, turn it off instead.

## Change workflows from the assistant

The Workspace Assistant can list your workflows and their runs, open a run, and read the list of workflow triggers and steps with their settings. It can also change workflows for you. Changes do not happen straight away: the assistant first shows an approval card in the chat, and nothing happens until you click **Approve**. Click **Decline** to stop it.

| You ask the assistant to    | The approval card says                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Create or change a workflow | "Approve creating the workflow" or "Approve changing the workflow", with its name                     |
| Turn a workflow on or off   | "Approve turning this workflow on" or "Approve turning this workflow off"                             |
| Delete a workflow           | "Approve deleting this workflow", noting that it can't be undone                                      |
| Run a workflow now          | "Approve running this workflow now", noting that its steps may change or send mail, events or files   |
| Cancel a run                | "Approve cancelling this workflow run", noting that a step already in progress can't be called back   |
| Retry a run                 | "Approve retrying the failed steps of this workflow run", noting that completed steps won't run again |

When you approve running a workflow now, the assistant queues one run of the workflow you asked about, and the card says "Workflow run queued". If the workflow's **Run by hand** trigger declares inputs, the assistant can fill them in for that run. The run then happens in the background, like any other.

The assistant can also try an **Ask** step's questions on your recent mail without changing anything, and that needs no approval. See [AI assistant](/guide/assistant) for how approvals work in the chat.

An outside AI client that you connect to Metis Suite (an MCP client) does not get approval cards. It can make these changes only if you have turned on its sensitive tools. See [What an MCP client can do](/guide/assistant/what-an-mcp-client-can-do).
