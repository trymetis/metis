# Owner dashboard

`/dashboard`: the instance roles that open it, how it is gated, the Accounts section (Users, Invites, bans), where each page gets its data, and how the System pages edit the instance config.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [auth.md](auth.md), [configuration.md](configuration.md), [workflow-runtime.md](workflow-runtime.md), [connections.md](connections.md), [updater.md](updater.md), [mcp.md](mcp.md).

## Code map

| Concern                                       | Where                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance roles                                | `src/types/instance-role.ts` → `INSTANCE_ROLES`, `USER_ROLES`, `meetsRequirement`, `canGrantInstanceRole`, `canManageUser`, `canManageAccountInvites` · `src/auth/instance-role.ts` → `instanceRoleOf`, `resolveInstanceRole`, `syncOwnerRole` · `src/auth/owner.ts` → `ownerEmail`, `isOwnerEmail` (`METIS_OWNER_EMAIL`) · column `user.role`                                                      |
| Page gate                                     | `src/proxy.ts` → `guardDashboard`                                                                                                                                                                                                                                                                                                                                                                   |
| Procedure gate                                | `src/server/middlewares/dashboard-session.ts` → `dashboardSession` (read), `dashboardOperator` (operate) · procedures in `src/server/routes/dashboard.ts` (`dashboard.*`, `dashboard.users.*`, `dashboard.invites.*`, `dashboard.system.*`)                                                                                                                                                         |
| The role on the client                        | `dashboard.me` · `src/components/dashboard/dashboard-role.ts` → `useDashboardRole`                                                                                                                                                                                                                                                                                                                  |
| Accounts section                              | overview `src/app/dashboard/accounts/` (`dashboard.accounts` → `dashboardAccounts` in `src/dashboard/stats.ts`) · Users `accounts/users/` → `src/dashboard/users.ts` → `listInstanceUsers`, `setUserRole`, `banUser`, `unbanUser`, `removeUser` · Invites `accounts/invites/` → `src/invites/index.ts` → `listAccountInvites` ([auth.md](auth.md)) · nav `src/components/dashboard/accounts-nav.ts` |
| Layout and navigation                         | `src/app/dashboard/layout.tsx` · nav tree `src/components/dashboard/dashboard-nav.ts` → `dashboardNav`, `NavEntry` (built from `system-nav.ts` and `accounts-nav.ts`) · rendered by `src/app/dashboard/_components/dashboard-sidebar.tsx` → `NavEntries`                                                                                                                                            |
| Stats pages                                   | `src/app/dashboard/page.tsx` and its sibling `*/page.tsx`, each rendering a `_components/*-view.tsx` that calls `orpc.dashboard.*` · data in `src/dashboard/stats.ts` (`dashboard*` functions)                                                                                                                                                                                                      |
| Runner status                                 | `runnerStatus` in `src/dashboard/stats.ts` (stats pages) and `src/dashboard/system.ts` (System overview) · tick stamps `src/workflow/store.ts` → `recordTick`                                                                                                                                                                                                                                       |
| System (config, drivers, providers, instance) | `src/app/dashboard/system/page.tsx`, `system/instance/page.tsx`, `system/drivers/[driver]/`, `system/providers/[provider]/` · the overview `system/_components/system-view.tsx`, the other views in `src/components/dashboard/` · `src/dashboard/system.ts` → `systemOverview`                                                                                                                      |
| On-demand checks                              | `src/dashboard/system-checks.ts` → `runSystemCheck` · called from `src/components/dashboard/system-client.tsx`                                                                                                                                                                                                                                                                                      |
| Editing a page's sections                     | `src/components/dashboard/config-form.tsx` → `ConfigForm` · slot `system-nav.ts` → `SAVE_BAR_SLOT_ID` · `config-fields.tsx` → `ConfigFieldRows`, `fieldDirty` · `src/dashboard/config-forms.ts` (field descriptors, form ↔ section, diff)                                                                                                                                                           |
| Saving and verifying                          | `src/dashboard/system-config.ts` → `configForm`, `saveConfigSections` · `src/dashboard/system-checks.ts` → `verifySections`                                                                                                                                                                                                                                                                         |
| Unsaved-changes guard                         | `src/store/unsaved-changes-store.ts` → `useUnsavedChangesStore` · `src/components/dashboard/guarded-link.tsx` → `GuardedLink`                                                                                                                                                                                                                                                                       |
| History and restore                           | `src/app/dashboard/system/history/` · `src/dashboard/system-config.ts` → `configHistory`, `configDiff`, `revertConfig`, `resetConfigSection`                                                                                                                                                                                                                                                        |
| Deploy checks: data                           | table `preflight_run` (`src/db/schema.ts` → `preflightRun`) · kinds `src/types/preflight.ts` · `src/dashboard/preflight.ts` → `recordPreflightRun`, `latestPreflightRun`, `acknowledgePreflightRun` · written by `scripts/preflight.ts`                                                                                                                                                             |
| Deploy checks: UI                             | page `src/app/dashboard/system/preflight/` · sidebar bar `src/app/dashboard/_components/preflight-bar.tsx` · shared query `src/store/preflight-store.ts` → `preflightQuery`, `acknowledgePreflight`                                                                                                                                                                                                 |
| Updates                                       | page `src/app/dashboard/system/updates/` ([updater.md](updater.md))                                                                                                                                                                                                                                                                                                                                 |
| Chart theming                                 | `src/styles/globals.css` → `.chart-surface`                                                                                                                                                                                                                                                                                                                                                         |
| Rail entry                                    | `src/components/app-rail.tsx` (`hasDashboard`, set in `src/app/w/[slug]/layout.tsx`)                                                                                                                                                                                                                                                                                                                |
| Audit log page                                | `src/app/dashboard/audit/` · `dashboard.audit` ([audit.md](audit.md))                                                                                                                                                                                                                                                                                                                               |

