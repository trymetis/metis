# Workflow engine — graphs, steps and execution semantics

What a workflow is: its tables, the graph and its typed values, expressions, the step registry, the builder, items and merges, triggers and their change feeds, inbound endpoints, waits and approvals, the AI steps, the test run, the principal a run acts as, and the built-in workflows.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [workflow-runtime.md](workflow-runtime.md), [workflow-runs.md](workflow-runs.md), [ai-agents.md](ai-agents.md), [database.md](database.md).

## Code map

| Concern                          | Where                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                           | `src/db/schema.ts` → `workflow`, `workflowRevision`, `workflowResource`, `workflowTrigger`, `workflowCursor`, `workflowEvent`, `workflowRun`, `workflowStepRun`, `workflowWait`, `workflowBlob`, `workflowEndpoint`                                                                                                                                                                             |
| Graph contracts (client-safe)    | `src/workflow/schema.ts` → `graphSchema`, `nodeSchema`, `edgeSchema`, `graphSettingsSchema`, `GRAPH_VERSION`, `MAX_MERGE_INPUTS`, `BARRIER_ITEM_KEY`                                                                                                                                                                                                                                            |
| Typed values                     | `src/workflow/values.ts` → `ValueType`, `RECORD_FIELDS`, `isAssignable`, `identityOf` · declared fields `src/workflow/fields.ts` → `FieldDecl`, `parseFieldDecls`, `parseAssignments`, `parseCases`                                                                                                                                                                                             |
| Expressions                      | `src/workflow/expr.ts` → `bindingSchema`, `checkBinding`, `inferType`, `evaluateBinding` (`@marcbachmann/cel-js`)                                                                                                                                                                                                                                                                               |
| Step registry                    | `src/workflow/steps/` → `triggers.ts`, `mail.ts`, `logic.ts`, `ai.ts`, `resources.ts` · `steps/index.ts` → `stepDef`, `StepKey`, `nodeOutputs`, `emitsFor`, `cardLines` · `steps/define.ts` → `p`, `step` · `steps/types.ts` → `StepDef`                                                                                                                                                        |
| Step runners (server)            | `src/workflow/run/` → `mail.ts`, `logic.ts`, `ai.ts`, `resources.ts` · `run/index.ts` → `runnerFor` · `run/types.ts` → `Runner`, `StepCtx`, `StepResult`                                                                                                                                                                                                                                        |
| Validation                       | `src/workflow/validation.ts` → `analyzeGraph`, `validateGraph`, `pairLoops`, `hiddenParam`, `graphResources`                                                                                                                                                                                                                                                                                    |
| Executor                         | `src/workflow/executor.ts` → `executeRun`, `TraceStep`                                                                                                                                                                                                                                                                                                                                          |
| Discovery and change feeds       | `src/workflow/discovery.ts` → `discoverTrigger`, `fireEvent`, `requestManualRun` · `src/workflow/feeds/` → `pollMail`, `pollCalendar`, `pollDrive` · provider cursors `changes` on `MailAdapter`, `CalendarAdapter`, `DriveAdapter` ([mail.md](mail.md), [calendar.md](calendar.md), [drive.md](drive.md)) · app events `src/workflow/app-events.ts` → `emitAppEvent` · `src/workflow/hooks.ts` |
| Inbound HTTP                     | route `src/app/api/inbound/[endpoint]/route.ts` → `src/workflow/inbound/handle.ts` → `handleInbound` · `inbound/endpoints.ts` → `ensureWebhookEndpoints`, `endpointUrl` · push `inbound/subscriptions.ts` → `renewEndpoints`                                                                                                                                                                    |
| Decisions                        | `src/workflow/decision.ts` → `decisionState`, `routeAnswer`, `branchQuestion` · `src/workflow/preview.ts` → `previewDecision`                                                                                                                                                                                                                                                                   |
| Background agents                | `src/mastra/agents/workflow-agents.ts` → `WORKFLOW_AGENTS`, `workflowWriterAgent` · `src/mastra/runtime-context.ts` → `principalRequestContext` ([ai-agents.md](ai-agents.md))                                                                                                                                                                                                                  |
| Layout and templates             | `src/workflow/graph.ts` → `layoutGraph`, `newNode`, `templateGraph`, `GRAPH_TEMPLATES`                                                                                                                                                                                                                                                                                                          |
| Test run                         | `src/workflow/test-run.ts` → `testRunGraph`, `listTestSamples` · procedures `workflows.test`, `workflows.testSamples`, `workflows.samples`, `workflows.pinSample`                                                                                                                                                                                                                               |
| Domain ops                       | `src/workflow/index.ts` → `createUserWorkflow`, `requestWorkflowRun`, `getWorkspaceRun`, `decideApproval` · `src/workflow/scope.ts` → `workflowScopeFor` · agent and MCP bodies `src/ops/workflow.ts`                                                                                                                                                                                           |
| Background principal             | `src/workflow/authorization.ts` → `resolvePrincipal`, `authorizeMailbox`, `authorizeCalendar`, `authorizeDrive`, `resourceAuth`                                                                                                                                                                                                                                                                 |
| Built-ins                        | `src/workflow/builtins/` → `scheduled-send.ts` → `scheduleSend` · `snooze.ts` → `snoozeMessage` · `before-send.ts` → `collectSendPolicyBccs` · `system.ts` → `ensureSystemWorkflows`, `WORKFLOW_PRUNE_ID`                                                                                                                                                                                       |
| Builder                          | `src/app/w/[slug]/workflow/_components/` → `workflow-editor.tsx`, `editor-store.ts`, `editor-context.tsx` → `diagnose`, `workflow-canvas.tsx`, `step-palette.tsx`, `inspector.tsx`, `test-panel.tsx`, `runs-panel.tsx`, `approvals-sheet.tsx`, `revisions-sheet.tsx` · revision diff `src/workflow/revision-diff.ts` → `diffGraphs`                                                             |
| Parameter editors                | `_components/forms/param-field.tsx` → `ParamField` · `forms/binding-editor.tsx` → `ExpressionInput`, `TemplateInput`, `PathPicker` · `forms/condition-builder.tsx` → `ConditionBuilder` over `src/workflow/conditions.ts` → `groupCel`, `parseCondition` · `forms/list-editors.tsx` · `forms/scope-paths.ts` → `scopeGroups`                                                                    |
| The step card (builder, history) | `src/components/workflow-graph/node-card.tsx` → `NodeCard` · `ports.ts` → `nodePorts` · `node-meta.tsx` → `STEP_ICONS`, `portTone` · `edges.ts` → `flowEdges` · `overlay.ts` → `runOverlay`, `testOverlay`                                                                                                                                                                                      |
| Procedures                       | `src/server/routes/workflows.ts` · `src/server/routes/mail/scheduled-send.ts` · snooze in `src/server/routes/mail/messages.ts`                                                                                                                                                                                                                                                                  |
| Upgrade conversion               | `migrations/0001_workflow_engine.ts` → `convertGraph` ([database.md](database.md))                                                                                                                                                                                                                                                                                                              |

