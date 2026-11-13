# Configuration — environment, the config file and the stored instance config

How the web app reads its configuration: the boot config (`config`), fixed for the life of the process, and the instance config (`getInstanceConfig()`), the stored settings that may change at runtime.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [servers.md](servers.md), [database.md](database.md), [deployment.md](deployment.md), [dashboard.md](dashboard.md).

## Code map

| Concern                                                    | Where                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment + file → the boot config and the instance seed | `src/config/index.ts` → `config`, `instanceSeed`, `resolveConfig`, `seedRaw`, `serverlessHost`, `suppliedByEnv`, `suppliedByFile`                                                                                                                                                   |
| Environment → raw config (the authoritative variable list) | `src/config/from-env.ts` → one `*ConfigFromEnv` per section · driver-dependent API keys `llmApiKeyFromEnv`, `decisionApiKeyFromEnv`, applied in `buildRaw`                                                                                                                          |
| Config file                                                | `src/config/from-file.ts` → `loadConfigFile`                                                                                                                                                                                                                                        |
| Schemas, defaults, limits, cross-field checks              | `src/config/schema.ts` → `bootConfigSchema` (`BootConfig`), `instanceConfigSchema` (`InstanceConfig`, `InstanceSection`), `crossCheckConfig`                                                                                                                                        |
| Validation error text                                      | `src/config/format-error.ts` → `formatConfigError`                                                                                                                                                                                                                                  |
| The instance sections                                      | `src/types/instance-config.ts` → `CONFIG_SECTIONS` · `src/config/sections.ts` → `INSTANCE_SECTIONS`, `SECTION_ENV_VARS`, `hashSection`, `validateInstanceConfig`, `instanceConfigWarnings`, `suppliedSections`                                                                      |
| Table                                                      | `src/db/schema.ts` → `instanceConfig`                                                                                                                                                                                                                                               |
| Row ↔ sections                                             | `src/config/row.ts` → `rowToInstanceConfig`, `instanceConfigToRow`                                                                                                                                                                                                                  |
| Reads and the fenced insert                                | `src/config/store.ts` → `readCurrentConfigRow`, `currentConfigVersion`, `insertConfigVersion`, `listConfigVersions`                                                                                                                                                                 |
| The snapshot                                               | `src/config/runtime.ts` → `getInstanceConfig`, `loadInstanceConfig`, `startInstanceConfigPoll`, `onInstanceConfigChange`, `sectionCached`, `aiEnabled`, `phishingDetectionEnabled`, `decisionEnabled`, `decisionClassifierBatch`                                                    |
| What every process does on a change                        | `src/config/watch.ts` → `watchInstanceConfig` · registered by `src/instrumentation.ts` and `scripts/workflow-worker.ts`                                                                                                                                                             |
| Seeding once                                               | `src/config/seed.ts` → `seedInstanceConfig` · called by `scripts/preflight.ts` and the first dashboard save                                                                                                                                                                         |
| Forced keys                                                | `src/config/seed.ts` → `forceInstanceConfigKeys`, `forcedSections`, `mergeCliServers` · read in `scripts/preflight.ts`                                                                                                                                                              |
| Pluggable drivers                                          | `src/services/{cache,decision,llm,mailer,phishing-detection,workflow-runner}/` · decision model over the AI SDK's `experimental_decide`: `drivers/systemone.ts` (`@ai-sdk/typesafe-ai`, any `/systemone` server by base URL), `drivers/openai.ts` (`openai.decisionModel`)          |
| Dashboard forms, saves, history                            | `src/dashboard/config-forms.ts` · `src/dashboard/system-config.ts` ([dashboard.md](dashboard.md))                                                                                                                                                                                   |
| Maintenance                                                | `src/maintenance/response.ts` → `maintenanceResponse` · page `src/app/(standalone)/maintenance/page.tsx` · text `src/maintenance/since.ts` → `maintenanceSinceText` · called by `src/proxy.ts`, `src/app/rpc/[[...rest]]/route.ts` and `src/app/api/drive/relay/[...path]/route.ts` |
| Annotated example                                          | `.env.example`                                                                                                                                                                                                                                                                      |

## Rules

### Two objects

- **Two config objects, never merged: the boot config (`config` from `@/config`) and the instance config (`getInstanceConfig()` from `@/config/runtime`).** A setting lives in exactly one; their keys are disjoint, so reading a setting from the other is a compile error.
  - `config` (`BootConfig`) holds what a process needs before it can reach the database, or what must never be edited from the dashboard. It is validated once at import and never changes.
  - `getInstanceConfig()` (`InstanceConfig`) returns the current stored version, one key per section in `CONFIG_SECTIONS`. Before a row is loaded it returns `instanceSeed`, the same sections parsed from the environment, the config file and the defaults.
