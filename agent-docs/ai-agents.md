# AI agents (Mastra)

The Mastra agents, `src/ops/` where every tool body lives, the tool roster shared with MCP and its read/write partition, the workspace scope, the background contexts workflow agents run in, inline references and the approval flow.
Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [mcp.md](mcp.md), [mail-ai.md](mail-ai.md), [configuration.md](configuration.md), [e2e.md](e2e.md).

## Code map

| Concern                                   | Where                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent registry + storage                  | `src/mastra/index.ts` → `mastra` · `src/mastra/storage.ts` → `storage` (`@mastra/libsql` on `MASTRA_DATABASE_URL`)                                                                                                                                                                                       |
| The agents                                | `src/mastra/agents/`                                                                                                                                                                                                                                                                                     |
| Chat routes                               | `src/app/api/ai/*/route.ts` (parse, session, rate limit) → `src/mastra/chat-streams.ts` → `stream*Chat` (`handleChatStream`, usage) · new assistant threads `src/mastra/memory.ts` → `createAssistantThread`                                                                                             |
| Every tool body                           | `src/ops/`, one file per domain; `account.ts` and `instance.ts` hold the MCP-only bodies; `ops/values.ts` holds the typed mail, calendar, drive and contact values workflow steps share; `ops/output.ts` → `Output`, `orFailure`                                                                         |
| Tool roster and shared args               | `src/mastra/toolkit/keys.ts` → `TOOL_KEYS`, `MCP_ONLY_TOOL_KEYS`, `READ_TOOL_KEYS`, `WRITE_TOOL_KEYS`, `isReadTool` · `src/mastra/toolkit/schema.ts` → `folderEnum` · `src/mastra/toolkit/resolve.ts` → `withToolErrors`, `ToolRefusal`                                                                  |
| Agent tool surfaces                       | `src/mastra/tools/`: one roster per page agent (`mailboxTools()` per request) · `workspace-tools.ts` → `workspaceResidentTools`, `workspaceSearchableTools`, `RESIDENT_TOOL_KEYS`, built from the `workspace-*-tools.ts` files                                                                           |
| MCP tool surface                          | `src/mastra/mcp/tools/` · `src/mastra/mcp/server.ts` · manifest `src/mcp/tools.ts` ([mcp.md](mcp.md))                                                                                                                                                                                                    |
| Per-request scope                         | `src/ops/scope.ts` → `WorkspaceCtx`, `AgentMailbox`, `mailScopeFor` · `src/mastra/runtime-context.ts` → `resolveWorkspaceScope`, `principalRequestContext`                                                                                                                                               |
| Workflow agents                           | `src/mastra/agents/workflow-agents.ts` → `WORKFLOW_AGENTS`, `workflowWriterAgent` · the steps that call them `src/workflow/run/ai.ts` ([workflow-graph.md](workflow-graph.md))                                                                                                                           |
| Per-turn context injected into the prompt | `src/ai/turn.ts` → `TurnEnvelope`, `turnEnvelopeSchema` · `src/mastra/turn-envelope.ts` → `applyTurnEnvelopes` · `src/mastra/chat-context.ts` → `mailboxLabelDirectory`                                                                                                                                  |
| Tool search for the workspace agent       | `src/mastra/tool-search.ts` → `workspaceToolSearch`, `sortedTools`                                                                                                                                                                                                                                       |
| Chat step budget                          | `src/mastra/step-budget.ts` → `chatStopWhen`, `finalAnswerStep`, `searchBudget` and the limits                                                                                                                                                                                                           |
| Assistant threads                         | `src/mastra/memory.ts` → `workspaceMemory` · procedures `src/server/routes/assistant.ts` · UI `src/app/w/[slug]/assistant/`                                                                                                                                                                              |
| Inline references                         | `src/ai/references.ts` → `REFERENCE_TYPES` · `src/ai/reference-directory.ts` → `suggestReferences`, `resolveReferences` · `src/mastra/reference-legend.ts` → `referenceLegend` · composer node `src/components/agent/references/reference-node.tsx` · procedures `src/server/routes/agent-references.ts` |
| Approval UI                               | `src/components/agent/agent-tool-call.tsx` · `sendAutomaticallyWhen` in each chat panel                                                                                                                                                                                                                  |
| Usage accounting                          | `src/ai/usage.ts` → `recordAiUsage` · `src/ai/usage-features.ts` → `AI_USAGE_FEATURES`                                                                                                                                                                                                                   |
| Stream errors                             | `src/mastra/stream-error.ts` → `mapStreamError`                                                                                                                                                                                                                                                          |

