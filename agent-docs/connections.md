# Connections — the grant, its secrets, scopes and quarantine

How a provider account becomes one `connection` row, how its tokens and credentials are stored, how scopes are requested, what can be connected, and what happens when config removes a provider.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [workspaces.md](workspaces.md), [servers.md](servers.md), [database.md](database.md), [configuration.md](configuration.md).

## Code map

| Concern                                       | Where                                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                                        | `src/db/schema.ts` → `connection`, `mailbox`, `calendar`, `drive`                                                                                                                                                                 |
| Column encryption                             | `src/db/crypto.ts` → `encryptedText`                                                                                                                                                                                              |
| The grant store                               | `src/connections/connection-store.ts` → `upsertConnection`, `resolveConnectionAuth`, `getFreshAccessToken`                                                                                                                        |
| Resource stores                               | `src/connections/{mailbox,calendar,drive}-store.ts` → `visibilityWhere` (module-private)                                                                                                                                          |
| Providers and resources                       | `src/connections/types.ts` → `PROVIDER_RESOURCES`                                                                                                                                                                                 |
| Drivers                                       | `src/connections/registry.ts` → `getDriver` · `src/connections/oauth-drivers.ts` → `OAUTH_DRIVERS` · `src/connections/drivers/oauth.ts` → `createOAuthDriver`, `scopesFor` · `src/connections/drivers/{google,microsoft,zoho}.ts` |
| OAuth key pairs                               | `src/connections/credentials.ts` → `configuredOAuthProviders`, `providerCredentials`                                                                                                                                              |
| What can be connected                         | `src/connections/servers.ts` → `connectServers`, `isProviderConfigured` · client `src/components/connect-servers-context.tsx` → `ConnectServersProvider`                                                                          |
| Connect flow                                  | `src/app/api/connections/start/[provider]/[resource]/route.ts` · `src/app/api/connections/[provider]/callback/route.ts` · state `src/connections/oauth-state.ts` → `encodeOAuthState`                                             |
| Procedures                                    | `src/server/routes/connections.ts` → `createCredential`, `delete`, `unavailable` · resource deletes in `src/server/routes/{mailboxes,calendars,drives}.ts`                                                                        |
| Quarantine                                    | `src/connections/quarantine.ts` → `reconcileQuarantine`, `backfillServerIds` · run by `scripts/preflight.ts` and a dashboard save (`store` in `src/dashboard/system-config.ts`)                                                   |
| Quarantine disclosure                         | `src/components/unavailable-accounts-banner.tsx` → `UnavailableAccountsBanner` · `src/connections/unavailable.ts` → `listUnavailableConnections` (`connections.unavailable` and the `listUnavailableAccounts` MCP tool)           |
| A user's resources with their workspace links | `src/connections/account-resources.ts` → `listAccountMailboxes`, `listAccountCalendars`, `listAccountDrives` (the `list` procedures and the `listAccountResources` MCP tool)                                                      |

## Rules

### The grant

- **The grant is the entity; a mailbox, a calendar and a drive are resources hanging off it.**
  - `connection` holds identity, tokens and the granted `scope`, owned by one user; it is unique per (user, provider, provider account).
  - `mailbox`, `calendar` and `drive` are one resource row per connection, and are what every other table points at.
- **Keep the connection key at those three columns: providers issue one grant per (client, account), not one per scope set.** Two rows for one Google account would let deleting a calendar kill the mailbox's refresh token.
- **Tokens refresh at request time and write back to the one `connection` row**, so one grant never diverges across workspaces (Microsoft rotates refresh tokens).
- **Detach never revokes; deleting a resource revokes only when no other resource still uses the connection; `connections.delete` always revokes the whole grant.** Providers cannot give back part of a grant, so removing a mailbox from an account that still has a calendar leaves the mail scopes live; the confirm copy says so.

### Secrets at rest

- **OAuth tokens and credentials are encrypted at rest by the column type, `encryptedText`.**
  - It seals in `toDriver` and opens in `fromDriver` with AES-256-GCM over `node:crypto`; the hooks are sync-only, which rules out WebCrypto's `subtle`.
  - Values are stored as `v1:<iv>:<tag>:<ciphertext>`; the `v1` prefix is what makes key rotation possible.
