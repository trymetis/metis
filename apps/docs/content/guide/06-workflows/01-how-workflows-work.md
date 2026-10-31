---
title: How workflows work
description: What a workflow is made of, when it runs, who it runs as and who can see it.
---

A workflow automates work you would otherwise do by hand in your mail, calendars and drives. This page explains the ideas behind workflows. To build one straight away, follow [Build your first workflow](/guide/workflows/build-your-first-workflow).

## Where to find workflows

Click **Workflows** in the left rail. You need at least one mailbox in the workspace to open this page. The Workflows page has a sidebar and an editor.

The **sidebar** on the left lists every workflow you can see:

- An enabled workflow has a coloured icon. A disabled one has a grey icon and the word "off" after its name.
- At the top are the back arrow (**Back to mail**) and the **New workflow** menu of templates.
- At the bottom are **Approvals**, which lists the requests waiting for your answer, and **Activity**, which opens the history of every run. **Approvals** shows a number when something is waiting for you.

The **editor** shows the workflow you picked. It has five parts:

- **The top bar** holds the workflow's name, the **Enabled** switch, the save status and the buttons **Test**, **Run now** and **Save**.
- **The step palette** lists every step you can add. It starts closed. Click **Show steps** (the panel icon at the left end of the top bar) to open it on the left of the canvas.
- **The canvas** in the middle shows the workflow as connected steps. This is where you build and change it.
- **The Inspector** on the right shows the settings of the step you select. When no step is selected, it shows a summary of the workflow and its **Workflow settings**.
- **The dock** under the canvas has two tabs, **Runs** and **Test run**. Click **Expand** at its right end to open it, and **Collapse** to close it again.

<img src="/images/workflows/workflows-page.webp" alt="The Workflows page with the list of workflows, the step palette, a workflow on the canvas and the Inspector" class="dark:hidden" />
<img src="/images/workflows/workflows-page-dark.webp" alt="The Workflows page with the list of workflows, the step palette, a workflow on the canvas and the Inspector" class="hidden dark:block" />

You can drag the edges of the palette, the Inspector and the dock to resize them. The palette starts closed, so the canvas has more room. Click **Show steps** in the top bar to open it, and **Hide steps** to close it again. Use **Hide the inspector** to make more room for the canvas. If you resize the palette or the Inspector while the palette is open, this browser remembers the layout and opens the palette on your next visit.

The page opens the first workflow in the list. If you have none, it opens the **Start from a manual trigger** template, not yet saved.

On a phone, the sidebar opens as a drawer named **Workflows**, and there is no palette. Tap **Add step** (the **+** button) in the top bar to add a step. Tap a step to open its settings at the bottom of the screen.

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
- **Mail, calendars and drives**: for example **Mail arrives**, **Event starting** or **File added**.
- **Events in Metis Suite**: for example **A run fails**, **Phishing detected** or **Member joins**.
- **Other workflows and services**: **When called** runs when another workflow calls it, and **Webhook** runs when another service sends it a request.
- **Sending mail**: **Before mail is sent** runs each time you send mail, so it can add a BCC address.

See [Triggers](/guide/workflows/triggers) for the details of each one.

Runs happen in the background on your server. You do not need to keep Metis Suite open. Each run is recorded, and you can see what every step did under **Activity**. See [Run a workflow and check its history](/guide/workflows/run-and-check-history).

## Who a workflow runs as

A workflow runs as the person who created it. It can only reach the mailboxes, calendars and drives that person can reach in the workspace. Run details show this person under **Runs as**. Editing a workflow does not change who it runs as. A workflow that another workflow calls runs as its own creator.

If the person who created a workflow leaves the workspace, the workflow can no longer run. Its runs are blocked, and the run details say why, for example "The workflow's owner is no longer in this workspace".

## Who can see and change workflows

Workflows belong to a workspace, and every member of the workspace can use them:

- You see the workflows you created, plus every workflow whose mailboxes, calendars and drives you can all see.
- Any member can create, edit, test, turn on, turn off and run the workflows they can see.
- Only workspace owners and admins can delete a workflow.

Run history follows the same rule. Details from a mailbox, calendar or drive you cannot see are hidden, and addresses you cannot see read "[hidden address]".

## Every save keeps a version

Each time you save a workflow, Metis Suite keeps that version as a new **revision**. Each run records the revision it used, so the history always shows the workflow as it was when it ran, even after you change it. Runs that already started finish on their own revision. To see what each save changed, open **Revisions** in the editor's **More workflow actions** menu. See [Manage workflows](/guide/workflows/manage-workflows#see-what-each-save-changed).

## Workflows can wait for a person

An **Ask for approval** step pauses a run until the people you choose approve or deny it, or until a deadline passes. Their requests appear under **Approvals**. See [Ask for approval](/guide/workflows/approvals).

Steps that send or create something, such as **Send mail**, **Reply** or **Create an event**, are never repeated. If Metis Suite cannot tell whether one of them went through, the step is marked "Needs review" instead of trying again, so nothing is sent twice.

Before you turn on a new workflow, try it with **Test**, which changes nothing. See [Test a workflow](/guide/workflows/test-a-workflow).

## AI in workflows

The steps in the **AI** category use an AI model. They follow the same AI switches as the rest of the workspace: AI must be on for every mailbox, calendar and drive the step reads, and for the ones that earlier steps read. See [Workspaces](/guide/workspaces) for the AI switches.

When AI decides who receives a message or an invitation, or where a file goes, the workflow needs an **Ask for approval** step before the step that acts. See [Steps](/guide/workflows/steps#ai).

Approval also comes in when you ask the Workspace Assistant to change your workflows. See [Manage workflows](/guide/workflows/manage-workflows#change-workflows-from-the-assistant).

## Other features that run in the background

**Schedule send** and **Snooze** in the mail app also run in the background on your server. They are not listed on the Workflows page, and their runs do not appear under **Activity**. You manage them from your mailbox. See [Mail](/guide/mail).

Your server also runs a daily clean-up that removes old workflow data. It is not listed on the Workflows page either. See [Limits](/guide/workflows/limits#how-long-run-data-is-kept).
