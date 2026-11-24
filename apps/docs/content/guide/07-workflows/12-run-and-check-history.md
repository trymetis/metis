---
title: Run a workflow and check its history
description: Start a workflow yourself with Run now, and see what every run did, step by step.
---

Most workflows run on their own, when their trigger fires. You can also start one yourself, and always look back at what each run did. To try a workflow without changing anything, see [Test a workflow](/guide/workflows/test-a-workflow).

## Run a workflow now

1. Click **Workflows** in the left rail, then click the workflow in the list.
2. Click **Run now** in the top bar, or press **w** then **r**.
3. If the **Run by hand** trigger declares inputs, a dialog named **Run** and the workflow's name opens: "Fill in the inputs this run starts with." Fill in each field, then click **Run now**.

The **Runs** tab opens under the canvas, and the new run is drawn on the canvas while it happens. Each step shows its status and how many items it handled, and the connections the items took are highlighted. To see the full details, click the **Details** icon (an arrow pointing out of a box) at the right end of the line above the list.

**Run now** shows only when the saved version of the workflow has a **Run by hand** or **On a schedule** trigger. It uses the **Run by hand** trigger, or the schedule when there is no **Run by hand** trigger.

Keep in mind:

- **Turn the workflow on first.** A disabled workflow is refused with "Turn this workflow on before running it".
- **Run now runs the saved version.** If you have unsaved changes, you see "Running the saved version. Save to run your latest changes." Click **Save** first to run your changes.
- **The workflow needs a Run by hand or On a schedule trigger.** Otherwise you see "Add a Run by hand or a schedule trigger before running this workflow". A workflow that only watches mail, calendars or drives cannot be started by hand. Use **Test** instead.
- **Rate limits apply.** If the workflow's **Rate limit** setting does not allow another run yet, you see "That run is already queued". See [Manage workflows](/guide/workflows/manage-workflows#change-the-workflow-settings).
- **A run acts for real.** It sends, labels, moves, creates and deletes just as an automatic run would.

## See the runs of one workflow

The **Runs** tab under the canvas lists the last 20 runs of the workflow you have open. Each row shows the status, how many steps were done or failed, any error, and how long ago it ran. A workflow with no runs says "No runs yet. Press Run now, or wait for a trigger to fire."

Click a run to draw it on the canvas. A line above the list says, for example, "Showing run 3f9a1c2e on the canvas". The number is the start of the run's id. If the workflow changed since then, it adds "It ran an earlier version of this workflow." The line also shows the run's error, if there was one. For a run from before the upgrade, it says "From before the workflow engine upgrade." and has no **Replay in a test**. Click a step to see each item it handled under **In the selected run** in the Inspector. While the run is going, the canvas updates every 2 seconds.

At the right end of that line:

- Click **Replay in a test** to test the workflow again with this run's event. See [Test a workflow](/guide/workflows/test-a-workflow#replay-an-earlier-run).
- Click the **Details** icon (an arrow pointing out of a box) to open the run's page. See [Read one run](#read-one-run).
- Click the **Hide** icon (the **X**), or click the run again, to stop showing it.

Point at an icon to see its name.

You can also stop showing the run with **Clear**, next to "Showing a run on the canvas" at the top of the dock.

If the run is waiting for an approval you can give, you can approve or deny it right there. See [Ask for approval](/guide/workflows/approvals).

