---
title: How workflows work
description: What a workflow is made of, when it runs, who it runs as and who can see it.
---

A workflow automates work you would otherwise do by hand in your mail, calendars, drives and contacts. This page explains the ideas behind workflows. To build one straight away, follow [Build your first workflow](/guide/workflows/build-your-first-workflow).

## Where to find workflows

Click **Workflows** in the left rail. You need at least one mailbox in the workspace to open this page. The **Workflows** page lists every workflow you can see.

<img src="/images/workflows/workflows-page.webp" alt="The Workflows page listing workflows, each with its trigger summary, its last run, when it was updated and its on and off switch" class="dark:hidden" />
<img src="/images/workflows/workflows-page-dark.webp" alt="The Workflows page listing workflows, each with its trigger summary, its last run, when it was updated and its on and off switch" class="hidden dark:block" />

At the top of the page:

- The back arrow, **Back to mail**, returns to your mail.
- **Approvals** lists the requests waiting for your answer. It shows a number when something is waiting for you. See [Ask for approval](/guide/workflows/approvals).
- **Runs** opens the history of every run in the workspace. See [Run a workflow and check its history](/guide/workflows/run-and-check-history#see-every-run).
- **Search workflows** filters the list by name as you type. Capital letters do not matter. If nothing matches, the list says "No workflow matches that search."
- **New workflow** creates a workflow. See [Build your first workflow](/guide/workflows/build-your-first-workflow).

If you have no workflows yet, the list says "No workflows yet." If the list cannot load, you see "Could not load your workflows", or a message from your server that says what went wrong.

Each row shows:

- An icon. It is coloured when the workflow is on, and grey when it is off.
- The workflow's name. Under it is a short summary of its triggers: the trigger's name, a dot and the first line of its card, for example "Mail arrives · Watching ana@example.com". Several triggers are separated by commas.
- The last run: an icon for its status and how long ago it ran, for example "5 minutes ago". Point at it to see its status, such as "Last run completed". Click it to open the runs of that workflow. If the workflow has no run you can open, the row says "Never run".
- When the workflow was last changed, for example "Updated 3 days ago".
- A switch that turns the workflow on or off at once. See [Turn a workflow off or on](/guide/workflows/manage-workflows#turn-a-workflow-off-or-on).

On a narrow screen, the list hides the last run and the **Updated** time. On a medium screen, it hides only the **Updated** time.

Click a workflow's name or its trigger summary to open it in the editor.

## The editor

The editor opens on its own page. It has five parts:

- **The top bar** holds **Back to workflows**, the workflow's name, the **Enabled** switch and the save status. On the right are **Undo**, **Redo**, **Test**, **Run now**, **Save**, **More workflow actions** (**...**) and **Hide the inspector**. The **More workflow actions** menu has **Tidy up the layout**, **Keyboard shortcuts**, **Runs**, **Revisions** and **Delete workflow**.
- **The step palette** lists every step you can add. It starts closed, as a small icon named **Show steps** in the top-left corner of the canvas. Click the icon to open the palette. It floats over the left side of the canvas.
- **The canvas** in the middle shows the workflow as connected steps. This is where you build and change it.
- **The Inspector** on the right shows the settings of the step you select. When no step is selected, it shows a summary of the workflow and its **Workflow settings**.
- **The dock** under the canvas has two tabs, **Runs** and **Test run**. A third tab, **Preview**, appears after you click **Try on recent mail** on an Ask step. See [Let AI decide with Ask and Branch](/guide/workflows/ask-and-branch#try-your-questions-on-recent-mail). Click **Expand** at the dock's right end to open it, and **Collapse** to close it again.

<img src="/images/workflows/workflow-canvas.webp" alt="A saved workflow open in the editor, with its name, the Enabled switch, Saved, and the Test, Run now and Save buttons in the top bar" class="dark:hidden" />
<img src="/images/workflows/workflow-canvas-dark.webp" alt="A saved workflow open in the editor, with its name, the Enabled switch, Saved, and the Test, Run now and Save buttons in the top bar" class="hidden dark:block" />

The palette opens with the **Show steps** icon and closes with the **Hide steps** icon, which takes its place beside the search box at the top of the open palette. Each time you open a workflow, the palette starts closed. The palette lies on top of the canvas, so the canvas keeps its full width.

You can drag the edges of the Inspector and the dock to resize them. Use **Hide the inspector** to make more room for the canvas. This browser remembers the sizes of the Inspector and the dock.

Click **Back to workflows** to return to the list. If you have unsaved changes, you are asked first. See [Manage workflows](/guide/workflows/manage-workflows#unsaved-changes).

If the workflow does not exist, or you cannot see it, the editor says "This workflow does not exist, or you cannot see it." Click **Back to workflows** to return to the list.

On a phone, there is no palette. Tap **Add step** (the **+** button) in the top bar to add a step. Tap a step to open its settings at the bottom of the screen.

## A workflow is a chain of steps

Each box on the canvas is a **step**. Lines between steps are **connections**. Items flow along the connections from one step to the next. An **item** is one thing a step works on, such as a message, a calendar event, a file, or a set of values.

Most steps run once for each item that reaches them. For example, if a step lists the 20 newest messages in a folder, the step after it runs 20 times, once for each message.

The palette groups the steps into seven categories:

| Category           | What it does                                                    | Examples                                           |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| **Triggers**       | Decide when the workflow runs. Every workflow starts with one.  | **Mail arrives**, **On a schedule**, **Webhook**   |
| **Mail**           | Read, change, file and send mail.                               | **List a folder**, **Label**, **Reply**            |
| **Calendar**       | Read, create and change events, and answer invitations.         | **List events**, **Create an event**               |
| **Drive**          | Read, save, copy, move and delete files.                        | **Save attachment to a drive**, **Read a file**    |
| **Logic**          | Choose a path for each item, split lists, and join branches.    | **If**, **Filter**, **Merge**                      |
| **Waits and flow** | Wait for a time, an event or a person, and run other workflows. | **Delay**, **Ask for approval**, **Call workflow** |
| **AI**             | Write, summarize, sort and read with an AI model.               | **Summarize**, **Classify**, **Agent**             |

A typical workflow reads from left to right: a trigger, then a step that picks out the items you care about, then the steps that act on them. The [Steps](/guide/workflows/steps) page describes every step.

A step with more than one output, such as **If**, shows a label on each output (for example **Yes** and **No**), so you can see which way each item goes.

Each step's settings can be fixed values, or expressions that use values from earlier steps, such as the sender of the message that started the run. See [Expressions](/guide/workflows/expressions).

## When a workflow runs

The trigger decides when a workflow runs. There are triggers for:

- **You**: **Run by hand** runs only when someone presses **Run now**.
- **Time**: **On a schedule** runs at the times you set, for example every weekday at 9:00.
- **Mail, calendars and drives**: for example **Mail arrives**, **Event starting** or **File added**. Contacts have no triggers.
- **Events in Metis Suite**: for example **A run fails**, **Phishing detected** or **Member joins**.
- **Other workflows and services**: **When called** runs when another workflow calls it, and **Webhook** runs when another service sends it a request.
- **Sending mail**: **Before mail is sent** runs each time you send mail, so it can add a BCC address.

See [Triggers](/guide/workflows/triggers) for the details of each one.

Runs happen in the background on your server. You do not need to keep Metis Suite open. Each run is recorded, and you can see what every step did on the **Runs** page. See [Run a workflow and check its history](/guide/workflows/run-and-check-history).

## Who a workflow runs as

A workflow runs as the person who created it. It can only reach the mailboxes, calendars, drives and address books that person can reach in the workspace. On the run's page, the **Runs as** row under **More about this run** shows this person's name and email address. See [More about this run](/guide/workflows/run-and-check-history#more-about-this-run). Editing a workflow does not change who it runs as. A workflow that another workflow calls runs as its own creator.

If the person who created a workflow leaves the workspace, the workflow can no longer run. Its runs are blocked, and the run details say why, for example "The workflow's owner is no longer in this workspace".

If the instance owner or an instance admin bans the person a workflow runs as, runs that come due while they are banned are blocked with "The workflow's owner is banned from this instance". Those runs stay blocked after the ban ends, until someone retries them. See [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#retry-a-run). Runs that come due after the ban run as usual.

## Who can see and change workflows

Workflows belong to a workspace, and every member of the workspace can use them:

- You see the workflows you created, plus every workflow whose mailboxes, calendars, drives and address books you can all see.
- Any member can create, edit, test, turn on, turn off and run the workflows they can see.
- Only workspace owners and admins can delete a workflow.

Run history follows the same rule. Details from a mailbox, calendar, drive or address book you cannot see are hidden, and addresses you cannot see read "[hidden address]".

## Every save keeps a version

Each time you save a workflow, Metis Suite keeps that version as a new **revision**. Each run records the revision it used, so the history always shows the workflow as it was when it ran, even after you change it. Runs that already started finish on their own revision. To see what each save changed, open **Revisions** in the editor's **More workflow actions** menu. See [Manage workflows](/guide/workflows/manage-workflows#see-what-each-save-changed).

## Workflows can wait for a person

An **Ask for approval** step pauses a run until the people you choose approve or deny it, or until a deadline passes. Their requests appear under **Approvals**. See [Ask for approval](/guide/workflows/approvals).

Steps that send or create something, such as **Send mail**, **Reply** or **Create an event**, are never repeated. If Metis Suite cannot tell whether one of them went through, the step is marked "Needs review" instead of trying again, so nothing is sent twice.

Before you turn on a new workflow, try it with **Test**, which changes nothing. See [Test a workflow](/guide/workflows/test-a-workflow).

## AI in workflows

The steps in the **AI** category use an AI model. They follow the same AI switches as the rest of the workspace: AI must be on for every mailbox, calendar, drive and address book the step reads, and for the ones that earlier steps read. Steps outside the **AI** category, such as the contact steps, do not need AI. See [Workspaces](/guide/workspaces) for the AI switches.

When AI decides who receives a message or an invitation, or where a file goes, the workflow needs an **Ask for approval** step before the step that acts. See [Steps](/guide/workflows/steps#ai).

Approval also comes in when you ask the Workspace Assistant to change your workflows. See [Manage workflows](/guide/workflows/manage-workflows#change-workflows-from-the-assistant).

## Other features that run in the background

**Schedule send** and **Snooze** in the mail app also run in the background on your server. They are not listed on the Workflows page, and their runs do not appear on the **Runs** page. You manage them from your mailbox. See [Mail](/guide/mail).

Your server also runs a daily clean-up that removes old workflow data. It is not listed on the Workflows page either. See [Limits](/guide/workflows/limits#how-long-run-data-is-kept).
