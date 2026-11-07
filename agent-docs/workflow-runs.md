# Workflow runs — cancel, resume, reconciliation, retention and history

What can be done to one run after it exists (cancel, resume, approval decisions, resolving an unconfirmed send, event or upload by hand), how long its data is kept, and what a caller may see of it.
Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [workflow-graph.md](workflow-graph.md), [workflow-runtime.md](workflow-runtime.md), [mail.md](mail.md).

## Code map

| Concern                  | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancel                   | `src/workflow/store.ts` → `cancelRun`, `closeStrandedCancels` · executor check `isCancelled` in `src/workflow/executor.ts` · domain op `src/workflow/index.ts` → `cancelWorkspaceRun`                                                                                                                                                                                                                                                                                   |
| Resume                   | `src/workflow/store.ts` → `resumeRun`, `settleRun` · `src/workflow/resume.ts` → `resumeCheckedRun` (and its refusal messages) · domain op `src/workflow/index.ts` → `resumeWorkspaceRun`                                                                                                                                                                                                                                                                                |
| Approvals                | `src/workflow/store.ts` → `decideWait`, `listOpenApprovals` · `src/workflow/index.ts` → `decideApproval`, `listPendingApprovals` · procedures `workflows.approvals`, `workflows.decide`                                                                                                                                                                                                                                                                                 |
| Unconfirmed dispatches   | `src/workflow/reconcile.ts` → `findUnconfirmedDispatch`, `inspectDispatch`, `resolveDispatch`, `findUnconfirmedSend`, `resolveUnconfirmedSend`, `dispatchWindow`, `MAIL_SEND_STEPS`, `SENT_SCAN_PAGES`, `CLOCK_SKEW_MS`, `DISPATCH_GRACE_MS` · per-step reconcilers `src/workflow/reconcilers.ts` → `RECONCILERS` · `src/workflow/fingerprint.ts` → `sendFingerprint` · `src/workflow/store.ts` → `resolveDispatchStepRun`, `claimedDispatchIds`, `loadDispatchStepRun` |
| Scheduled-send surfaces  | `src/workflow/builtins/scheduled-send.ts` → `retryScheduledSend` · procedures `mail.scheduledSend.*` in `src/server/routes/mail/scheduled-send.ts` · UI `src/app/w/[slug]/m/[mailbox]/scheduled/_components/{scheduled-view,resolve-send-dialog}.tsx` over `src/components/workflow-history/resolve-dispatch-dialog.tsx` → `ResolveDispatchDialog`, `resolveCopyFor`                                                                                                    |
| Retention                | `src/workflow/store.ts` → `pruneWorkflowData`, `clearRetainedOutputs` · system step `system.workflowPrune` (`WORKFLOW_PRUNE_ID`) · settings `workflowRunner.stepDataDays`, `historyDays` ([configuration.md](configuration.md))                                                                                                                                                                                                                                         |
| Run visibility           | `src/workflow/index.ts` → `canSee`, `getWorkspaceRun`, `listWorkspaceRuns` · `src/workflow/store.ts` → `loadRunDetail`                                                                                                                                                                                                                                                                                                                                                  |
| Run procedures and tools | `src/server/routes/workflows.ts` (`unconfirmedStep`, `resolveStep` among them) · `src/ops/workflow.ts` → `cancelWorkflowRun`, `resumeWorkflowRun` · surfaces `src/mastra/tools/workspace-workflow-tools.ts`, `src/mastra/mcp/tools/workflows.ts`                                                                                                                                                                                                                        |
| Run history UI           | `src/app/w/[slug]/workflow/history/_components/workflow-history.tsx` · `src/components/workflow-history/` → `workflow-run-detail.tsx`, `workflow-run-graph.tsx`, `run-waits.tsx`, `approval-actions.tsx`, `json-block.tsx` · `src/components/workflow-graph/overlay.ts` → `runOverlay`                                                                                                                                                                                  |
| Runs in the editor       | `src/app/w/[slug]/workflow/_components/runs-panel.tsx` → `RunsPanel` · `approvals-sheet.tsx` → `ApprovalsSheet`                                                                                                                                                                                                                                                                                                                                                         |

## Rules

### Cancel

- **A cancel changes only the run, and a cancel that loses the race to the last side effect reports the real outcome.** A run the worker already finished reports `finished` with its real status.
- **`cancelRun` is one transaction.**
  - A `pending` or `waiting` run flips to `cancelled` at once: its open waits close, its waiting steps become `skipped` and its step data is cleared.
  - A `running` run is marked `cancelled` while keeping its lease, so the executor's `isCancelled` checks stop it before its next side effect and the worker settles it.