## Rules

### One switch

- **AI is one concept behind one switch.** Decision models count as AI exactly as the LLM does.
  - The workspace and per-resource AI switches gate every AI call, LLM and decision alike, through one check (`workspaceAllowsAi` plus the resource's `aiEnabled`, [workspaces.md](workspaces.md)).
  - Mailboxes, calendars, drives and address books use the same check.
- **Everything that depends on a database-backed setting is resolved per request** ([configuration.md](configuration.md)).
  - Every agent's `model` is a function (`() => getLlm().chat`, Mastra's `DynamicArgument`), and so are the mailbox agent's `tools` and both chat agents' phishing line in `instructions`.
  - The workspace agent picks one of four prebuilt `ToolSearchProcessor`s per request (`workspaceToolSearch()`): with and without `analyzePhishing`, each with and without the decision steps; filtering one would change the search index and with it the recorded prompts.
  - The decision-steps variants differ in `previewDecision` and in the graph hint (`graphHint` in `src/mastra/toolkit/schema.ts`) inside `listWorkflows`, `createWorkflow` and `updateWorkflow`, so those three tools are built once per variant (`workspaceWorkflowGraphTools`, and `workflowGraphTools` for MCP).

### The operations

- **Every operation lives once in `src/ops/`; `src/mastra/tools/` and `src/mastra/mcp/tools/` are only surfaces**, and workflow steps call the same functions.
  - An operation takes already-resolved primitives (an `AgentMailbox`, a `ResolvedCalendar`) plus args and returns JSON.
- **Every operation's return type is its Zod output schema** (`<op>Output` beside it, typed through `Output<typeof schema>`, `orFailure` for an `{ error }` answer), so a body that drifts from its schema fails the build; shared shapes reuse `src/server/schema.ts`.
  - The schemas are compile-time contracts: no tool passes them as `outputSchema`, so nothing validates or advertises them at run time.
  - The owner's System views are the exception: `instance.ts` parses them through the dashboard schemas after `withoutSecretHints`.
  - A `createTool` definition is id + description + optional `requireApproval` + a one-line call into it.
  - `ops/workflow.ts` takes the whole `WorkspaceCtx`, because a graph may reference several resources; its tools take no `mailboxId`, except `previewDecision`, which runs an Ask step on one mailbox's inbox.
  - A body that needs a route's mail scope builds it with `mailScopeFor(ctx, mailbox)`; `AgentMailbox` carries `mailboxes` and `isAggregate` for that ([mail.md](mail.md)).
- **Every shared tool runs the same domain function as its route, and a route's rate limit lives in that function** (`enforceRateLimit`), so a route never holds logic its tool needs.
  - The per-user bucket in `mailSession`, `calendarSession` and `driveSession` is a guard, not a route's limit, and stays in the middleware ([orpc.md](orpc.md)); tools are paced by the chat and MCP limits instead.
- **A chat route only parses, authorizes and rate-limits; everything that shapes the model request lives in `chat-streams.ts`**, so the e2e recorder sends byte-for-byte the request the UI sends ([e2e.md](e2e.md)). The same holds for `classifyMessages` and `generateSmartReplies` behind their procedures.
- **Per-request scope rides in Mastra `RequestContext`, which only the tool surfaces read.** Operations get resolved primitives.
- **Tools read request headers from `ctx.actor.headers`**, because they run during stream consumption, after the request handler returned and `next/headers` is gone.
- **Both surfaces take identical arguments**, because the shared Zod fragments live in `toolkit/schema.ts`. The one exception is MCP's `workspaceId` ([mcp.md](mcp.md)).
- **One folder vocabulary:** `folderEnum` is `MAIL_FOLDERS`, used by every agent, MCP, and the `<@folder:key>` picker.
- **Resolver errors name every valid id**, and append the `<@…>` inline-reference hint only when `ctx.actor.kind === "session"` (an MCP client has no composer). A resolver that has to throw throws `ToolRefusal`, which `withToolErrors` returns verbatim.
- **Role checks live in the shared function, which takes the caller's role** (`ctx.workspaceRole` on the tool path); the rule is in [workspaces.md](workspaces.md).
- **Personal rows are keyed by the calling user (`ctx.userId`)**: mutes, read-later, drive pins.

