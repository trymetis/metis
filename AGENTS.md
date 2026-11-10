# Metis Suite — agent rules

> The hard constraints every change follows. Domain detail lives in [`agent-docs/`](agent-docs/) (index in §7): read the doc for the domain you touch before changing it.

## 1. The project

- **Metis Suite (`trymetis/metis`, AGPL-3.0-or-later) is a mail, calendar, drive and contacts client over provider APIs, with an AI agent and phishing detection.** Product copy is written for open source and self-hosting: "bring your own model" means the operator's own model.
- **Self-hosted and Metis Cloud run the same released app.** The only Cloud-specific code here is the `console` mail driver ([configuration.md](agent-docs/configuration.md)).
- **Workspaces:** `apps/web` (the product), `apps/desktop` and `apps/mobile` (shells onto a user's instance), `apps/www` (marketing site), `apps/docs` (customer docs, rules in `apps/docs/AGENTS.md`), `apps/gateway-{cloudflare,resend}`, `packages/*`, `e2e/`.
  - `apps/updater` is a Go module outside the bun workspaces; `proto/` is its protocol.
  - The Next.js rules `next dev` generates live in `apps/web/AGENTS.md`.
- **`src/…` means `apps/web/src/…`** unless a path names another workspace.
- **Every edit under `apps/docs/content/` (pages and each folder's `meta.ts`) goes through the three subagents in `.claude/agents/`, in order: `docs-feature-finder`, `docs-writer`, `docs-verifier`.** Never hand-edit a page there, not even a one-line fix. The rest of `apps/docs/` (scripts, screenshot lists, images, config) is edited directly.

## 2. Toolchain

- **bun is the package manager**; scripts are in each `package.json`.
- **Bun's isolated linker: every workspace declares every package it imports**, including peers its dependencies need, because `turbo prune` drops auto-installed peers.
- **Shared versions go in the root `package.json` catalog** (`catalog:`).
- **Workspace packages export TypeScript source** through `package.json#exports`, with no build step.
- **oxlint and oxfmt run once at the root.** Fix formatting and import order with `bun run lint:fix`, never by hand.
  - Configs are `.mts`, because not every package is `"type": "module"`.
  - Each workspace's `oxlint.config.mts` extends the root `oxlint.config.mts`, which inherits only `rules`, `plugins` and `overrides`; `env`, `settings` and `ignorePatterns` belong to each file.
  - oxfmt has no `extends`: a workspace `oxfmt.config.mts` spreads the root's, and exists only where its options or ignores differ.
  - These configs import the root's by relative path, the one exception to §4's import rule.
  - Type-aware linting is the `--type-aware` flag in the scripts, because `options.typeAware` is rejected in a nested config.
  - The rule set, its exemptions and the suppression format are in [lint.md](agent-docs/lint.md).
- **Never hand-edit generated output** (`shadcn add` primitives, `packages/ui/src/components/svgs/`, `packages/updater-proto/src/gen/`, `apps/updater/gen/`, `src/db/auth-schema.ts` beyond its `$type` pass, the drive icons, the privacy rules, the www models and HDRI), not even to satisfy lint. Report what the generator did and ask.
- **A schema change ships a hand-written, data-preserving migration in `apps/web/migrations/` and passes `bun run db:check`** ([database.md](agent-docs/database.md)).
- **Migrations reach a database only through preflight or `bun run db:migrate`, which the project owner runs**, never an agent.
- **A user-visible change adds a line under `## Unreleased` in its release track's changelog**: the root `CHANGELOG.md` for the server (app, images, `compose.yml`, `bootstrap.sh`), `apps/desktop/CHANGELOG.md`, `apps/mobile/CHANGELOG.md`; a release is cut with `bun run release`, never by hand.
  - Each release's notes are one file in the root `releases/` folder, named after its tag (`app-v0.3.1.md`), and are never edited once published ([deployment.md](agent-docs/deployment.md)).
- **Never commit secrets.** `.env*` is gitignored except `apps/web/.env.example` and `e2e/.env.fixture`.
- **Source copied into the repo gets a `NOTICE` entry.** Dependencies need no license bookkeeping: `apps/web/scripts/licenses.ts` writes `THIRD_PARTY_LICENSES.txt` at image build.

## 3. Dependencies

- **Google: the scoped `@googleapis/{gmail,calendar,drive,people}` clients only.** The monolithic `googleapis` OOMs `tsc`. Never depend on `google-auth-library`; build the client with `new auth.OAuth2()` from the scoped package.
- **Microsoft Graph: `@microsoft/microsoft-graph-client` + `@microsoft/microsoft-graph-types`**, never the Kiota `@microsoft/msgraph-sdk-*` packages.
- **S3: AWS SDK commands only**; never hand-roll the S3 protocol, including the drive relay's SigV4 URLs ([drive.md](agent-docs/drive.md)).
- **MCP OAuth: `@better-auth/mcp` only.** It is `@better-auth/oauth-provider` preconfigured, so registering both is forbidden.
- **`ai` and every `@ai-sdk/*` package are pinned exactly and bumped together, to the `@ai-sdk/provider` version `@mastra/core` pins**, so one copy exists ([ai-agents.md](agent-docs/ai-agents.md)).
- **UI primitives are shadcn on Base UI (`base-nova`)**, installed with `bunx shadcn@latest add` from the consuming app into `packages/ui` ([ui.md](agent-docs/ui.md)).

## 4. Code

- **Imports: relative inside a module, `@/` across modules, `@metis/*` across workspaces.** Nothing reaches `../../`, and no workspace imports another's files by relative path.
- **Domains are top-level under `src/` (`mail/`, `calendar/`, `drive/`, `connections/`, …); `src/lib/` holds only what belongs to no domain.**
- **Nothing imports from `src/app/`.** A route's `_components/` serves only that route; a component a second route needs moves to `src/components/` with every `_components/` file it imports.
- **Import `cn` from `@metis/ui/lib/utils`**, except in `apps/mobile`, which uses its own `lib/utils.ts`.
- **No informational or doc comments in code.** Reasons and invariants go in the domain's doc.
- **Every log line starts with its module's bracketed tag** (`[orpc]`, `[workflow]`).
- **Every workspace-, mailbox-, calendar-, drive- or address-book-scoped procedure takes its scope as explicit input** (`workspaceScopeSchema` … `addressBookScopeSchema` in `src/server/schema.ts`, extended with `.extend`). Clients read it from the URL (`useWorkspaceScope()`, `useMailboxScope()`); there is no cookie fallback ([orpc.md](agent-docs/orpc.md)).
- **Shared Zod types live in `src/server/schema.ts`.**
- **`apps/desktop` keeps the unscoped name `metis-suite-desktop`**: it is also the userData folder and the `.deb` name.

## 5. Cross-domain rules

- **The grant is the entity: a mailbox, a calendar, a drive and an address book hang off one `connection` row** ([connections.md](agent-docs/connections.md)). **A workspace only borrows a resource** ([workspaces.md](agent-docs/workspaces.md)).
- **Mail, calendar, drive and contacts are peers.** None imports another; shared code, and code that moves data between them, lives in neutral modules. Anything that handles one resource kind (menus, gates, counts, policy, copy) handles all four.
- **Rows are keyed by the narrowest true scope with a real FK; never add a per-user toggle over per-mailbox data** ([workspaces.md](agent-docs/workspaces.md)).
- **Composite ids (the `all` mailbox, `/d/all`, `/p/all` and the packed contact refs in its URLs) never reach our DB** ([mail.md](agent-docs/mail.md), [drive.md](agent-docs/drive.md), [contacts.md](agent-docs/contacts.md)).
- **Calendar, drive and address-book visibility restrictions are app-level product guarantees, never isolation.**
- **Tokens and credentials are sealed with `encryptedText`; anything not sealed `v1` is rejected** ([connections.md](agent-docs/connections.md)).
- **The operator defines servers; users bring only their own login.** The server only connects to hosts a server entry names ([servers.md](agent-docs/servers.md)).
- **Two config objects, never merged: the boot config `config` and the instance config `getInstanceConfig()`.** A setting that may change at runtime is read through the snapshot per use, never captured at module load ([configuration.md](agent-docs/configuration.md)).
- **Instance roles (owner, admin, observer) run the server; workspace roles work with a workspace's data; neither reaches the other** ([dashboard.md](agent-docs/dashboard.md)).
- **2FA is required everywhere past sign-in**; `src/proxy.ts` and `appSession` enforce it, because a session exists before 2FA does ([auth.md](agent-docs/auth.md)).
- **A security-relevant change writes an audit event with `recordAuditEvent` in the function every caller shares; no copy calls the log tamper-proof** ([audit.md](agent-docs/audit.md)).
- **There is one background runtime, `runWorkflowTick()`**; web requests only queue work, and the database owns all workflow state ([workflow-runtime.md](agent-docs/workflow-runtime.md)).
- **AI is one concept behind one switch:** LLM and decision-model calls are both gated by the workspace and per-resource AI switches ([ai-agents.md](agent-docs/ai-agents.md)).
- **Every agent, MCP and workflow operation lives once in `src/ops/`; tool parity and the read/write partition are compile-checked, and a tool key is never renamed** ([ai-agents.md](agent-docs/ai-agents.md)).

## 6. Tests

- **E2E treats the app as a black box**: public HTTP API and UI only, generic clients, no app imports ([e2e.md](agent-docs/e2e.md)).
- **A change to anything in a recorded LLM or decision request (agent instructions, resident tools, prompts) needs `bun run generate:record` in `e2e/`.**

## 7. Domain docs

| Doc                                                   | Domain                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [configuration.md](agent-docs/configuration.md)       | boot config, the stored instance config and its snapshot, environment variables, the config file, driver notes      |
| [orpc.md](agent-docs/orpc.md)                         | where oRPC procedures live, guards, errors, per-namespace rules                                                     |
| [auth.md](agent-docs/auth.md)                         | the owner account, invites, sign-in, 2FA, rate limiting, regenerating the Better Auth schema                        |
| [audit.md](agent-docs/audit.md)                       | the audit log: recorded events, who reads which slice, retention, what it may be claimed to prove                   |
| [connections.md](agent-docs/connections.md)           | the grant, encryption at rest, connecting, scopes, `connectServers`, quarantine, token refresh, revoke              |
| [workspaces.md](agent-docs/workspaces.md)             | workspaces, resource links, membership, data scopes, user prefs, AI and phishing policy, the data export            |
| [servers.md](agent-docs/servers.md)                   | operator-defined servers and credential drivers                                                                     |
| [mail.md](agent-docs/mail.md)                         | `MailSession`, `MailAdapter`, providers, the `all` mailbox, moves, the mail list, IMAP                              |
| [gateways.md](agent-docs/gateways.md)                 | the `/v1` gateway contract, Cloudflare Email, Resend                                                                |
| [mail-ai.md](agent-docs/mail-ai.md)                   | phishing detection, labels, thread-summary cards                                                                    |
| [mail-rendering.md](agent-docs/mail-rendering.md)     | the sandboxed email frame and its CSP, remote-content blocking, tracker stripping, link cleaning, the image proxy   |
| [calendar.md](agent-docs/calendar.md)                 | calendars, visibility, `CalendarAdapter`, CalDAV                                                                    |
| [contacts.md](agent-docs/contacts.md)                 | address books, book visibility, `ContactsAdapter`, CardDAV, saving from mail, the saved-contact index               |
| [drive.md](agent-docs/drive.md)                       | drive model, direct vs relay transfers, `DriveSurface`, root visibility, icons                                      |
| [drive-providers.md](agent-docs/drive-providers.md)   | S3, WebDAV, FTP/FTPS, SFTP                                                                                          |
| [drive-preview.md](agent-docs/drive-preview.md)       | browser-only file preview and its cache                                                                             |
| [search.md](agent-docs/search.md)                     | the workspace search dialog, its query language, provider pushdown, result actions, saved searches, members pages   |
| [shortcuts.md](agent-docs/shortcuts.md)               | keyboard chords, app-wide keys, search dialog keys                                                                  |
| [ai-agents.md](agent-docs/ai-agents.md)               | Mastra agents, toolkit, tool parity, workspace scope, references, approvals                                         |
| [mcp.md](agent-docs/mcp.md)                           | the MCP server, client registration, auth, consent, call scoping                                                    |
| [workflow-runtime.md](agent-docs/workflow-runtime.md) | `runWorkflowTick()`, the three transports, claims, draining, tick budget, what each driver needs                    |
| [workflow-graph.md](agent-docs/workflow-graph.md)     | workflow tables, graphs and expressions, the step registry, triggers and feeds, inbound, waits, AI steps, built-ins |
| [workflow-runs.md](agent-docs/workflow-runs.md)       | cancel, resume, approvals, unconfirmed-send reconciliation, retention, run visibility and history                   |
| [dashboard.md](agent-docs/dashboard.md)               | instance roles, the dashboard and its Accounts section, bans, config editing, deploy checks                         |
| [ui.md](agent-docs/ui.md)                             | `@metis/ui`, shadcn rules, theme and brands, the mail shell, the source link, brand marks                           |
| [desktop.md](agent-docs/desktop.md)                   | the Electron shell and the `native` sign-in protocol                                                                |
| [mobile.md](agent-docs/mobile.md)                     | the Expo shell                                                                                                      |
| [downloads.md](agent-docs/downloads.md)               | where the desktop and Android apps are published, and the URL of every file                                         |
| [database.md](agent-docs/database.md)                 | schema, migrations and the drift check, `METIS_DB_DRIVER`, sqld, Drizzle naming                                     |
| [deployment.md](agent-docs/deployment.md)             | compose, bootstrap, preflight, Docker images, release tags, health endpoints, build traps                           |
| [self-host.md](agent-docs/self-host.md)               | where `bootstrap.sh` and `compose.yml` are published (`sh.trymetis.email`)                                          |
| [updater.md](agent-docs/updater.md)                   | the updater protocol, the Go updater, dashboard updates                                                             |
| [lint.md](agent-docs/lint.md)                         | the oxlint rule set, rules turned off or tuned and why, workspace settings, suppression format                      |
| [e2e.md](agent-docs/e2e.md)                           | the e2e black-box rule, the two suites, the fakes, the harness and the model-call recorder                          |
| [www.md](agent-docs/www.md)                           | the marketing site's metadata, structured data, sitemap, social images and comparison pages                         |

### Writing AGENTS.md and agent-docs

- **AGENTS.md holds only hard constraints every session needs**; everything else goes in the domain doc.
- **A change that makes a doc wrong updates that doc in the same change.**
- **The docs answer questions without reading code**: why, the flows, invariants the code cannot express, traps and deliberate limits, never a line-by-line description of the code.
- **Point to code by exact path and symbol** (`src/proxy.ts` → `proxy`). Never copy what the code already lists (catalogs, columns, versions, tuning constants); name the file that holds it.
- **Each fact has one home doc**; other docs link to it.
- **State facts positively.** A negative ("never X") only guards a real trap or invariant.
- **Present tense, current state only.** No changelog language ("now", "no longer", "was", "used to", "previously"); history lives in git.
- **One rule per bullet, the rule first and in bold; mechanism goes in sub-bullets.** Keep every line under 350 characters.
- **Every doc has the same shape:** a title; a short scope paragraph naming what it covers, where its paths are relative to and the related docs; then `## Code map`, `## Rules`, `## How it works` and `## Deliberate limits`, leaving out any section it has nothing for.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
