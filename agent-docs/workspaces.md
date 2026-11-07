# Workspaces — membership, resource links and data scope

What a workspace is, how it borrows mailboxes, calendars, drives and address books, which scope each table is keyed by, how membership changes cascade, and what the account data export holds. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [connections.md](connections.md), [auth.md](auth.md), [search.md](search.md) (Settings → Members), [mail-rendering.md](mail-rendering.md).

## Code map

| Concern                                  | Where                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                                   | `src/db/schema.ts` → `workspace`, `workspaceMember`, `workspaceInvite`, the link tables `mailboxWorkspace`, `calendarWorkspace`, `driveWorkspace`, `userPrefs`                                                                                                                              |
| Workspace and membership ops             | `src/workspace/index.ts` → `createWorkspace`, `resolveDefaultWorkspaceSlug`, `changeMemberRole`, `transferOwnership`, `removeMember`, `createInvite`, `acceptInvite`                                                                                                                        |
| Role-checked ops shared with agent tools | `src/workspace/admin.ts` → `listWorkspaceInvites`, `removeWorkspaceMember`, `revokeWorkspaceInvite`, `setWorkspaceTheme`                                                                                                                                                                    |
| Attaching an owned resource              | `src/connections/attach.ts` → `attachOwnedMailbox`, `attachOwnedCalendar`, `attachOwnedDrive`                                                                                                                                                                                               |
| AI and per-resource policy               | `src/workspace/policy.ts` → `workspaceAllowsAi`, `resolveMailboxPolicy`                                                                                                                                                                                                                     |
| Typed routes and reserved slugs          | `src/workspace/path.ts` → `workspacePath`, `onboardingPath`, `RESERVED_MAILBOX_SLUGS`, `RESERVED_CALENDAR_SLUGS`, `RESERVED_DRIVE_SLUGS`                                                                                                                                                    |
| Page titles                              | `src/workspace/titles.ts` → `mailboxTitle`                                                                                                                                                                                                                                                  |
| Landing                                  | `src/app/w/page.tsx` (default workspace) · `src/app/w/[slug]/page.tsx` (first resource, else onboarding)                                                                                                                                                                                    |
| "This workspace lacks X" chooser         | `src/workspace/gate.ts` → `getWorkspaceGateData` · `src/components/workspace-gate.tsx`                                                                                                                                                                                                      |
| Link procedures                          | `src/server/routes/workspace-{mailboxes,calendars,drives}.ts` · account-level `src/server/routes/{mailboxes,calendars,drives}.ts` · `src/server/routes/workspaces.ts`                                                                                                                       |
| Slug allocation                          | `src/lib/slug-ladder.ts` · `src/{mail,calendar,drive}/slug.ts`                                                                                                                                                                                                                              |
| Workspace AI and role on the client      | `src/components/workspace-access.tsx` → `WorkspaceAccessProvider` (set by `src/app/w/[slug]/layout.tsx`)                                                                                                                                                                                    |
| Data export                              | `src/account/export.ts` → `buildDataExport` · threads `src/mastra/memory.ts` → `exportAssistantThreads` · procedure `src/server/routes/user.ts` → `exportData` · file shape `src/server/schema.ts` → `dataExportSchema` · UI `src/app/settings/account/_components/data-export-section.tsx` |

## Rules

### Resources

- **A workspace only borrows a resource; the link row carries everything per-workspace.**
  - `mailbox_workspace`, `calendar_workspace`, `drive_workspace` and `address_book_workspace` hold the per-workspace `slug` and `ai_enabled`, unique per (resource, workspace) and per (workspace, slug).
  - The mailbox link also carries `phishing_detection_enabled`, the calendar link `visible_calendar_ids` ([calendar.md](calendar.md)), the drive link `visible_root_ids` ([drive.md](drive.md)), the address-book link `visible_book_ids` ([contacts.md](contacts.md)).
- **Every member sees every resource linked to the workspace; a resource is hidden from a workspace by detaching it.**
  - `visibilityWhere` in `src/connections/{mailbox,calendar,drive,address-book}-store.ts` filters only by workspace and quarantine, so lookups take no user or role.
  - A link's `visible_calendar_ids`, `visible_root_ids` and `visible_book_ids` narrow what the workspace shows of a resource, for every member alike.
- **Three distinct verbs.**
  - Attach inserts a link.
  - Detach deletes a link; the resource keeps working everywhere else.
  - Delete resource deletes the row and cascades its links; whether it revokes the grant is in [connections.md](connections.md).
- **An attached resource starts with AI off** (`ai_enabled` defaults false), so attaching, from the app or an MCP tool, exposes nothing to any AI surface until a person turns it on with TOTP.
- **Mailboxes, calendars, drives and address books are equal reasons for a workspace to exist.** Mail and workflows need a mailbox; Workspace AI needs any of the four (`getWorkspaceGateData` with destination `assistant`).

### Membership

- **Every user has a personal workspace**, created at signup ([auth.md](auth.md)).
- **Losing membership drops the member's four link kinds in the same transaction as the `workspace_member` row.**
  - `removeMember` matches them through `connection.user_id`, because no FK can express "links to resources this user owns".
  - It is the only place a membership is deleted directly; user and workspace deletion reach the links by cascade.
  - It refuses to remove the last owner.