### The roster

- **Tool parity is compile-checked: adding an operation breaks the build until the workspace agent, the MCP server and the MCP settings matrix all expose it.**
  - `src/mastra/tools/workspace-tools.ts` carries `satisfies Record<ToolKey, unknown>`.
  - `src/mastra/mcp/server.ts` carries `satisfies Record<ToolKey | McpOnlyToolKey, unknown>`.
  - `MCP_TOOL_MANIFEST` in `src/mcp/tools.ts` carries `satisfies readonly { key: ToolKey | McpOnlyToolKey; … }[]` plus `MANIFEST_COVERS_EVERY_TOOL`, a conditional type that refuses `true` the moment a key has no manifest entry.
- **`MCP_ONLY_TOOL_KEYS` stay out of the workspace agent**, so it can neither see nor search them: workspace navigation, account tools and owner tools.
- **The map key is the model-facing tool name** (not `createTool({ id })`), so one roster forces one vocabulary.
- **Every tool key is a read or a write, never both, and the build checks it.** `READ_TOOL_KEYS` and `WRITE_TOOL_KEYS` partition `ToolKey`; `TOOL_PARTITION_IS_COMPLETE` refuses `true` while a key is missing or on both sides. A new tool is a write until it is listed as a read.
- **Never rename a tool key.** `searchContacts` kept its key when it moved from mail history to saved contacts (`src/ops/contacts.ts`): it takes no `mailboxId` and searches the visible books of AI-enabled address books. MCP names are on the wire to external clients and are the JSON keys inside `mcp_client.capabilities.tools`, so a rename strands stored prefs.
- **The AI's own guards are human-only, and no tool lists hidden resources.** AI switches, calendar visibility, drive roots, sharing, detaching, joining a workspace, MCP client settings, member roles, workspace invites and anything behind TOTP have no tool.

### Agents and scope

- **The workspace agent is scoped across every connected mailbox, calendar, drive and address book in the workspace, and carries the whole tool roster**; its gate, shell and prompt say so too.
  - `analyzePhishing` drops out when `phishingDetectionEnabled()` is false and `previewDecision` when `decisionEnabled("workflowNode")` is false, on the workspace agent and on MCP alike.
- **The workspace agent's tool list stays byte-identical for identical turns.** `ToolSearchProcessor` appends loaded tools in an order that varies between runs, so `sortedTools` runs after it and sorts by name; prompt caching and the e2e replay depend on it.
- **Assistant threads are personal.** `resourceId` is the user id and `metadata.workspaceId` the workspace; `ownsThread` checks both in every `assistant.*` procedure and in the chat route before it streams.
- **Deleting an account or a workspace deletes its threads (`deleteAssistantThreads`)**, because the Mastra database has no cascade.
- **The data export reads every thread of the user through `exportAssistantThreads`** ([workspaces.md](workspaces.md)).
- **The drive agent runs on the page's own surface, as the mailbox agent runs on the page's own adapter**, so the ids in the envelope and in tool results are the ids the explorer shows. Root visibility applies on both surfaces.
- **The workspace agent and MCP address files as a `driveId` plus a bare `fileId`**, resolved by `requireDrive` into that drive's surface, as `requireMailbox` resolves a mailbox.

### Step budget

