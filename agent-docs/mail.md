# Mail — sessions, adapters and providers

How a mail request reaches a provider: `MailSession`, the `MailAdapter` interface and its providers, the `all` aggregate mailbox, drafts, signatures and the workspace footer, personal mail state and undo send.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [gateways.md](gateways.md), [mail-ai.md](mail-ai.md), [mail-rendering.md](mail-rendering.md), [servers.md](servers.md), [workflow-graph.md](workflow-graph.md), [orpc.md](orpc.md).

## Code map

| Concern                                             | Where                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session (user → workspace → mailboxes → fresh auth) | `src/mail/session.ts` → `MailSession`, `MailScope`, `scopeMessage`, `mailboxIds`, `sendingMailbox`, `forSender` · middleware `src/server/middlewares/mail-session.ts`                                                                                                                                                                    |
| Adapter interface + factory                         | `src/mail/adapter.ts` → `MailAdapter`, `MailChanges`, `getMailAdapter` · rows that follow a move `src/mail/moves.ts` → `followMoves`, `carryMessageRows`, `MESSAGE_ROWS`                                                                                                                                                                 |
| The `all` mailbox                                   | `src/mail/aggregate.ts` → `getAggregateAdapter`                                                                                                                                                                                                                                                                                          |
| Providers                                           | `src/mail/providers/gmail.ts` → `gmailMail` · `microsoft.ts` → `microsoftMail` · `zoho.ts` → `zohoMail`, `detectRegion`, `loadAccount` · `imap.ts` → `imapMail` · `imap-pool.ts` → `withImap`, `lockMailbox`, `SEARCH_FOLDERS`, `retireImapServers` · `gateway-client.ts` → `gatewayMail` ([gateways.md](gateways.md))                   |
| Procedures                                          | `src/server/routes/mail/` (one file per area) · sender choice `src/server/routes/mail/sender.ts` → `resolveSender`                                                                                                                                                                                                                       |
| Message cache, summaries cache                      | `src/mail/cache.ts` → `cacheMessage`, `getThreadSummary` ([mail-ai.md](mail-ai.md))                                                                                                                                                                                                                                                      |
| Unsubscribe                                         | `src/mail/unsubscribe.ts` → `parseUnsubscribeHeader` · `src/mail/subscriptions.ts` → `scanSubscriptions`, `unsubscribeSenders` · table `mailUnsubscribe`                                                                                                                                                                                 |
| Personal state                                      | `src/mail/mute.ts`, `src/mail/read-later.ts` · tables `mailMute`, `mailReadLater` in `src/db/schema.ts`                                                                                                                                                                                                                                  |
| Mail list state (client)                            | `src/mail/mail-cache.ts` → `useMailList`, `useReadLaterList`, `refreshMailListHead`, `refreshReadLaterList`, `holdRemoved`, `setCachedLabels`, `mutedThreads`, `readLater` · `src/store/mail-store.ts` → `listTabs`, `selectedView`, `submittedSearch`, `updateEmail`, `removeEmail`, `removeEmails` · `src/lib/in-order.ts` → `inOrder` |
| Custom labels, contacts, raw source                 | `src/mail/custom-labels.ts` · `src/mail/contacts.ts` → `suggestContacts` · `src/mail/raw.ts` → `readRawMessage`                                                                                                                                                                                                                          |
| Signatures and the footer                           | `src/mail/signatures.ts` → `composeSignatures`, `saveSignature`, `setMailFooter`, `finishOutgoing` · `src/mail/signature-markup.ts` · table `mailSignature` · procedures `src/server/routes/mail/signatures.ts`, `workspace-signatures.ts`                                                                                               |
| Signature UI                                        | composer node `src/app/w/[slug]/m/[mailbox]/_components/signature-block.ts` · settings `src/app/w/[slug]/settings/signatures/` · sanitizer `src/lib/sanitize-html.ts` → `sanitizeSignatureHtml`                                                                                                                                          |
| Undo send                                           | `src/store/undo-send-store.ts` → store action `startSend` · `src/components/undo-send-toast.tsx`                                                                                                                                                                                                                                         |
| Body rendering, labels                              | `src/mail/render/` ([mail-rendering.md](mail-rendering.md)) · `src/mail/labels.ts` ([mail-ai.md](mail-ai.md))                                                                                                                                                                                                                            |
| Workspace search over mail                          | `MailAdapter.searchAst` in every provider · `src/mail/search.ts` → `searchMail` ([search.md](search.md))                                                                                                                                                                                                                                 |
| Opening a message after navigating                  | `src/mail/pending-open.ts` → `stashPendingOpen`, `takePendingOpen` (read by `src/app/w/[slug]/m/[mailbox]/[folder]/_components/folder-view.tsx`)                                                                                                                                                                                         |
| Provider list                                       | `src/connections/types.ts` → `CONNECTION_PROVIDERS`                                                                                                                                                                                                                                                                                      |

