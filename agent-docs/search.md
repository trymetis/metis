# Workspace search

The search dialog on the app rail: the query language, how one query runs against every provider and the app's own tables, what each result does, and the members pages it opens.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [mail.md](mail.md), [calendar.md](calendar.md), [drive.md](drive.md), [workspaces.md](workspaces.md), [shortcuts.md](shortcuts.md), [ai-agents.md](ai-agents.md).

## Code map

| Concern                                                | Where                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kinds and the field table                              | `src/search/fields.ts` → `SEARCH_KINDS`, `SEARCH_FIELDS`, `RETIRED_KEYS`, `LOCAL_MAIL_STATES`, `EXPLICIT_KINDS`                                                                                                                                       |
| Parsing, validation and the depth cap                  | `src/search/query.ts` → `parseSearch`, `MAX_SEARCH_DEPTH`                                                                                                                                                                                             |
| AST helpers over liqe's `ParserAst`                    | `src/search/ast.ts` → `conjuncts`, `disjuncts`, `retag`, `andAll`                                                                                                                                                                                     |
| Which kinds a query can match, and pruning it per kind | `src/search/kinds.ts` → `kindsFor`, `pruneFor`                                                                                                                                                                                                        |
| Matching an item: the rewrite liqe's `test` runs on    | `src/search/match.ts` → `forMatching`, `matcherFor`, `needsKey`                                                                                                                                                                                       |
| Pushdown planning shared by every provider             | `src/search/pushdown.ts` → `Dialect`, `compileWith`, `planPushdown`, `pickText`, `bindTags`                                                                                                                                                           |
| Dates and sizes in values                              | `src/search/dates.ts` → `parseSearchDate` · `src/lib/size.ts` → `parseSize`                                                                                                                                                                           |
| Input tokens and the caret context for autocomplete    | `src/search/tokens.ts` → `searchTokens`, `caretContext`                                                                                                                                                                                               |
| The adapter contract                                   | `src/search/types.ts` → `AstSearch`, `Accept` · `searchAst` on `MailAdapter`, `CalendarAdapter` (`EventAstSearch` adds the window), `DriveAdapter` and `DriveSurface`                                                                                 |
| Provider dialects                                      | `src/mail/providers/gmail.ts` → `gmailDialect` · `microsoft.ts` → `kqlDialect` · `zoho.ts` → `zohoDialect` · `imap.ts` → `imapDialect` · `gateway-client.ts` → `searchAst` · `src/drive/providers/google.ts` → `googleDialect`                        |
| Text-only search                                       | `src/calendar/text-search.ts` → `textEventSearch`, `EVENT_SEARCH_MAX` · `src/drive/text-search.ts` → `textDriveSearch`                                                                                                                                |
| Per-domain search                                      | `src/mail/search.ts` → `searchMail`, `mailSearchDoc` · `src/calendar/search.ts` → `searchEvents` · `src/drive/search.ts` → `searchFiles`, `fileKinds`                                                                                                 |
| Everything in the app's own tables                     | `src/search/sources.ts` → `searchLocal`                                                                                                                                                                                                               |
| Saved searches                                         | `src/search/saved.ts` → `MAX_SAVED_SEARCHES` · table `saved_search` in `src/db/schema.ts`                                                                                                                                                             |
| Procedures                                             | `src/server/routes/search.ts` → `search.mail`, `search.events`, `search.files`, `search.local`, `search.suggest`, `search.saved.*`                                                                                                                    |
| The dialog                                             | `src/components/search/` → `workspace-search.tsx` (mounted by `src/app/w/[slug]/layout.tsx`), `search-dialog.tsx`, `use-search.ts`, `actions.ts`, `preview.tsx`, `entries.ts` (commands, settings pages, workspaces), `suggestions.ts`, `prompts.tsx` |
| The query input                                        | `src/components/search/search-input.tsx` (TipTap with a highlight plugin) · token colors `.search-query .sq-*` in `src/styles/globals.css`                                                                                                            |
| Open state                                             | `src/store/search-store.ts` → `useSearchStore`                                                                                                                                                                                                        |
| Opening a result after navigating                      | `src/components/search/navigate.ts` · compose through `useMailStore` → `setComposeInitial` · `/w/[slug]/workflow?id=`                                                                                                                                 |
| Hand-offs                                              | `src/mail/pending-open.ts` → `stashPendingOpen` · `src/calendar/pending-open.ts` → `stashCalendarHandoff` · `src/drive/pending-open.ts` → `stashDrivePreview`, `stashDriveAction` · `src/components/assistant/pending.ts` → `setPendingDraft`         |
| Members pages                                          | `src/app/w/[slug]/members/page.tsx` · `[userId]/page.tsx` · shared `src/components/members/member-admin.tsx` → `useMemberAdmin`, `member-activity.tsx`                                                                                                |
| Workspace AI and role on the client                    | `src/components/workspace-access.tsx` → `useWorkspaceAccess`                                                                                                                                                                                          |

