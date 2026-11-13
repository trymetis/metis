# Auth — accounts, sign-in, 2FA and the Better Auth schema

How accounts are created, how the instance owner is fixed, how invites work, how sign-in and the second factor are enforced, and how Better Auth's own tables are regenerated.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [desktop.md](desktop.md), [connections.md](connections.md), [configuration.md](configuration.md), [dashboard.md](dashboard.md) (instance roles), [workspaces.md](workspaces.md) (workspace membership), [database.md](database.md).

## Code map

| Concern                                       | Where                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth options and plugin list           | `src/auth/base.ts` → `authOptions`                                                                                                                                                                                                                                                              |
| The live instance, hooks, step-up             | `src/auth/server.ts` → `getAuth`, `Auth`, `verify2FA`                                                                                                                                                                                                                                           |
| Account creation                              | `src/auth/signup.ts` → `ownerSignup`, `createAccount`, `ownerHasAccount`, `hasAnyUser` · procedures in `src/server/routes/signup.ts` · page `src/app/(auth)/setup/`                                                                                                                             |
| Invites                                       | `src/invites/index.ts` → `createInvite`, `previewInvite`, `acceptInvite`, `declineInvite`, `signUpFromInvite`, `revokeWorkspaceInvite`, `revokeAccountInvite` · `invites.*` and `signup.invitePreview`, `signup.invite` · page `src/app/(auth)/invite/accept/`                                  |
| Setup code                                    | `src/auth/setup-code.ts` → `verifySetupCode`                                                                                                                                                                                                                                                    |
| Invite tokens                                 | `src/auth/invite-token.ts` → `newInviteToken` · `src/db/schema.ts` → `invite`                                                                                                                                                                                                                   |
| 2FA gates                                     | `src/proxy.ts` → `proxy`, `protectedPath`, `config.matcher` · `src/server/middlewares/app-session.ts` → `appSession`                                                                                                                                                                            |
| 2FA step-up in procedures                     | `src/server/require-totp.ts` → `requireTotp`                                                                                                                                                                                                                                                    |
| Code classification                           | `src/auth/two-factor-code.ts` → `twoFactorCodeKind` · client hook `src/hooks/use-two-factor-code.ts` → `useTwoFactorCode`                                                                                                                                                                       |
| Return-to after 2FA                           | `src/auth/two-factor-callback.ts` → `rememberTwoFactorCallback`, `consumeTwoFactorCallback`, `TWO_FACTOR_CALLBACK_COOKIE`                                                                                                                                                                       |
| Native sign-in endpoints (Better Auth plugin) | `src/auth/native.ts` ([desktop.md](desktop.md))                                                                                                                                                                                                                                                 |
| Bans                                          | `src/auth/ban.ts` → `isBanned`, `activeBan`, `userBanned`, `BANNED_MESSAGE` · columns `user.banned`, `ban_reason`, `ban_expires` (Better Auth `additionalFields` in `src/auth/base.ts`) · set in `src/dashboard/users.ts` → `banUser`, `unbanUser` ([dashboard.md](dashboard.md))               |
| Session lookup for the app                    | `src/auth/session.ts` → `getAppUser`                                                                                                                                                                                                                                                            |
| Legal consent                                 | `src/auth/legal-consent.ts` → `legalConfig`, `enforceLegalConsent`                                                                                                                                                                                                                              |
| Rate limiting                                 | `src/services/rate-limit.ts` → `rateLimit` · client IP `src/services/client-ip.ts` → `clientIp`, `forwardedClient` · Better Auth rules in `authOptions` → `rateLimit.customRules`                                                                                                               |
| Sign-in alerts                                | plugin `src/auth/sign-in-notifier.ts` → `signInNotifier` · sender `src/auth/sign-in-alert.ts` → `sendSignInAlert` · email `src/services/mailer/send.ts` → `sendSignInAlertEmail` · switch `src/app/settings/security/_components/sign-in-alerts-section.tsx` · pref `user_prefs.sign_in_alerts` |
| Schema regeneration                           | `scripts/auth-generate.ts` · `src/auth/generate.ts` → `auth` (`{ options }`) · output `src/db/auth-schema.ts`                                                                                                                                                                                   |

## Rules

### The instance and its config