- **Anything not sealed with `v1` is rejected:** `open()` logs the column and throws.
- **The threat model is DB dumps, snapshots and read replicas, not app-server compromise.** `src/db/auth-schema.ts` is generated, so encryption stays out of it: the next regen would drop the annotation.
- **`src/db/crypto.ts` reads `METIS_ENCRYPTION_KEY` from `process.env` itself.** `src/db/schema.ts` imports it, and drizzle-kit loads that file through a CJS transformer with no react-server condition, so any `import "server-only"` in the chain (as `@/config` has) breaks `db:push`, `db:export` and `db:check`.

### Connecting and scopes

- **Connecting is an account-level act: the path and the signed state carry no workspace.** The optional `?attachTo=<workspace slug>` is checked against live membership, carried inside the HMAC-signed state, re-checked in the callback, and only records "the user asked to add it here".
- **The callback path is `/api/connections/[provider]/callback` for every resource**, because it is a registered redirect URI in three provider consoles.
- **Scopes are per resource, unioned per grant.** Each driver exposes `grantedResources(scope)`; an OAuth driver builds the scope it requests from the resources (`scopesFor`, used by `buildAuthUrl` and `exchangeCode`).
  - Google sends `include_granted_scopes=true` and the callback unions the returned scope.
  - Zoho has no incremental authorization (`mergesGrantedScopes: false`), so the start route asks for the union of everything already granted; a narrower Zoho refresh token would overwrite the one mail depends on.
- **Every driver declares `resources`**, so an unsupported (provider, resource) pair fails at the start route instead of after a consent round trip.
- **`connectServers()` is the one list of what can be connected, read from the config snapshot per call.**
  - Each OAuth provider with both halves of its key pair contributes one entry (`credentials.ts` warns once per half-pair); every server-list entry contributes one.
  - `isProviderConfigured`, quarantine and the connect dialog all derive from it.
  - The layouts pass it to `ConnectServersProvider` per request.
  - An empty list is valid and raises a config warning ([configuration.md](configuration.md)); the empty-workspace cards then say nothing can be connected yet.
- **`ConnectServersProvider` is mounted in the `/w/[slug]` and `/settings` layouts only**, so an anonymous visitor's RSC payload (sign-in, `/setup`, invite pages) reveals nothing about the instance's servers.

### Quarantine

- **A grant whose provider or server entry leaves config is quarantined.** Runtime reads `connection.quarantined_at`, not config.
  - `visibilityWhere` in all three resource stores, the `listUnattached*` and `list*Workspaces` queries, and `getFreshAccessToken` (which returns null) all exclude it.
  - The resource vanishes from every workspace surface with no UI branch; account pages still list it so it can be deleted.
  - The workflow runner blocks its runs (`src/workflow/authorization.ts`), so an operator's config change cannot fail queued mail.
  - The only disclosure is `UnavailableAccountsBanner`, dismissed against a fingerprint of the quarantined ids.
- **Quarantine runs once per change, in the process that wrote it.**
  - Preflight runs `reconcileQuarantine` on every deploy; a dashboard save runs it before returning when it touches an OAuth or server-list section.
  - Other processes that pick the change up through the config poll only retire their own server pools.
  - The same pass refreshes `connection.server_name` when an entry was renamed.

## How it works

- **OAuth connect.**
  - The start route checks the session (or consumes a native ticket, [desktop.md](desktop.md)), validates `attachTo` and an optional `expectConnection`, computes the scope set, signs the state (`encodeOAuthState`, valid for `STATE_TTL_SEC`) and sets a nonce cookie.
  - The callback decodes the state, requires the matching nonce cookie, upserts the `connection` and the resource row, and attaches it to the requested workspace.
- **Adding a resource to an existing account.** `?expectConnection=<id>` carries the expected account in the state; when the user picks a different account at the provider, the callback connects it as a separate account and says so.
- **Credential connect** is `connections.createCredential` ([servers.md](servers.md)).
- **`reconcileQuarantine`** stamps `quarantined_at` on connections whose provider is unconfigured or whose server reference no longer resolves, and clears it when the entry returns.
- **Token refresh.** `resolveConnectionAuth(row)` returns `{kind: "oauth", accessToken, email}`, refreshing through `getFreshAccessToken` when near expiry, or `{kind: "credentials", credentials, email}` for credential providers.
- **Revoke.** `revokeConnection` deletes the row, then calls the driver's `revoke`: a POST to `oauth2.googleapis.com/revoke` for Google, every Zoho DC, nothing for Microsoft.

## Deliberate limits

- **Microsoft grants are revoked by the user**, at account.microsoft.com / myapps.microsoft.com, because Microsoft has no per-app revoke API.
