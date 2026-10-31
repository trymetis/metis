---
title: Run a workflow and check its history
description: Start a workflow yourself with Run now, and see what every run did, step by step.
---

Most workflows run on their own, when their trigger fires. You can also start one yourself, and always look back at what each run did. To try a workflow without changing anything, see [Test a workflow](/guide/workflows/test-a-workflow).

## Run a workflow now

1. Click **Workflows** in the left rail, then click the workflow in the list.
2. Click **Run now** in the top bar, or press **w** then **r**.
3. If the **Run by hand** trigger declares inputs, a dialog named **Run** and the workflow's name opens: "Fill in the inputs this run starts with." Fill in each field, then click **Run now**.

The **Runs** tab opens under the canvas, and the new run is drawn on the canvas while it happens. Each step shows its status and how many items it handled, and the connections the items took are highlighted. To see the full details, click **Details**.

**Run now** shows only when the workflow is saved, and its saved version has a **Run by hand** or **On a schedule** trigger. It uses the **Run by hand** trigger, or the schedule when there is no **Run by hand** trigger.

Keep in mind:

- **Turn the workflow on first.** A disabled workflow is refused with "Turn this workflow on before running it".
- **Run now runs the saved version.** If you have unsaved changes, you see "Running the saved version. Save to run your latest changes." Click **Save** first to run your changes.
- **The workflow needs a Run by hand or On a schedule trigger.** Otherwise you see "Add a Run by hand or a schedule trigger before running this workflow". A workflow that only watches mail, calendars or drives cannot be started by hand. Use **Test** instead.
- **Rate limits apply.** If the workflow's **Rate limit** setting does not allow another run yet, you see "That run is already queued". See [Manage workflows](/guide/workflows/manage-workflows#change-the-workflow-settings).
- **A run acts for real.** It sends, labels, moves, creates and deletes just as an automatic run would.

## See the runs of one workflow

The **Runs** tab under the canvas lists the last 20 runs of the workflow you have open. Each row shows the status, how many steps were done or failed, any error, and how long ago it ran. A new workflow says "Save the workflow to run it. Until then, try it with a test run." A saved one with no runs says "No runs yet. Press Run now, or wait for a trigger to fire."

Click a run to draw it on the canvas. A line above the list says "Showing run" followed by the first characters of the run's id. If the workflow changed since then, it adds "It ran an earlier version of this workflow." Click a step to see each item it handled under **In the selected run** in the Inspector. While the run is going, the canvas updates every 2 seconds.

- Click **Details** to open the run's page. See [Read one run](#read-one-run).
- Click **Replay in a test** to test the workflow again with this run's event. See [Test a workflow](/guide/workflows/test-a-workflow#replay-an-earlier-run).
- Click **Hide**, or click the run again, to stop showing it.

If the run is waiting for an approval you can give, you can approve or deny it right there. See [Ask for approval](/guide/workflows/approvals).

## See every run

Click **Activity** at the bottom of the workflow list. The **Workflow activity** page lists up to the latest 100 runs in the workspace that you can see, newest first, and refreshes on its own. To see the runs of one workflow, choose it in the list at the top right, which shows **All workflows** to start with.

<img src="/images/workflows/activity.webp" alt="The Workflow activity page with a list of runs" class="dark:hidden" />
<img src="/images/workflows/activity-dark.webp" alt="The Workflow activity page with a list of runs" class="hidden dark:block" />

Each run shows:

- An icon for its outcome, the workflow name, and how long ago it ran.
- Its status, plus "attempt" and a number when it was tried more than once.
- The error, if there was one.
- One small tag for each step that ran. "×3" after a step name means it ran for three items. A question mark means the step needs review. A cross means the step failed. Three dots mean the step is waiting.

If nothing has run yet, the page says "No runs recorded yet. Runs appear here once a trigger fires."

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

Click a run to open its details. The header shows the workflow name, the status and the run's id. The back arrow returns to **Workflow activity**.

<img src="/images/workflows/run-detail.webp" alt="The details of one run, with its facts, the graph and the selected Label step" class="dark:hidden" />
<img src="/images/workflows/run-detail-dark.webp" alt="The details of one run, with its facts, the graph and the selected Label step" class="hidden dark:block" />

### The facts