## Rules

### Sessions and ids

- **Routes use `context.mail.adapter`.** The session already holds the right adapter, aggregate or single ([orpc.md](orpc.md)).
- **Mail domain functions take a `MailScope`, the session fields they read.** `MailScope` is user, workspace, role, adapter, resolved mailboxes and `isAggregate`.
  - A procedure passes its session; an agent tool passes `mailScopeFor(ctx, mailbox)` ([ai-agents.md](ai-agents.md)).
- **Composite ids never reach our DB.** Every `(mailboxId, messageId)` write goes through `scopeMessage(mail, id)`, whose branded `ScopedMessage` stops a composite id double-keying any mailbox-keyed table.
  - Reads use `mailboxIds(mail)` and re-compose ids on the way out when `mail.isAggregate`.
- **Writes are scoped by `mailboxIds(mail)` (mailbox rows) or `mail.mailboxes[].linkId` (workspace-link rows).** Server components pass route params; oRPC procedures take the slugs from their own validated input.
- **The aggregate adapter never guesses a sender.** `sendMessage` and draft writes throw on it, so those paths take an explicit `fromMailboxSlug` (the compose From picker, also carried on undo-send state).
- **Background behavior runs only in the workflow engine** ([workflow-runtime.md](workflow-runtime.md)); an inbox fetch triggers nothing.

### Moves

- **A move returns the message's new id, and callers keep it.**
  - `archiveMessage` and `restoreMessage` return the id after the move: IMAP reads the new UID from `COPYUID` and encodes `[folder, uidvalidity, uid]`; Zoho re-encodes `[folderId, messageId]` with the destination folder; Graph returns the moved message; Gmail and the gateways keep the id.
  - `deleteMessage` returns the id in Trash, or `null` when the message is gone for good (IMAP from Trash, the gateways always).
  - `updateDraft` returns the draft's id after the update (IMAP and Zoho replace the draft).
  - The workflow archive and restore steps pass the new id downstream, and the agent/MCP `updateDraft` returns it, so a later call never targets a moved message.
- **`changes` is the one optional adapter method: a change cursor over one folder for workflow feeds** ([workflow-graph.md](workflow-graph.md)).
  - Gmail reads history from a `historyId` (messages added or labelled into the folder); a 404 means the id expired.
  - Microsoft reads a messages delta filtered to mail received from the first call on; a 410 means the token expired.
  - IMAP keeps `uidvalidity:uidnext` and searches UIDs from it; a changed `uidvalidity` expires it.
  - It answers `null` where a folder has no cursor (Gmail archive, starred on Microsoft and IMAP) and the feed lists instead; Zoho and the gateways leave it out.
- **A message's own rows follow it when a move changes its id.** `getMailAdapter` wraps every adapter in `followMoves`, which re-keys the `MESSAGE_ROWS` tables (`mail_label`, `mail_read_later`) after `archiveMessage`, `restoreMessage`, `deleteMessage` and `batchDelete`.
  - So an IMAP or Outlook message archived and restored keeps its AI label (which the summarizer prompt carries) and its read-later mark.
  - `batchDelete` returns the ids that changed (old → new): IMAP from `COPYUID`, Graph from each batched `move` to Deleted Items (the same move `deleteMessage` makes), Zoho by re-encoding each id with the Trash folder; Gmail and the gateways keep their ids and return none.
  - A failed re-key logs `[mail]` and leaves the move, which already happened at the provider, in place.