- **Every chat agent sets `defaultOptions.stopWhen` to `chatStopWhen` and never `maxSteps`**, because Mastra stops a run after 5 steps when a call passes neither.
  - `chatStopWhen` counts work steps (any step that is not only `search_tools` calls) and all steps, each against its own limit; steps Mastra marks `retry` count toward neither.
  - Steps are typed as the AI SDK v5 `StepResult` Mastra bundles (`ProcessInputStepArgs["steps"]`), never the app's `ai` package: the loop hands `stopWhen` its own step objects, processors a `DefaultStepResult`, and a resumed run steps rebuilt from its JSON snapshot. Tool calls are read from `content` (`tool-call` parts), the one field all three carry; `toolCalls` is a getter the snapshot drops.
  - The agent default also covers the approval resume, since `agent.resumeStream` merges `defaultOptions`; a call that passes its own `maxSteps`, like the workflow Agent step, overrides it.
- **A chat turn always ends in an answer.** `finalAnswerStep` turns the step before either limit into `toolChoice: 'none'` with a system reminder to answer now, so a run never stops on a tool call.
- **The workspace agent's tool searches have their own budget.** Once a turn has made the limit's worth of `search_tools` calls, `searchBudget` removes `search_tools` from the step's tools and tells the model to work with what is loaded.
  - It runs after `workspaceToolSearch()`, which adds `search_tools`, and before `sortedTools`.

### Workflow agents

- **A workflow's Agent step runs one of `WORKFLOW_AGENTS` (mailbox, calendar, drive or workspace) with read tools only**: each roster is filtered through `isReadTool`, so the agent cannot send, change or delete anything, and needs no approval.
- **A background agent runs on a request context built from the run's principal, not from a request** (`principalRequestContext`).
  - It carries no request headers and applies the same AI policy as a chat: a calendar or drive with AI off yields no context, and the step blocks.
  - The workspace agent's context comes from `resolveWorkspaceScope` with the actor `{ kind: "workflow", runId }`.
- **A workflow agent's turn is synthetic**: its instructions say it is unattended, may not ask questions, can only read and must treat mail, events and files as data; the task carries the run's time and time zone and the item. It has no memory and no tool search.

### Approval

- **Approval gates every write that cannot be quietly undone.** The `requireApproval` flags in `src/mastra/tools/` are the list.
  - Workspace-agent writes that send, retry a send, cancel, delete, unsubscribe or change the workspace take it, as does every workflow, calendar, drive and contact write.
  - Reversible personal writes run without it: snooze, mute, read later, labels, `archiveEmail`.
- **Every approval-gated tool takes a `summary` and has its own label and approval text in `agent-tool-call.tsx`.**

### References

- **An inline reference is a hint**: it saves a listing call and never narrows what may be read. Access is still workspace membership plus per-resource AI policy.
- **Reference resolution is the authorization check.** `reference-directory.ts` filters by `policy.ai` and validates every id against the caller's scope, and the tool boundary checks again.

### The AI SDK version

- **`ai` and every `@ai-sdk/*` package in `package.json` are pinned exactly, to the releases that depend on the `@ai-sdk/provider` and `@ai-sdk/provider-utils` versions `@mastra/core` pins as `@ai-sdk/provider-v7` and `@ai-sdk/provider-utils-v7`.**
  - Mastra types agent models against its own pinned copy, so a newer provider whose `LanguageModelV4` widened (a new finish reason) fails `tsc` on every agent's `model` and on `workspaceMemory`.
  - A caret range lets the lockfile keep a newer release than the floor, so the pins carry no `^`.
  - Bump the set when a Mastra release moves its pin: read `dependencies` of the new `@mastra/core`, then pick each package's newest release on that provider version.

## How it works

- **The chat agents.**
  - `mailboxAgent`: stateless chat at `/api/ai/chat`, scoped to the active mailbox. Each turn carries a `MailTurnEnvelope` (the open folder and the emails in view) and the label directory (`mailboxLabelDirectory`). It keeps its own narrow roster and `MailboxCtx`, which is structurally an `AgentMailbox`, so toolkit bodies take it directly.
  - `calendarAgent`: stateless chat at `/api/ai/calendar-chat`. `CalendarCtx` carries only the calendar session's accounts; writes go through `assertWritable`, so a hidden calendar is unreachable.
  - `contactsAgent`: stateless chat at `/api/ai/contacts-chat`. `ContactsCtx` carries only the address-book session's accounts with AI on; reads and writes go through `src/contacts/aggregate.ts`, so a hidden book is unreachable. Each turn carries a `ContactsTurnEnvelope` with the attached contacts.
  - `driveAgent`: stateless chat at `/api/ai/drive-chat`. `DriveCtx` carries only the drive session's drives and its roster (`drive-tools.ts`) uses the workspace agent's toolkit bodies; `DriveCtx.surface` is the page's surface ([drive.md](drive.md)).
  - `workspaceAgent`: persistent chat at `/api/ai/workspace-chat` with `@mastra/memory`, rendered at `/w/[slug]/assistant`.