## Rules

### Storage

- **A workflow is a graph with immutable revisions.** Saving writes a new `workflow_revision`; a run carries its `revision_id` and executes that revision to the end.
- **`workflow_resource` ties a revision to every mailbox, calendar and drive it names through real FKs**, with a CHECK that exactly one of the three is set per row.
- **Unique keys make every step idempotent.** One event per trigger and event key, one run per event, one step run per run, node and item key; a retried run redoes only the step runs that did not complete.
- **Every step run, the barrier included, is created by one `INSERT … SELECT … FROM workflow_run WHERE id = ? AND lease_token = ?`** (`beginStepRun`), so a stale lease inserts nothing and the fence and insert take the write lock once.
- **Large values live in `workflow_blob`, apart from step data.** A scheduled send's draft is a `draft` blob of its workflow; downloaded file contents are `bytes` blobs of their run, referenced from a value as `{ blobId }`.

### Graph and values

- **A node is `{ id, step, title?, skip?, position, params, onError? }` and every param is a binding**: a `literal` JSON value, a `template` text with `{{ cel }}` parts, or an `expr` CEL expression.
- **Node ids are expression names** (`NODE_ID_PATTERN`), because a later step reads an earlier one as `steps.<id>`; `newNodeId()` mints `s` plus eight characters, and pasting copies renames `steps.<id>` references to the new ids.
- **Every value has a `ValueType`.** Records (`mail`, `event`, `file`, …) have the fields `RECORD_FIELDS` lists; a declared field list (`FieldDecl[]`) is an object type; `json` is assignable both ways.
- **An expression sees `trigger`, `item`, `steps.<id>` for the steps every path to it passed through, `run` and `now`.** `analyzeGraph` derives each node's scope in topological order; a step after an Aggregate sees only the Aggregate, not what fed it, and a step after an End loop sees what its Loop saw plus the End loop, not the loop body.
- **Expressions are type-checked, not only parsed.** `checkBinding` infers a binding's type against the node's scope and the param's declared type; the builder runs it as the user types and validation refuses a mismatch with the param's label.
- **CEL types are registered as classes, dates are `google.protobuf.Timestamp` and integers are BigInt.** `toCel` / `fromCel` convert at the boundary; `registerType` with field schemas fails on Timestamp fields, which is why each type gets its own class (`classFor`).
- **Graph settings carry `concurrency`, a rate `limit` and a `timezone`.** The limit's key is an expression over the trigger event; `debounce` replaces a queued run of the same key and delays it, `throttle` records the event without a run (`openEvent`).
- **A run has one time zone** (`graphTimezone`): the settings' `timezone`, else its trigger's, else UTC. `date()` and `time()` in expressions read it when given no zone, and so do Create an event, Find free time and the Agent step.