- **A failed IMAP move is an error.** imapflow's `messageMove` returns `false` without throwing, so `moveMessage` throws on it; an archive into a missing folder must not report success.
- **A missing IMAP message is an error**: `getHeaders` throws "Message not found" like `getMessage`, so a stale id is never read as a message without headers.

### Personal state and the list

- **Mute and read later are personal rows with no provider write**, keyed user × mailbox.
- **The list's tab lives in `mail-store` (`listTabs`, keyed workspace/mailbox/folder).** `FolderView` mounts `EmailList` in a different tree with and without an open message, and the remount must keep the tab rather than fall back to Primary, which hides transactions.
- **A custom label's color is a palette name or a `#rrggbb` hex** (`customLabelColorSchema`).
  - A palette name resolves to the `--label-custom-*` tokens of the current theme; a hex is the mark as-is, and chip text takes its hue at the theme's `--label-custom-text-l` lightness (`customLabelColor`), so any pick stays readable in light and dark.
  - Labels exist only in Metis, so no provider palette limits the colors.
  - Mailbox colors hash over their own fixed eight-color list (`mailbox-color.ts`), so a new palette color never recolors a mailbox.
- **Editing a custom label changes its name and color, never its key** (`updateCustomLabel`), because label rows and workflows store the key.
- **The list, its search results, labels, mute and read later live in the TanStack Query cache** (`mail-cache.ts`); `mail-store` keeps only UI state and the `updateEmail` / `removeEmail(s)` actions, which write into every cached list and search result.
  - `useMailList` pages `messages.list` with `useInfiniteQuery` (staleTime `Infinity`); polling and re-entering a folder fetch the first page and merge it in (`refreshMailListHead`), so loaded pages stay.
  - Other readers of the list (shortcuts, agent panel, detail) observe the cache without fetching (`useCurrentEmails`); `selectedView` tells them whether the folder list or the read-later list is showing.
- **Read later is its own list, not a filter over a folder's pages.** The `[folder]` route serves `read-later` as `FolderView` with `view="read-later"`, so it keeps the list and reading pane; `mail.readLater.listEmails` (`listReadLaterEmails`) reads each saved id from the provider.
  - A saved message shows wherever it was moved: `followMoves` re-keys its read-later row, and the list never pages the folder to find it.
  - The rows are filtered by the read-later id cache, so taking a message off the list hides its row at once and a refresh in flight cannot bring it back.
  - The page has no tab row; muted conversations stay hidden, as in the Inbox.
- **The Unread and Starred tabs and the sidebar label filters list from the server, never by filtering the folder's loaded pages** (`useEmailSource`, `listSource`), so a match on a later page shows and a sparse filter never pages through the whole folder.
  - Unread and Starred run the provider search for `mail-folder:<folder> is:unread|starred` (`mail.messages.listInState` → `listMailInState`), paged like search; IMAP pages a one-folder search by UID ([search.md](search.md)).
  - These lists and the sidebar label list keep their pages (staleTime `Infinity`) and refresh only when the user switches to them (`refreshListOnSwitch` remembers the list last shown).
  - `FolderView` remounts `EmailList` when a message opens or closes; a refetch then would drop the message just opened from **Unread**.
  - A sidebar label lists the mailbox's `mail_label` rows for that label from every folder, since a label row carries no folder (`mail.labels.listEmails` → `listLabelledEmails`); each page reads its messages from the provider (`readListedEmail`) and skips any that are gone.
  - The other tabs (Primary and the label tabs) still filter the loaded pages.
  - **An empty filter with more pages shows a Load more button, never an automatic walk.** Outlook, Zoho and the gateways cannot push `is:unread` / `is:starred` down, so a page of 25 folder messages may hold no match; the button fetches the next page on click.
