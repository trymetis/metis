# MCP server

The `/api/mcp` endpoint: how MCP clients get an OAuth client (by hand or CIMD), how a bearer token is checked and gated per client, which workspaces a client reaches, how tools are consented to, and how a call is scoped.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [ai-agents.md](ai-agents.md), [auth.md](auth.md), [dashboard.md](dashboard.md), [e2e.md](e2e.md).

## Code map

| Concern                                                        | Where                                                                                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint                                                       | `src/app/api/mcp/route.ts` → `POST`                                                                                                                                                    |
| Client gate, audience and issuer                               | `src/mcp/auth.ts` → `MCP_AUDIENCE`, `MCP_ISSUER`, `resolveMcpClient` · table `mcpClient` in `src/db/schema.ts`                                                                         |
| Workspace visibility                                           | `src/mcp/workspaces.ts` → `listMcpWorkspaces`, `visibleMcpWorkspaces`                                                                                                                  |
| Per-request server                                             | `src/mastra/mcp/server.ts` → `buildMcpServer` · tool definitions `src/mastra/mcp/tools/*`                                                                                              |
| Call scoping and the `workspaceId` argument                    | `src/mastra/mcp/context.ts` → `mcpScopeFromCall`, `mcpWorkspaceFromCall`, `mcpAccountFromCall`, `mcpVisibleWorkspaces` · `src/mastra/mcp/schema.ts` → `workspaceTarget`, `inWorkspace` |
| MCP-only tools                                                 | account and workspace navigation `src/mastra/mcp/tools/account.ts` (bodies `src/ops/account.ts`) · owner tools `src/mastra/mcp/tools/instance.ts` (bodies `src/ops/instance.ts`)       |
| Tool manifest and per-client prefs                             | `src/mcp/tools.ts` → `MCP_TOOL_MANIFEST`, `isMcpToolEnabled`, `isSensitiveTool`, `isOwnerOnlyTool`, `mcpToolsFor`                                                                      |
| Presets (per-client redirect URIs, instructions, removal text) | `src/mcp/presets.ts` → `MCP_PRESETS`                                                                                                                                                   |
| OAuth provider + CIMD plugin options                           | `src/auth/base.ts` → `authOptions` (`mcp({ … })`, `cimd({ … })`)                                                                                                                       |
| Discovery                                                      | `src/app/.well-known/oauth-authorization-server/[[...path]]/route.ts`, `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`                                             |
| Consent page                                                   | `src/app/(standalone)/oauth/consent/` (workspace multi-select `_components/workspace-select.tsx`)                                                                                      |
| Settings pages                                                 | the client list `src/app/settings/mcp/` · one client's page `src/app/settings/mcp/[client]/` (Tools, Workspaces, Authorizations)                                                       |
| Shared client UI                                               | `src/components/mcp-client-actions.tsx` → `McpClientEnableSwitch`, `McpClientRemoveButton` · `src/components/mcp-tool-picker.tsx` → `McpToolPicker`                                    |
| Procedures                                                     | `src/server/routes/mcp.ts` (incl. `storedStringArray`)                                                                                                                                 |
| Manually added clients and their tool switches                 | `src/mcp/clients.ts` → `createManualMcpClient`, `setMcpClientTools`, called by `mcp.createClient`, `mcp.setTools` and the e2e seed generator ([e2e.md](e2e.md))                        |
| Client slugs                                                   | `src/mcp/slug.ts` → `uniqueMcpClientSlug` (over `uniqueNameSlug` in `src/lib/slug-ladder.ts`)                                                                                          |
| Abandoned CIMD clients                                         | `src/mcp/prune-cimd-clients.ts` → `pruneAbandonedCimdClients`, `ABANDONED_AFTER_MS` · run by the `system:cimd-prune` workflow ([workflow-graph.md](workflow-graph.md))                 |

## Rules

### Clients and tokens