### The step registry

- **Every step and trigger is one `StepDef` in `src/workflow/steps/`, and `StepKey` is the union of their keys.** `STEP_ICONS` is typed over `StepKey`, so a step without an icon fails the build, and so does a runner map that misses a key.
- **A definition is client-safe and holds everything but the side effect**: label, category, description, params (`p.*` builders with kind, type, default, `visibleWhen`, `bindable`, `target`), output type, outputs, `emits`, effect, `ai`, `check` and `card`.
- **A step factory takes its key as a `const` type parameter**, so its key stays a literal and `StepKey` stays a union.
- **The effect decides retries and test runs.** `read` steps run in a test; `write` and `dispatch` steps only preview; a `dispatch` step (a send, an event created, a file written) is never re-sent ([workflow-runs.md](workflow-runs.md)).
- **`emits` decides what an output carries**: the step's result (`result`), or the item it received (`input`), as If, Filter, Ask and Branch do. The executor and `nodePorts` both read it through `emitsFor`.
- **A step's `title` names it everywhere** (`nodeTitle`): cards, edge labels (`edgeLabel`: "Filter to Label"), run history.
- **Only a `write` or `dispatch` step can be skipped (`skip`).** The executor passes each item straight to `out` and records the step `skipped`.
- **`onError` routes a failing item.** `fail` fails it; `continue` passes the input on; `branch` adds an `error` output (`nodeOutputs`) that carries the input with the error in `error`.
- **A step whose target params (`target: true`: recipients, a drive folder) read from an AI step must have an approval between them**: validation refuses a dispatch whose target comes from an AI step without a `flow.approval` downstream of that AI step.

### Validation

- **`validateGraph` is the only gate**, run on save, by the test run, on resume and by the builder on every edit (`diagnose`).
  - Whole-graph rules: a trigger exists, no cycles, every step reachable, one incoming connection except Merge and Wait for all (one per `in:<n>` input), a before-send trigger alone in its graph.
  - Per step: required params, bindable params, binding types, resources in the workspace (`allowedResources`), AI on for every resource an AI step or its ancestors read (`aiResources`), and the step's own `check`.
- **The scope of a step decides where it may appear.** `scope: "builtin"` steps (`trigger.once`, `mail.sendScheduled`) save only on built-in workflows, `scope: "system"` steps only on system ones.

### Items, merges and aggregates

- **A run moves items, not messages.** An item is `{ key, value, trail }`; `trail[nodeId]` holds each step's result, which is what `steps.<id>` reads.
- **A step that emits several items keys each one**: `<node>:<entry key>` when the runner names the entry (a listed message; Split and Loop use `<item key>/<index>`, so entries of different items never share a key), otherwise `<item>#<n>`, so the step runs below it are keyed per entry and survive a retry.
- **Merge and Wait for all fold repeats by identity** (`identityOf`: mailbox and message id, calendar and event id, drive and file id), so an action after them runs once even when an item arrives by two paths.
- **Wait for all releases only when every input reachable from this run's trigger has settled.** An input that found nothing counts as settled; one that failed, blocked, waits or ran out of budget holds the join and everything below it.
- **A released join never re-evaluates.** The barrier is a step run with item key `barrier` (`BARRIER_ITEM_KEY`) holding each input's state and count, kept when a run settles, and a resumed run trusts a `completed` barrier.
- **Aggregate waits for every item and passes on one list, or one list per key**, as a single item keyed by the group.
- **Loop and End loop bracket a sub-graph that runs once per entry of a list.** Loop splits each item's list into entries and pushes a frame (`LoopFrame`: the Loop and the item's key) onto every entry; the steps between run per entry as usual.
  - End loop is a barrier like Aggregate; it groups what reaches it by the top frame and passes on one item per looped item, under that item's key and trail, with `{ results, count }`. An item whose list was empty, or whose entries were all filtered out, still comes out with no results.
  - Each End loop must close exactly one Loop (`pairLoops`: the Loop above it with as many Loops as End loops between them); loops nest.