- **The mail list renders only the rows near the viewport** (`useVirtualizer` from TanStack Virtual in `email-list.tsx`, measured per row, `ROW_OVERSCAN` rows above and below), so a folder with thousands of loaded threads stays responsive.
  - The scroll element is the `ScrollArea` viewport (`[data-slot="scroll-area-viewport"]`), found through a ref on the root, because the shadcn primitive does not expose the viewport and is generated code.
  - The overscan is wide enough that the first loaded pages are all in the DOM, so the e2e tests can find any row of the seeded folders by its subject without scrolling.
  - The open thread is scrolled into view (`scrollToIndex`, `align: "auto"`) once per newly opened message (`scrolledTo`), so next and previous in the reading pane never land on an unrendered row, while new mail at the top or a removed row above never pulls the list back to the open row.
  - The infinite-load sentinel stays after the sized list, so loading more still starts 200 px before the end.
- **A cached message body is cleared once the message has not been opened for `mailCache.retentionDays`** (instance config, default 30, `METIS_MAIL_CACHE_DAYS`; `pruneCachedBodies` in `src/mail/cache.ts`, run daily at 03:45 UTC by `system:mail-cache-prune`).
  - Only `body_html` and `body_text` are cleared; subject, sender, snippet and the phishing verdict stay, because the read later and muted lists render from them and the verdict costs an AI call to redo. Opening a message from the stored copy refreshes `synced_at` (`touchCachedMessage` in `mail.messages.get`), and opening one whose body was cleared fetches and stores it again, so the period counts from the last open.
- **Contact suggestions are cached in the cache driver for 10 minutes, cleared by any send from a mailbox in the set** (`suggestContacts` in `src/mail/contacts.ts`).
  - An entry for a mailbox set is written into every member mailbox's `contacts:` hash and used only when all of them still hold the same value, so a send from any member invalidates it.
  - `getMailAdapter` wraps `sendMessage` to call `forgetContacts(mailboxId)` after a send, so every send path (compose, agents, MCP, workflows) clears it without each caller doing so.
  - A result built while the sent or inbox listing failed is returned but not stored, so a brief provider error never pins empty suggestions.
  - The browser keeps no copy of its own past one request (`useContactSuggestions`, default `staleTime`), and a sent message refreshes it (`undo-send-store.ts`), so the server cache is the only wait.
- **A refresh in flight cannot undo a personal toggle.** The client sends each item's add/remove in order (`inOrder`), and every local edit of mute, read later or labels records its time (`markEdited`); a fetch that started before the edit keeps the edited cache instead of its response (`keepingEdits`), so no request is aborted and an older response never overwrites the edit.
- **A move or delete refreshes the label map and the read-later queries once its request settles** (`refreshMessageRowsAfter` in `removeEmail(s)`), because `followMoves` may have re-keyed their rows to a new id.
- **A list reload never brings back a row the user just removed.**
  - Archive, delete, restore, snooze and bulk delete remove the row first and pass their request to `removeEmail` / `removeEmails`, which hold the id (`holdRemoved`) until that request settles.
  - Every list and search fetch takes the time it started and drops a held id unless it started after the request settled; an earlier fetch may have read the folder before the provider moved the message.
  - The hold ends with the first fetch that started after the request settled, so a failed request lets the row return, and a message that comes back under the same id (a short snooze on Gmail or Outlook) stays visible.

### Signatures and the footer

- **A signature belongs to one of three owners, and the most personal default wins, separately for new mail and for replies** (`composeSignatures`).
  - Personal (user × mailbox), mailbox, workspace; one `mail_signature` table holds all three, its check constraint ties each `scope` to its owner columns.
  - A personal signature without a reply default falls through to the mailbox's reply default, then the workspace's.
- **Each owner has its own editor:** personal signatures by their user, mailbox signatures by the person who connected the mailbox (`getMailbox(mailboxId, userId)`), workspace signatures and the footer by workspace owners and admins.
  - `signatureOwnerFor` and `canEditWorkspaceSignatures` (`src/mail/signatures.ts`) hold these checks for the procedures and the tools alike.