- **One OAuth client per MCP client; clients arrive by hand at `/settings/mcp` or through CIMD.** `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration` are both false.
- **The `mcp_client` row is the kill switch**: a client with no row, or a disabled one, has no access.
- **Every request is gated per client.** JWTs are verified offline with no client-existence check, so deleting or disabling the OAuth client leaves an issued token valid; the route resolves `mcp_client` from the JWT's `azp` claim and answers 403 when the row is missing or disabled.
- **A CIMD client never takes over a manually registered row.** The plugin stores `clientDiscoveryId = "cimd"` on clients it registered from a metadata URL, and that provenance is the guard.
- **CIMD fetches go through `@better-auth/cimd/node`**, because the contract needs resolve-once DNS, rejection of RFC 6890 special-use addresses, address pinning and no redirects; plain `fetch` does none of that.
- **Discovery must advertise both `client_id_metadata_document_supported: true` and `"none"` in `token_endpoint_auth_methods_supported`.** The CIMD plugin and the oauth-provider metadata emit them; check both after a bump. Claude and Codex check the pair and fall back to DCR, which fails here, if either is missing.
- **All clients are public**: `token_endpoint_auth_method: "none"`, PKCE-S256 forced.
- **Audiences are resources (RFC 8707):** `mcp({ resource: MCP_AUDIENCE })`, backed by `oauth_resource` + `oauth_client_resource`. HTTPS only, except loopback for local dev.
- **Redirect URIs match exactly, plus RFC 8252 §7.3 loopback port flexibility for IP literals only.** Better Auth gives `localhost` the same flexibility as `127.0.0.1`, so `mcp({ validateRedirectUri })` accepts an inexact match only when the host is `127.0.0.1` or `[::1]`.
- **A refresh token works once.** `refreshTokenReuseInterval: 0` turns off the 30-second replay window `@better-auth/mcp` defaults to, so reusing a rotated refresh token is refused and revokes the family.
- **Better Auth's array columns (`oauth_client.redirect_uris`, `scopes`, …) are JSON encoded twice.**
  - Its SQLite adapter turns the array into a string, and the generated `mode: "json"` column encodes that string again.
  - Better Auth's own reads undo both; a direct Drizzle read undoes only the outer layer, so it goes through `storedStringArray`, which decodes the remaining layer and throws on anything else.

### Consent and settings

- **First approval of a CIMD client happens at `/oauth/consent`**: a workspace multi-select, the tool picker and TOTP.
- **Approving at `/oauth/consent` is two steps, and the first one may repeat.**
  - `mcp.registerConsentClient` writes the `mcp_client` row, then Better Auth's consent call issues the grant.
  - When the second step fails and the user approves again, `registerConsentClient` updates the row it wrote for the same user; a row owned by another user is a `CONFLICT`.
- **Consent is given per tool at registration time, because MCP has no approval primitive.** The only party a tool result reaches is the model that called it.
- **Tools come in two tiers, and the tier is the default.** Non-sensitive tools are on by default; tools marked `sensitive: true` in `MCP_TOOL_MANIFEST` stay off until someone turns them on for that client (`isMcpToolEnabled`).
  - `runSystemCheck` is sensitive, because it connects to every checked service when the model calls it.
- **The consent page and the settings page render the same `McpToolPicker`**: one collapsible section per tier, a checkbox that switches the whole tier (shown or filtered out), and a search box over label, description and group.
- **Re-enabling a client takes TOTP (`mcp.setEnabled`).**
- **Each client has its own settings page at `/settings/mcp/<slug>`; the slug is unique per user.**
  - It comes from the label the way workspace slugs do (`claude-code`, then `claude-code-2`), because a CIMD client ID is a whole URL.
  - Both creation paths, `mcp.createClient` and `mcp.registerConsentClient`, set it.
- **No tool changes the AI's own guards** ([ai-agents.md](ai-agents.md)), and that includes every `mcp.*` setting.

### Workspaces

- **A client belongs to a user and reaches a workspace when all of these hold:** the user is a member, the workspace has AI on (`workspaceAllowsAi`), and the workspace is not in the client's `hidden_workspace_ids`.
  - Hidden workspaces are an exclusion list, empty by default, and a convenience: a workspace the user joins later is reachable without a new approval; removing the client is how access ends.
  - A workspace with AI off is unreachable for every client; the client keeps working in the user's other workspaces.
- **Every workspace-scoped MCP tool takes a required `workspaceId`**, because the workspace agent's workspace is fixed by its chat route and MCP's is not. `inWorkspace` and `workspaceTarget` add it.
- **Each call runs inside one workspace's rules**, exactly as the workspace agent does.
- **A refused `workspaceId` names every reachable workspace**, and a hidden workspace gets the same refusal as an AI-off one (`mcpScopeFromCall` throws `ToolRefusal`).
- **Account tools reveal only reachable workspaces and the user's own accounts.** `listAccountResources` keeps only links to reachable workspaces and leaves out accounts linked only elsewhere; `listUnavailableAccounts` returns only the user's own accounts.

### The server