### Triggers and events

- **A trigger is a node; `workflow_trigger` is its schedule.** Saving an enabled revision arms one row per trigger node; discovery claims due rows, and a fired trigger opens a `workflow_event` and a run in one transaction (`openEvent`).
- **The event key is the deduplication.** A schedule's key is its fired instant, a feed's the change it saw (`star:<mailbox>:<message>:<scan>`, `added:<file>`, …), a webhook's its `Idempotency-Key` header or a fresh id, so overlapping ticks and several workers cannot double-run.
- **A trigger's `filter` expression runs before the run exists.** An event it rejects is stored with `skipped_reason` and no run, so the key is not seen again.
- **A feed trigger baselines when it is armed.** Its first scan records what is already there as events with no run (`already there when the trigger was turned on`); only later changes start runs.
- **Feeds read provider change cursors where a provider has one, and listings otherwise.** Each cursor lives in `workflow_cursor` under its scope, with the provider's token in `token`.
  - Mail: an adapter's `changes` returns the ids added to a folder since a token (Gmail history, a Graph delta from now on, an IMAP `uidvalidity:uidnext` pair); the feed reads each new id. Without one, it keeps a seen-set of listed ids with a periodic deeper sweep.
  - An expired token takes a fresh one and falls back to the listing for that scan; the listing baselines again only when the seen-set is empty, so an expiry never floods runs.
  - Calendars and drives keep a snapshot (each event's fields and answers, each file's modified time and size). A provider token (Google sync tokens and changes, Graph deltas, CalDAV sync tokens or ctags) only says whether anything changed, so an unchanged scan skips the listing, and every `RESCAN_EVERY` scan lists anyway.
- **App events start runs without polling.** `emitAppEvent` fires every armed trigger of that kind in the workspace whose params match: a run failed, phishing found, a label applied by a person or by AI, a member joined (`hooks.ts`).
- **A run-failed trigger never fires for its own workflow** (`exceptWorkflowId`), so an error handler cannot loop on itself.
- **A manual trigger declares typed inputs; a call trigger declares the inputs other workflows pass.** `requestWorkflowRun` fires a workflow's Run by hand trigger, or its schedule trigger when it has none.

### Inbound HTTP

- **One listener, `/api/inbound/<endpoint>`, serves webhooks and provider push.** `workflow_endpoint` holds each endpoint's kind (`webhook`, `graph`, `google-channel`), sealed secret, provider subscription id and expiry; `src/proxy.ts` exempts the route from sessions.
- **A webhook checks, in order, the allowed IPs, the required headers, then the secret header or the HMAC signature**, compares in constant time, caps the body at 256 KB, rate-limits per endpoint and fires its trigger with `{ body, headers, receivedAt }`.
- **The webhook's client address is the last `X-Forwarded-For` hop that is not one of the runner's trusted proxies** (`handleWebhook` calls `forwardedClient` from `src/services/client-ip.ts` with `workflowRunner.trustedProxies`), the same walk as [auth.md](auth.md)'s client IP over the runner's own list.
  - Without trusted proxies only the nearest hop counts; with no `X-Forwarded-For` there is no address and an IP-restricted webhook refuses.
- **Push only wakes a trigger; the feed still reads the changes.** A Graph notification or a Google channel ping sets the trigger due now (`wakeTrigger`), so a forged or replayed push costs at most one early scan.
- **Push is opt-in.** `renewEndpoints` subscribes armed Microsoft feed triggers and Google Calendar and Drive triggers only while a public URL is configured; everything else polls ([configuration.md](configuration.md)). Only a trigger that reached a provider counts against the per-tick renewal budget.
- **A renewal re-points the subscription at the current public URL.** A Graph renewal PATCHes `notificationUrl` with the expiry and creates a new subscription when Microsoft answers 404; a Google channel is re-created at each renewal. A changed public URL takes effect at the next renewal, up to `RENEW_BEFORE_MS` before expiry.
- **A push subscription outlives its trigger only until the next renewal pass.** Disabling or deleting a workflow drops its webhook endpoints at once; `renewEndpoints` stops the provider subscriptions of disarmed, disabled or deleted triggers first (`strandedEndpoints`), and all of them when the public URL is removed.
- **Gmail mailboxes always poll.** Gmail push needs a Pub/Sub push subscription the operator would create by hand, so it is left out.
- **The webhook secret is shown only to the workflow's owner and workspace admins** (`workflows.webhookSecret`), who may also rotate it.

