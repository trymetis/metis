# oRPC — where procedures live and the rules per namespace

How `orpc.*` namespaces are laid out and guarded, how errors reach the client, how an endpoint is added, and the rules for individual namespaces.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md) (scope as explicit input), [auth.md](auth.md).

## Code map

| Concern                         | Where                                                                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router                          | `src/server/routes/index.ts` → `router`                                                                                                                                                                                                                                                       |
| HTTP handler                    | `src/app/rpc/[[...rest]]/route.ts` → `RPCHandler`, prefix `/rpc` (its own `onError` also logs under `[orpc]`)                                                                                                                                                                                 |
| Request headers + error mapping | `src/server/middlewares/base.ts` → `base`, `AUTHORED_CODES`, `toClientError` · `src/lib/errors/sanitize-error.ts` → `sanitizeError`                                                                                                                                                           |
| Session middlewares             | `src/server/middlewares/app-session.ts` → `appSession` · `dashboard-session.ts` → `dashboardSession`, `dashboardOperator` · `workspace-session.ts` → `workspaceSession` · `mail-session.ts` → `mailSession` · `calendar-session.ts` → `calendarSession` · `drive-session.ts` → `driveSession` |
| TOTP step-up                    | `src/server/require-totp.ts` → `requireTotp`                                                                                                                                                                                                                                                  |
| Zod inputs and outputs          | `src/server/schema.ts` → `workspaceScopeSchema`, `mailboxScopeSchema`, `calendarScopeSchema`, `driveScopeSchema`                                                                                                                                                                              |
| Clients                         | `src/lib/orpc.ts` → `orpc` (browser, `RPCLink`), `rpc` (TanStack Query utils) · `src/lib/orpc.server.ts` → `orpc` (`createRouterClient`)                                                                                                                                                      |
| Query client                    | `src/lib/query-client.ts` → `getQueryClient`, `refreshQuery`, `refreshQueries` · `src/app/_components/query-provider.tsx` → `QueryProvider` (in the root `layout.tsx`)                                                                                                                        |
| Scope hooks                     | `src/hooks/use-workspace-path.ts` → `useWorkspaceScope`, `useMailboxScope`                                                                                                                                                                                                                    |
| Workspace admin checks          | `src/workspace/admin.ts` (called from `src/server/routes/workspaces.ts`)                                                                                                                                                                                                                      |
| Sender for the `all` mailbox    | `src/server/routes/mail/sender.ts` → `resolveSender`                                                                                                                                                                                                                                          |

## Rules

### Layout and guards

- **A namespace lives in `src/server/routes/` under its name in kebab case, wired in `routes/index.ts`.** `mail.*` is a directory with one file per sub-namespace, wired in `mail/index.ts`.
- **Guard each procedure with the narrowest session middleware for its scope.**
  - `appSession` for account-level procedures, `workspaceSession` for workspace-level ones, and the resource session for mail and `ai`, calendar events and drive.
  - `appSession` answers no session with `UNAUTHORIZED` and a session without 2FA with `FORBIDDEN`.
  - `workspaceSession` answers an unknown workspace with `FORBIDDEN`.
  - `mailSession`, `calendarSession` and `driveSession` answer an unknown slug with `NOT_FOUND`.
- **`mailSession`, `calendarSession` and `driveSession` rate-limit every procedure per user, one bucket per resource kind** (`MAIL_RATE`, `CALENDAR_RATE`, `DRIVE_RATE` in their middleware files).
  - The bucket is a floor that covers every procedure, including new ones; a procedure with a costlier action (sending, classifying, scanning) adds its own tighter limit on top.
  - It counts before the resource is resolved, so a flood of unknown slugs is limited too.
- **`signup.*` is the only namespace on bare `base`: public and IP rate-limited** ([auth.md](auth.md)). `signup.invitePreview` reads the session when there is one; `invites.accept` and `invites.decline` use `appSession`.
- **`dashboard.*` answers anyone without an instance role with `NOT_FOUND`** (`dashboardSession`), so the dashboard stays indistinguishable from an unrouted URL; `dashboardOperator` answers an Observer with `FORBIDDEN` ([dashboard.md](dashboard.md)).

### Errors

- **Only authored error codes keep their message.**
  - `base` passes an `ORPCError` whose code is in `AUTHORED_CODES` through unchanged.
  - It maps a `RateLimitedError` thrown by a domain function's `enforceRateLimit` to `TOO_MANY_REQUESTS` with its `retryAfterSec`.
  - It maps a `NotVisibleError` (`src/lib/errors/not-visible.ts`), thrown directly or as the cause of a wrapped error, to `NOT_FOUND` with its `clientMessage`. Calendar visibility checks throw it with their own message; drive's `DriveNotVisibleError` sets a neutral one ([drive.md](drive.md)).
  - It maps a `BadRequestError` (`src/lib/errors/bad-request.ts`), thrown directly or as a cause, to `BAD_REQUEST` with its message. The account resolvers throw it for a missing choice ("Pick which calendar account / drive / mailbox …") and the calendar providers for an answer from someone not on the guest list, so the user, agents and MCP read the same text.
  - Every other error is logged and its message replaced by `sanitizeError`, so a raw provider or database message never reaches the client.
  - `sanitizeError` words a 403 as a permission problem only when the provider gives no error reason or a permission reason (`PERMISSION_REASONS`); a rate-limit reason reads as too many requests, and any other reason as a failed request, because Google answers some bad requests with 403.
  - Each procedure a user triggers gets its wording in `OPERATIONS`, keyed by procedure path; one without an entry reads "do that".
  - Throw an authored code for any message the user should read.
