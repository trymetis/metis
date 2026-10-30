# Owner dashboard

`/dashboard`: who may open it, how it is gated, where each page gets its data, and how the System pages edit the instance config.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [auth.md](auth.md), [configuration.md](configuration.md), [workflow-runtime.md](workflow-runtime.md), [connections.md](connections.md), [updater.md](updater.md), [mcp.md](mcp.md).

## Code map

| Concern                                       | Where                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The owner check                               | `src/auth/owner.ts` → `isOwnerEmail` (reads `config.app.ownerEmail`, `METIS_OWNER_EMAIL`)                                                                                                                                                                                      |
| Page gate                                     | `src/proxy.ts` → `guardDashboard`                                                                                                                                                                                                                                              |
| Procedure gate                                | `src/server/middlewares/owner-session.ts` → `ownerSession` · procedures in `src/server/routes/dashboard.ts` (`dashboard.*`, `dashboard.system.*`)                                                                                                                              |
| Layout and navigation                         | `src/app/dashboard/layout.tsx` · `src/app/dashboard/_components/dashboard-sidebar.tsx` · `src/components/dashboard/system-nav.ts`                                                                                                                                              |
| Stats pages                                   | `src/app/dashboard/page.tsx` and its sibling `*/page.tsx`, each rendering a `_components/*-view.tsx` that calls `orpc.dashboard.*` · data in `src/dashboard/stats.ts` (`dashboard*` functions)                                                                                 |
| Runner status                                 | `runnerStatus` in `src/dashboard/stats.ts` (stats pages) and `src/dashboard/system.ts` (System overview) · tick stamps `src/workflow/store.ts` → `recordTick`                                                                                                                  |
| System (config, drivers, providers, instance) | `src/app/dashboard/system/page.tsx`, `system/instance/page.tsx`, `system/drivers/[driver]/`, `system/providers/[provider]/` · the overview `system/_components/system-view.tsx`, the other views in `src/components/dashboard/` · `src/dashboard/system.ts` → `systemOverview` |
| On-demand checks                              | `src/dashboard/system-checks.ts` → `runSystemCheck` · called from `src/components/dashboard/system-client.tsx`                                                                                                                                                                 |
| Editing a page's sections                     | `src/components/dashboard/config-form.tsx` → `ConfigForm` · slot `system-nav.ts` → `SAVE_BAR_SLOT_ID` · `config-fields.tsx` → `ConfigFieldRows`, `fieldDirty` · `src/dashboard/config-forms.ts` (field descriptors, form ↔ section, diff)                                      |
| Saving and verifying                          | `src/dashboard/system-config.ts` → `configForm`, `saveConfigSections` · `src/dashboard/system-checks.ts` → `verifySections`                                                                                                                                                    |
| Unsaved-changes guard                         | `src/store/unsaved-changes-store.ts` → `useUnsavedChangesStore` · `src/components/dashboard/guarded-link.tsx` → `GuardedLink`                                                                                                                                                  |
| History and restore                           | `src/app/dashboard/system/history/` · `src/dashboard/system-config.ts` → `configHistory`, `configDiff`, `revertConfig`                                                                                                                                                         |
| Deploy checks: data                           | table `preflight_run` (`src/db/schema.ts` → `preflightRun`) · kinds `src/types/preflight.ts` · `src/dashboard/preflight.ts` → `recordPreflightRun`, `latestPreflightRun`, `acknowledgePreflightRun` · written by `scripts/preflight.ts`                                        |
| Deploy checks: UI                             | page `src/app/dashboard/system/preflight/` · sidebar bar `src/app/dashboard/_components/preflight-bar.tsx` · shared query `src/store/preflight-store.ts` → `preflightQuery`, `acknowledgePreflight`                                                                            |
| Updates                                       | page `src/app/dashboard/system/updates/` ([updater.md](updater.md))                                                                                                                                                                                                            |
| Chart theming                                 | `src/styles/globals.css` → `.chart-surface`                                                                                                                                                                                                                                    |
| Rail entry                                    | `src/components/app-rail.tsx` (`isOwner`, set in `src/app/w/[slug]/layout.tsx`)                                                                                                                                                                                                |
| Audit log page                                | `src/app/dashboard/audit/` · `dashboard.audit` ([audit.md](audit.md))                                                                                                                                                                                                          |

