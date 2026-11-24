# oRPC — where procedures live and the rules per namespace

How `orpc.*` namespaces are laid out and guarded, how errors reach the client, how an endpoint is added, the rules for individual namespaces, and the shell cache that keeps the shell's lists in the browser.
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
| Shell cache                     | `src/lib/shell-cache.ts` → `CACHED_QUERIES`, `startShellCache`, `clearShellCache` · `src/app/w/[slug]/_components/shell-cache.tsx` → `ShellCache` · `src/auth/local-data.ts` → `clearLocalData`                                                                                               |
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
- **`mailSession`, `calendarSession` and `driveSession` rate-limit every procedure per user, one bucket per resource kind** (`RATE_LIMITS.mailSession`, `calendarSession`, `driveSession`, `addressBookSession`).
  - The bucket is a floor that covers every procedure, including new ones; a procedure with a costlier action (sending, classifying, scanning) adds its own tighter limit on top.
  - It counts before the resource is resolved, so a flood of unknown slugs is limited too.
- **`signup.*` is the only namespace on bare `base`: public and IP rate-limited** ([auth.md](auth.md)). `signup.invitePreview` reads the session when there is one; `invites.accept` and `invites.decline` use `appSession`.
- **`dashboard.*` answers anyone without an instance role with `NOT_FOUND`** (`dashboardSession`), so the dashboard stays indistinguishable from an unrouted URL; `dashboardOperator` answers an Observer with `FORBIDDEN` ([dashboard.md](dashboard.md)).

### Errors

- **Only authored error codes keep their message.**
  - `base` passes an `ORPCError` whose code is in `AUTHORED_CODES` through unchanged.
  - It maps a `RateLimitedError`, thrown by a procedure or by a domain function's `enforceRateLimit`, to `TOO_MANY_REQUESTS` with its `retryAfterSec`.
  - It maps a `NotVisibleError` (`src/lib/errors/not-visible.ts`), thrown directly or as the cause of a wrapped error, to `NOT_FOUND` with its `clientMessage`. Calendar visibility checks throw it with their own message; drive's `DriveNotVisibleError` sets a neutral one ([drive.md](drive.md)).
  - It maps a `BadRequestError` (`src/lib/errors/bad-request.ts`), thrown directly or as a cause, to `BAD_REQUEST` with its message. The account resolvers throw it for a missing choice ("Pick which calendar account / drive / mailbox …") and the calendar providers for an answer from someone not on the guest list, so the user, agents and MCP read the same text.
  - Every other error is logged and its message replaced by `sanitizeError`, so a raw provider or database message never reaches the client.
  - `sanitizeError` words a 403 as a permission problem only when the provider gives no error reason or a permission reason (`PERMISSION_REASONS`); a rate-limit reason reads as too many requests, and any other reason as a failed request, because Google answers some bad requests with 403.
  - Each procedure a user triggers gets its wording in `OPERATIONS`, keyed by procedure path; one without an entry reads "do that".
  - Throw an authored code for any message the user should read.
- **Every rate limit's values live in one table, `src/services/rate-limits.ts`**: `RATE_LIMITS` for the app's own limits, `AUTH_PATH_RATE_LIMITS`, `AUTH_DEFAULT_RATE_LIMIT` and `AUTH_TWO_FACTOR_RATE_LIMIT` for Better Auth.
  - A call site names its entry (`RATE_LIMITS.mailSend`); it never writes a scope, count or window inline.
  - The Better Auth entries restate the library's own defaults for the paths the app uses, so no limit is implicit.
  - Operators cannot change them.