### Waits, approvals and calls

- **A wait suspends the run, not the worker.** A Delay, Wait until, Wait for, Approval or Call step returns a wait; the executor records the step run `waiting` with its wake time and the run settles `waiting` with `due_at` at the earliest wake.
- **`workflow_wait` holds what can end a wait from outside**: an approval's approvers and request, a called run's id, a deadline. Deciding, a child settling, or the deadline sets the run due; the step run reads the outcome on its next pass.
- **An approval is decided once, by one of its approvers** (`decideWait` checks the approver list and `status = open` in one `UPDATE`), and routes the item to `approved`, `denied` or, at the deadline, `timeout`.
- **Wait for event polls while it waits.** A reply on a thread, an RSVP change or a file in a folder is checked every `EVENT_POLL_MS`, until it is seen (`matched`) or the deadline passes (`timeout`).
- **Call starts a child run with a parent link**; settling the child sets its waiting parent due, and the parent reads the child's `flow.return` output.

### AI steps

- **AI is gated twice.** Validation refuses an AI step when a resource it or its ancestors read has AI off; at run time `requireAiFor` / `authorizeResourceAi` blocks it when that changed since.
- **Ask and Branch are reads with stored answers.** A completed Ask replays its answers on resume, so a resumed run never asks again; Ask and Branch are refused while `decisionEnabled("workflowNode")` is false.
- **The Agent step gets read tools only.** `WORKFLOW_AGENTS` filters each roster through `isReadTool`, so no write tool reaches it ([ai-agents.md](ai-agents.md)).
- **An Agent step checkpoints each model round in the step run's state**, and suspends as a short time wait when the tick budget nears its end, so a long agent continues on the next tick instead of being cut off.
- **Typed AI output comes from a second structuring pass** (`structured`, Mastra `structuredOutput` with `errorStrategy: "fallback"`); a failure yields empty fields and `complete: false` instead of failing the run.
- **Every AI call records usage with the run id**: `workflow-decision` for Ask, `workflow-agent` for each Agent round, `workflow-ai` for the other AI steps and the structuring pass.

### Builder

- **The editor's store owns the graph; React Flow is controlled from it.** `createEditorStore` holds name, enabled, graph, selection and the undo history; a drag, and typing in one field, is one undo step (`beginGesture` / `endGesture`).
- **The inspector is generic.** `ParamField` picks an editor from the param's kind; bindable params get an expression toggle, text params become templates when they contain `{{`, and `PathPicker` inserts a path from the node's scope (`scopeGroups`).
- **A condition param is edited as rows when its CEL is one the builder writes.** `parseCondition` reads back only what `groupCel` produces (groups of all or any, two levels deep, one comparison per field kind); anything else stays an expression, and either view can switch to the other when the CEL allows it.
- **The Revisions sheet diffs each saved revision against the one before**, and unsaved edits against the latest save (`diffGraphs`): steps added and removed, changed fields with the before and after binding, connections and settings.
- **A param change that removes outputs asks before dropping their connections** (`staleEdges`).
- **Ports are colored by the type they carry** (`portTone`), and the canvas refuses a connection into a trigger, a cycle, a second connection into a single input, or an Ask question into anything but a Branch.
- **The step palette floats over the canvas, never as a column** (`step-palette.tsx` → `FloatingPalette`): closed, it is one icon in the canvas's top-left corner; open, that icon heads the panel beside the search box, and only the icon closes it. The saved column layout holds only the center and the inspector, and the phone layout keeps quick add instead.
  - The canvas buttons (zoom, **Fit View**, **Tidy up the layout**, the minimap switch) are one row in the top-right corner (`workflow-canvas.tsx` → `CanvasControls`), in the palette's rounded, shadowed style, so the full-height panel never covers them; the minimap keeps the bottom-right in the same style.
- **Unsaved changes are tracked against the last save**, and leaving or switching workflows asks first. The phone layout keeps the editor's panels in sheets (`ResponsiveAside`, `MobileAsideTrigger`).

### Principal and built-ins

