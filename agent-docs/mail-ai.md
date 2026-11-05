# AI over mail — phishing detection, labels and thread summaries

The three AI features that run over message content: phishing analysis (the external phishing backend), label classification (LLM or decision model) and thread-summary cards (json-render).
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [ai-agents.md](ai-agents.md), [mail.md](mail.md), [workspaces.md](workspaces.md), [configuration.md](configuration.md).

## Code map

| Concern                                  | Where                                                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phishing backend                         | a separate proprietary service, not part of this repository                                                                                                                                                             |
| Phishing request                         | `src/services/phishing-detection/backend.ts` → `analyzeEmail` · registry `src/services/phishing-detection/registry.ts` → `getPhishingDetection` · drivers `src/services/phishing-detection/drivers/{metis,disabled}.ts` |
| Phishing backend token                   | `src/auth/backend-token.ts` → `mintBackendToken`                                                                                                                                                                        |
| Phishing entry points                    | tool body `src/ops/phishing.ts` → `analyzePhishing` · procedure `ai.analyzePhishing` in `src/server/routes/ai.ts`                                                                                                       |
| Labels: entry and path choice            | `src/mail/classify.ts` → `classifyMessages` (picks the decision or LLM path) · procedure `mail.labels.classify` in `src/server/routes/mail/labels.ts` (adds the rate limit)                                             |
| Labels: decision path and storage        | `src/mail/labels.ts` → `classifyByDecision`, `setUserLabel`, `DECISION_LABEL_MIN` · `src/mail/classify-unsure.ts` → `unsureMessages`, `markUnsure`, `forgetUnsure`, `UNSURE_TTL_SEC` · table `mailLabel`                |
| Labels: LLM path                         | prompt `src/mail/classify-prompt.ts` → `classifyPrompt` · agent `src/mastra/agents/classifier.ts` → `classifierAgent`                                                                                                   |
| Label vocabulary                         | `src/mail/label-meta.ts` → `LABEL_DESCRIPTIONS`                                                                                                                                                                         |
| Decision options                         | `src/services/decision/decide.ts` → `neutralCriteria`                                                                                                                                                                   |
| Summary build, refine, gate, link filter | `src/mail/thread-summary.ts` → `buildThreadSummary`, `gateSummary`                                                                                                                                                      |
| Card schema and spec                     | `src/mail/summary-catalog.ts` → `summaryCardSchema`, `buildSummarySpec`, `summarySpecSchema`                                                                                                                            |
| Card wording                             | `src/mail/summary-prompt.ts` → `CARD_DEFINITIONS`                                                                                                                                                                       |
| Input bounding (the caps)                | `src/mail/summary-conversation.ts` → `loadConversation` · `src/mail/structured-data.ts` → `prepareHtml` · `src/mail/attachment-data.ts` → `parseAttachment`, `ATTACHMENT_PARSERS`                                       |
| Summary cache                            | `src/mail/cache.ts` → `getThreadSummary` · table `mailThreadSummary`                                                                                                                                                    |
| Rendering and card actions               | `src/app/w/[slug]/m/[mailbox]/[folder]/_components/thread-summary/` → `ThreadSummaryCards`, `SummaryActionsProvider`, `add-to-calendar.tsx`                                                                             |

## Rules

### Phishing

- **Phishing analysis is a per-workspace mailbox switch, separate from AI.** `ai.analyzePhishing` refuses a mailbox whose resolved policy has `phishingDetection` off ([workspaces.md](workspaces.md)).
- **The phishing driver and its on/off are database-backed.** `getPhishingDetection()` rebuilds on the first call after the section changes; `phishingDetectionEnabled()` gates `ai.analyzePhishing`, the toolkit and both tool rosters per request ([configuration.md](configuration.md)).
- **The decision driver and its switches are database-backed too.** `getDecision()` rebuilds on the first call after the `decision` section changes, and `decisionEnabled(feature)` gates the label path and the summary gate per call ([configuration.md](configuration.md)).
- **Phishing analysis must work without a cookie.** The backend verifies a Better Auth JWT against `/api/auth/jwks`.
  - Cookie requests get it from `getAuth().api.getToken({ headers })`.
  - MCP carries only a bearer token, so `mintBackendToken(userId)` signs the same `{ sub, email }` payload through `auth.api.signJWT`.
- **Phishing analysis reads the raw MIME** (`getRaw`); the rendering pipeline never touches it ([mail-rendering.md](mail-rendering.md)).