To see every run of the workflow, not only the last 20, open its own **Runs** page. See [The Runs page of one workflow](#the-runs-page-of-one-workflow).

## See every run

Click **Runs** at the top right of the **Workflows** page. The **Runs** page lists the runs in the workspace that you can see, newest first. Under the title, it says "Every workflow in this workspace". The page refreshes on its own about once a minute while you look at it, and again when you come back to its browser tab. The back arrow, **Back to workflows**, returns to the list of workflows.

<img src="/images/workflows/runs.webp" alt="The Runs page with its status filters and a list of recent runs" class="dark:hidden" />
<img src="/images/workflows/runs-dark.webp" alt="The Runs page with its status filters and a list of recent runs" class="hidden dark:block" />

The page shows up to 50 runs at first. To see older ones, click **Load older runs** at the bottom. Each click adds up to 50 more, as far back as the history goes.

Each run shows:

- An icon for its outcome, the workflow name, and how long ago it ran.
- Its status, plus "attempt" and a number when it was tried more than once.
- The error, if there was one.
- One small tag for each step that ran. "×3" after a step name means it ran for three items. A question mark means the step needs review. A cross means the step failed. Three dots mean the step is waiting.

### Filter the runs

To see the runs of some workflows only, click **All workflows** at the top right. Tick one or more workflows in the menu. The button then shows the workflow's name, or the number of workflows you picked, for example "3 workflows". To see every workflow again, click **All workflows** in the menu.

To see runs in one state, click a chip in the **Status** row:

| Chip          | Runs it shows                                |
| ------------- | -------------------------------------------- |
| **All**       | Every run. This is the default.              |
| **Failed**    | **failed**, **blocked** and **partial** runs |
| **Waiting**   | **waiting** runs                             |
| **Running**   | **pending** and **running** runs             |
| **Completed** | **completed** runs                           |
| **Cancelled** | **cancelled** and **stopping** runs          |

If nothing has run yet, the page says "No runs recorded yet. Runs appear here once a trigger fires." If runs exist but none fit your filters, it says "No runs match these filters."

### The Runs page of one workflow

Each workflow also has its own **Runs** page. To open it, do one of these:

- In the editor, click **More workflow actions** (**...**), then **Runs**. If you have unsaved changes, the dialog **Discard unsaved changes?** asks first.
- On the **Workflows** page, click the last run in the workflow's row. It shows only when the window is wide enough.
- In [workspace search](/guide/search/results-and-actions#workflows-and-workflow-runs), pick **Open its runs** on the workflow.

It works like the page for every workflow, with these differences:

- Under the title, it shows the workflow's name.
- There is no workflow filter. The **Status** chips are the same.
- The back arrow, **Back to the workflow**, opens the workflow in the editor.
- With the **All** chip and no runs, it says "No runs recorded yet. Runs appear here once a trigger fires." With another chip and no matching runs, it says "No runs match these filters."

### Run statuses

| Status        | Meaning                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| **pending**   | Waiting to start.                                                                                        |
| **running**   | Running now.                                                                                             |
| **waiting**   | Paused at a step that waits, such as **Delay**, **Wait for**, **Ask for approval** or **Call workflow**. |
| **completed** | Every step that was reached finished.                                                                    |
| **partial**   | Some steps finished, and others failed, were blocked or need review.                                     |
| **failed**    | The run failed.                                                                                          |
| **blocked**   | A step could not run until something is fixed, for example AI is turned off for a mailbox.               |
| **cancelled** | Someone cancelled the run, or the workflow was turned off or deleted while the run waited.               |
| **stopping**  | The run was cancelled while it was running, and it stops before its next step.                           |

To retry a **failed**, **partial** or **blocked** run, see [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs).

## Read one run

Click a run to open its details. The back arrow, **Back to runs**, depends on where you opened the run:

- **From one workflow's Runs page,** or from the **Details** icon in the **Runs** tab under the editor's canvas, it returns to that workflow's **Runs** page. From there, **Back to the workflow** opens the editor.
- **From anywhere else,** such as the **Runs** page for every workflow, **Open the run** in workspace search, or the **Approvals** panel, it returns to the **Runs** page for every workflow.

<img src="/images/workflows/run-detail.webp" alt="The details of one run: the header and the run facts at the top, the graph on the left, and More about this run with the card of the selected step on the right" class="dark:hidden" />
<img src="/images/workflows/run-detail-dark.webp" alt="The details of one run: the header and the run facts at the top, the graph on the left, and More about this run with the card of the selected step on the right" class="hidden dark:block" />

### The header

The title is the workflow's name. Next to it, a badge shows the run's status with its icon, for example **Completed**, **Waiting** or **Stopping**. See [Run statuses](#run-statuses).

On the right of the header:

- **Cancel run** shows for a **pending**, **running** or **waiting** run. See [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#cancel-a-run).
- **Retry failed steps** shows for a **failed**, **partial** or **blocked** run. See [The run facts](#the-run-facts) for where it sits when the run has an error.

### The run facts

Under the header, a row of facts sums up the run. Each fact has a small label above its value. A fact shows only when it applies. On a narrow screen, the facts wrap two to a row.

| Fact        | What it shows                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger** | What started the run and the kind of trigger, for example "Schedule fired · On a schedule".                                           |
| **Started** | When the run started, for example "Oct 8, 2026, 12:00 PM". A run that has not started shows **Due** instead, with the time it is due. |
| **Took**    | How long the run took, for example "12 seconds" or "3 minutes", once it has finished.                                                 |
| **Attempt** | The number of the try, for example "2", when the run was tried more than once. See [Automatic retries](#automatic-retries).           |

What started the run is one of these:

- "Schedule fired", for an **On a schedule** trigger.
- "Something changed", for a mail, calendar or drive trigger.
- "App event", for an event in Metis Suite.
- "Inbound request", for a webhook.
- "Called by another workflow".
- "Run manually", for a run started with **Run now**. It is followed by " · On a schedule" when the workflow has no **Run by hand** trigger.

When the run has an error, a red band under the run facts shows it. For a **failed**, **partial** or **blocked** run, **Retry failed steps** sits at the right end of this band. See [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#retry-a-run).

### The graph

The left part of the page shows the workflow exactly as it was when it ran. Above it, a line says "Revision" and its number, then "as it ran · select a step for its detail". Each step is coloured by what happened to it. The legend below the graph explains the colours: **Completed**, **Skipped**, **Waiting**, **Failed**, **Blocked**, **Needs review**, **Not reached**, and **In progress or sending**. A solid line is a **Path taken**, and a dashed line is **Not taken**.

On a touch screen, tap the **Move the graph** icon (four arrows) in the graph's controls to pan and zoom. Tap it again (**Stop moving the graph**) when you are done.

### The column beside the graph

A column on the right of the graph shows the rest of the run. In a narrower window, it moves under the graph. From top to bottom, it shows **More about this run**, the waits, the steps, the trigger event and the run's output.

#### More about this run

This section lists more facts about the run, one row each. A row shows only when it applies.

| Row               | What it shows                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scheduled for** | For a run started by a schedule: the time the run was due, for example "Oct 8, 2026, 9:00 AM".                                                                                                                                                                                                                           |
| **Missed runs**   | When scheduled times passed while your server was down: how many were combined into this run, for example "2 merged into this one". See [When scheduled runs happen](/guide/workflows/triggers#when-scheduled-runs-happen).                                                                                              |
| **Started by**    | For a run started by hand: the name and email address of the person who started it, for example "Ana Lopez (ana@example.com)". It says "A former member" if they have left the workspace.                                                                                                                                |
| **Runs as**       | The name and email address of the person the workflow runs as, or "A former member" if they have left the workspace. See [Who a workflow runs as](/guide/workflows/how-workflows-work#who-a-workflow-runs-as).                                                                                                           |
| **Revision**      | The saved version that ran, who saved it and when, for example "3 · saved by Ana Lopez, Oct 1, 2026, 4:12 PM". The name reads "a former member" if that person has left. "Edited since" on the next line means the workflow was saved again after this version. "Workflow deleted since" means the workflow was deleted. |
| **Run ID**        | The run's full id.                                                                                                                                                                                                                                                                                                       |

#### Waits

If the run waited, the **Waits** section lists each wait, with the name of its step and its kind: "Waiting until", "Waiting for an event", "Waiting for approval" or "Waiting for a called workflow". Each one shows:

- Its state: open, resolved, timed out or cancelled.
- When it wakes ("wakes" and a time) or times out ("times out" and a time).
- For approvals: the request, who was asked ("Asked" and their names), and "Approved by" or "Denied by" and the name.

If you are one of the approvers, you can answer an open approval here with **Approve** or **Deny**. You can add a **Note (optional)** of up to 500 characters. See [Ask for approval](/guide/workflows/approvals).

#### Steps

Under **Steps**, every step has a card with its name and its status, for example "fired" for the trigger, "completed", "not reached" or "needs review". If you renamed the step, the kind of step shows next to its name. Under the name, a row of badges sums up the step's results. The badges for failed, blocked and needs-review results are red.

#### The selected step

To see what a step did with each item, click the step in the graph, or click its name under **Steps**. The **Steps** list is replaced by the card of that step alone. Click the **X** at the top right of the card to go back to the list.

<img src="/images/workflows/run-selected-step.webp" alt="The details card for the selected Label step, listing each message it labelled" class="dark:hidden" />
<img src="/images/workflows/run-selected-step-dark.webp" alt="The details card for the selected Label step, listing each message it labelled" class="hidden dark:block" />

The card shows the badges, then one row for each item the step handled. A row shows:

- The status, and the number of attempts when there was more than one.
- A title and a subtitle for the item, such as the subject and sender of a message.
- When a waiting item wakes.
- For steps with several outputs, the path the item took. **Branch** rows also show how sure the AI model was.
- Any detail or error, and when the step ran and how long it took.
- For an item whose outcome needs review, a **Resolve** button. See [Resolve a step with an unconfirmed outcome](/guide/workflows/cancel-and-retry-runs#resolve-a-step-with-an-unconfirmed-outcome).
- For an item someone resolved, who did it and when: "Confirmed by" and the name, or "Closed by" and the name, with the reason and any note.
- The item's **Input** and **Output**.

**Wait for all**, **Aggregate** and **End loop** steps show one extra row with no name. It is the point where the step waits for its inputs:

- Its status reads "failed" if any input failed, and "blocked" if any input is blocked. Otherwise it reads "Waiting for inputs" while an input is still running or waiting, and "completed" once every input has finished.
- While it is only waiting, a grey line says which inputs it is waiting for, for example "waiting for input 2 to finish".
- When an input is blocked or failed, a red line says so, for example "held: input 1 is blocked" or "held: input 1 did not succeed".
- One badge for each input shows "Input" and its number, the input's state and how many items it passed on, for example "Input 1: finished · 3 items". The state is "finished", "waiting", "not finished", "blocked" or "failed".

#### The trigger event and the output

At the bottom of the column, click **Trigger event** to see what started the run, and **Run output** to see what the run gave back.

### What you may not see

- **Hidden details.** Details from mailboxes, calendars, drives and address books you cannot see are left out, and addresses you cannot see read "[hidden address]".
- **Cleared data.** Inputs, outputs and events are kept for a limited time, 7 days unless your administrator changed it. After that, the run still shows its steps and statuses, but not the data. See [Limits](/guide/workflows/limits#how-long-run-data-is-kept).
- **Missing runs.** If a run does not exist or you cannot see it, the page says "This run does not exist or is not visible to you."

While a run is still going or stopping, the page updates on its own about every 15 seconds.

## Automatic retries

When a run fails for a reason that may pass, such as a mail server that does not answer, Metis Suite tries it again on its own a few times, with a growing wait between tries. On the **Runs** page, each new try shows as "attempt" and a number, for example "attempt 2". On the run's page, the **Attempt** fact shows the number. If it still does not succeed, the run ends as **failed**, **partial** or **blocked**, and you can retry it yourself.

## Runs from before the upgrade

Runs from before the workflow engine upgrade are kept as history. They show "from before the upgrade" on the **Runs** page, and their details say "This run happened before the workflow engine was upgraded. It is kept as history and cannot be retried." They cannot be replayed in a test either. To do the work again, run the workflow again.