- **The agents and MCP manage signatures with `listSignatures`, `saveSignature`, `deleteSignature` and `setMailFooter`** (bodies in `src/ops/mail.ts`).
  - The three writes are sensitive in `MCP_TOOL_MANIFEST` and need approval in the assistant, because a signature or footer goes out on other people's mail.
- **The composer inserts the signature in the browser; every other send path inserts it on the server in `finishOutgoing`.**
  - The composer adds the new-mail default to a new message and the reply default to a reply or forward, swaps it when the From mailbox changes, and offers every option plus No signature in its toolbar picker.
  - A reopened draft never gets a signature added. Outlook (Graph) is reported to strip `data-` attributes from stored draft HTML, so the `data-metis-signature` marker cannot be trusted after a provider round trip.
  - The editor holds the signature as one atom node with the sanitized HTML as an attribute, because StarterKit has no image or table nodes and drops unknown attributes.
- **Agent, MCP and workflow mail gets the default new-mail signature unless the caller opts out.**
  - `sendEmail`, `createDraft` and `scheduleEmail` take `signature` (default true); the workflow steps Create a draft, Send mail, Reply and Forward have **Add signature** (default on), Reply and Forward using the reply default and the workflow's principal as the user.
  - `updateDraft` never adds one, and a body that already holds `data-metis-signature` is left alone.
- **The footer goes on every message sent through Metis from the workspace, after any quoted text, and never into a draft.**
  - App sends and scheduled sends get it in `prepareOutgoing` (a scheduled send when it is queued, so `mail.sendScheduled` does not add it again), agent and MCP sends in `send` (`src/ops/mail.ts`), workflow sends in the Send mail, Reply and Forward runners.
  - It is added after the before-send Bcc policy runs, so policies match what the sender wrote.
  - The unsubscribe `mailto:` send calls the adapter directly and gets neither signature nor footer.
- **Signature and footer HTML is sanitized on save and again when rendered** (`sanitizeSignatureHtml`): no script, style, form or media tags, no `id`, `class` or `data-` attributes, links only `http(s)`, `mailto` and `tel`, images only `https`.
- **`{{name}}` and `{{email}}` are filled per sender** with the user's account name and the sending address, in signatures and in the footer (`withFooter`).
  - The settings previews fill them too: a mailbox's lists with the signed-in user's name and that mailbox's address, the workspace signatures and the footer with the mailbox picked in **Preview as**.
- **Changing the footer writes `workspace.mail_footer_changed`** in `setMailFooter` ([audit.md](audit.md)).

### Other rules

- **Unsubscribe results are mailbox-scoped**: the sender dropped the address, not the person.
- **The RFC 8058 one-click POST is SSRF-guarded**: https only, no IP literal, no localhost, sent through `safeRequest` (`src/lib/ssrf.ts`).
- **`undo-send-toast.tsx` is presentational and imports no store.** `startSend` schedules `fire()` and calls `showUndoSendToast` itself, so the send does not depend on a mounted component and the two stay out of an import cycle.
- **Codes, OTPs and links in mail are stored and cached like any other content.** An "Expires in X min" label is display only; a derived copy adds no protection to a mailbox that has leaked.
- **IMAP needs a long-lived process** (Docker / `next start`): the pool lives in module memory, so on a serverless host every invocation reconnects.
- **The list row shows `snippet` as the adapter returns it, so every adapter returns plain text.**
  - IMAP builds it with the gateways' `snippetOf` ([gateways.md](gateways.md)).
  - Gmail's API returns `snippet` HTML-escaped, so `gmail.ts` decodes it with `decodeHTML`; Graph's `bodyPreview` and Zoho's decoded `summary` are already plain text.
- **Adding a provider**: implement `MailAdapter` (including `searchAst` with a `Dialect` for what its search can express, [search.md](search.md)), add it to `MAIL_ADAPTERS` in `src/mail/adapter.ts`, add a connections driver ([connections.md](connections.md) or [servers.md](servers.md)) and extend `CONNECTION_PROVIDERS`.

## How it works

