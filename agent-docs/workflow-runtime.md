# Workflow engine — the runtime and its transports

The one durable background runtime: `runWorkflowTick()`, the three transports that wake it (`bullmq`, `cron`, `internal`), how a tick claims and drains work, and what each mode needs to run.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [workflow-graph.md](workflow-graph.md), [workflow-runs.md](workflow-runs.md), [dashboard.md](dashboard.md), [configuration.md](configuration.md), [deployment.md](deployment.md).

## Code map

| Concern                      | Where                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tick                     | `src/workflow/tick.ts` → `runWorkflowTick`, `mutationReserve`                                                                                                                               |
| Driver registry and contract | `src/services/workflow-runner/registry.ts` → `getWorkflowRunner`, `buildWorkflowRunner` · `types.ts` → `WorkflowRunnerDriver` · `index.ts`                                                  |
| Transports                   | `src/services/workflow-runner/drivers/bullmq.ts` → `createBullmqDriver` · `drivers/cron.ts` → `createCronDriver` · `drivers/internal.ts` → `createInternalDriver`                           |
| One wrapper for every tick   | `src/services/workflow-runner/tick.ts` → `runTick`                                                                                                                                          |
| Cron endpoint                | `src/app/api/workflows/tick/route.ts` (`maxDuration`) → `src/services/workflow-runner/webhook.ts` → `handleTickRequest` · budget cap `src/config/schema.ts` → `CRON_TICK_ROUTE_MAX_SECONDS` |
| In-process runner            | `src/services/workflow-runner/in-process.ts` → `startInProcessRunner`, `syncInProcessRunner` · started from `src/instrumentation.ts`, switched by `src/config/watch.ts`                     |
| BullMQ worker process        | `scripts/workflow-worker.ts` (bundled to `workflow-worker.mjs` in the `worker` image)                                                                                                       |
| Failure reporting            | `src/workflow/diagnostics.ts` → `tickFailure`, `formatTickFailure`, `errorCode` · type `TickFailure` in `src/workflow/runtime.ts`                                                           |
| Tick bookkeeping and claims  | `src/workflow/store.ts` → `recordTick`, `claimDiscovery`, `claimRuns`, `CLAIM_SLICES` · table `workflowTick`                                                                                |
| Discovery                    | `src/workflow/discovery.ts` → `discoverTrigger` · change feeds `src/workflow/feeds/` ([workflow-graph.md](workflow-graph.md))                                                               |
| Push subscriptions           | `src/workflow/inbound/subscriptions.ts` → `renewEndpoints` (called from the tick's maintenance stage)                                                                                       |
| System workflows             | `src/workflow/builtins/system.ts` → `ensureSystemWorkflows` (called by preflight)                                                                                                           |

## Rules

### One runtime

- **There is exactly one background runtime, and `runWorkflowTick()` is it.** Every driver calls the same tick; only what wakes it differs.
- **A web process runs a timer only while the stored driver is `internal`**; web requests only queue work in the database.
- **The driver, its tuning, the Redis URL and the cron secret come from the config snapshot**, so switching drivers needs no redeploy as long as the processes the target needs exist ([configuration.md](configuration.md)).
  - Batch size, concurrency, budget and cadence are read per tick (`runTick` reads `getInstanceConfig()`).
  - The cron route checks the driver and secret per request.
- **Nothing ticks in maintenance** (`METIS_MAINTENANCE`, [configuration.md](configuration.md)): a web process never starts the `internal` runner, the worker logs that it is idle and takes no ticks, and the cron route answers 503 from the proxy.
- **Two transports ticking at once during a switch is safe**: claims are leased and trigger events are unique, so overlap only costs a redundant tick.
- **Redis only wakes the tick.** Definitions, schedules, events, waits, run ownership, retries and history live in the app database in every mode, so a cron or internal deployment needs no Redis and a Redis outage loses no work. Due times are persisted, never enqueued.

### Transports

- **A driver connects to nothing until `start()`.** The BullMQ queue, worker and Redis connection are built there, and only `scripts/workflow-worker.ts` calls it.
- **The BullMQ Job Scheduler is one stable scheduler that only produces tick jobs** (`upsertJobScheduler`, `every: cadenceSec * 1000`); schedules and payloads stay in the database.
- **The in-process runner runs at most once per process.** Its timer, active tick and signal listeners live on `globalThis` symbols, so a dev reload or a second `start()` reuses them.
- **The in-process runner adds its `SIGTERM` / `SIGINT` listeners beside Next's own.**
  - They abort the active tick, and Next still decides when the process exits.
  - When its own listener is the only one (`process.listenerCount(signal)`, as with a custom server or `NEXT_MANUAL_SIG_HANDLE`), it re-raises the signal once the tick has stopped, so the default exit still happens.
- **The cron endpoint compares `X-Metis-Secret` in constant time, answers 404 unless `cron` is the selected driver, and awaits the tick before responding.**
- **Under `cron`, the tick budget is capped below the tick route's `maxDuration`** (`CRON_TICK_ROUTE_MAX_SECONDS`), so a tick always answers before the host kills the request.

### Draining

- **Cadence gates discovery, not recovery.** `workflow_tick` holds the cadence claim (`claimDiscovery`), so an early tick still drains ready runs without rescanning every trigger.
- **Every claim mints a new fencing token that every completion, retry and release must match.** Runs are claimed with a bounded `UPDATE … WHERE id IN (SELECT … LIMIT n) RETURNING`, because SQLite has no `SKIP LOCKED`; the sub-select runs under the statement's own write lock.
- **A claim takes pending runs and waiting runs whose due time has passed**, plus running runs whose lease expired; a waiting run's due time is its earliest wake, so a timer or a decided approval resumes it on the next tick.
- **Claims are fair across categories** (`CLAIM_SLICES`: built-ins, user, system). Each gets a share of the batch, and the slice order rotates every claim so a batch of one still serves every category; leftover capacity goes by due time.
- **A workflow's `settings.concurrency` caps its running runs at claim time.** The claim skips runs of a workflow at its cap, and `enforceCaps` releases any a single batch claimed past it.
- **A tick finishes every claimed run before it surfaces a failure.**
  - `drain()` runs the batch across `concurrency` workers; a worker whose run throws stops taking new work.
  - The tick awaits every other worker and only then rethrows the first error, so the caller (cron's response, the BullMQ job) never reports failure while sibling runs still execute untracked.
- **A worker that reaches the deadline releases its remaining runs (`releaseRun`)** instead of starting them.
- **The tick budget bounds provider mutations two ways.**
  - A mutation is not started inside the reserve at the end of the budget (`mutationReserve`); the run is re-queued with its attempt restored.
  - A mutation that still overruns settles as `unknown`, never awaited past the host limit or re-queued while possibly in flight ([workflow-runs.md](workflow-runs.md)).
  - Reads that overrun are retried.
- **A tick failure is recorded as stage + error code only**, because a `DrizzleQueryError` message carries the query's params.
  - `formatTickFailure`'s `"<stage> failed: <code>"` is what `workflow_tick.last_error`, the log line and the cron response carry.
  - `errorCode` walks the `cause` chain for `code`.

## How it works

- **A tick.** `runTick` stamps an invocation id and logs one logfmt `[workflow-runner] tick` line, then `runWorkflowTick`:
  - takes the cadence claim and, when it wins, discovers due triggers;
  - closes stranded cancels and finishes pending send resolutions ([workflow-runs.md](workflow-runs.md)), and renews or stops provider push subscriptions (`renewEndpoints`, at most ten per tick, only while a public URL is configured);
  - claims and drains ready runs within the tick budget;
  - stamps `workflow_tick` (`recordTick`), which the dashboard's runner health reads ([dashboard.md](dashboard.md)).
- **`bullmq`.** The worker process runs the Job Scheduler and consumes its tick jobs; web and worker share the same database and encryption key.
  - `scripts/workflow-worker.ts` loads the snapshot and polls it with a timer that keeps the process alive; while the driver is anything else it logs that it is idle and waits.
  - On a runner change it stops the current queue and worker, then starts new ones when `bullmq` is selected, which re-upserts the scheduler with the new cadence.
  - It exits non-zero on a failed start or readiness check.
- **`cron`.** An external scheduler POSTs `/api/workflows/tick` with `X-Metis-Secret` at least as often as the cadence.
- **`internal`.** `startInProcessRunner()` (called from `instrumentation.ts` outside the build phase) runs one tick at start, then one per cadence on an `unref()`'d timer, skipping an interval while a tick is still running.
  - On a runner change, `syncInProcessRunner()` stops the timer (aborting the active tick) and starts a new one if the driver is still `internal`, so a cadence change restarts it; the two are serialized per process.
- **Work cut off by a process exit** is recovered by lease expiry, exactly as for a killed worker.
- **What each driver needs to run.** The root stack runs the app only ([deployment.md](deployment.md)); the operator procedure is the docs site's Background work page (`apps/docs/content/self-hosting/02-configure/07-background-work.mdx`).
  - `internal` (the default) needs the app process to run continuously (`next start` / the runner image); on known serverless hosts a save refuses it and seeding stores it with a warning (`validateInstanceConfig` in `src/config/sections.ts`).
  - `bullmq` needs the published worker image and a Redis with `noeviction`, which the operator runs wherever they like and points at through the stored Redis URL. The worker needs only the minimal boot variables ([configuration.md](configuration.md)).
  - `cron` needs an external scheduler (cron-job.org, a GitHub Actions schedule, a crontab) that POSTs the tick route with the stored secret in `X-Metis-Secret`.
  - Vercel Cron cannot drive it: it sends a GET with `Authorization: Bearer`, and the route answers only POST and reads only `X-Metis-Secret`.
  - Selecting `bullmq` without a running worker means nothing ticks: work queues in the database, nothing fails, and the runner shows `never` or `delayed`.

### Operating the runner

- **Every tick logs one `[workflow-runner] tick` line** with `driver`, `outcome`, `invocation`, timing and counts (`discovered`, `discoveryErrors`, `claimed`, `completed`, `failed`, `blocked`, `remaining`); `internal` lines add `trigger=start|interval`.
  - `outcome` is `worked` when the tick discovered or claimed anything, `idle` otherwise, and `failed` on an infrastructure error, which names only `stage` (`setup`, `discovery`, `maintenance`, `execution`) and `code`.
  - A failing workflow is not a tick failure: it shows in `failed` / `blocked` and in that workflow's history.
  - `discoveryErrors` counts feed triggers that could not be checked (owner left, mailbox, calendar, drive or address book no longer visible or attached, provider scan failed); it recurs once per cadence until fixed, and the trigger's inspector shows the error.
- **The cron endpoint answers `200` or `500` (with `failure`) with a JSON summary, `401` for a wrong or missing secret, `404` when the driver is not `cron`.**
  - Rejections log `tick rejected` at most once a minute per reason, with the count since the last line.
  - The scheduler's timeout must exceed the tick budget, and calling more often than the cadence only drains ready work sooner.
- **During a Redis outage the worker logs `redis source=… code=…` at most once a minute per error** and receives no ticks; it catches up on the first tick after Redis returns, and a worker started while Redis is down waits instead of exiting.
- **The worker drains on `SIGTERM` / `SIGINT`**: it stops taking ticks and waits for the active one (at most the budget), so its stop timeout must exceed the budget (75 s covers the default 45 s).
  - Startup exits non-zero with `not ready database=false …` when the database cannot be queried.
- **The app under `internal` does not wait for its active tick on shutdown**; Next exits once its HTTP requests finish, so a longer stop timeout buys nothing. The cut-off work is recovered by lease expiry, and a restart catches up on its start tick.
- **A backlog drains on its own over several ticks** (`remaining` and the dashboard's backlog age show it); to drain faster, tick more often under `cron` or raise batch size and concurrency.
- **Switching drivers needs no migration.** Moving to `cron`, set the secret in the same edit and start the scheduler; moving to `bullmq`, start the worker and Redis first and enter the Redis URL in the same edit; moving to `internal`, stop the worker and remove the scheduler.
