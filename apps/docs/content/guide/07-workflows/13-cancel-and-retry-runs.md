---
title: Cancel and retry runs
description: Stop a run that is waiting or running, run the failed or blocked steps of a run again, and resolve steps whose outcome is unconfirmed.
---

You can stop a run before it finishes, retry a run that failed or was blocked, and resolve a step whose outcome is unconfirmed. All three start from the run's details page. Anyone who can see a run can cancel it, retry it and resolve its steps.

To open a run, click **Workflows** in the left rail, click **Activity** at the bottom of the list, then click the run. You can also open a workflow, click a run in the **Runs** tab under the canvas, and click **Details**.

## Cancel a run

**Cancel run** appears at the top right of a run that is **pending**, **running** or **waiting**.

1. Open the run and click **Cancel run**.
2. The dialog **Cancel this run?** opens. Read what it says, then click **Cancel run** to confirm, or **Keep running** to leave the run alone.

What happens depends on the state of the run:

- **The run has not started its next attempt yet,** or it is waiting. None of its remaining steps run.
- **The run is running now.** It stops before its next step. A step that is already in progress, a send included, cannot be called back and may still finish. Nothing the run already did is undone.

Either way, the workflow itself stays enabled, and the steps that finished stay in the history. A message at the bottom of the screen confirms the result, for example that the run was cancelled, or that the cancellation was recorded and the run stops before its next step. If the run had already finished or was already cancelled, the message says so and nothing changes.

A run you cancel while it is running shows the status **stopping**, with a note that it stops before its next step. Once the step that was in progress is done, its outcome appears in the run details.

To stop a workflow from running again, turn it off. See [Manage workflows](/guide/workflows/manage-workflows).

## Retry a run

**Retry failed steps** appears at the top right of a run whose status is **failed**, **partial** or **blocked**.

1. Fix the cause first. The run's **Error** and the step rows say what went wrong, for example "AI is turned off for this mailbox".
2. Open the run and click **Retry failed steps**.
3. The dialog **Retry this run?** opens. Click **Retry failed steps** to confirm, or **Not now** to go back.

The run is queued again and starts shortly after. A message says how many steps will run again and how many keep their results.

How a retry works:

- **Only the steps that failed or were blocked run again.** Steps that completed keep their results and do not run a second time, so nothing that was already sent or changed is done twice.
- **The retry uses the version that ran.** Even if you edited the workflow since, the retry follows the saved version the run started with.
- **The run keeps its place in the history.** It does not appear as a new run.
- **Answered questions are not asked again.** If an **Ask** step already finished, its answers are kept.

### When a run cannot be retried

The retry is refused, with a message that says why, when:

| Situation                                                                                                   | What to do                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The run is still queued or running.                                                                         | Wait for it to finish.                                                                                           |
| The run completed.                                                                                          | Nothing to retry.                                                                                                |
| The run was cancelled.                                                                                      | A cancelled run cannot be resumed. Run the workflow again.                                                       |
| The workflow is turned off.                                                                                 | Turn it back on, then retry.                                                                                     |
| The workflow was deleted.                                                                                   | Its runs can no longer be retried.                                                                               |
| The run finished longer ago than step results are kept (7 days unless your administrator changed it).       | Its results are gone, so it cannot be retried. Run the workflow again.                                           |
| The run started before the workflow engine upgrade.                                                         | Run the workflow again instead.                                                                                  |
| The results of the completed steps, or the message the run was going to send, are no longer stored.         | It cannot be retried. Run the workflow again.                                                                    |
| The person the workflow runs as left the workspace, or lost access to a mailbox, calendar or drive it uses. | Restore access to it before retrying.                                                                            |
| The saved version is no longer valid.                                                                       | Retrying would fail the same way. Fix the workflow and run it again.                                             |
| A send in the run has an unconfirmed outcome.                                                               | Resolve it first. See [Resolve a step with an unconfirmed outcome](#resolve-a-step-with-an-unconfirmed-outcome). |
| A send in the run was closed without resending.                                                             | Nothing after it can run. To send again, write a new message or run the workflow again.                          |
| Every step either completed or needs review.                                                                | Nothing is left to retry.                                                                                        |

## Resolve a step with an unconfirmed outcome

Steps that send or create something are never repeated. If Metis Suite could not tell whether one of them went through, for example because the provider did not answer, the step shows "needs review". The run cannot be retried, because a retry could send or create it twice. Instead, a person resolves the step: they confirm that it went through, or close it.

This applies to these steps: **Send mail**, **Reply**, **Forward**, **Create an event**, **Respond to an invitation**, **Create a file**, **Copy a file**, **Save attachment to a drive**, **Save message to a drive**, **Add an invitation file** and **Create a contact**.

Anyone who can see the run can resolve its steps. The AI assistant cannot do it for you.

### Open the step

1. Click **Workflows** in the left rail, click **Activity** at the bottom of the list, then click the run.
2. Under **Steps**, find the step that shows "needs review". The row of the item that needs review has a **Resolve** button.
3. Click **Resolve**. A dialog opens. Its title says what kind of step it is:

| Step                                                                                            | Dialog title                      |
| ----------------------------------------------------------------------------------------------- | --------------------------------- |
| **Send mail**, **Reply**, **Forward**                                                           | "Resolve an unconfirmed send"     |
| **Create an event**                                                                             | "Resolve an unconfirmed event"    |
| **Respond to an invitation**                                                                    | "Resolve an unconfirmed response" |
| **Create a file**, **Copy a file**, **Save attachment to a drive**, **Save message to a drive** | "Resolve an unconfirmed upload"   |
| **Add an invitation file**, **Create a contact**                                                | "Resolve an unconfirmed step"     |

If the run is still going, the dialog says "This run is still being handled. Wait for it to finish, then resolve the step." Close it and try again later.

### Confirm that it went through

For every step except **Add an invitation file**, the dialog looks at the provider for a match and lists up to five. Each one has a **This is it** button.

| Step                                                                                            | What counts as a match                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Send mail**, **Reply**, **Forward**                                                           | A message in the mailbox's most recent **Sent** mail with the same subject and recipients, sent around the time the step ran. |
| **Create an event**                                                                             | An event in the calendar with the same title, starting within a minute of the step's start time.                              |
| **Respond to an invitation**                                                                    | The event, when it shows the response the step sent.                                                                          |
| **Create a file**, **Copy a file**, **Save attachment to a drive**, **Save message to a drive** | A file with the same name in the destination folder, changed around the time the step ran.                                    |
| **Create a contact**                                                                            | A contact in the address book with the same name and email address.                                                           |

Click **This is it** on the right one. The step counts as done, and the steps after it in the run go on.

If nothing matches, the dialog says so. **Add an invitation file** cannot be checked at the provider, so for it you can only close the step. Check the calendar yourself first.

### Close it without trying again

If you cannot confirm the step, close it:

1. In the dialog, pick a reason. For a send, the reasons are "I believe it was delivered", "It was not delivered" (the default) and "I no longer want it sent". For other steps, they are "I believe it went through", "It did not go through" (the default) and "I no longer want it done".
2. Optionally, write a note under "Why (optional)", up to 500 characters.
3. Click **Close without resending** (for a send) or **Close without retrying** (for other steps).

Closing records your decision. It is not proof that the step went through or not. Nothing after the step runs, and the unconfirmed outcome stays in the run history. To send or create it again, do it by hand or run the workflow again.

Click **Not now** to leave the dialog without changing anything.

### After you resolve it

The step's row shows who resolved it and when: "Confirmed by" and the name, or "Closed by" and the name, followed by the reason you picked and your note.