- **A step that was about to start when the cancel landed is recorded `skipped`.**
- **Settle and release leave a cancelled run cancelled**; neither requeues it.
- **Disabling a user workflow cancels its queued and waiting runs**; deleting one also clears the step data of all its runs and drops its blobs and endpoints (`softDeleteDefinition`).

### Resume

- **A run can be resumed, never replayed.** `resumeRun` re-queues the same run (same revision, same event) as `pending` with its attempts reset.
  - The executor skips every step run already `completed` for its run, node and item key and reclaims only the `failed` and `blocked` ones, so a completed send or change is never repeated.
- **Resume depends on kept step data.** A run can be resumed only while its step outputs are kept (`stepDataDays`, at least one day for this check); after that `resumeRun` refuses with `expired`.
- **A run from before the engine upgrade (`upgraded`) is history only** and always refuses with `upgraded`: its step results are in the old format.
- **`resumeCheckedRun` re-validates before the claim**: the revision must still validate, the principal must resolve, and every mailbox, calendar, drive and address book the graph names must still be reachable by them.
- **Every refusal to resume carries an actionable message**; the refusals and their messages are in `resume.ts`.
- **The resume claim is one conditional `UPDATE` fenced on status, `finished_at` and a null lease**, so the check and the claim are one atomic step and simultaneous requests claim it once.
- **A step that never started counts as retryable only when a send verified by a person feeds it**; that is how a verified send's follow-up runs.

### Approvals

- **An approval is decided by one of its approvers, once.** `decideWait` updates the wait only while it is `open` and the caller is in its approver list, and sets the run due in the same transaction; a second decision finds nothing and is refused.
- **`workflows.approvals` lists only the caller's open approvals**; a run's detail lists all of its waits, with `canDecide` for the caller.

### Unconfirmed dispatches

- **An unconfirmed dispatch is resolved by a person, once, and never by running it again.** A dispatch step that ends without a receipt (an error, a timeout, a worker that died mid-call) settles `unknown` ([workflow-graph.md](workflow-graph.md)).
- **Before a dispatch step runs, the executor stores what it is meant to do in the step run's state (`expected`, from the runner's `expect`)**: a send's recipients and subject, an event's calendar, title and times, a response and its event, a file's drive, folder and name.
  - A scheduled send compares against its draft blob while that still exists.
- **A dispatch is confirmed only from what the provider shows now.** Sends (`MAIL_SEND_STEPS`) are checked against the Sent folder (below); `RECONCILERS` match a created event by title and start in its calendar, a response by the event's own answer, a written, copied or saved file by name in its folder, changed within the dispatch window, and a created contact by name and email in its address book.
  - Add an invitation file has no reconciler: what it creates depends on the file, so it can only be closed.
- **A created event, a written file or a created contact is confirmed only when no other completed step run holds it as its receipt** (`claimedDispatchIds` lists the candidates, and the resolving `UPDATE` checks again).
- **Resolution is single-shot**: one conditional `UPDATE` reads the status and requires `resolved_at IS NULL` and a settled, unleased run (`resolveDispatchStepRun`).
  - A late in-process provider result cannot overwrite a resolved step, because `reconcileStepRun` requires `resolved_at IS NULL` too.
  - A resolved step stays resolved when its run is cancelled.
  - A delivery claim is recorded as the person's decision, not as a provider receipt.
- **A send is verified only when the picked Sent message meets every check below**, all inside the one `UPDATE` that resolves it.
  - **Found in the Sent listing:** by id, in the sender mailbox's Sent listing, at most `SENT_SCAN_PAGES` pages, read under the run's principal. `getMessage` is not used, because Gmail, Microsoft and Zoho return only the id and body from it.
  - **Sender and subject** match exactly, with "(no subject)" counting as empty.
  - **To and Cc** are compared as two separate address sets, each equal to the expected one, including when empty.
  - **Bcc** is compared whenever the Sent copy shows it, and must then equal the expected one, even when that had none.
  - **Date:** between `CLOCK_SKEW_MS` before and `DISPATCH_GRACE_MS` after the send step's `started_at` (`dispatchWindow`). That column is written only when a step run is created or reclaimed, and a `dispatching` or `unknown` one is never reclaimed, so later re-marks cannot move it.
  - **Unique:** it is not another run's receipt, and not indistinguishable from an id-less completed send in that mailbox (Microsoft returns a `null` id) that settled within `CLOCK_SKEW_MS` of it with the same `fingerprint`.