## Rules

### Who and how

- **Instance roles run the server; workspace roles work with a workspace's data, and neither reaches the other.** An instance role never opens mail, calendars, drives or contacts, and a workspace role never reaches the dashboard.
- **There are three instance roles:**
  - **Owner**: the account whose email is `METIS_OWNER_EMAIL` ([auth.md](auth.md)); exactly one.
  - **Admin**: the same dashboard powers as the Owner, config and updates included; granted only by the Owner.
  - **Observer**: the whole dashboard read-only, the Accounts pages and the audit log included; granted by the Owner or an Admin.
- **Every account has a stored `user.role`: `owner`, `admin`, `observer` or `user` (the default).**
  - `owner` is stored for display and filtering only; every owner check reads `METIS_OWNER_EMAIL`, so `resolveInstanceRole` ignores a stored `owner` on any other address.
  - Preflight's `syncOwnerRole` stores `owner` on the `METIS_OWNER_EMAIL` account, clears any ban on it, and turns any other stored `owner` into `admin`, so the previous owner keeps dashboard access after a handover.
- **Owner and Admins differ only in whom they manage.** The Owner grants, revokes, bans and removes Admins and Observers; an Admin does so for Observers and plain users only (`canGrantInstanceRole`, `canManageUser`). Nobody changes, bans or removes the Owner, and nobody bans themselves.
- **The role is resolved in one place.** `resolveInstanceRole` turns an email and the stored `user.role` into the instance role; `instanceRoleOf` loads the column, and listings that select it call `resolveInstanceRole` directly. `canManageUser` is shared by the server and the Users page.
- **The proxy is the only page gate.** `guardDashboard` reads the real session and `instanceRoleOf`, and rewrites to `/_not-found` for anyone with no instance role; the dashboard layout and pages hold no session check.
  - A full session read is possible there because Next 16's proxy runs on Node by default.
  - A role holder without 2FA is sent to `/2fa/setup` like on any other page.
- **Everyone without an instance role gets a 404**, byte-identical to any unrouted URL.
- **Every procedure carries one requirement: `read` (all three roles) or `operate` (Owner and Admin).** `/rpc` is outside the dashboard matcher, so the middlewares protect the data: no role throws `NOT_FOUND`, an Observer on an `operate` procedure `FORBIDDEN`.
  - `operate`: config save, restore and reset, health checks, acknowledging deploy checks, upgrade and undo, and every `dashboard.users.*` and `dashboard.invites.*` write.
- **The UI hides write controls from Observers** (`useDashboardRole().canOperate`): config fields render disabled inside a `fieldset`, and the save bar, reset, restore, check, acknowledge, upgrade, Users row menus and invite form do not render.
- **Every dashboard write that changes config, releases or someone's dashboard access takes TOTP**: config saves, restores and resets, upgrades and undo, and on the Accounts pages role changes, bans, unbans, removals and an account invite that carries an instance role (scope `instance-users`).
  - A plain account invite takes no code, the same as a workspace invite to a new address and MCP's `createSignupInvite`, since all three only create an account; the code guards the one invite that grants dashboard access.
  - Revoking an account invite and acknowledging a deploy check change only access or a badge and take none.