- **The other agents** return JSON in a requested schema: `drafterAgent` (reply drafts in `src/server/routes/ai.ts`, smart replies in `src/mail/smart-replies.ts`), `summarizerAgent` and `classifierAgent` ([mail-ai.md](mail-ai.md)).
  - `workflowWriterAgent` serves the workflow AI steps and fills their declared fields through `structuredOutput`.
- **Models.** Each agent runs on one `getLlm()` slot from `src/services/llm`, rebuilt on the first call after the LLM section changes: the four chat agents and the workflow agents on `chat`, `drafterAgent` on `smartReply`, `summarizerAgent` on `summary`, `classifierAgent` on `classifier` ([configuration.md](configuration.md)).
- **Streaming.** Chat routes stream via `handleChatStream` → `createUIMessageStreamResponse` into the AI SDK's `useChat`; the UI is AI Elements (`src/components/ai-elements/*`) on Base UI shadcn ([ui.md](ui.md)).
  - Each chat route validates the posted messages with `parseUIMessages` (`src/ai/messages.ts`, the AI SDK's `safeValidateUIMessages`) and answers 400 when they do not validate; stored threads read back through it too.
- **Resident vs searchable tools.** Only `RESIDENT_TOOL_KEYS` are always loaded; the rest load through `workspaceToolSearch` (Mastra's `ToolSearchProcessor`). The workspace agent's instructions name only the resident tools and the capability areas.
- **Cross-drive search.** `searchFiles` without a `driveId` searches every drive (`searchAcross`), like `searchMail`.
- **The workspace scope is one builder for two callers.** `resolveWorkspaceScope(session, actor)` checks `workspaceAllowsAi`, loads mailboxes, calendars, drives and address books (all `aiEnabled`-filtered) and a lazy members loader, and returns the `WorkspaceCtx` both the assistant and MCP run on.
  - `actor` is `{kind:"session", headers}`, `{kind:"mcp", clientId}` or `{kind:"workflow", runId}`: the only difference, and the only reason an operation may know which surface called it.
- **Inline references.** The assistant's composer is a TipTap editor whose atom nodes `renderText` to `<@type:id>`, so `editor.getText()` is the wire format.
  - Multi-part ids are packed `a|b|c`; `<@file:driveId|fileId>` resolves through that one drive's surface, so root visibility applies, and `<@addressbook:addressBookId|bookId>` and `<@contact:addressBookId|bookId|contactId>` resolve only in a visible book.
  - `referenceLegend` turns the tokens into a system block naming exact tool arguments; an unresolvable id is listed UNRESOLVED and degrades to literal text in the transcript.
  - Chips also open things in the UI: a `<@member:id>` chip opens a view-only member panel beside the assistant chat (`MemberPreview`), a `<@contact:…>` chip opens the contact in the Contacts section, an `<@addressbook:…>` chip opens nothing, and the search dialog's "Ask the assistant" prefills a new chat with a chip ([search.md](search.md)).
- **Approval flow.** A gated tool emits `approval-requested` with `approval.id = "${runId}::${toolCallId}"`. The client's `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` resubmits once every approval is answered, and `handleChatStream` resumes the run through `agent.resumeStream`.

## Deliberate limits

- **No `uploadFile` or `shareFile` tool**: an upload tool would push bytes through the server, and a public-link primitive is a one-call exfiltration of a whole drive.
- **No tool for credentials or sessions, for resolving an unconfirmed send ([workflow-runs.md](workflow-runs.md)), for smart replies (the model writes its own replies), or for the workspace logo (an image upload).**
- **The mailbox, calendar, drive and contacts agents are stateless**: the client sends the conversation each turn.