- **Whether a Sent copy shows Bcc depends on the provider.**
  - The Resend and Cloudflare gateways store Bcc on sent mail; Gmail, Microsoft and Zoho list none.
  - On IMAP a copy shows it only if its raw message carries a Bcc header, and the copy Metis files itself (`MailComposer` in `src/mail/providers/imap.ts`) omits it.
  - On a copy that hides Bcc an extra Bcc goes unnoticed, which is why To, Cc, subject, sender and time must each match on their own.

### Retention

- **Step inputs and outputs are kept for `stepDataDays` after a run settles (7 by default); history is kept for `historyDays` (90 by default).** Both are instance settings ([configuration.md](configuration.md)).
- **`system:workflow-prune` applies them once a day** (`pruneWorkflowData`): it clears step inputs, outputs and state of settled runs older than `stepDataDays` (the barrier is kept), their trigger event and run output, drops their `bytes` blobs, deletes runs older than `historyDays` with their events, and deletes run-less events older than 30 days.
- **A run with an unresolved `dispatching` or `unknown` step is never deleted**, so an unconfirmed dispatch can still be resolved.
- **`stepDataDays = 0` clears step data when a run settles** and hides inputs and outputs from run detail; a scheduled send that went out clears its step data and drops its draft at settle.

### Visibility

- **A run's detail and listing hide what the caller cannot see, not just what the run touched.** `getWorkspaceRun` and `listWorkspaceRuns` omit a run unless the caller is its principal or can see every mailbox, calendar, drive and address book in its executed revision (`canSee`).

## How it works

- **Stuck cancels.** A cancelled run whose lease expires (its worker died) is closed on cancel or by `closeStrandedCancels` at the next tick, which turns its in-flight change steps into `unknown`. "Stopping" is `status = cancelled` with no `finishedAt`; `hasInFlightRun` counts it, so discovery waits for it.
- **Resume surfaces.**
  - `workflows.resumeRun` and "Retry failed steps" on the run detail.
  - `resumeWorkflowRun` on the workspace agent (approval) and MCP (`sensitive: true`).
  - `mail.scheduledSend.retry` (the latest run of that scheduled message, mailbox-scoped like `cancel`) in the scheduled view.
- **Resolving.** One dialog (`ResolveDispatchDialog`, worded per step by `resolveCopyFor`) shows the candidates and records the outcome with who, when and why.
  - A scheduled send: `mail.scheduledSend.unconfirmed` and `.resolve`, from the scheduled view.
  - A user workflow: `workflows.unconfirmedStep` and `workflows.resolveStep`, from the run detail, for anyone who can open the run; the run-detail item carries `resolvable` and its `resolution`.
  - **Verified:** the step becomes `completed` with a real receipt and the found message, event or file as its output, and keeps its original `finished_at`.
  - **Closed:** the step stays `unknown` with its error and no receipt, the draft and step data are dropped, and resume refuses with `send-closed`.
- **Cleanup after a resolution.** `finishResolution` drops the draft blob, clears step data of a closed send and, for a verified send, calls `resumeCheckedRun` for the follow-up; it marks the resolution finished last.
  - `finishPendingResolutions` re-runs it in every tick for a bounded batch, oldest first; a cleanup that throws is deferred by `FINISH_RETRY_MS`, so failing rows cannot starve newer ones.
- **Fingerprint.** `sendFingerprint` hashes the normalized subject plus the To and Cc address sets, stored on every send receipt.
- **Run history.**
  - Each item names what it handled: the executor stores a title and subtitle (a subject and sender, an event title, a file name) in the step run's `receipt.item`, which outlives the step data.
  - The executor writes the outputs each step run sent items on to `workflow_step_run.output_handles`, which decides the edges history draws as taken and the output labels an item shows.
  - Run detail returns each item's input and output while they are kept, the trigger event, the run's `flow.return` output, and every wait with its approvers and decision.
- **What an openable run still hides.**
  - An item whose input or output names a mailbox, calendar, drive or address book the caller cannot see loses its detail, error, input and output, and keeps its status.
  - Any address in an error, detail or approval request that is not one of the caller's visible mailboxes, calendars or drives reads `[hidden address]`.
- **The run-detail graph is the editor's graph, read-only.** It draws the revision's own positions with the shared `NodeCard`; `runOverlay` turns the detail into each step's status and item count and each edge's taken state and count.
- **The editor shows a run on its own canvas.** The Runs dock lists the workflow's recent runs; selecting one, or pressing Run now, draws that run's `runOverlay` over the current graph and polls while it is live, lists its open waits with approve and deny, and can replay its event in a test run ([workflow-graph.md](workflow-graph.md)).

## Deliberate limits

- **Resolving an unconfirmed dispatch is human-only**: no agent or MCP tool exists for it, and an unresolved one keeps its run from resuming.
- **A Bcc-only send whose Sent copy shows no Bcc cannot be verified.**