- **A limit counts work, not views**: a limit in front of a cache is checked only on a miss (thread summaries via `buildThreadSummary`'s `beforeModel`, the phishing check after `getCachedAnalysis`, the subscriptions scan after its cached result).
- **Every rate limit is reported with `RateLimitedError(result, subject)`, never a hand-built `TOO_MANY_REQUESTS`**, so each message reads "Too many <subject>. Try again in <wait>." from `src/lib/rate-limit-message.ts` → `rateLimitMessage`.
  - The wait is the bucket's remaining time (`CacheDriver.ttlMs`), not the whole window.
  - Plain routes answer with `tooManyRequests`, whose JSON `error` carries the same text and whose `Retry-After` header carries the wait; the agent panels and the Workspace Assistant show that `error` instead of the raw body (`src/ai/chat-error.ts` → `chatErrorText`).
  - Better Auth's 429s carry only `X-Retry-After`; `src/auth/client.ts` rewrites them to the same text.
  - Agent and MCP tools pass a `RateLimitedError`'s message through as the tool error (`withToolErrors` in `src/mastra/toolkit/resolve.ts`), so the assistant and MCP clients get the same text.
  - Clients read the wait from an error with `rateLimitWait` (same file) to retry after it: the toolbar unsubscribe check, smart replies and the mail list's AI labels do.
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

### Shell cache

- **The shell cache keeps only the lists the shell shows on nearly every page, in `CACHED_QUERIES`, plus the first page of a drive's root folder.**
  - Mail, events, contacts, file contents, chat messages, AI results, sessions, grants and dashboard data are never added.
  - It covers all four resource kinds: their workspace link lists, mail custom labels, sub-calendars, drive pins, quotas and root folder, and address books.
  - Anything the server layouts render (user, roles, workspace policy, AI switch, theme) stays out, because those decide access and arrive with the page.
- **The query cache stays the source of truth; IndexedDB only mirrors it.** Nothing reads the shell cache except `startShellCache`, which copies rows into the query cache.
- **A row is seeded only into a query that already has an observer and no data.** `useQuery` reads the cache on its first render and subscribes only after that render commits, so a component still hydrating sees a seed only when another component already subscribed to the same key, the same race as a fast server answer.
- **Every seeded key is invalidated and fetched again**, so its stored copy shows only until the server answers, whatever its `staleTime`.
- **The cache belongs to one user and one app version.** `startShellCache` compares both with its owner row and empties the cache on any mismatch, which covers a session that ended without sign-out (expiry, revocation, a ban).
- **Every web sign-out path calls `clearLocalData`**, which clears the shell cache and the drive preview cache ([drive-preview.md](drive-preview.md)).

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
  - Server data shared across components lives only in the query cache, never in a Zustand store or a module variable; code outside React reads and writes it through `getQueryClient()`. The shell cache mirrors part of it to IndexedDB (see Shell cache).
  - `QueryProvider` turns off retries and refetch on window focus, so a page loads once on mount and on explicit refresh, and an error shows at once; `usePollingRefresh` or `refetchInterval` polls where a page needs it; `usePollingRefresh` also refreshes on focus or visibility at most once per half interval, and returns `markRan` so a manual refresh pushes the next tick back.
- **The server client.** Server components call procedures in-process through `@/lib/orpc.server`, which the root `layout.tsx` imports so it initializes. No proxy runs on those calls, which is why `appSession` checks 2FA itself.
- **Headers.** `base` reads `next/headers` once per call and puts them on `context.headers`, which every session middleware and `requireTotp` use.
- **The shell cache** is a Dexie database (`metis-shell-cache`) with a `queries` table keyed by query hash and an `owner` row.
  - `ShellCache`, in the workspace layout, calls `startShellCache` with the user id and the server version (`sourceInfo().version`) once mounted.
  - Once the rows are read, queries that already have observers are seeded at once and refreshed with `refreshQuery` unless a fetch is running; every later query is seeded on its `observerAdded` event, which fires before the observer decides whether to fetch on mount.
  - A seed is `setQueryData` with the stored `updatedAt`, then an invalidation with `refetchType: "none"`, so the mount fetch runs.
  - The same `QueryCache` subscriber writes every other `success` update of a cached key back, including `setQueryData` after a mutation, so call sites need no changes; the rows stay in memory too, so a query collected after `gcTime` is seeded again on its next mount.
  - Rows older than 30 days are dropped on start. `clearShellCache` deletes the database and stops any write already queued.
  - Dexie reopens the database by itself when the browser closes it, as the desktop and mobile "Clear cache" do while the page is open.

## Deliberate limits

- **The shell cache only speeds up a cold start** (a new tab, a reload, launching the desktop or mobile app); navigation within a session is already served from memory. It adds no offline mode: there is no service worker, and the page still comes from the server.
- **The shell cache is not encrypted.** Its rows are names and addresses, never tokens or credentials, and a key kept beside them in IndexedDB would add nothing against someone with the profile; OS disk encryption and the wipes above cover it, as for the drive preview cache.