### Labels

- **The classifier prompt uses short ref tokens (`e1`, `e2`…) in place of provider ids**, because long Microsoft and Zoho ids get mangled by the model.
- **One label per message per mailbox**, with `source` = `provider | ai | user`.
  - Classification runs once per mailbox ([workspaces.md](workspaces.md) has the scope rule).
  - A user label upserts over the AI one and is never overwritten.
- **The decision classifier writes only confident labels.**
  - The top label at p ≥ `DECISION_LABEL_MIN` is written, with p as its confidence.
  - Below that, or on a refusal, nothing is written and the message is flagged in its mailbox's `classify-unsure:` cache hash (`markUnsure`, `UNSURE_TTL_SEC` from the hash's first flag), which stops it being asked again; flagged items are filtered out before any call, read in one `hmget` per mailbox.
  - Creating or deleting a custom label drops the mailbox's unsure hash (`forgetUnsure` in `createCustomLabel` / `deleteCustomLabel`), because the new set of labels may fit a message the old one did not.
- **A failed decision call leaves only its own message unlabeled**, asked again on the next render, with no LLM fallback; the other calls still write their labels, unsure keys and usage.
- **The LLM prompt and the decision options render the label names and descriptions from one table**, `LABEL_DESCRIPTIONS`.

### Summaries

- **The model returns `{ cards }` and the server builds the json-render spec.** `buildSummarySpec` builds it and `summarySpecSchema` validates it, because json-render's `elements` map cannot be expressed in strict JSON Schema.
- **The card registry is our own, on base-nova** (`@json-render/react`), because `@json-render/shadcn` pulls in Radix.
- **Summary input is bounded so a huge or hostile email cannot reach the model whole.** The caps (HTML and text sizes, base64 and data-URI stripping, body caps, JSON-LD / microdata pruning, nested `message/rfc822` depth, per-attachment `maxBytes`) live in the input-bounding files in the code map.
- **Images reach the summarizer only while the stored LLM section has summary vision on** (seeded from `METIS_LLM_SUMMARY_VISION`, read per summary).
- **Every `url` / `*Url` a card returns, at any depth, is dropped unless it appears in the conversation's own links** (`allowedLinks`).
- **Card actions reuse existing procedures and reading-pane handlers** through `SummaryActionsProvider`.
- **"Add to calendar" carries the Meeting card's attendees**, passing the email addresses in `attendees` to `calendarEvents.create`.
- **Summary output is capped (`maxOutputTokens`)**, because without a cap an OpenAI-compatible endpoint such as OpenRouter reserves the model's full maximum against the account's credit.
- **Bump `SUMMARY_FORMAT` when the card format changes**; it is the suffix of the cached `model` (`#cards-v<n>`), so old rows rebuild.
- **A summary is built only from a complete conversation.** `loadConversation` lets a failed `getHeaders` fail the build, because the prompt's `Mailing headers:` block is what the summarizer and the gate read as the automated-mail signal.

## How it works

- **Decision classifier (`decisionEnabled("classifier")`).** `classifyByDecision` asks one `choice` question per message (state `{ from, subject, snippet }`, options through `neutralCriteria`), `decisionClassifierBatch()` calls at a time.
- **Summary cache.** `mail_thread_summary` caches per `(mailboxId, threadKey)`.
  - New messages `refine()` the cards in place, with a full rebuild after `REBUILD_AFTER` refinements.
  - A failed generation is cached too (`failedAt`, previous cards kept) and retried only after `FAILURE_RETRY_MS` or when the thread changes.
- **Summary gate (`decisionEnabled("summaryGate")`).** After the cache check, `gateSummary` makes one decision call over the messages about to be sent (each capped at `GATE_TEXT_MAX` chars): `worth`, plus one `card:<type>` question per card type other than `Summary`, worded from `CARD_DEFINITIONS`.
  - Below `GATE_WORTH_MIN`, a full build caches `{ cards: [], skipped: true }` without calling the summarizer.
  - Below it on a refine, the previous cards and `incrementCount` stay and the message count advances.
  - Otherwise the summarizer gets the schema `summaryCardsSchemaFor` builds from `Summary` and the card types at or above `GATE_CARD_MIN`, or the full schema when none pass.
  - A gate error, a refusal or a missing answer runs the summarizer un-gated. With the switch off, a `skipped` row counts as stale and rebuilds.