## Rules

### The language

- **liqe is the only parser.** `parseSearch` calls liqe's `parse` inside a try/catch.
  - A `SyntaxError` carries an `offset`; any other throw (an open quote or parenthesis) means the query is unfinished.
  - Validation then walks the tree against `SEARCH_FIELDS`.
- **A query runs only with no diagnostics.** Every procedure parses the query string itself and returns `diagnostics` with empty results when anything is wrong.
- **A key is shared only if it means the same property on every kind** (the item's own `name:`, `title:` or state `is:`).
- **A key that names a container has a prefix:** `mailbox:`, `calendar:`, `drive:`, `mail-folder:`, `drive-folder:`, `sub-calendar:`.
- **`in:` and `folder:` are reserved in `RETIRED_KEYS` and always answer with an error** pointing at `mail-folder:` or `drive-folder:`, so a Gmail habit gets a useful message.

### Matching and pushdown

- **liqe matches substrings, so `forMatching` rewrites exact values before liqe's `test` runs.**
  - Enum and slug values become anchored case-insensitive regexes, so `is:read` cannot match `unread`.
  - Quoted values become case-insensitive regexes.
  - Dates and sizes become numeric comparisons on `date` and `size`; bare words go to the `text` field.
- **A filter that does not apply to a kind is false for that kind.** `pruneFor` binds each tag, and a kind whose query is `false` is not searched: `type:file` or `from:` alone calls no calendar.
- **Pushdown may only widen the query.** A provider compiles each top-level conjunct through its `Dialect`.
  - A leaf it expresses exactly is dropped from the residual.
  - A leaf it expresses approximately (dates on Gmail, Zoho and IMAP; folders on Zoho) is pushed down and kept in the residual.
  - An `OR` is pushed down whole, or not at all when any branch cannot be expressed.
- **The residual is checked by the caller, with the app's own data.** Adapters return results through `accept(residual, items)`, which the domain search supplies: mail adds labels, read later and mutes, drive adds pins and parent-folder names, calendar adds sub-calendar names.
- **States only the app knows (`LOCAL_MAIL_STATES`) are a separate source.** An AND that contains one is answered from those rows alone; elsewhere in the query both sources run and the results are merged.
- **Subscriptions are searched only when asked for (`EXPLICIT_KINDS`, `type:subscription`)**, because finding them scans mail at the provider.

### Access and actions

- **Search applies the visibility rules of the app's own lists.**
  - Mailboxes, calendars and drives come from the same workspace lists; drive results pass `visibleOnly`; calendar results come from visible calendars only.
  - Chats are the caller's own threads (`listAssistantThreads`); invites need an admin (`listWorkspaceInvites`); connections are the caller's own grants that back this workspace (`listWorkspaceConnectionsOf`).
- **Search runs on every resource whatever its AI switch.** Only the "Ask the assistant" action checks the platform, workspace and resource switches (`ai` on each hit, [ai-agents.md](ai-agents.md)).
- **Every result action calls an existing procedure, with that procedure's own checks.** `search.*` holds only the search procedures.
- **Saved searches are personal**: `saved_search` is keyed user × workspace, capped at `MAX_SAVED_SEARCHES`. Recent searches stay in the viewer's browser storage.
- **Role changes, removal and ownership transfer live once, in `useMemberAdmin`**, used by the profile page and the search dialog; settings → General shows a short list that links to `/members` ([workspaces.md](workspaces.md) has the rules).

- **The sub-calendar list behind calendar results is cached per workspace for a minute** (`cachedCalendarList` in `src/calendar/list-cache.ts`, one cache hash per workspace, one field per user and account set); a listing with an account error is not kept.
  - `attachCalendar`, `detachCalendar` and `setCalendarVisibility` (`src/connections/calendar-store.ts`) drop the workspace's hash, so a calendar shown, hidden, linked or unlinked shows in search at once on every process.

## How it works

- **One query, four requests.** `use-search.ts` debounces the query, then calls `search.mail`, `search.events`, `search.files` and `search.local` in parallel for the kinds `kindsFor` allows, and filters commands, settings pages and workspaces in the browser.
  - Each request carries the viewer's IANA time zone, so `today`, `7d` and ISO dates mean the viewer's day.
- **Mail.** `searchMail` runs `searchAst` on the aggregate mail adapter, which binds `mailbox:` per mailbox, fans out and packs the per-mailbox cursors as `listMessages` does.
  - Gmail gets a `q` string; Outlook gets KQL in `$search`, against the folder endpoint when the query has a top-level `mail-folder:`.
  - Zoho gets a `searchKey` joined with `::`; IMAP gets a `SearchObject` (colliding keys in an AND become `NOT (OR (NOT a) (NOT b))`); the gateways take one free-text term.
  - With nothing to push down, a provider lists its inbox and the residual filters it.
- **Events.** `searchEvents` takes its window from top-level `after:`, `before:` and `on:` (otherwise a year either side of today) and binds `calendar:` per account. Every calendar provider's `searchAst` is `textEventSearch`, which lists the window with one free-text or `title:` term.
- **Files.** `searchFiles` runs the aggregate drive surface's `searchAst`. Google Drive compiles names, full text, kinds and dates into `files.list` `q`, sorted by modified time unless a full-text term forces relevance order ([drive.md](drive.md)); every other drive's `searchAst` is `textDriveSearch`, which runs the provider's own search with one free-text or `name:` term.
- **Highlighting.** `search-input.tsx` is a one-paragraph TipTap editor whose plugin parses on every change.
  - A good parse becomes one decoration per token location.
  - A failed parse keeps the previous decorations mapped through the edit and marks only the text from the error offset.
  - A separate decoration marks the parenthesis matching the caret.
- **Autocomplete.** `caretContext` parses the text again with a marker at the caret to learn whether a key or a value is being typed, falling back to the word before the caret. Keys come from `SEARCH_FIELDS`, enum values from the field, and resources, labels, workflows and people from `search.suggest`.
- **Results.** The list groups results by kind, and the preview pane shows the highlighted result; the keys are in [shortcuts.md](shortcuts.md). On phones the dialog is a full-height bottom sheet with no preview pane.
- **The search box keeps focus.**
  - The kind chips prevent focus on mousedown, and the "In a resource" menu's `finalFocus` returns to the box, so typing after a click lands in the query; a focused chip would toggle itself off at the next typed space.
  - Esc on an action list is caught in the dialog's `onOpenChange` (`reason === "escape-key"`, then `cancel()`), because Base UI's own Escape dismissal runs whatever the editor keymap handled.
- **Opening things.** Navigation cannot carry state, so `navigate.ts` hands a result over to the page it opens.
  - Mail through `stashPendingOpen` (the folder view opens it); events and sub-calendar visibility through `stashCalendarHandoff` (read by `CalendarProvider`); file previews, uploads and new folders through `src/drive/pending-open.ts` (read by `DriveShell`).
  - Compose through the mail store; "Ask the assistant" through `setPendingDraft` (the composer starts with the reference chip); workflows through `?id=`.
  - Each page reads its hand-off when it mounts and listens for new ones while mounted, so a result for the page already on screen still opens.
  - A hand-off lands only on the page it names: that mailbox and folder, that calendar slug, that drive slug.
- **Members.** `/w/[slug]/members` lists members and, for admins, pending invites and the invite dialog. `/w/[slug]/members/[userId]` shows a profile with recent mail and upcoming events with that person (two searches), the person actions, and management for those allowed to. A `<@member:id>` chip in a chat opens the profile.

## Deliberate limits

- **The residual can only check what the provider returned.** Free text is trusted to the provider; a residual condition on a field a provider's results lack (Outlook and Zoho results carry no reliable folder outside a top-level `mail-folder:`) can drop a real match.
- **IMAP search across folders has no pages**: it returns the newest matches across its search folders ([mail.md](mail.md)). A search held to one folder by `mail-folder:` pages by UID, like the folder list.
- **Text-only drives (S3, WebDAV, FTP, SFTP, OneDrive) need a word**; a query of only `kind:`, `size:` or dates finds nothing on them.
- **An event search lists at most `EVENT_SEARCH_MAX` events per account in its window** before the residual filter, so a query with no word over a busy calendar should carry `after:` and `before:`.
- **`drive-folder:` matches the name of a file's parent folder**, as a name rather than a path.
- **Ranges are numeric only** (liqe's grammar), so date ranges are written as `after:` and `before:`.
- **App-database states match only the message cache** for read later and mutes, so a message never opened shows its cached subject and sender, not its full text.