## Rules

### Who and how

- **`METIS_OWNER_EMAIL` names the instance owner, who gets instance-level observability and nothing more.** The owner has the same workspace privileges and mail access as anyone else.
- **Unset `METIS_OWNER_EMAIL` means `/dashboard` exists for nobody**, so a forgotten variable closes the page.
- **The proxy is the only page gate.** `guardDashboard` reads the real session and rewrites to `/_not-found` for anyone but the owner; the dashboard layout and pages hold no session check.
  - A full session read is possible there because Next 16's proxy runs on Node by default.
  - The owner without 2FA is sent to `/2fa/setup` like on any other page.
- **Everyone but the owner gets a 404**, byte-identical to any unrouted URL.
- **The procedures gate themselves.** `/rpc` is outside the dashboard matcher, so `ownerSession` protects the data, and it throws `NOT_FOUND` for the same reason the proxy 404s.
- **Only the `isOwner` boolean crosses to the client**, for the rail's Dashboard entry.
- **The stats and System pages are also owner-only MCP tools** (`src/ops/instance.ts`, [mcp.md](mcp.md)), with secrets reduced to set or not set.

### Stats

- **The dashboard covers mailboxes, calendars and drives alike** wherever it counts resources.
- **`dashboardMcp` lists clients without a workspace join**, because a client belongs to a user.
- **Usage is bucketed by UTC day** (`dashboardUsage`, `strftime` over `ai_usage.created_at`).
- **Charts are TanStack Charts.** `.chart-surface` maps `--ts-chart-1…5` onto the `--chart-*` tokens, so both themes and all brands apply with no per-chart branch.
- **Runner health is read from the database**, so it looks the same whichever driver ticks.
- **The automation page shows counts and run outcomes only** (`dashboardAutomation`: the runner, workflow and scheduled counts, recent runs).

### System and editing

- **The System pages show the instance config from the snapshot and the boot config from `config`, each for the settings it owns** ([configuration.md](configuration.md)). Once a row exists the dashboard is the only place the instance config changes.
- **Configuration warnings (`instanceConfigWarnings`) are shown, not enforced**: on the System overview (`configWarnings`) and after a save or restore.
- **Every database-backed section is edited inline on the System page that shows it.**
  - Drivers on their driver page, the decision model on the LLM page; sign-up, legal, relay and the mail image proxy on Instance; an OAuth pair or a server list on its provider page.
  - The card shows the editable value itself; a page shows each config value once.
- **One save covers a whole page.** `dashboard.system.update` takes every changed section of the page with one TOTP code and stores them as one version.
- **Every config write takes TOTP.** `dashboard.system.update` and `dashboard.system.revert` call `requireTotp` (scope `instance-config`) before anything else.
- **A section is checked against the real service before it is saved, and a failed check refuses the save.** `verifySections` runs the section's own check against the candidate config; a section with nothing external to reach has none.
- **Secrets are write-only.** Forms carry `{ set, hint }` for each secret.
  - An empty or absent field keeps the stored value, `null` removes an optional one, and a string replaces it.
  - A list entry's secret is kept by matching the entry's id.