| Fact         | What it shows                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**  | What started the run: "Run manually", "Schedule fired", "Something changed" (a mail, calendar or drive trigger), "App event" (an event in Metis Suite), "Inbound request" (a webhook) or "Called by another workflow". Details may follow, such as the trigger's name, the time the run was for, how many missed scheduled times were combined, and who pressed **Run now**. |
| **Revision** | The saved version that ran, for example "Revision 3", and when it was saved. "current" means nobody changed the workflow since. Otherwise it says the workflow was edited since, with the newer revision, or deleted since.                                                                                                                                                  |
| **Runs as**  | The person the workflow runs as. "A former member" means that person has left the workspace.                                                                                                                                                                                                                                                                                 |
| **Timing**   | When the run started, when it finished and how long it took. A run that has not started shows when it is due. "attempt" and a number show when it was tried more than once.                                                                                                                                                                                                  |
| **Error**    | The reason the run failed, if it did.                                                                                                                                                                                                                                                                                                                                        |

### Waits

If the run waited, the **Waits** section lists each wait: "Waiting until", "Waiting for an event", "Waiting for approval" or "Waiting for a called workflow". Each one shows its state (open, resolved, timed out or cancelled), when it wakes or times out, and for approvals the request, when it was asked, and "Approved by" or "Denied by" and the name. You can answer an open approval here.

### The trigger event and the output

Click **Trigger event** to see what started the run, and **Run output** to see what the run gave back.

### The graph

The **Graph** shows the workflow exactly as it was when it ran. Each step is coloured by what happened to it. The legend below the graph explains the colours: **Completed**, **Skipped**, **Waiting**, **Failed**, **Blocked**, **Needs review**, **Not reached**, and **In progress or sending**. A solid line is a **Path taken**, and a dashed line is **Not taken**.

Click a step to open its details in a card below the graph. Click **Close step detail** to close it. On a touch screen, tap **Move the graph** to pan and zoom, and **Stop moving the graph** when you are done.

<img src="/images/workflows/run-selected-step.webp" alt="The details card for the selected Label step, listing each message it labelled" class="dark:hidden" />
<img src="/images/workflows/run-selected-step-dark.webp" alt="The details card for the selected Label step, listing each message it labelled" class="hidden dark:block" />

### The steps

Under **Steps**, every step has a card with its status, for example "fired" for the trigger, "completed", "not reached" or "needs review". Under the card's title, a row of badges sums up the step's results. The badges for failed, blocked and needs-review results are red. Below the badges is one row for each item the step handled. A row shows:

- The status, and the number of attempts when there was more than one.
- A title and a subtitle for the item, such as the subject and sender of a message.
- When a waiting item wakes.
- For steps with several outputs, the path the item took. **Branch** rows also show how sure the AI model was.
- Any detail or error, and when the step ran and how long it took.
- For an item whose outcome needs review, a **Resolve** button. See [Resolve a step with an unconfirmed outcome](/guide/workflows/cancel-and-retry-runs#resolve-a-step-with-an-unconfirmed-outcome).
- For an item someone resolved, who did it and when: "Confirmed by" and the name, or "Closed by" and the name, with the reason and any note.
- In the card of the step you selected, the item's **Input** and **Output**.

**Wait for all**, **Aggregate** and **End loop** steps show one extra row with no name. It is the point where the step waits for its inputs:

- Its status reads "failed" if any input failed, and "blocked" if any input is blocked. Otherwise it reads "Waiting for inputs" while an input is still running or waiting, and "completed" once every input has finished.
- While it is only waiting, a grey line says which inputs it is waiting for, for example "waiting for input 2 to finish".
- When an input is blocked or failed, a red line says so, for example "held: input 1 is blocked" or "held: input 1 did not succeed".
- One badge for each input shows "Input" and its number, the input's state and how many items it passed on, for example "Input 1: finished · 3 items". The state is "finished", "waiting", "not finished", "blocked" or "failed".

### What you may not see

- **Hidden details.** Details from mailboxes, calendars and drives you cannot see are left out, and addresses you cannot see read "[hidden address]".
- **Cleared data.** Inputs, outputs and events are kept for a limited time, 7 days unless your administrator changed it. After that, the run still shows its steps and statuses, but not the data. See [Limits](/guide/workflows/limits#how-long-run-data-is-kept).
- **Missing runs.** If a run does not exist or you cannot see it, the page says "This run does not exist or is not visible to you."

While a run is still going, the page updates on its own.

## Automatic retries

When a run fails for a reason that may pass, such as a mail server that does not answer, Metis Suite tries it again on its own a few times, with a growing wait between tries. Each new try shows as "attempt" and a number, for example "attempt 2". If it still does not succeed, the run ends as **failed**, **partial** or **blocked**, and you can retry it yourself.

## Runs from before the upgrade

Runs from before the workflow engine upgrade are kept as history. They show "from before the upgrade" under **Activity**, and their details say "This run happened before the workflow engine was upgraded. It is kept as history and cannot be retried." They cannot be replayed in a test either. To do the work again, run the workflow again.