- **Read configuration through those two.** The direct `process.env` readers are:
  - `src/config/` itself, which builds both;
  - `src/db/crypto.ts` (`METIS_ENCRYPTION_KEY`, [connections.md](connections.md) has the reason);
  - `src/instrumentation.ts` (Next's `NEXT_RUNTIME` / `NEXT_PHASE`) and `serverlessHost` (the host's own markers);
  - `NODE_ENV` checks for dev-only logging;
  - outside `src/`: `drizzle.config.ts` (`DATABASE_*`) and `next.config.ts` (`NEXT_BUILD_OUTPUT`).
- **Boot config, permanently** (`bootConfigSchema` sections):
  - the database variables (`METIS_DB_DRIVER`, `DATABASE_*`, `MASTRA_DATABASE_*`);
  - `METIS_ENCRYPTION_KEY`, which seals the stored config's secrets;
  - `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`: sessions, TOTP secrets, JWKS, OAuth redirect URIs and the MCP issuer depend on them;
  - `METIS_OWNER_EMAIL`, required and never configurable from the dashboard it protects, and `METIS_SETUP_CODE`, used before any dashboard exists ([auth.md](auth.md));
  - `METIS_DRIVE_RELAY_SECRET`: every relay signing key derives from it and the relay endpoint trusts the signature alone, so a dashboard-set value would let an owner forge relay URLs for any user's drive ([drive.md](drive.md));
  - `METIS_SOURCE_URL`: it describes the code the process runs, which changes only with a restart, and pages before sign-in need it ([ui.md](ui.md));
  - `METIS_UPDATER_SOCKET`: a dashboard-editable path could point the app at any socket on its filesystem ([updater.md](updater.md));
  - `METIS_AUDIT_RETENTION_DAYS`: a dashboard-editable retention would let a leaked owner session erase the audit log ([audit.md](audit.md)).
  - `METIS_MAINTENANCE`: the instance config lives in the database a maintenance window protects, so a stored switch would be copied into every backup and bring a restored copy up frozen.