- **A stale form is refused.** Each save sends the version the form was opened at; a different current version answers `CONFLICT` with the current version.
- **Diffs show secrets only as changed or unchanged.**
- **Every link out of a dashboard page is a `GuardedLink`.** While a page has unsaved changes it cancels the navigation (`Link`'s `onNavigate`) and shakes the save bar.
  - Closing or reloading the tab gets the browser's own leave dialog (`beforeunload`, attached only while dirty).
- **Every dashboard table renders through `ScrollTable`** (`src/components/dashboard/scroll-table.tsx`): on phones its first column stays pinned and the right edge fades while columns remain off-screen; desktop gets the plain table.
- **On phones the sidebar is a sheet opened from the page's section bar** ([ui.md](ui.md) → shells); the deploy-check bar lives in the sheet and the source link stays on the page.
- **The sidebar fetches whether the Updates entry shows** (`dashboard.system.updatesEnabled`), because the layout is prerendered by `next build`, which would bake in the build's environment.

### Deploy checks

- **Preflight's warnings reach the owner through the database.** Preflight runs in its own container (or a build step), so `scripts/preflight.ts` stores every ⚠ line it prints, with its kind, as one `preflight_run` row; the dashboard only reads it.
- **Recording a run never fails a deploy.** A failed insert is logged and preflight still exits 0.
- **Acknowledging silences the bar, not the warnings.** `dashboard.system.acknowledgePreflight` stamps the run; the next deploy writes a new, unacknowledged run. It needs no TOTP, because it changes only the badge.
- **A run is tied to the config version it checked.** When the current version differs, the page says the warnings may no longer apply; the app never recomputes them, because they compare against preflight's environment.

## How it works

- **Tick stamps.** Every `runWorkflowTick()` calls `recordTick`, which stamps `workflow_tick.last_tick_at`, plus `last_success_at` on a tick with no infrastructure error, or `last_error` on one with.
  - `last_tick_at` and `last_success_at` only move forward (`max(…)`), so overlapping ticks finishing out of order cannot move the status back.
  - `last_error` follows the newest tick.
- **Runner status** is derived, never stored:
  - **never**: no tick has ever completed, which differs from a quiet engine;
  - **failing**: the latest tick did not succeed;
  - **delayed**: the last success, the oldest due trigger or the oldest due run is older than twice the cadence plus the tick budget;
  - **busy**: work is due;
  - **idle**: nothing is due.
- **Blocked runs** carry `workflow_run.blocked_at` (set by `settleRun`), which keeps them out of the retry count.
- **System checks run only when the owner asks.** `dashboard.system.check` runs a driver check or, for a provider, the same `serverChecks` probes preflight uses ([servers.md](servers.md)).
- **Preflight runs the dashboard's AI checks once per deploy, warn only.** A set LLM driver goes through `checkLlm` (kind `llm`), and the decision model through `checkDecisionModel` when any switch is on (kind `decision`).
  - In the e2e stack both point at the `replay` service, which starts before preflight, so the checks pass.
- **Editing.**
  - `ConfigForm` loads `dashboard.system.form` for each of the page's sections (descriptors, values, secret summaries, a server list's entries) and renders one card per section, hiding fields whose `when` does not match.
  - It keeps the loaded values beside the draft; any change shows the save bar (Reset, Save changes) and sets `useUnsavedChangesStore.dirty`.
  - The bar is portaled into the sticky slot at the end of the layout's `<main>` (`SAVE_BAR_SLOT_ID`), so it lines up with the page column.
  - Save asks for one TOTP code and sends only the changed sections.
- **Saving (`saveConfigSections`).**
  - Parses each section through its schema, refuses when nothing changed or `validateInstanceConfig` fails, and runs `verifySections` on every changed section.
  - Stores one version (`kind: edit`) with the owner as author; a failed check is shown above the cards and nothing is stored.
  - Reloads the snapshot at once and reruns quarantine when an OAuth or server-list section changed ([connections.md](connections.md)).
  - With no stored row yet, the first save seeds one.
- **Deploy checks.**
  - Preflight collects its warnings as it goes (`warn(kind, message)`), then calls `recordPreflightRun`, which keeps the latest `KEEP_RUNS` runs.
  - `PreflightBar` and the preflight page share `usePreflightStore`, so acknowledging on the page updates the bar at once.
  - The bar is hidden until a run exists and highlighted while the latest run has unacknowledged warnings; the page groups the warnings by kind.
  - The owner's MCP clients read the same data through `getPreflightWarnings` ([mcp.md](mcp.md)).
- **History.** `/dashboard/system/history` lists every version with its kind, author, time and `changed_keys`.
  - Compare diffs any two (`configDiff`, field by field through the form descriptors).
  - Restore (`revertConfig`) inserts a copy of the chosen version (`kind: revert`, `reverted_from_version`) for every section that differs, after the same TOTP and verification as an edit.

## Deliberate limits

- **Browser Back is not guarded** against unsaved changes.
- **Updates has no MCP tool** ([updater.md](updater.md)).