- **One owner per workspace.** Roles are `owner` / `admin` / `member`.
  - `transferOwnership` promotes the new owner and demotes the old one to `admin`; its route requires TOTP.
  - `changeMemberRole` refuses to touch the owner role.
- **Listing and revoking invites, removing members and changing the theme need an owner or admin.** The check lives in `src/workspace/admin.ts`, which takes the caller's role, so `workspaces.*` and the agent/MCP tools enforce the same rule.
- **A `workspace_invite` grants membership when the account it was sent to accepts it**; a `signup_invite` only creates an account ([auth.md](auth.md)).
  - `acceptInvite` compares the signed-in account's email with `invite.email` (case-insensitive), so a forwarded or leaked link joins nobody else, and the `memberJoined` event names the right person.
  - The error does not repeat the invited address, so a stray link holder learns nothing from it.

### Navigation and preferences

- **The URL slug is the source of truth for the current workspace**, so switching workspace is a navigation.
- **`user.default_workspace_slug` can go stale**, so `resolveDefaultWorkspaceSlug` re-checks membership on read.
- **User preferences live in `user_prefs`**, with no row until the first write. The one exception is `default_workspace_slug`, a Better Auth `additionalFields` entry so it rides in the session.

### Data scope

- **Rows are keyed by the narrowest scope that is true for everyone who can see them, always with a real FK**, so a wrong scoping choice is a constraint violation at write time instead of an empty read.
  - Keyed by **mailbox** (true for anyone who can see it): the message cache with its phishing verdict (`src/mail/cache.ts`), thread summaries, unsubscribe results and labels.
  - Keyed by **user × mailbox** (personal): mutes and read later; drive pins are user × drive.
  - Keyed by **user × workspace** (personal): saved searches ([search.md](search.md)).
  - Keyed by **workspace** with a principal: user workflows, whose mailbox references hang off `workflow_resource` ([workflow-graph.md](workflow-graph.md)).
- **Never add a per-user toggle over per-mailbox data.** One user's "on" would cache a verdict another user's "off" was meant to prevent, so summaries and phishing analysis run for everyone who can see the mailbox.

### Data export

- **The data export (`user.exportData`) is the account's own settings and history, never a mailbox archive.**
  - It holds preferences with the remote-content allowlist, workspace memberships, labels, user workflows, Workspace Assistant threads and the user's own audit events (`securityActivity`, [audit.md](audit.md)).
  - Mail, events, files and contacts stay with the provider; the settings section and the file's `notice` both say so.
- **It follows ownership, not visibility.**
  - Resource links and labels come only from resources the user connected (`connection.user_id`), for all four kinds.
  - Workflows are the live `user` workflows whose principal is the user; threads are every thread whose `resourceId` is the user, including threads from a workspace the user has left.
  - A label on a mailbox another member attached belongs to that member's export.
- **It carries no credential and no instance-internal reference a reader cannot resolve.**
  - Tokens and sealed credentials never leave; workspace ids become slugs, resources are named by provider and email.
  - Workflow graphs keep the stored mailbox ids, with an id → email map beside each graph.
- **The file is versioned (`format: "metis-suite-export"`, `version`); renaming or removing a field bumps `version`.**
- **Thread messages are AI SDK UI messages**, the shape `assistant.threadMessages` returns.
- **The procedure is per-user rate-limited (scope `data-export`) and takes no TOTP step-up**: it changes nothing, and `appSession` already requires 2FA.

## How it works

- **Landing.** `/w` redirects to the default workspace, or to `/settings/workspaces` when there is none. `/w/[slug]` lands on the first mailbox's inbox, else calendars, else drives, else onboarding (`onboardingPath`, the mailboxes settings page).
- **Gate.** When the current workspace lacks what a surface needs and another workspace has it, `workspace-gate.tsx` renders an in-place chooser from `getWorkspaceGateData(userId, workspaceId, destination)`, ordered by `user_prefs.workspace_order`.
- **AI policy.** A resource reaches any AI surface only when `workspaceAllowsAi` holds (the instance LLM is on and the workspace's `ai_policy` is not `off`) and its own link has `ai_enabled`.
- **Phishing policy** resolves per mailbox link (`resolveMailboxPolicy`), and nothing runs while `phishingDetectionEnabled()` is false. The workspace's `phishing_detection_policy` is:
  - `off`;
  - `optional`: the link's `phishing_detection_enabled` decides;
  - `required`: on for every mailbox, whatever the link says.
- **Turning a policy on takes TOTP.** `ai_enabled` on for a mailbox, calendar, drive or address book, or `phishing_detection_enabled` on for a mailbox, through `setPolicy` / `setPolicyEverywhere`; and every change through `workspaces.setPolicy` (owners and admins only).
- **The data export** runs every read in parallel in `buildDataExport` and returns one JSON document; the settings section serializes it into `metis-suite-export-<date>.json` in the browser.

## Deliberate limits

- **The data export has no import.** It is a portable copy for the user, not a backup the app restores.
- **The data export leaves out the built-in workflows (scheduled sends, snoozes), workflow runs, mutes, read later, saved searches, drive pins, unsubscribes, sent invites, the mailbox caches (messages, thread summaries, phishing verdicts), AI usage and MCP clients.**
- **A resource the user connected but linked to none of their workspaces appears only through its labels**, because resource links are exported per workspace.