- **Reach Better Auth only through `getAuth()`, resolved per request; types use `Auth`.** It caches one instance per version of the sections it depends on (`signup`, `cache`) and builds a new one on the first call after either changes; running requests finish on the instance they started with ([configuration.md](configuration.md)).
- **`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are boot config.** Changing the secret breaks every session, TOTP secret, backup code and JWKS-signed token; the URL is baked into OAuth redirect URIs and the MCP issuer and audience.
- **Sign-up mode and legal consent are database-backed and read per request** (`getInstanceConfig().signup.signupDisabled`, `legalConfig()`), so the sign-in page, `/setup`, invite creation, the invite page and the consent check follow a dashboard edit without a redeploy.
- **Sessions and verification tokens are stored in the database** (`storeSessionInDatabase`, `verification: { storeInDatabase: true }`), so a cache driver change drops only rate-limit counters.
  - Keep `verification.storeInDatabase`: with `secondaryStorage`, `getAuthTables` drops the `verification` table unless it is set, which would move verification, reset and magic-link tokens into the cache driver, where `memory` loses them on restart.

### Accounts

- **Accounts are created by writing their rows directly with Drizzle**, because `disableSignUp` blocks Better Auth's sign-up, `getAuth().api.signUpEmail()` included.
  - `createAccount` in `signup.ts` writes `user`, `account` (`providerId: "credential"`, hashed with Better Auth's `hashPassword`), `legal_consent`, the personal workspace and `defaultWorkspaceSlug`; `ownerSignup` and `signUpFromInvite` both call it.
  - The workspace and default slug are written explicitly because `databaseHooks.user.create.after` in `server.ts` fires only on Better Auth's own inserts.
  - Both pages then call `signIn.email` client-side and land on `/2fa/setup`.
- **`METIS_OWNER_EMAIL` is required and names the one instance owner.** Boot and preflight fail without it, naming the variable (`appConfigSchema` in `src/config/schema.ts`); `metis setup` refuses to run without it ([cli.md](cli.md)).
- **The owner account comes only from `/setup`, which needs `METIS_SETUP_CODE`.** `verifySetupCode` compares sha256 digests with `timingSafeEqual`; the code lives only in the operator's environment, so it protects a deployment nobody watches boot.
  - `/setup` is open exactly while no account has the owner address (`ownerHasAccount`), and only for that address: the page shows it read-only and `signup.first` refuses any other.
  - Handing over ownership is changing `METIS_OWNER_EMAIL` and restarting; the new owner signs in, or claims the address on `/setup` when it has no account yet. Preflight's `syncOwnerRole` makes the previous owner an Admin ([dashboard.md](dashboard.md)).
- **`/setup` fails shut and says only "not available".** With no setup code it 403s; the variable name goes to a server-side `console.warn` only.
- **The owner account can't be deleted, demoted, banned, removed or invited.** `assertCanDeleteAccount` in `src/server/routes/user.ts` refuses deletion, so the owner address never becomes free while it is the owner.
- **Every other account comes from an invite, or from self sign-up while sign-up is open.** One `invite` table carries account invites and workspace invites alike; the rules are under Invites below.
  - Self sign-up refuses the owner address (`hooks.before` on `/sign-up/email`, `OWNER_ADDRESS_SETUP_ONLY`), so the owner account only ever comes from `/setup`, and an unverified row can never close `/setup`.
- **The `signup.*` procedures are public and IP rate-limited** ([orpc.md](orpc.md)).
- **One rule finds the client IP: the rightmost `X-Forwarded-For` hop that is not in the `proxies` section's trusted list** (`clientIp`), with any `:port` stripped; the signup limits, Better Auth and the audit log all use it.
  - `cf-connecting-ip` counts only when every `X-Forwarded-For` hop is trusted, so Cloudflare's address is believed only when it arrived through a listed proxy; `x-real-ip` is never read, because Caddy passes it through from the caller.
  - The auth route (`src/app/api/auth/[...all]/route.ts`) drops any incoming `x-metis-client-ip` and sets it to `clientIp`; `authOptions` makes it Better Auth's only IP header (`CLIENT_IP_HEADER` in `src/lib/client-ip-header.ts`), so Better Auth's own `X-Forwarded-For` parsing never runs.
  - Behind Caddy or one appending load balancer the nearest hop is the caller, so nothing needs configuring.
  - The bundled Caddy (`caddy reverse-proxy`, no trusted proxies) replaces `X-Forwarded-For` with whatever connected to it, so behind a CDN the only hop is the edge: listing Cloudflare's ranges lets `cf-connecting-ip` through, and any other CDN's callers share the edge's bucket because no other CDN header is read.
- **Every account signs in with a password; a seeded account gets its first one through password reset.** Reset owns 0 → 1 passwords and `changePassword` owns 1 → 1′, so `POST /reset-password` stays unguarded.

### Invites

- **An invite is a fixed bundle set by the inviter:** the bound email, an optional workspace and workspace role, and for an account invite an optional instance role. The invitee supplies only name, password and two-factor; nothing on the acceptance page changes the bundle.
- **`createInvite` is the one creation function**, used by the dashboard Invites page, workspace Members, the Workspace Assistant and MCP, with a `by: AuditActor`. It checks in this order:
  - the inviter's permission: workspace invites need a workspace owner or admin; account invites need the instance Owner or an Admin, and an Admin role in the bundle needs the Owner (`canGrantInstanceRole`);
  - the owner address is refused, except a workspace invite once the owner has an account;
  - an account invite to an address with an account is refused; existing users are invited only into workspaces;
  - a workspace invite to an address with no account needs open sign-up or an inviter who is instance Owner or Admin, otherwise "Ask the instance owner or an instance admin to invite this person.";
  - the rate limit, one bucket per inviter and workspace (account invites share one), then the email.
- **Invite links travel only by email.** When delivery fails the invite is deleted and the inviter gets an error; only the instance Owner, and only from the app (`linkOnFailure`), keeps the invite and is shown the link, audited `invite.link_shown`.
  - The `noop` mailer counts as a failed delivery, because nothing would ever arrive; `log` counts as sent, since it is a development driver.
- **An invite is checked again when it creates an account** (`signUpRefusal`, in `previewInvite` and `signUpFromInvite`): an account invite needs a sender who still is instance Owner or Admin and may still grant its role, and a workspace invite needs open sign-up or such a sender.
  - So invites copied from the old tables, invites sent before sign-up turned invite-only, and invites whose sender lost their role or was deleted stop creating accounts.
- **Any instance role reads the pending account invites; only the Owner and Admins create or revoke them** (`listAccountInvites` takes the viewer's role, `createInvite` and `revokeAccountInvite` check `canManageAccountInvites`).
- **One pending invite per address and workspace** (`invite_pending_account_idx`, `invite_pending_workspace_idx`); an expired pending invite is replaced by a new one, a live one refuses it.
- **Invites are single-use, expire after 7 days and are revocable.** Accepting stamps `accepted_at` and `accepted_user_id`, declining `declined_at`; revoking deletes the row.
- **The acceptance page (`/invite/accept`) serves every state from `signup.invitePreview`:**
  - signed in as the invited address: Accept and Decline;
  - signed in as another address: refused without naming the invited address;
  - signed out with an account: Sign in to accept, which returns to the page;
  - no account: the sign-up form with the email locked (`signup.invite`); the account is created verified with its personal workspace, joins the invited workspace (made its default) and takes any instance role in the bundle, then goes to `/2fa/setup`.
- **Invite tokens are stored as sha256 hashes (`token_hash`, unique)**, because they are looked up by value and randomized GCM ciphertext is not searchable.
- **The e2e seed generator creates its member with `createAccount` directly**, since the e2e mailer only logs.

### Bans

- **A banned account can't hold a session, so it can't sign in on any path.** `databaseHooks.session.create.before` refuses with `ACCOUNT_BANNED` and `BANNED_MESSAGE`, which covers password, magic link, the 2FA step and native sign-in, since each creates its session through Better Auth.
  - Only the password form shows the message; requesting a magic link still answers as usual, and opening it ends in Better Auth's plain 403, because its verify endpoint does not catch the hook's error.
- **Banning deletes the user's sessions** (`internalAdapter.deleteUserSessions`, which clears the secondary storage too); nothing checks the ban per request.
  - The cookie cache (`session.cookieCache.maxAge` in `authOptions`) keeps a deleted session readable until it expires, so a ban reaches open tabs within that window, and the dashboard's ban dialog and toast say so.
  - The window is kept short instead of adding a lookup to every request, because sessions can't be recreated once the ban is in place.
- **A ban also stops what acts as the user without a session:** `resolveMcpClient` returns `banned`, so MCP answers 403 with `BANNED_MESSAGE`, and `resolvePrincipal` blocks every run whose principal is banned.
  - A `user` run ends `blocked` and stays so after an unban; a `scheduled-send` or `snooze` run is put back with its attempt restored (`runOne` in `src/workflow/tick.ts`), so it goes out once the ban ends.
- **The owner is never banned.** `banUser` refuses the owner, and `syncOwnerRole` clears any ban on the `METIS_OWNER_EMAIL` account at preflight, so a handover to a banned account does not lock the instance out.
- **A ban touches nothing else.** Memberships, workspaces, connections and the resources the user linked stay as they are and stay usable by the other members; system workflows run with no principal and are unaffected.

### Sign-in

- **`/get-session` is exempt from Better Auth's per-IP rate limit** (`customRules["/get-session"]: false`).
  - Every page load calls it, so under the global rule many tabs, or many users behind one NAT, would hit 429; `useSession()` would then read no session and pages would sign the user out.
  - It is a cookie-cached read of the caller's own session.
- **Magic link must not reveal whether an address exists.** The plugin checks `disableSignUp` only at `/magic-link/verify`, so `hooks.before` resolves the email on `/sign-in/magic-link` and answers `{ status: true }` for an unknown one: no verification row, no mail, the same response as a real send.
- **Never put `~` in a Better Auth `callbackURL`.** It is rejected as `INVALID_CALLBACK_URL` and surfaces as a misleading "verify your email".

### Sign-in alerts

- **Every completed sign-in emails the account an alert unless the user turned alerts off** (`user_prefs.sign_in_alerts`, on when no row exists). The alert names the time in UTC, the device, the IP address and the method, and links to the sessions list in account settings.
- **A sign-in is complete when a session survives the second-factor challenge**, so one sign-in sends one alert.
  - `signInNotifier` must stay after `twoFactorPlugin` in `authOptions` → `plugins`. Better Auth runs `hooks.after` first and plugin hooks in plugin order, and the two-factor hook is what deletes the pre-challenge session and nulls `newSession`.
  - It fires on `/sign-in/email` and `/magic-link/verify` (no challenge: no 2FA yet, or a trusted device), `/two-factor/verify-totp` and `/two-factor/verify-backup-code` (the challenge passed) and `/native/exchange` (the desktop and mobile apps, [desktop.md](desktop.md), [mobile.md](mobile.md)).
  - A second-factor request that already carries a session cookie is enabling 2FA or a step-up, never a sign-in, so it sends nothing.
- **`signInNotifier` reaches the database and mailer only through `AuthDeps.onSignIn`**, because `base.ts` must stay free of `server-only` imports (below).
- **A failed alert never fails the sign-in.** `sendSignInAlert` catches and logs `[auth] failed to send sign-in alert`; it is awaited inside the sign-in request, like every other auth mail.
- **Turning alerts off writes `sign_in_alerts.disabled`** in `user.updatePreferences`, the one procedure that changes the preference ([audit.md](audit.md)).

### Second factor

- **A session alone proves nothing: check 2FA wherever a session is trusted.** Better Auth issues a full session before 2FA exists (`/two-factor/enable` needs one).
  - `proxy` runs on every path but built assets, the favicon and app icons, the health endpoints `/api/livez` and `/api/readyz` ([deployment.md](deployment.md)), `/rpc` and `/api/drive/relay/*`, because maintenance answers there first ([configuration.md](configuration.md)); Next buffers the body of every request it sees, so the two upload paths stay outside it.
  - `protectedPath` limits its session and 2FA gates to `/w/*`, `/settings/*`, `/dashboard/*` ([dashboard.md](dashboard.md)), `/invite/accept` and `/api/*`; every other path goes on untouched.
  - Within `/api/*` it skips `/api/auth/*`, `/api/mcp*` (bearer), `/api/workflows/tick` (secret), `/api/inbound/*` (each endpoint's own secret), `/api/drive/relay/*` (SigV4 signature) and the health endpoints.
  - `appSession` covers `/rpc` and in-process server calls, where no proxy runs; `/rpc` also carries the public `signup.*` procedures, so the proxy cannot gate it.
  - The native plugin endpoints `/api/auth/native/code` and `/api/auth/native/connect-ticket` check 2FA themselves.
- **Every second-factor field takes a TOTP or a backup code, and `verify2FA` is the only server entry point** for them; procedures never call `getAuth().api.verifyTOTP` or `verifyBackupCode`.
  - `verify2FA` verifies a backup code with `disableSession: true`, because a step-up must not re-issue the session.
  - Its callers: `requireTotp` (oRPC), the `x-totp-code` header check on Better Auth endpoints in `server.ts`, and the procedures that rate-limit on their own scope.
- **Classify 6 digits as TOTP before 10 alphanumerics as backup**, so an all-digit backup code is never misread. Pages use `useTwoFactorCode()`; no `src/app/**` file imports the classifier.

### Better Auth schema

- **Never hand-edit `src/db/auth-schema.ts` except the `$type` pass below.** Regenerate with `bun run --cwd apps/web db:auth-schema`, then `bun run lint:fix` (the CLI writes unformatted), then re-apply the `$type` pass, then write the migration ([database.md](database.md)).
- **After a `better-auth` bump, regenerate before anything else.** `auth@latest` must match the installed `better-auth`: the CLI's own `@better-auth/core` decides the table shape, and startup schema validation rejects auth requests on a mismatch.
- **Re-apply `$type<string[]>()` on every array-valued json column of the OAuth tables after every regen.**
  - SQLite has no array type, so the generator emits `text(…, { mode: "json" })` and drizzle infers `unknown` (`{}` when notNull).
  - The object-valued json columns (`metadata`, `customClaims`, `confirmation`) keep the inferred type.
  - A missed pass breaks the build in `src/server/routes/mcp.ts`, so it is loud.
- **`src/auth/base.ts` must import nothing that reaches `import "server-only"`**, because the Better Auth CLI refuses such a config.
  - Everything server-only (`config`, `db`, `MCP_AUDIENCE`, `rateLimit`) arrives through `AuthDeps`: `server.ts` passes the real ones, `generate.ts` passes placeholders and an in-memory libSQL.
  - `@/db` and `@/services/rate-limit` are `import type` only.
  - Keep the `server-only` imports in source; the CLI is what adapts.
- **`generate.ts` exports `auth = { options }`, not a `betterAuth()` instance.** Constructing one runs plugin `init`, whose oauth-provider resource seed queries `oauth_resource` and crashes the CLI against the empty database.

## How it works

- **Sign-in with 2FA.** Password sign-in goes through Better Auth's two-factor plugin. A magic-link sign-in for a user with 2FA is challenged by `hooks.after` on `/magic-link/verify`, which redirects to `/2fa/verify` and stores the requested page in `metis-2fa-callback`.
- **Gate responses.**
  - No session: a redirect to `/` (401 JSON on `/api/*`).
  - No 2FA: a redirect to `/2fa/setup` (403 on `/api/*`) with the page stored in `metis-2fa-callback`, which `/2fa/setup` returns to.
  - `proxy` lets `/invite/accept` through without a session, connection callbacks through on their signed state and nonce cookie (the callback page and its Connect action, [connections.md](connections.md)), and native-ticket connection starts through on the ticket.
- **Pages that check 2FA too.** The server pages and layouts under `/w` that redirect before rendering check `twoFactorEnabled` after `getAppUser` and redirect to `/2fa/setup`.
- **Step-up on Better Auth endpoints.** `hooks.before` in `src/auth/server.ts` requires a code in `x-totp-code` for the password- and session-changing endpoints and for accepting `/oauth2/consent`.
- **Disabling 2FA is audited in `hooks.after`** on `/two-factor/disable`, because the client calls Better Auth directly ([audit.md](audit.md)).
- **Session cost.** `proxy` reads the real session (`getAuth().api.getSession`), which is cheap behind the cookie cache; enabling TOTP refreshes that cache.
- **Rate limiting.** Better Auth's limits run on `secondaryStorage` over the cache driver; `rateLimit` does an atomic `incr(key, ttl)` on the same driver for its callers. Both resolve the driver per call (`getCache()`), so a cache switch drops the counters and nothing else.
- **The CLI and the `@/` alias.** `scripts/auth-generate.ts` symlinks `apps/web/node_modules/@ → ../src`, runs `bunx auth@latest generate` against `src/auth/generate.ts`, and removes the symlink in a `finally`, because the CLI's jiti loader cannot resolve `@/`.

## Deliberate limits

- **A ban reaches an open browser tab only when its cookie cache expires**, up to two minutes later, and a workflow run already executing a step finishes that step.
- **Removing a user deletes the account** through the same deletion path a user takes ([dashboard.md](dashboard.md)).
- **Magic link is sign-in only**; it never creates an account.
- **Sign-in alerts are sent for every sign-in, not only from new devices**, and the first sign-in of a new account sends one too. Sessions are long-lived, so sign-ins are rare, and a per-device memory would be a second record of devices beside the session table.
- **Sign-in alerts need a mailer that delivers**; under `noop` or `log` the switch still saves but nothing arrives (`NOOP_DISABLED_FLOWS`, [configuration.md](configuration.md)).