- **Session.** `getMailSession(headers, workspaceSlug, mailboxSlug)` joins app user → workspace by slug → `mailbox_workspace × mailbox × connection` → fresh auth. A `MailSession` carries `mailboxSlug`, `isAggregate`, a ready-built `adapter` and `mailboxes: ResolvedMailbox[]`.
- **`all`.** A reserved slug served through the ordinary `/w/[slug]/m/[mailbox]/…` tree, so every folder, action and shortcut works unchanged.
  - `listMessages` / `search` fan out to every mailbox, merge-sort by date and pack the per-mailbox page tokens into one base64url cursor; a failing mailbox lands in `mailboxErrors` and the rest still render.
  - Every per-message method resolves the composite id `<mailboxId>:<providerId>` and delegates to that mailbox's adapter.
- **Drafts live at the provider** (`createDraft` / `updateDraft` / `deleteDraft`). Zoho has no in-place patch, so its update creates the new draft and deletes the old one.
- **Undo send** is a hold of `UNDO_SEND_HOLD_MS` in `undo-send-store`; send later and snooze are built-in workflows ([workflow-graph.md](workflow-graph.md)).
- **A Zoho message id carries its folder**: base64url of `[folderId, messageId]` (`encodeMessageId` in `zoho.ts`), because Zoho's per-message calls (content, attachment info, attachment content) all need the folder in the path.
  - Ids are built from the `folderId` Zoho reports on each listed message, so a message in a user-made folder resolves exactly; bulk `updatemessage` calls send only the decoded `messageId`.
- **A Zoho mailbox reads and sends through the Zoho mail account whose address is the connection's email** (`src/connections/zoho-accounts.ts` → `pickZohoAccount`), because `/api/accounts` can list several accounts per login, such as an external `IMAP_ACCOUNT` beside the `ZOHO_ACCOUNT`, in no documented order.
  - With no address match it takes the first `ZOHO_ACCOUNT`, then the first account; connecting (`getProfile` in `src/connections/drivers/zoho.ts`) uses the same pick when the login has no profile email.
  - `zohoMail` binds a `ZohoSession` (`accessToken`, `email`); the account, its folder ids and its From address are cached per token for `ACCOUNT_CACHE_TTL_SEC`.
- **Zoho region.** Every Zoho mail call goes through `detectRegion(session)`, which probes each DC's `/api/accounts` and pins the first 200 per token, in memory and in the cache driver.
- **IMAP pool.** One `ImapFlow` per credential fingerprint in a module-level map, idle-evicted; `getMailboxLock` serializes access, so one account never exceeds one connection (Dovecot caps 10 per IP).
  - Every mailbox access goes through `ctx.lock(path)` (`lockMailbox`), which sends a `NOOP` when the pooled connection already has that mailbox selected.
  - A server reports another session's changes only around a command, and a `SEARCH` sees only messages the session was told about, so without the `NOOP` the first list after new mail arrives misses that mail.
  - The folder map is discovered once per connection; a lookup that finds no folder clears it, so a folder created later is found on the next call.
  - When a server entry changes, `retireImapServers` drops that entry's pooled connections: idle ones log out at once, busy ones close after their last lease.
- **IMAP threading is synthesized.** `threadId` is the first Message-ID in `References`, else the message's own, computed from the envelope fetch with no extra round trip.
- **IMAP sending.** SMTP does not file sent mail, so every send APPENDs to `\Sent` itself; a failed APPEND logs and still reports success, because the send succeeded.

## Deliberate limits

- **The footer reaches only mail sent through Metis.** Mail sent from the provider's own app, including a Metis-created draft sent there, goes out without it.
- **Signature images are hosted `https` links.** Embedded (`cid:`) images would need inline attachments in `DraftPayload` and every adapter.
- **A reopened Outlook draft's signature is ordinary text** when Graph stripped the marker, so the composer picker appends the chosen signature instead of replacing it.

- **IMAP is known-degraded.**
  - Search is `SEARCH TEXT` over `SEARCH_FOLDERS` (Inbox, Archive, Sent): substring, no ranking.
  - `starred` is a `\Flagged` search.
  - Folders map through SPECIAL-USE with name fallbacks.