- **Instance config, seeded once:** every section in `CONFIG_SECTIONS`. `SECTION_ENV_VARS` maps each to the variables that can seed it.
- **Every seed is optional, with a default**, so a process needs only the database variables, `METIS_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `METIS_OWNER_EMAIL`. The defaults live on the section schemas, so a stored row and the environment share them.

### Sources and validation

- **Bad configuration fails at boot.** `bootConfigSchema` and `instanceConfigSchema` both run when `@/config` is first imported, so a malformed seed fails even when a stored row will replace it; `formatConfigError` names the offending field.
  - `SKIP_ENV_VALIDATION`, or the `lint` / `typecheck` scripts, skip validation and the config file.
- **The environment and the config file are interchangeable, key by key.** An environment value wins over the file, and an empty variable counts as unset.
  - Both feed one raw object through `defu(envRaw, file)`, so a section may be split across them: a driver in the file and its API key in env.
  - `resolveConfig` validates the boot sections with `bootConfigSchema` and maps the rest onto the instance sections (`seedRaw`) for `instanceConfigSchema`.
  - Every `*ConfigFromEnv` returns all of its fields; the section schemas default a missing driver (`withDefaultDriver`), so nothing is lost before the merge.
  - The env name of an API key depends on the driver (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `METIS_LLM_API_KEY`, `METIS_DECISION_API_KEY`), so `buildRaw` picks it after the merge.
- **Validation lives in the section schemas.** A stored row is parsed back through `instanceConfigSchema`, the same schema the seed goes through; `envBoolSchema` therefore takes booleans as well as `"true"` / `"1"`.
- **Server lists are JSON arrays whose entries need distinct names and ids; a host field takes a hostname.** What each entry holds: [servers.md](servers.md), [drive-providers.md](drive-providers.md).

### The stored config

- **The database wins once a row exists.** Preflight seeds an empty table, and later only a section the row has never stored; afterwards it only warns for each section the environment or config file sets to something other than the stored value (`suppliedSections`).
  - The owner puts a section back to the environment and config file with the dashboard's **Reset to environment**, which stores that section of `instanceSeed` as a new `reset` version ([dashboard.md](dashboard.md)); `instanceSeed` is read at boot, so a changed variable needs a restart first.
- **`METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS` makes one preflight run store the named variables' sections from the environment over the stored config.** The `metis` CLI passes it to one preflight container after a config change and never writes it to a file.
  - The double underscore keeps it apart from every config variable.
  - It must never be set on a platform whose build or start command runs preflight on every deploy, because every deploy would then overwrite the dashboard's edits to those sections.
  - A forced section is stored whole from `instanceSeed`, exactly as **Reset to environment** stores it, so the CLI always writes every variable of a section it forces.
  - A shared variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) forces every section that lists it.
  - A name in no section of `SECTION_ENV_VARS` (a boot-only variable included) stops preflight before migrations, so nothing is written.
- **Server entries whose id starts with `metis-` belong to the CLI** (`mergeCliServers`).
  - Forcing a `*Servers` section keeps every stored entry without the prefix and replaces every stored `metis-` entry with the environment's `metis-` entries, so an entry removed from `.env` and forced is removed.
  - Environment entries without the prefix only seed a first run; forcing ignores them.
- **One table, one current row.** `is_current` carries a partial unique index; every write is one short transaction that clears the current flag where `version` is the expected one, refuses when that touched nothing, then inserts. SQLite has no `FOR UPDATE`; the conditional update is the fence.
- **Each secret is its own `encryptedText` column; only the server lists are JSON**, in one sealed `servers` column, because they are variable-shaped lists that carry S3 secret keys. Adding a setting is a schema change and a migration ([database.md](database.md)).
- **Cross-section checks (`validateInstanceConfig`, against the boot config) run on every candidate config, and only there.**
  - They cover: a decision switch on with the LLM disabled, a relayed server listed without `METIS_DRIVE_RELAY_SECRET`, and the `internal` runner on a known serverless host.
  - A dashboard save and a forced preflight run refuse a candidate that fails them.
  - Seeding warns and stores it anyway, so a first deploy (the default `internal` runner on Vercel, for example) never fails on them.
  - They cannot run at boot, because the LLM and server lists a process boots with are not the stored ones.
- **No provider at all is a warning** (`instanceConfigWarnings`): preflight logs it when seeding, a save returns it, and the System overview shows it.

### Maintenance

- **`METIS_MAINTENANCE` holds the time maintenance began, as an ISO 8601 date-time with an offset** (`2026-11-11T10:00:00Z`); unset or empty means none.
  - A value that does not parse, or a time later than the process's clock, fails boot (`maintenanceConfigSchema` in `src/config/schema.ts`), so a typo never leaves an app half-frozen.
- **While it is set, the app writes nothing: a request that accepts `text/html` gets the maintenance page, and any other request gets 503 with `{"error":"maintenance","since":"…"}`.**
  - `/api/livez` and `/api/readyz` behave as always, so a platform health check never restarts or removes a frozen app ([deployment.md](deployment.md)); the built assets and the app icons load as always, so the page renders.
  - Every maintenance answer carries `Retry-After: 300`, `Metis-Maintenance` (the time, in ISO 8601 UTC) and `Metis-Version`, so a script tells maintenance from failure and learns the running release; the JSON also carries `Cache-Control: no-store`.
- **The page answers 200, not 503.** `maintenanceResponse(true, url)` rewrites to `/maintenance`, and Next serves a rewritten page with the page's own status (`resolve-routes.js` keeps only the proxy's headers), so callers that need the status send any `Accept` but `text/html`.
- **`src/proxy.ts` answers first, before any session work**, on every path its matcher covers ([auth.md](auth.md)).
- **`/rpc` and `/api/drive/relay/*` check maintenance in their own route handlers, through the same `maintenanceResponse`.**
  - The proxy matcher leaves them out because Next buffers the body of every request the proxy sees and cuts it at 10 MB (`proxyClientMaxBodySize`), which would truncate compose attachments and relay uploads.
- **Background work stays off.** `src/instrumentation.ts` skips the `internal` runner and keeps the instance config poll, which only reads; `scripts/workflow-worker.ts` logs `[workflow-worker] maintenance since …, idle` once and takes no ticks; the `cron` route gets the proxy's 503 ([workflow-runtime.md](workflow-runtime.md)).
- **The maintenance page is an ordinary page under the root layout**, with the app's fonts, styles, theme and `MetisMark`, and the source link from `(standalone)`.
  - `resolveThemeBrand` returns the default brand in maintenance, so the root layout reads no session and no database; the client's session check gets the JSON 503 and falls back to the default brand.
  - `/maintenance` calls `notFound()` outside maintenance.
- **On a server the `metis` CLI manages, the app is never stopped while visitors can reach it.** The CLI recreates the app and workers with `METIS_MAINTENANCE` in their container environment, never in `.env` ([cli.md](cli.md), [updater.md](updater.md)).

### Reading at runtime

- **`aiEnabled()` (`@/config/runtime`) is the one instance-wide AI flag: true when the stored LLM driver is not `disabled`.**
  - `phishingDetectionEnabled()` is its phishing counterpart.
  - Both read the snapshot per call, so turning a driver on or off is live.
  - `decisionEnabled(feature)` is the same for each decision switch: true only when the decision driver is not `disabled` and that switch is on. The workspace and per-resource AI switches gate decision calls too ([ai-agents.md](ai-agents.md)).
- **Never capture an instance-config value, or a driver built from one, in a module constant.** Build drivers with `sectionCached([sections], build, dispose?)`: `build` receives the current `InstanceConfig`, reruns on the first use after those sections' hashes change, and the replaced value goes to `dispose`.

## How it works

- **Sources.** `resolveConfig` merges the environment over the config file, then validates the boot config and the instance seed.
  - The file is `METIS_CONFIG_PATH` (a missing file throws), else the first that exists of `metis.config.{yaml,yml,json,toml}` in the working directory and `/etc/metis/config.{yaml,yml,json,toml}`.
  - Its keys are the raw sections the `*ConfigFromEnv` readers produce (`auth`, `db`, `app`, `drive`, `connections`, `llm`, …), not variable names and not the instance section names.
  - So `app.signupDisabled` seeds `signup`, `drive.relayMaxMb` / `relayConcurrency` seed `relay`, and `connections` seeds the OAuth pairs (`connections.zohoRegion` becoming `zoho.region`) and the server lists.
- **The snapshot.** `getInstanceConfig()` returns a frozen `InstanceConfig` that starts as `instanceSeed`, so build, lint and typecheck need no database. Its state lives on a `globalThis` symbol, so instrumentation and every route bundle share one snapshot.
  - `register()` in `src/instrumentation.ts` awaits `loadInstanceConfig()` before Next serves a request (not during `next build`), then registers `watchInstanceConfig` and starts the poll. The worker and preflight load it at startup.
  - The poll (`POLL_INTERVAL_MS`) reads only the current `version` and reloads the full row when it changed. A failed read logs once per distinct error and keeps the previous snapshot; no current row keeps the environment and logs once.
  - A write in this process reloads at once; other processes catch up within one poll.
  - `install` hashes every section (`hashSection`, a sha256 of key-sorted JSON) and notifies `onInstanceConfigChange` listeners with the sections whose hash changed. A version whose cross-section checks fail is still installed, with a warning.
- **Change listeners** (`watchInstanceConfig`):
  - the mail warning on a mail change, and `warmupCache` on a cache change;
  - retiring changed IMAP/FTP/SFTP pools on any server-list change (the writer already ran quarantine, [connections.md](connections.md));
  - the runner switch (`syncInProcessRunner` in a web process, the worker's own switch in the worker).
- **Seeding** (`seedInstanceConfig`).
  - With no current row it inserts version 1 (`kind: seed`) from `instanceSeed` and returns the `validateInstanceConfig` and `instanceConfigWarnings` findings as warnings.
  - A concurrent seed loses on the partial unique index and falls through to the existing-row branch.
  - With a row, it first fills each section that row has never stored (`unstoredSections`: its marker column is NULL, as on a row written before the section's columns existed) from `instanceSeed`, in one new `seed` version, then returns the supplied sections that differ from the stored ones.
  - The first dashboard save also seeds when no row exists, so a development database (`next dev` never runs preflight) needs no preflight run.
- **Forcing** (`forceInstanceConfigKeys`), right after seeding in the same preflight run.
  - It builds the candidate from the current row and the forced sections, parses each forced section through its `instanceConfigSchema` shape (a failure names the field through `formatConfigError`), runs `validateInstanceConfig`, and exits preflight non-zero on any finding.
  - It stores one `forced` version with `changed_keys` set to the forced sections, retried on `ConfigVersionConflictError`, and logs `[preflight] forced sections=google version=12 keys=GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET`.
  - `instanceConfigWarnings` findings go to the deploy checks; the drift warning skips the forced sections.
  - It writes no audit event, like a dashboard config edit; the version row, with no user, is the record.
  - Running processes pick the new version up on their next poll.
- **What the variables themselves do not say** (`.env.example` annotates every variable):
  - An `https://` `BETTER_AUTH_URL` turns on secure cookies.
  - `MAIL_FROM_AUTH` and `MAIL_FROM_INVITE` fall back to `MAIL_FROM`.
  - Legal consent is off only when both `METIS_TERMS_URL` and `METIS_PRIVACY_URL` are unset.
  - `METIS_CONFIG_PATH` and `SKIP_ENV_VALIDATION` are read outside the schema.
- **The `smtp` mail driver requires STARTTLS on a connection without implicit TLS** (`requireTLS` in `src/services/mailer/drivers/smtp.ts` → `createSmtpTransport`), for `SMTP_URL` and `SMTP_HOST` alike.
  - `SMTP_PLAIN=true` (column `mail_smtp_plain`, dashboard **Allow unencrypted**) keeps the opportunistic upgrade, for a local relay without TLS; the schema refuses it with `SMTP_SECURE=true`.
  - A `requireTLS` query parameter in `SMTP_URL` overrides both, because nodemailer applies URL options last.
- **The `console` mail driver** (`METIS_MAIL_DRIVER=console`, `src/services/mailer/drivers/console.ts`) delivers the instance's own mail (every message in `src/services/mailer/send.ts`) to the Metis Cloud console, so a new Cloud user gets it there before setting up a mailer of their own.
  - Its endpoint (`CONSOLE_MAIL_URL`) and the per-tenant bearer credential the console issues (`CONSOLE_MAIL_TOKEN`) are mailer settings stored like a Resend key (`mail_console_url`, `mail_console_token`), so the owner can later switch to their own SMTP or Resend from the dashboard.
  - Each message is one `POST <endpoint>` with `Authorization: Bearer <token>` and a JSON body `{ to, from, subject, html, text }`; any 2xx means accepted, anything else fails the send.
  - The driver has no verification request, so the dashboard's mail check skips it and a save stores it unchecked.
- **Structured outputs on `openai-compatible`.** Off, the endpoint gets `json_object` mode and the schema goes into the prompt (`structuredOutput` in `src/services/llm/structured-output.ts`, decided per call), so summaries need a much larger context window. Turn it on only when the endpoint supports `json_schema`.
- **The runner section also carries workflow retention and inbound settings**: `stepDataDays` and `historyDays` ([workflow-runs.md](workflow-runs.md)), and `publicUrl` and `trustedProxies` ([workflow-graph.md](workflow-graph.md)).
  - Webhook and push addresses use `publicUrl`, else `BETTER_AUTH_URL` (`inboundBase`); push subscriptions start only while `publicUrl` is set.
  - `trustedProxies` takes a list or one comma-separated string; the dashboard edits it as text. It serves only the webhook **Only from these IPs** check.
- **The `proxies` section is the app's own trusted-proxy list** (`METIS_TRUSTED_PROXIES`, column `trusted_proxies`, the Instance page's Proxies card).
  - `clientIp` reads it per request for rate limits, Better Auth and the audit log ([auth.md](auth.md)).
  - It is separate from the runner's list on purpose, so a workflow setting never decides sign-in limits.
- **Both trusted-proxy lists accept only real addresses and in-range prefixes** (`isIpOrRange` in `src/config/schema.ts`), because `BlockList.addSubnet` throws on a bad prefix and the lookup runs on every sign-in.
  - A stored entry that fails the check is dropped when the row loads (`rowToInstanceConfig`), so an older row never stops the config from loading.
- **A keyless SystemOne server.** With `METIS_DECISION_API_KEY` unset, the driver sends `KEYLESS_PLACEHOLDER` (`src/services/decision/drivers/systemone.ts`), because the TypeSafe provider always sends a bearer; preflight warns.

## Deliberate limits

- **Every cache driver implements the same `CacheDriver` (`src/services/cache/types.ts`), including a small hash API for grouped entries** (`hget`, `hmget`, `hsetExpiring`; `del` drops the whole hash).
  - `cachedField` and `forgetHash` (`src/services/cache/hash-cache.ts`) are the read-through helpers on top: they read a field, validate it with a Zod schema, load and store it on a miss, share an identical in-flight load within the process, and only log when the cache driver fails.
  - `hsetExpiring` sets a field and gives the hash a lifetime only if it has none, in one Lua script (`HSET_EXPIRE` in `src/services/cache/lua-scripts.ts`) like `incr`'s `INCR_EXPIRE`, so it runs on every Redis version and on Upstash.
- **Changing the cache driver drops rate-limit counters.** Sessions and verification tokens live in the database, so they survive ([auth.md](auth.md)); the replaced Redis client closes after `CLOSE_GRACE_MS` (`src/services/cache/registry.ts`).
- **A process with no database reachable at boot runs on the environment** until a poll succeeds.
- **Versions are never pruned.** They are small, and pruning would break `reverted_from_version`.