- **Background access carries its own principal.** `authorization.ts` re-checks membership, resource visibility, connection health and AI policy before every side effect, so a detached resource or a departed member blocks the run with a visible reason.
- **Built-ins are ordinary workflows with the graphs below**, and preflight's `ensureSystemWorkflows` upserts the system ones once per deployment, one at a time, because the `local` driver fails two overlapping writes in one process ([database.md](database.md)).
  - A graph that changed in a release is revised on the next deploy; a database migrated without preflight (`bun run db:migrate` alone) has no system workflows until `bun run preflight` runs.
- **Before-send runs the executor in `policy` mode on every enabled `trigger.mail.beforeSend` graph**: such a graph holds only steps marked `beforeSend` (logic and `mail.addBcc`), touches no provider and schedules nothing; the Bcc addresses it emits are added to the draft.

## How it works

- **Execution.** `executeRun` walks the graph in topological order, evaluates each node's bindings per item, runs its runner and files each emitted item under its output; step runs are begun, reclaimed and finished under the run's lease token.
- **Modes** (`ExecutionMode`). `live` persists step runs under the lease; `test` persists nothing, runs reads for real and previews writes ("would change this message"); `policy` is the before-send pass.
- **The test run** (`workflows.test`) runs the editor's graph, saved or not, under a draft definition whose principal is the caller; it validates like a save and is rate-limited per user (`workflow-test-run`).
  - Its event is a sample from the trigger's feed (`workflows.testSamples`), the pinned sample, a pasted event, typed inputs, or nothing for a schedule.
  - Replay (`replayRunId`) reruns a past run's stored event; with `fromNodeId` it reuses the past run's completed step results everywhere except that step and the steps after it.
  - A before-send or app trigger tests only with a pinned or pasted event.
- **Pinned samples** live on the workflow (`workflow.samples`, by trigger node id, at most 64 KB each).
- **Schedules.** A recurring schedule coalesces a backlog into one overdue event (`coalesceMissed`; five-field cron, explicit IANA zone, UTC instants stored); a one-shot runs once when service resumes.
- **Enable and disable.** Disabling a user workflow cancels its open runs; re-enabling resets each schedule's next instant and each feed trigger's cursor and baseline (`rearmTriggers`). `disabled_reason` holds why the upgrade turned a workflow off, and the editor shows it; saving clears it.
- **The built-in graphs.**
  - Send later: `trigger.once → mail.sendScheduled → Filter(item.id != "") → Label "scheduled"`, sending the workflow's draft blob.
  - Snooze: `trigger.manual(message, folder, wakeAt) → Archive → Wait until → Move to Inbox`, built per the folder the message was snoozed from (`snoozeGraph`): Trash for a trashed message, no return step for an archived one; rescheduling moves the open time wait (`rescheduleWait`).
  - `system:cimd-prune` hourly ([mcp.md](mcp.md)), `system:audit-prune` daily ([audit.md](audit.md)), `system:mail-cache-prune` daily ([mail.md](mail.md)) and `system:workflow-prune` daily ([workflow-runs.md](workflow-runs.md)), each a schedule around one system step.
- **Upgrade.** `0001_workflow_engine` converts every graph of the old shape (kinds, predicates, mailbox sources) into steps and CEL, and every run into history ([workflow-runs.md](workflow-runs.md)), except the built-in work still owed:
  - A pending or running scheduled send stays live: a running one is queued again, and its step runs are re-keyed to the converted graph's item key (`trigger`), so a send already `dispatching` settles `unknown` instead of going out twice.
  - A snooze whose wake is armed, or whose wake already fired into a pending or running run, becomes a waiting run of the converted graph, due at that wake; the old run is kept as cancelled history.
  - Pending or running user and system runs become history; their triggers fire again.

## Deliberate limits

- **No outbound HTTP step.** A workflow receives webhooks but does not call arbitrary URLs.
- **Calendar and drive feeds still diff snapshots**, bounded per scan (`SNAPSHOT_LIMIT` in each feed), so a folder or calendar larger than the bound is only watched over its newest part; provider tokens only decide whether to list. A mail change cursor reads at most `DELTA_LIMIT` new messages per scan and reports the rest as skipped.
- **An IP pin is only as good as the proxy in front.** Next gives route handlers no socket address, and `next start` fills `X-Forwarded-For` from the socket only when a request has none, so a client that reaches the app directly can name its own address. The compose stack's Caddy replaces any incoming `X-Forwarded-For`.
- **A test run of a before-send or app trigger needs an event**, since there is nothing to sample.
