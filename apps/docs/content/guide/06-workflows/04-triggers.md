---
title: Triggers
description: Every way a workflow can start, what each trigger passes on, and how to set a schedule and its time zone.
---

A trigger decides when a workflow runs. Every workflow starts with at least one trigger, and a trigger never has a connection coming into it. Add a trigger from the **Triggers** category of the step palette, or press **w** then **a** and search for it. Click a trigger on the canvas to see its settings in the Inspector.

A workflow can have more than one trigger. For example, to watch two mailboxes for new mail, add one **Mail arrives** trigger for each. **Before mail is sent** is the exception: it must be the workflow's only trigger.

| Group                                                                   | Triggers                                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [By hand or on a timetable](#by-hand-or-on-a-timetable)                 | **Run by hand**, **On a schedule**                                                                                                                  |
| [From other workflows and services](#from-other-workflows-and-services) | **When called**, **Webhook**                                                                                                                        |
| [Mail](#mail-triggers)                                                  | **Mail arrives**, **Mail is sent**, **Mail is starred**, **Mail is labelled**                                                                       |
| [Calendar](#calendar-triggers)                                          | **Event created**, **Event changed**, **Event cancelled**, **Invitation received**, **Event ended**, **Reply to an invitation**, **Event starting** |
| [Drive](#drive-triggers)                                                | **File added**, **File changed**                                                                                                                    |
| [Events in Metis Suite](#events-in-metis-suite)                         | **A run fails**, **Phishing detected**, **AI labels mail**, **Member joins**                                                                        |
| [Sending mail](#before-mail-is-sent)                                    | **Before mail is sent**                                                                                                                             |

Each trigger passes on one item: the message, event, file or other details that started the run. Later steps read it as `trigger`, and the first step after the trigger also reads it as `item`. See [Expressions](/guide/workflows/expressions).

## Only when

Many triggers have an **Only when** setting: a condition on the event. The help text says "A condition on the event; leave it empty to run on every one." For example, on **Mail arrives**, `item.subject.contains("invoice")` starts a run only for messages whose subject contains "invoice".

You can build the condition from rows, such as a field, **contains** and a value, or write it as an expression. If you remove every row, the condition is empty and the trigger runs on every event. See [Expressions](/guide/workflows/expressions#build-a-condition-from-rows).

When a condition uses `date()` or `time()` without a time zone, it uses the workflow's time zone. See [The workflow's time zone](/guide/workflows/expressions#the-workflows-time-zone).

## By hand or on a timetable

### Run by hand

"Starts when someone presses Run, with the inputs you declare."

The workflow runs only when someone clicks **Run now** in the editor, or asks the Workspace Assistant to run it. Use it for clean-up jobs you want to start yourself, or to try a workflow before you put it on a schedule.

Under **Inputs**, you can declare values that the person who runs it fills in, such as a date or an address. Each input has a name, a **Type**, an optional description and a **Required** checkbox. See [Expressions](/guide/workflows/expressions#declared-fields).

The card says "When you press Run", plus "Asks for" and the input names when there are any. Later steps can read `trigger.inputs`, who ran it (`trigger.requestedBy`) and when (`trigger.requestedAt`).

See [Run a workflow now](/guide/workflows/run-and-check-history#run-a-workflow-now).

### On a schedule

"Starts at the times a schedule names, in its time zone."

A new schedule runs every weekday at 09:00, in your browser's time zone. Click the trigger to change it in the Inspector.

<img src="/images/workflows/schedule-trigger.webp" alt="The Inspector for an On a schedule trigger set to Every day at 07:00, with its time zone and next runs" class="dark:hidden" />
<img src="/images/workflows/schedule-trigger-dark.webp" alt="The Inspector for an On a schedule trigger set to Every day at 07:00, with its time zone and next runs" class="hidden dark:block" />

Pick how often it runs under **Repeats**. Each choice shows the fields it needs:

| Repeats           | Fields                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Every hour**    | **Minutes past the hour**, from 0 to 59                                                                    |
| **Every day**     | **At**: the time of day                                                                                    |
| **Every weekday** | **At**: the time of day, Monday to Friday                                                                  |
| **Every week**    | **On**: the day of the week, and **At**: the time of day                                                   |
| **Every month**   | **On day**: the day of the month, from 1 to 31, and **At**: the time of day                                |
| **Custom (cron)** | **Cron expression**: any schedule written as a cron expression. See [Custom schedules](#custom-schedules). |

With **Every month**, a day after the 28th shows a note such as "Months without day 31 are skipped." In those months, the workflow does not run.

Under **Time zone**, pick the time zone the times are in. Type part of a name, such as `Berlin` or `New_York`, to search the list. If nothing fits, the list says "No time zone matches". A time zone that is not valid shows the problem "Pick a valid time zone".

**Next runs** shows the next three times the workflow will run, so you can check the schedule before you save. If the schedule can never run, it says "This schedule never fires as written."

The card on the canvas sums up the schedule, for example "Weekdays at 09:00" or "Every day at 09:00", with the time zone below it.

Later steps can read when the run fired (`trigger.firedAt`), the time it was scheduled for (`trigger.scheduledFor`) and whether missed times were combined into it (`trigger.missed`).

#### Custom schedules

Choose **Custom (cron)** under **Repeats** to write the schedule as a cron expression. A cron expression is five values separated by spaces. The field's help says: "Five fields: minute, hour, day of month, month, day of week." A `*` means "every". Days of the week run from `0` (Sunday) to `6` (Saturday).

| Cron           | Runs                                 |
| -------------- | ------------------------------------ |
| `0 9 * * 1-5`  | 9:00 every Monday to Friday          |
| `0 7 * * *`    | 7:00 every day                       |
| `30 17 * * 5`  | 17:30 every Friday                   |
| `0 8,13 * * *` | 8:00 and 13:00 every day             |
| `*/30 * * * *` | Every 30 minutes                     |
| `0 6 1 * *`    | 6:00 on the first day of every month |

If the expression is not a valid five-field cron expression, the step shows "Use a five-field cron expression" straight away, and the workflow cannot be saved until you fix it.

#### When scheduled runs happen

A run can start a little after the scheduled minute. If your server was down when one or more scheduled times passed, the workflow runs once when the server is back, not once for every missed time. The run details then say how many missed times were combined.

**Run now** also works with a scheduled workflow, so you can run it without waiting.

## From other workflows and services

### When called

"Starts when another workflow's Call workflow step runs it, with the inputs you declare."

Use it to build a workflow once and use it from several others. Under **Inputs**, declare the values the calling workflow passes in. The card says "When another workflow calls it", plus "Takes" and the input names. Later steps can read `trigger.inputs`. To give a result back to the caller, end the workflow with a **Return** step. See [Steps](/guide/workflows/steps#waits-and-flow).

### Webhook

"Starts when another service posts JSON to this workflow's URL. The body becomes the run's input."

Once you save the workflow, the trigger shows a web address and a secret that the other service uses. See [Start a workflow from a webhook](/guide/workflows/webhooks).

## Mail triggers

Each mail trigger passes on the message as its item.

| Trigger              | Description on screen                                                              | Settings                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Mail arrives**     | "Starts for each new message in a folder of a mailbox."                            | **Mailbox**, **Folder** (Inbox to start with; also Sent, Drafts, Starred, Trash, Archive or Spam), **Only when** |
| **Mail is sent**     | "Starts for each new message in a mailbox's Sent folder, whoever sent it."         | **Mailbox**, **Only when**                                                                                       |
| **Mail is starred**  | "Starts when a message in a mailbox gets a star."                                  | **Mailbox**, **Only when**                                                                                       |
| **Mail is labelled** | "Starts when a label is put on a message in Metis, by a person, AI or a workflow." | **Mailbox**, **Label**                                                                                           |

The **Mail arrives** card says "Watching" and the mailbox address. It adds the folder when it is not the inbox, and the **Only when** condition when there is one.

<img src="/images/workflows/new-mail-trigger.webp" alt="A Mail arrives card watching a mailbox address" class="dark:hidden" />
<img src="/images/workflows/new-mail-trigger-dark.webp" alt="A Mail arrives card watching a mailbox address" class="hidden dark:block" />

**Mail is labelled** starts as soon as the label is put on, without waiting for a check.

## Calendar triggers

Each calendar trigger watches one connected calendar account and passes on the event as its item.

| Trigger                    | Description on screen                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| **Event created**          | "Starts for each new event in a calendar."                                   |
| **Event changed**          | "Starts when an event's time, title, place or attendees change."             |
| **Event cancelled**        | "Starts when an event is cancelled or deleted."                              |
| **Invitation received**    | "Starts for each new event that asks you to respond."                        |
| **Event ended**            | "Starts when each event ends."                                               |
| **Reply to an invitation** | "Starts when an attendee accepts, declines or tentatively accepts an event." |
| **Event starting**         | "Starts a set number of minutes before each event begins."                   |

They all have:

- **Calendar**: the calendar account to watch.
- **Only in calendar** (optional): one calendar of that account. Leave it empty for every calendar of the account.
- **Only when** (optional): a condition on the event.

**Event starting** has **Minutes before**, from 0 to 10080 (one week). It starts at 15. The card says, for example, "15 minutes before".

**Reply to an invitation** passes on the event (`trigger.event`), the attendee who replied (`trigger.attendee`) and their previous answer (`trigger.previous`).

## Drive triggers

| Trigger          | Description on screen                         |
| ---------------- | --------------------------------------------- |
| **File added**   | "Starts for each new file in a folder."       |
| **File changed** | "Starts when a file in a folder is modified." |

Both have **Drive**, **Folder** and **Only when**, and pass on the file as their item.

Under **Folder**, pick the folder to watch. "Only files directly in this folder are watched. Leave empty for the top of the drive." Files in folders inside it do not start the workflow. To watch another folder, add another trigger.

## Events in Metis Suite

These triggers start when something happens inside Metis Suite. They start straight away, without waiting for a check.

| Trigger               | Description on screen                                                                       | Settings                                                      | Passes on                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **A run fails**       | "Starts when a run of another workflow in this workspace fails, so this one can handle it." | **Only for**: one workflow, or leave empty for every workflow | The workflow (`workflowId`, `workflow`), the run (`runId`), the error (`error`) and when it failed (`failedAt`) |
| **Phishing detected** | "Starts when phishing detection flags a message."                                           | **Only in**: one mailbox, or leave empty for every mailbox    | The message (`message`), the verdict (`verdict`) and its score (`score`)                                        |
| **AI labels mail**    | "Starts when AI classification puts a label on a message."                                  | **Only in** (a mailbox) and **Only label**                    | The message (`message`) and the label (`label`)                                                                 |
| **Member joins**      | "Starts when someone joins this workspace."                                                 | None                                                          | The member (`member`, `userId`), their role (`role`) and when they joined (`joinedAt`)                          |

The **A run fails** card says "When" and the workflow name, then "fails", or "When any workflow fails". It never starts for a failure of its own workflow.

To try these triggers with **Test**, pin or paste a sample event first. See [Test a workflow](/guide/workflows/test-a-workflow).

## Before mail is sent

"Runs on each outgoing message before it leaves, so the workflow can amend it. Only logic and draft steps may follow."

This trigger runs each time someone in the workspace sends a message from the mail app, just before it goes out. This includes scheduled messages. Mail sent by the AI assistant, a connected AI client or a workflow does not trigger it.

Its only setting is **Only from**: pick one mailbox, or leave it empty for every mailbox ("Leave empty for every mailbox."). The card says "Every mailbox in this workspace" or "Sent from" and the address.

Only **If**, **Switch**, **Filter**, **Stop** and **Add a Bcc** can follow it, and it must be the workflow's only trigger. Use it to add a BCC address to outgoing mail. See [Add a BCC to outgoing mail](/guide/workflows/add-a-bcc-to-outgoing-mail).

These checks happen as part of sending, so they do not appear under **Activity**.

## How watching triggers work

The mail, calendar and drive triggers watch for changes. They work like this:

- **Only new changes start runs.** When you turn a workflow on, the mail, events or files already there are skipped. Only later changes start runs.
- **They are not instant.** Some providers tell Metis Suite about changes as they happen. Otherwise, Metis Suite checks every few minutes. Which one you get depends on your provider and on how your server is set up.
- **Turning a workflow off and on again starts fresh.** Changes that happened while it was off are skipped, and schedules start again from their next time.

Click a watching trigger to see how the watch is going. The Inspector shows one of these lines:

| Line                                    | Meaning                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| "Paused while the workflow is off."     | The workflow is turned off, so nothing is watched.           |
| "Changes are pushed by the provider."   | The provider tells Metis Suite about changes as they happen. |
| "Checks for changes every few minutes." | Metis Suite looks for changes on its own.                    |

After the first check, the line adds "Last checked" and how long ago that was. If the last check failed, the reason shows below in red.

You cannot use **Run now** with a workflow that only has watching triggers. You can still try it with **Test**, which runs it on one of the newest items. See [Test a workflow](/guide/workflows/test-a-workflow).