- **MCP exposes every operation the workspace agent has, plus MCP-only tools**; parity and the two switch-dependent tools are in [ai-agents.md](ai-agents.md). `src/mastra/mcp/tools/*` hold only ids, descriptions and MCP gating; every body is a call into `src/ops/`.
- **Owner tools exist only for the owner.** `buildMcpServer` registers them only when the client's user is the owner (`isOwnerEmail`, read on each request), and each one checks again before running.
- **Owner tools report a secret only as set or not set.** The System pages' `{ set, hint }` carries the last characters of the real value; `withoutSecretHints` in `src/ops/instance.ts` nulls the hint, so no part of a secret reaches a model.
- **The endpoint answers 404 while the stored LLM driver is disabled (`aiEnabled()` false), checked per request.**
- **`/api/mcp` answers 403 to a request whose `Origin` is not the app's own** (`APP_ORIGIN`), before authentication, as the Streamable HTTP rules require; clients that send no `Origin` are unaffected.
- **The route returns the `Response` as soon as headers are written.**
  - On the `2026-07-28` path `startHTTP` resolves when the request finishes, and `subscriptions/listen` is a stream that stays open.
  - Awaiting `startHTTP` first sends no headers, and Claude Code then waits for the listen acknowledgement before treating the server as connected.
  - So the route races `toFetchResponse(res)` (which resolves on headers) against `startHTTP` settling.
- **The protected resource metadata names the real issuer.** `authorization_servers` is `MCP_ISSUER` (`<BETTER_AUTH_URL>/api/auth`), the `issuer` the authorization server metadata reports, because spec-following clients stop on a mismatch (RFC 8414 §3.3). The authorization server route is a catch-all, so the path-inserted discovery URL resolves.

## How it works

- **A request.**
  - `requireMcpAuth` verifies signature, issuer, audience and expiry against the JWKS and answers 401 with the RFC 9728 `WWW-Authenticate` challenge.
  - The route resolves the `mcp_client` row joined to its user (`resolveMcpClient`) and rate-limits per client (`rateLimit` in `route.ts`).
  - It builds a fresh `MCPServer` with `buildMcpServer(capabilities.tools, { isOwner })` and bridges the Fetch request to Node with `fetch-to-node` in serverless mode.
- **Both protocol eras from one endpoint.** `protocolVersion: "2026-07-28"` in `buildMcpServer` makes `@mastra/mcp` serve modern clients (a per-request envelope) natively and legacy clients (an `initialize` handshake) through the SDK's stateless fallback; the CIMD side uses `metadataProfile: "mcp-2026-07-28"` in `src/auth/base.ts`.
- **Transport is stateless Streamable HTTP**, because a per-request server in serverless mode holds no cross-request state or long-lived connection.
- **Scoping a call.**
  - The route sets `req.auth` (`McpAuthInfo`, whose `extra` carries the user, owner flag and hidden list) on the bridged request; `@mastra/mcp` relays it as `authInfo`.
  - `mcpScopeFromCall(requestContext, workspaceId)` checks the id against `mcpVisibleWorkspaces`, then the shared `resolveWorkspaceScope` resolves resources and fresh tokens, cookie-free.
  - The visible list and each workspace's scope are memoized per request (`WeakMap<RequestContext, …>`), so several calls in one HTTP request resolve each workspace once.
- **Account and owner tools.** `listWorkspaces` and `getWorkspace` are how a model finds its `workspaceId`s.
  - Account tools run on `mcpAccountFromCall`.
  - Owner tools are one-line calls into `src/dashboard/stats.ts`, `system.ts`, `system-checks.ts` and `preflight.ts`; `getPreflightWarnings` reads the last deploy's warnings ([dashboard.md](dashboard.md)).
- **Managing clients.** Every `mcp.*` procedure runs under `appSession` and finds a client by `(clientId, userId)`.
  - `mcp.getClient` takes the slug and answers `null` (the page's 404) for a slug the user does not own.
  - `mcp.access` supplies the workspaces and the owner flag the settings and consent pages render.
- **Abandoned CIMD clients.** A CIMD client with no `mcp_client` row, no consent and no tokens is deleted after `ABANDONED_AFTER_MS`, so an unfinished consent leaves nothing behind.
- **End-to-end coverage** is in [e2e.md](e2e.md): the consent flow in Playwright, every tool in the Vitest suite on seeded clients.

## Deliberate limits

- **With every tool switched on, the roster can exceed some MCP hosts' per-server tool caps**; the default-enabled set is sized to stay under them.