- **A procedure that wraps a rate-limited domain call in its own `try` rethrows `RateLimitedError`** before mapping the rest to `BAD_GATEWAY` (as in `src/server/routes/ai.ts` and `mail/subscriptions.ts`).
- **Workspace admin procedures pass `context.appUser.workspaceRole` to `src/workspace/admin.ts`** and map its `forbidden` flag to `FORBIDDEN`.

### Step-up

- **A procedure uses `requireTotp`, rate-limited per user and scope, unless it already rate-limits on its own scope; then it calls `verify2FA` directly** ([auth.md](auth.md)).
- **Step-up guards every change that widens what AI or other people can reach, or that cannot be undone:** turning AI on for a mailbox, calendar, drive or address book, workspace policy, deletion, ownership and admin promotion, re-enabling an MCP client, and deleting the account.

### Per namespace

- **`mail.*` and `ai.*` work through `context.mail.adapter` and key every `(mailboxId, messageId)` write through `scopeMessage`** ([mail.md](mail.md)).
  - In the `all` mailbox, sending and draft writes take an explicit `fromMailboxSlug`, resolved by `resolveSender` ([mail.md](mail.md)).
- **`drive.*` works through `context.drive.surface`** ([drive.md](drive.md)). The one exception is `drive.quotas`, which reports per drive and so asks each of `context.drive.drives` for its own adapter (`driveQuotas` in `src/drive/quota.ts`).
- **`workflows.run` opens a durable trigger event with its typed inputs and returns its run id** ([workflow-runtime.md](workflow-runtime.md)).
  - `runs`, `getRun`, `cancelRun` and `resumeRun` share one visibility rule ([workflow-runs.md](workflow-runs.md)).
  - `workflows.test` runs an unsaved graph without side effects and returns its trace ([workflow-graph.md](workflow-graph.md)).
  - `workflows` is top-level and workspace-scoped, because a workflow belongs to the workspace.
- **`connections.createCredential` and `connections.delete`** are described in [servers.md](servers.md) and [connections.md](connections.md).
- **`audit.*` is read-only**: `audit.mine` on `appSession`, `audit.workspace` on `workspaceSession` for owners and admins ([audit.md](audit.md)).

## How it works

- **A new endpoint**: a procedure in `src/server/routes/*.ts`, wired into the router, with its schemas in `src/server/schema.ts`; the client calls it as `orpc.*`.
- **Procedures are plain objects** built from a session middleware plus Zod `.input()` / `.output()`. Middleware factories take the schema (`.input(schema).use(mw, mapInput)`), which keeps input inference.
- **Throw `ORPCError` for HTTP-shaped errors.**
- **The browser client** (`@/lib/orpc`) is an `RPCLink` with `credentials: "include"`.
- **Client components read data through TanStack Query, never through an effect that sets state.** `useQuery(rpc.x.queryOptions({ input }))`, or `useInfiniteQuery(rpc.x.infiniteOptions(...))` for cursor pages; `skipToken` as `input` disables a query.
  - Mutations stay `await orpc.x(...)` calls in event handlers, followed by `refreshQuery(rpc.x.queryKey({ input }))` / `refreshQueries(rpc.x.key())` or `queryClient.setQueryData(rpc.x.queryKey({ input }), ...)`.
- **A refresh never aborts a request and never returns data read before the write.** `refreshQuery` / `refreshQueries` (`src/lib/query-client.ts`) wait for any fetch of that key already running, then fetch again; a bare `refetch()` either cancels a running fetch (once the query has data) or hands back the one that started before the write (while it has none).
  - Polling joins a running fetch with `refetch({ cancelRefetch: false })`.
  - A local edit buffer over loaded data (a draft, a selection) re-syncs at render time when the query's `data` reference changes.
  - Server data shared across components lives only in the query cache, never in a Zustand store or a module variable; code outside React reads and writes it through `getQueryClient()`.
  - `QueryProvider` turns off retries and refetch on window focus, so a page loads once on mount and on explicit refresh, and an error shows at once; `usePollingRefresh` or `refetchInterval` polls where a page needs it.
- **The server client.** Server components call procedures in-process through `@/lib/orpc.server`, which the root `layout.tsx` imports so it initializes. No proxy runs on those calls, which is why `appSession` checks 2FA itself.
- **Headers.** `base` reads `next/headers` once per call and puts them on `context.headers`, which every session middleware and `requireTotp` use.
