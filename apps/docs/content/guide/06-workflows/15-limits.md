---
title: Limits
description: The sizes, rules and problem messages every workflow has to fit, and how long run data is kept.
---

This page lists the limits a workflow has to fit, how long run data is kept, and the problem messages the editor shows.

## Sizes

| Item                                             | Limit                                                         |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Workflow name                                    | 80 characters                                                 |
| Step name                                        | 60 characters                                                 |
| Steps in one workflow                            | 100                                                           |
| Connections in one workflow                      | 200                                                           |
| Expression                                       | 2,000 characters                                              |
| Text with `{{ }}` values                         | 20,000 characters                                             |
| Declared fields (inputs, body fields, AI fields) | 30, with names up to 40 characters and descriptions up to 300 |
| **Set fields** values                            | 30                                                            |
| **Switch** cases                                 | 20, with names up to 40 characters                            |
| **Classify** categories                          | 2 to 20, with names up to 40 characters                       |
| Inputs on a **Merge** or **Wait for all** step   | 16                                                            |
| **Loop**                                         | 100 entries                                                   |
| **Download a file**                              | Files up to 10 MB                                             |
| **Read a file**                                  | The first 20,000 characters                                   |
| **Agent**                                        | 1 to 20 tool calls, 1 to 30 minutes                           |
| **List a folder** and **Search mail**            | Up to 100 messages                                            |
| **List events**                                  | Up to 250 events                                              |
| Drive **List a folder**                          | Up to 500 files                                               |
| **Search files**                                 | Up to 200 files                                               |
| **Ask** questions                                | 20 in one step, 500 characters each                           |
| **Pick one** answer name                         | 40 characters                                                 |
| "When it applies" note                           | 200 characters                                                |
| Text sent to the model by **Ask**                | The first 8,000 characters of a long body                     |
| **Try on recent mail**                           | 10 newest inbox messages, up to 10 tries a minute             |
| Webhook required headers                         | 10                                                            |
| Webhook body                                     | 256 KB                                                        |
| Webhook requests                                 | 120 a minute for each webhook                                 |
| Approval note                                    | 500 characters                                                |
| **Runs at the same time**                        | 1 to 20                                                       |
| Rate limit period                                | 1 to 10080 minutes                                            |
| Test runs                                        | Up to 10 a minute                                             |
| Items to pick from in a test run                 | The 15 newest                                                 |
| Pinned sample                                    | 64 KB                                                         |
| Runs in the editor's **Runs** tab                | The latest 20                                                 |
| Runs shown under **Activity**                    | The latest 100                                                |
| Undo                                             | The last 100 changes                                          |
| Automatic retries                                | A few attempts, with a growing wait between them              |

## How long run data is kept

Your server keeps two kinds of run data, each for a time your administrator sets:

- **Step data**: each step's input and output, the trigger event and the run's output. It is kept for 7 days by default. After that, the run still shows its steps and statuses, but not the data, and the run can no longer be retried. Your administrator can also choose to clear it as soon as each run ends.
- **Run history**: the runs themselves. They are kept for 90 days by default, then removed from **Activity**. A run is kept past this limit while a step in it still has an unconfirmed outcome that nobody has resolved. This applies to steps that send mail, create an event, answer an invitation or write a file. See [Resolve a step with an unconfirmed outcome](/guide/workflows/cancel-and-retry-runs#resolve-a-step-with-an-unconfirmed-outcome).

A daily clean-up removes the old data. It does not appear on the Workflows page.

## Rules for connections

- Every workflow starts with a trigger, and every other step has to be connected to one.
- A trigger cannot receive a connection.
- A step cannot connect to itself, and steps cannot loop back on themselves.
- Each ordinary step takes one incoming connection. Use **Merge** or **Wait for all** to join branches, with each branch on its own input.
- Everything coming into one step must be the same kind of item.
- An **Ask** step's outputs connect only to **Branch** steps, and a **Branch** step only takes input from an **Ask** question.
- After **Before mail is sent**, only **If**, **Switch**, **Filter**, **Stop** and **Add a Bcc** can follow, and it must be the workflow's only trigger.
- **Add a Bcc** works only after **Before mail is sent**.
- **Loop** and **End loop** work as a pair. Every **End loop** needs exactly one **Loop** before it, and an inner loop closes before the outer one. See [Loop and End loop](/guide/workflows/steps#loop-and-end-loop).

## Problem messages

The editor checks the workflow after every change. A problem shows in red at the bottom of the step's card and in the Inspector, and the top bar shows a red button such as **1 problem**. Click the button to select the first step with a problem. Problems that belong to the whole workflow, such as a missing trigger, show in the Inspector when no step is selected.

A workflow with problems cannot be saved. When you click **Save** or **Create workflow**, you see "Fix the problem in this workflow before saving" or, for example, "Fix the 2 problems in this workflow before saving", and the first step with a problem is selected. A workflow without a name shows "Give your workflow a name".

### The workflow's shape

| Message                                                                 | What to do                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "Add a trigger to start this workflow"                                  | Add a trigger from the **Triggers** category of the step palette, or press **w** then **a** and search for it.           |
| "Connect this step to a trigger"                                        | Connect the step, or remove it.                                                                                          |
| "Nothing can connect into a trigger"                                    | Remove the connection that goes into the trigger.                                                                        |
| "Steps are connected in a loop; remove one connection"                  | Remove a connection so that items never come back to a step they already passed.                                         |
| "Only Merge and Wait for all take more than one connection; add one"    | Remove a connection, or add a **Merge** or **Wait for all** step.                                                        |
| "This step has a single input"                                          | Connect only one step to this step's input.                                                                              |
| "Connect each branch to its own input" or "Two branches share an input" | Connect each branch to its own input, such as "Branch 1" and "Branch 2".                                                 |
| "Connect at least two branches"                                         | Connect a second branch to the **Merge** or **Wait for all** step, or remove it.                                         |
| "Everything coming into this step must be the same kind of item"        | Make sure every branch into the step passes on the same kind of item.                                                    |
| "A connection leaves from an output this step no longer has"            | Remove the connection, or bring back the output, for example a removed case.                                             |
| "A connection points at a step that no longer exists"                   | Remove the connection.                                                                                                   |
| "This step no longer exists; remove it"                                 | Remove the step and add a current one.                                                                                   |
| "Two steps share an id"                                                 | Remove one of the steps and add it again.                                                                                |
| "End loop needs exactly one Loop before it"                             | Add a **Loop** before the **End loop**, or remove the **End loop**. With loops inside loops, close the inner loop first. |

A workflow can hold up to 100 steps and 200 connections. If yours needs more, split it into two and use **Call workflow** between them.

### Settings

| Message                                                                     | What to do                                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Fill in" and the setting's name                                            | Fill in that setting.                                                                                                              |
| The setting's name, then what is wrong with its expression                  | Fix the expression. See [Expressions](/guide/workflows/expressions).                                                               |
| The setting's name, then "cannot use an expression"                         | Use a fixed value for that setting.                                                                                                |
| "Remove the unknown setting" and a name                                     | Remove the step and add it again.                                                                                                  |
| "Pick a valid time zone"                                                    | Pick a time zone from the **Time zone** list.                                                                                      |
| "Use a five-field cron expression"                                          | Fix the **Cron expression**, or pick another choice under **Repeats**. See [Triggers](/guide/workflows/triggers#custom-schedules). |
| "That mailbox is not in this workspace" (or calendar, or drive)             | Pick another one. The list marks the missing one "Not in this workspace".                                                          |
| "That workflow is gone; pick another"                                       | Pick another workflow in **Call workflow**.                                                                                        |
| "That workflow needs a When called trigger"                                 | Add a **When called** trigger to the workflow you call, or pick another one.                                                       |
| "Only a step that changes something can be skipped"                         | Turn off **Skip this step**.                                                                                                       |
| "Fix the" and what, then the reason, or "Two" and what, then "share a name" | Fix the declared field, or rename one of the two.                                                                                  |
| "Add a case"                                                                | Add at least one case to the **Switch** step.                                                                                      |
| "Add at least two categories"                                               | Add categories to the **Classify** step.                                                                                           |
| "Add a field for the model to fill in"                                      | Declare at least one field under **Fields**.                                                                                       |
| "Write each IP as an address or CIDR range"                                 | Fix the **Only from these IPs** list of the **Webhook** trigger.                                                                   |
| "Fix the required headers"                                                  | Give each required header a name and a value.                                                                                      |

### Triggers, sending and AI

| Message                                                                              | What to do                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A step's name, then "cannot run before a message is sent"                            | Use only **If**, **Switch**, **Filter**, **Stop** and **Add a Bcc** after **Before mail is sent**.                          |
| "A Before mail is sent trigger must be the workflow's only trigger"                  | Remove the other triggers, or move them to another workflow.                                                                |
| "Connect this step to an outgoing message"                                           | Connect **Add a Bcc** after a **Before mail is sent** trigger.                                                              |
| A step's name, then "is only used by built-in workflows"                             | Remove the step.                                                                                                            |
| "Turn AI on for every mailbox, calendar and drive this step reads"                   | Turn AI on for them, or read from others. See [Workspaces](/guide/workspaces).                                              |
| A setting's name, then "comes from AI; add an Ask for approval step before this one" | Add an **Ask for approval** step after the AI step and before this one. See [Ask for approval](/guide/workflows/approvals). |
| "Add a question to this Ask step"                                                    | Add at least one question.                                                                                                  |
| "Two questions share an id"                                                          | Remove one of the questions and add it again.                                                                               |
| "A Pick one question can offer at most 255 answers, Other included"                  | Remove some answers.                                                                                                        |
| "An Ask step's questions connect only to Branch steps"                               | Connect each question output of the Ask step to a **Branch** step.                                                          |
| "Connect this Branch step to a question of an Ask step"                              | Connect one of the Ask step's question outputs to this **Branch** step.                                                     |
| "Ask and Branch steps are turned off on this instance"                               | Remove the Ask and Branch steps, or ask your administrator.                                                                 |

## Other limits

- **Watching is not instant.** Triggers that watch mail, calendars and drives start shortly after the change, not at the same moment.
- **What is already there is skipped.** When a watching trigger starts, the mail, events or files already there do not start runs.
- **Drive triggers watch one folder.** Files in folders inside it are not watched.
- **A workflow can only reach what its creator can reach.** It uses the mailboxes, calendars and drives of the person who created it.
- **Unconfirmed steps wait for a person.** If Metis Suite cannot tell whether a step that sends or creates something went through, you resolve it from the run's details. See [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#resolve-a-step-with-an-unconfirmed-outcome).