- **Only `hasDashboard` crosses to the workspace client**, for the rail's Dashboard entry and the search dialog.
- **The stats, Accounts and System pages are also MCP tools for the same roles** (`src/ops/instance.ts`, [mcp.md](mcp.md)), with secrets reduced to set or not set.
  - Users is read-only there (`getInstanceUsers`, with the page's filters): role changes, bans and removal need TOTP, so they have no tool ([ai-agents.md](ai-agents.md)); account invites have their own tools ([mcp.md](mcp.md)).

### Accounts

- **Accounts is a section like System: an overview page and two subpages.** The overview (`dashboard.accounts`) counts accounts, two-factor adoption, bans and pending invites and lists the newest accounts; Users and Invites are tables.
- **Both tables filter on the server**, with the same input schemas the MCP tools take (`dashboardUsersInputSchema`, `dashboardInvitesInputSchema` in `src/server/schema.ts`): a case-insensitive substring search, plus role, status and two-factor for users and role and status for invites.
- **Users lists every account** with its role, ban, creation, last sign-in, two-factor state and the workspaces it owns; each row the viewer may manage has a menu with Change role, Ban or Unban, and Remove.
  - Last sign-in is `last_sign_in.signed_in_at`, written by `recordSignIn` (`src/auth/last-sign-in.ts`) from the sign-in notifier on every completed sign-in, so it survives signing out.
- **Removing a user deletes the account** through `deleteAccount`, the path a user's own deletion takes, and writes `user.removed`; it is refused while the user owns a workspace with other members, with the message the user would see.
- **An invite with no instance role seeds no role.** Its `instance_role` stays null, and the account it creates takes the `user.role` column default; nothing maps null to `user` in code, and the Invites page shows such an invite as **No role**.
- **Account invites live on Invites; workspace invites live under each workspace's Members** ([workspaces.md](workspaces.md)). An invite from this page may carry an instance role, Admin only when the Owner sends it ([auth.md](auth.md)).
- **A ban is a duration (1, 7 or 30 days, or until unbanned) and an optional reason** on `user.banned`, `ban_reason` and `ban_expires`; what a ban stops is in [auth.md](auth.md).
  - It writes `user.banned` with the reason and expiry, and an unban writes `user.unbanned`.
  - An expired ban counts as no ban everywhere (`isBanned`, `activeBan` in `src/auth/ban.ts`), so nothing clears it.
- **Role changes write `instance_role.granted` and `instance_role.revoked`** with the previous role in `detail.from`; setting `user` is a revoke.

### Stats

- **The dashboard covers mailboxes, calendars, drives and address books alike** wherever it counts resources.
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
- **Every config write takes TOTP.** `dashboard.system.update`, `dashboard.system.revert` and `dashboard.system.reset` with a code call `requireTotp` (scope `instance-config`) before anything else.
- **A section is checked against the real service before it is saved, and a failed check refuses the save unless the Owner or an Admin saves anyway.** `verifySections` runs the section's own check against the candidate config; a section with nothing external to reach has none.
  - **Save anyway** (and **Restore anyway** in History) sends `force` with a fresh TOTP code and stores the version despite failed results; the failures still come back in `check`.
- **A server-list or OAuth section probes only checks whose inputs changed.** Each `ServerCheck` carries `probe`, the exact inputs its probe reads; a check whose provider, server, part and `probe` hash match one in the stored config is not run again.
  - An unchanged check reports the latest preflight run's `server` warning for its label (`warning`, "Unchanged. The last deploy check reported: …") only when the check's key also matches the config version that run checked (`readConfigRow(run.configVersion)`), so a fix saved after the deploy drops the old warning; otherwise it is `skipped`.
  - An unchanged check never refuses a save, so a save that only removes entries always passes.
  - A save, restore or reset that stores a version returns the check's `warning` results in `warnings`, so they toast even when nothing failed.
- **Secrets are write-only.** Forms carry `{ set, hint }` for each secret.
  - An empty or absent field keeps the stored value, `null` removes an optional one, and a string replaces it.
  - A list entry's secret is kept by matching the entry's id.
- **A new server-list entry starts with the entry schema's defaults filled in** (`blankEntry` in `src/dashboard/config-forms.ts`, read off `SERVER_ENTRY_SCHEMAS`), so a switch or port shows the value a save stores; an untouched empty field is left out of the save and takes the schema default.
- **A stale form is refused.** Each save sends the version the form was opened at; a different current version answers `CONFLICT` with the current version.
- **Diffs show secrets only as changed or unchanged.**
- **Every link out of a dashboard page is a `GuardedLink`.** While a page has unsaved changes it cancels the navigation (`Link`'s `onNavigate`) and shakes the save bar.
  - Closing or reloading the tab gets the browser's own leave dialog (`beforeunload`, attached only while dirty).
- **Every dashboard table renders through `ScrollTable`** (`src/components/dashboard/scroll-table.tsx`): on phones its first column stays pinned and the right edge fades while columns remain off-screen; desktop gets the plain table.
- **On phones the sidebar is a sheet opened from the page's section bar** ([ui.md](ui.md) → shells); the deploy-check bar lives in the sheet and the source link stays on the page.
- **The sidebar fetches whether the Updates entry shows** (`dashboard.system.updatesEnabled`), because the layout is prerendered by `next build`, which would bake in the build's environment.

### Deploy checks

- **Preflight's warnings reach the dashboard through the database.** Preflight runs in its own container (or a build step), so `scripts/preflight.ts` stores every ⚠ line it prints, with its kind, as one `preflight_run` row; the dashboard only reads it.
- **Recording a run never fails a deploy.** A failed insert is logged and preflight still exits 0.
- **Acknowledging silences the bar, not the warnings.** `dashboard.system.acknowledgePreflight` stamps the run; the next deploy writes a new, unacknowledged run. It needs no TOTP, because it changes only the badge.
- **A run is tied to the config version it checked.** When the current version differs, the page says the warnings may no longer apply; the app never recomputes them, because they compare against preflight's environment.

## How it works

- **The sidebar is one ordered tree of `NavEntry` (icon, label, optional href, optional children)**, and `NavEntries` renders it recursively.
  - An entry with children and an href is a collapsible section whose href is its overview page; it opens by itself while the path is inside it.
  - An entry with children and no href is a group heading (System's Drivers and Providers); Updates is in the tree only when updates are enabled.
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
- **System checks run only when the Owner or an Admin asks.** `dashboard.system.check` runs a driver check or, for a provider, the same `serverChecks` probes preflight uses ([servers.md](servers.md)).
- **Preflight runs the dashboard's AI checks once per deploy, warn only.** A set LLM driver goes through `checkLlm` (kind `llm`), and the decision model through `checkDecisionModel` when any switch is on (kind `decision`).
  - In the e2e stack both point at the `replay` service, which starts before preflight, so the checks pass.
- **Editing.**
  - `ConfigForm` loads `dashboard.system.form` for each of the page's sections (descriptors, values, secret summaries, a server list's entries) and renders one card per section, hiding fields whose `when` does not match.
  - It keeps the loaded values beside the draft; any change shows the save bar (Reset, Save changes) and sets `useUnsavedChangesStore.dirty`.
  - The bar is portaled into the sticky slot at the end of the layout's `<main>` (`SAVE_BAR_SLOT_ID`), so it lines up with the page column.
  - Save asks for one TOTP code and sends only the changed sections.
- **Saving (`saveConfigSections`).**
  - Parses each section through its schema, refuses when nothing changed or `validateInstanceConfig` fails, and runs `verifySections` on every changed section.
  - Stores one version (`kind: edit`) with the person saving as author; a failed check is shown above the cards with **Save anyway**, and nothing is stored unless they use it.
  - Reloads the snapshot at once and reruns quarantine when an OAuth or server-list section changed ([connections.md](connections.md)).
  - With no stored row yet, the first save seeds one.
- **Deploy checks.**
  - Preflight collects its warnings as it goes (`warn(kind, message)`), then calls `recordPreflightRun`, which keeps the latest `KEEP_RUNS` runs.
  - `PreflightBar` and the preflight page share `usePreflightStore`, so acknowledging on the page updates the bar at once.
  - The bar is hidden until a run exists and highlighted while the latest run has unacknowledged warnings; the page groups the warnings by kind.
  - MCP clients of instance role holders read the same data through `getPreflightWarnings` ([mcp.md](mcp.md)).
- **History.** `/dashboard/system/history` lists every version with its kind, author, time and `changed_keys`.
  - Compare diffs any two (`configDiff`, field by field through the form descriptors).
  - Restore (`revertConfig`) inserts a copy of the chosen version (`kind: revert`, `reverted_from_version`) for every section that differs, after the same TOTP and verification as an edit; a refused restore offers **Restore anyway**.
- **Reset to environment.** Each section card's **Reset to environment** calls `dashboard.system.reset` (`resetConfigSection` in `src/dashboard/system-config.ts`), which compares the stored section with `instanceSeed[section]`.
  - Without a code it changes nothing and returns `updated: false`, both sides as form values (`sectionForm`), the secret keys that differ (`changedSecrets`), the warnings and `inUse`; the dialog (`src/components/dashboard/reset-section-dialog.tsx`) builds the field diff in the browser from that.
  - With a code it takes TOTP, then stores the seed as a `reset` version after the same `refuseInvalid` and `verifySections` as an edit, and returns the same view with `updated: true`.
  - `inUse` lists every active connection the reset would quarantine (`quarantineImpact` in `src/connections/quarantine.ts`, the same rule `reconcileQuarantine` applies); a non-empty list refuses the reset with `PRECONDITION_FAILED` unless `force` is set, which the dialog's "Reset anyway" checkbox sends.
  - The button is disabled while the page has unsaved edits and when the form's `matchesEnvironment` says the section already equals the seed.

## Deliberate limits

- **Browser Back is not guarded** against unsaved changes.
- **A ban leaves the user's resources linked.** Mailboxes, calendars, drives and address books they linked to workspaces stay usable by the other members; removing the user is what detaches them.
- **Updates has no MCP tool** ([updater.md](updater.md)).
