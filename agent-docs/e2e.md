# End-to-end tests

The black-box rule every e2e test and fixture follows, which suite a test belongs in, where the stack, the seed and replay services, suites and seed generators live, how model calls are recorded and replayed, and the shell smoke tests.
Paths are from the repository root.
See also [AGENTS.md](../AGENTS.md), [mcp.md](mcp.md), [updater.md](updater.md), `e2e/README.md` (the stack, environment files, seed data, server addresses, running the tests), `e2e/E2E_MISSES.md` (what e2e does not cover).

## Code map

| Concern                                                                               | Where                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The stack                                                                             | `e2e/compose.yml` · `bun run up` in `e2e/package.json` · the service list and images in `e2e/README.md`                                                                                                                                                                                 |
| Test servers                                                                          | one Dockerfile per server in `e2e/{mail,caldav,s3,webdav,ftp,sftp}/` · Cloudflare gateway under `wrangler dev` in `e2e/gateway-cloudflare/` · Resend gateway `e2e/gateway-resend/Dockerfile` · proxy `e2e/proxy/haproxy.cfg`                                                            |
| The fakes (one static Go binary, one role per service)                                | `e2e/fakes/` → `main.go` (roles `updater`, `resend`, `mcp-client`, `cron`, `health`) · `updater.go` · `resend.go` · `mcpclient.go` · `cron.go` · `Dockerfile` · `go.mod` `replace` onto `apps/updater/gen`                                                                              |
| The test CA every stack certificate chains to                                         | `e2e/tls/ca.crt` · `ca.key` · reissue with `e2e/tls/generate.sh`                                                                                                                                                                                                                        |
| Seed and replay services (seeding; model replay, `/llm-misses`, `/llm-hits`, `/totp`) | `e2e/harness/seed.ts` · `database.ts` · `replay.ts` · `llm.ts` (`llm-seed.json`) · `totp.ts` (`enrollment.json`)                                                                                                                                                                        |
| The Playwright suite (UI)                                                             | `e2e/playwright.config.ts` · `e2e/tests/` → `setup/`, `read/`, `write/` (run order in `write/order.list.ts`), shared helpers at its top · `bun run test:browser`                                                                                                                        |
| The Vitest suite (no browser)                                                         | `e2e/vitest.config.ts` (projects `mcp`, `rpc`, `workflows`, `gateway`, `system`) · `e2e/api/` → `global-setup.ts` (HTTP sign-in into the gitignored `api/.state/`), `support/`, one folder per project · `bun run test:api`                                                             |
| Driver switches                                                                       | `e2e/api/system/` · `support/config.ts` → `setSection`                                                                                                                                                                                                                                  |
| Desktop shell smoke tests (Playwright `_electron`)                                    | `e2e/desktop.config.ts` · `e2e/desktop/` → `shell.ts` (`launchShell`, `signInThroughBrowser`), `shell.spec.ts` · `bun run test:desktop`                                                                                                                                                 |
| Android shell smoke flow (Maestro, run by hand)                                       | `e2e/mobile/setup.yaml`                                                                                                                                                                                                                                                                 |
| Clients both suites share                                                             | `e2e/clients/` → `harness.ts`, `mcp.ts`, `rpc.ts`, `llm-misses.ts`, `sign-in.ts` (HTTP sign-in)                                                                                                                                                                                         |
| MCP tool cases                                                                        | `e2e/api/mcp/tools.test.ts` → `CASES`, `ALONE`, `UNCOVERED` · generic checks `e2e/api/mcp/checks.test.ts`                                                                                                                                                                               |
| Fixtures written with generic clients                                                 | `e2e/seed/` → `mailbox/` (`mailbox()`), `calendar-events.ts`, `drive-files.ts`, `documents.ts`, `assets/` · the cast and case catalog `e2e/CAST.md` · names `e2e/lib/cast.ts`                                                                                                           |
| Shared helpers (`@metis/e2e/lib/*`)                                                   | `e2e/lib/` · client names `e2e/lib/mcp-clients.ts`                                                                                                                                                                                                                                      |
| Seed generators (run the app's own code)                                              | `apps/web/scripts/e2e/generate/index.ts` and siblings · MCP clients and tokens `generate/mcp.ts` → `seedMcpClients` · id rewriting `apps/web/scripts/e2e/stable-ids.ts`                                                                                                                 |
| The recorder                                                                          | `apps/web/scripts/e2e/record/` → supervisor and flags `index.ts` · `catalog.ts` → `catalog`, `SLOTS` · `scheduler.ts` · `spawn.ts` · `worker.ts` · `recorder.ts` → `startRecorder`, `QUIET_MS` · `journal.ts` · `merge.ts` → `mergeOutputs` · `preflight.ts` · scenario bodies `steps/` |
| Recorder outputs                                                                      | `e2e/harness/llm-seed.json` · `llm-manifest.json` (scenario → keys) · `e2e/harness/record/<scenario>.sql` · `e2e/harness/mastra/<scenario>.sql` · journal `e2e/.record/journal.jsonl` (gitignored)                                                                                      |
| Generator scripts                                                                     | `e2e/package.json` → `generate`, `generate:record`                                                                                                                                                                                                                                      |
| CI run (`bun run test` on every `app-v*` release, or by hand on any branch)           | `.github/workflows/e2e.yml`                                                                                                                                                                                                                                                             |
| Fixture values                                                                        | `e2e/.env.fixture` (committed) · `e2e/.env` (real keys, gitignored)                                                                                                                                                                                                                     |

## Rules

### The black box

- **E2E treats the app as a black box.** Tests and fixtures reach it only through its public HTTP API and UI, with generic clients (the packages in `e2e/package.json`, plain `fetch`).
  - They never import app modules or replicate how the server encrypts, stores or generates anything.
  - TOTP: use the secret from the enrollment response with a generic TOTP library.
  - Accounts and connections: call the app's endpoints.
  - Fixtures: talk to IMAP, CalDAV, S3, WebDAV, FTP and SFTP directly with standard clients.
  - A generic client that fails against the app is a server bug.
- **The seed generators are the one place that runs the app's own code**, so they live in `apps/web/scripts/e2e/`; `@metis/e2e/lib` is the only code they share with `e2e/`.
- **The shell smoke tests drive the desktop shell through its windows and OS-level hooks only**: they launch the built `apps/desktop` with the `electron` binary and import nothing from it.
  - `shell.openExternal` is the OS boundary, so it is replaced through `electronApp.evaluate` to capture the sign-in URL instead of opening a browser.
  - The deep link arrives as a second-instance launch argument, as the OS would deliver it on Linux and Windows.
  - That second launch passes `--no-sandbox`, as Playwright's `_electron.launch` does for the first, because a development copy's `chrome-sandbox` is not root-owned and Chromium aborts without it.
  - Each test gets a fresh `XDG_CONFIG_HOME`, which on Linux holds the shell's `userData`, its autostart entry and its scheme registration.
- **A value belongs in `e2e/.env` only if it unlocks something outside the stack** (a paid API, a real account); everything else, including values that look like secrets, is seed data in `e2e/.env.fixture`. Only `generate:record` reads `e2e/.env`.

### Suites

- **A Playwright test performs an action in the UI or asserts what the UI renders; everything else is a Vitest test.**
  - Checking the backend over `rpc` after a UI action belongs to the UI test.
  - A test that only makes HTTP, oRPC, MCP or protocol calls lives in `e2e/api/`, so it needs no browser and no consent page.
- **Testing a tool is separate from testing how a client connects.** The consent page, CIMD and the token endpoint are covered once in Playwright (`write/mcp.spec.ts`, `write/mcp-conformance.spec.ts`); the Vitest suite uses the seeded MCP clients' tokens directly.
  - `generate/mcp.ts` creates the clients through `src/mcp/clients.ts` and signs each access token with the JWT plugin's `signJWT` for the user's stable id.
  - Each tool group has its own client because the MCP route rate-limits per client ([mcp.md](mcp.md)); `api/support/mcp.ts` paces every client under it.
- **The `system` tests share one 2FA rate limit** (`requireTotp`: 10 codes per user and scope in 300 s), so `setSection` waits out a 429's `retryAfterSec` (up to 300 s) and retries.
  - The `system` project's `testTimeout` in `vitest.config.ts` covers two such waits, since a test may call `setSection` twice right after another test's burst of edits.
- **Every MCP tool has exactly one case, in `CASES` or `ALONE`, and a tool without one fails the suite.**
  - The completeness test compares `tools/list` of an all-tools client with the cases; `UNCOVERED` names the tools the stack cannot run.
  - A case asserts the tool's output and undoes what it changed.
  - The groups run concurrently, so a case that adds mail to the inbox goes in `ALONE` and runs by itself after them: "newest mail" reads such as `previewDecision` take arrival order, and an unrecorded message is a replay miss.
- **A driver is tested by switching to it at runtime, the way an owner does.** The cache, runner and mailer chains in `api/system/` go through `dashboard.system.update`.
  - So each step also covers the save's connection check, the rebuilt `sectionCached` driver, the change listeners and, for `bullmq`, the worker picking the change up through the config poll.
  - Each chain ends on the stack's default, so the files after it see the stack they expect.
- **The browser suite runs before the API suite, against the same fresh stack.** `bun run test` is `down`, `up`, `test:browser`, `test:api`.
  - Labels are not seeded: the browser setup's first inbox page classifies the mail, and recorded summary requests carry those labels, so a summary asked for earlier is a replay miss.
  - `mail:decision` also classifies the inbox beyond its first page, after the summaries: the Unread, Starred and label filters list that mail and the list classifies whatever it shows; recording it after the summaries keeps their requests free of those labels.
  - `mail:sent`, `mail:drafts`, `mail:archive`, `mail:spam` and `mail:trash` start from `mail:decision` and record each folder's first page the same way, because the list classifies every folder it shows.
  - Every write in either suite puts back what it changed, and each suite's teardown fails on any replay miss.

### Fakes

- **A small long-running fake is a role of the Go binary in `e2e/fakes/`.** A fake implements the outside service's contract (the updater protocol, Resend's API, CIMD documents), never the app's, so it needs nothing from the TypeScript suites.
  - The `replay` service, which replays recordings with keys the TypeScript recorder computes, stays TypeScript.
  - The updater fake mirrors the Go updater ([updater.md](updater.md)).
- **Outside services are faked inside the stack under their real names; app code is unchanged.** The fake Resend API is the network alias `api.resend.com` with a certificate from the e2e CA, as `mcp-client` is for CIMD; the app keeps calling the hard-coded URL. `replay` answers as `openrouter.ai` and `api.typesafe.ai` the same way (`harness/tls/models.crt`), so the stack's model base URLs are the real ones.

### Recordings

- **Any change to an agent's instructions or resident tools, or to anything else in a recorded LLM or decision request, needs `bun run generate:record` in `e2e/`.**
- **A scenario calls the function the UI's route or procedure calls, never a copy of its body.** A recorded request that differs from the UI's by one byte is a replay miss that was paid for.
  - Chats go through `src/mastra/chat-streams.ts`, classification through `classifyMessages`, smart replies through `generateSmartReplies`, assistant threads through `createAssistantThread`.
  - Only client-side behavior (the list's classify batches, the turn envelope a composer builds) is mirrored in `steps/`.
- **Every upstream answer is in the journal before the app sees it.** `recorder.ts` appends and fsyncs each success to the journal; a crash, a kill or Ctrl-C loses at most the call in flight, and the next run serves journaled answers for free.
- **Only successful answers are recorded.** A 4xx, a 5xx after retries, a mid-stream error or an empty body fails the scenario that asked; 401, 402 and 403 also stop every further call to that upstream for the run.
- **A scenario that does not finish keeps its previous recordings and fragments.** Only a scenario that finished `ok` replaces its key set and its `record/` and `mastra/` fragments; recordings no manifest entry claims sit under `(unattributed)` until a run where every scenario finishes.
- **Scenarios that touch the same external state declare it.**
  - `reads` and `writes` in `catalog.ts` are readers-writer locks (`imap:inbox`, `drive:<kind>`).
  - `slots` cap concurrent holders (`SLOTS`; `ftp-explicit` stays under vsftpd's per-address connection limit), because a refused FTP connection would be recorded as a tool error the replay never sees.
- **The world step converges the stack before anything records.** It removes a leftover late arrival and approval folder, and any error in it blocks every scenario.

### Lint

- **`no-await-in-loop` is off for `e2e/` and for `apps/web/scripts/e2e/`** (`e2e/oxlint.config.mts`, the `scripts/e2e/**` override in `apps/web/oxlint.config.mts`).
  - Playwright steps drive one page, seeds and cleanups write to one shared stack, and polls wait on the previous read, so these loops run in order on purpose.
  - The recorder's scheduler sets its own concurrency through `reads`, `writes` and `slots`.
- **The generic test clients return the shape their caller names, under a `no-unsafe-type-assertion` directive** (`clients/rpc.ts` → `rpcWithCookie`, `tests/fixtures.ts` → `rpcFor`, `api/support/mcp.ts` → `McpSession.ok`, the gateway tests' `v1Json`).
  - The black-box rule keeps the app's schemas out of reach, and the test's assertions check the values; every other read from `replay`, a fake or a file parses with zod.

## How it works

- **`generate`** needs no running stack: it runs the app's code against a scratch database and writes the account, a second member account (Cy, outside Ana's workspace), both 2FA enrollments, connections, seeded workspace state and the MCP clients with their tokens into `e2e/harness/`.
  - Ids are rewritten to stable values (`stable-ids.ts`); the token's `kid` survives because Better Auth's ids are not UUIDs.
- **`generate:record`** runs a supervisor that imports no app code: free preflight checks (time zone, harness files, every test server's port, the OpenRouter key and its credit), then the recorder proxy, then one child process per scenario. Its flags are in `record/index.ts`.
  - Each child gets its own copy of its source database (`from` in `catalog.ts`), its own environment (`env`), a recorder URL `…/s/<scenario>/v1` that attributes every request to it, and a timeout.
  - A child that fails, times out or crashes fails only its scenario; scenarios whose `from` did not finish are `blocked`.
  - Before exiting, a child waits until none of its requests are pending and it has been quiet for `QUIET_MS`, so fire-and-forget calls land; workspace chats first wait for the thread's title (`steps/chats.ts` → `titled`), which Mastra requests only after saving the turn.
  - At the end `mergeOutputs` writes `llm-seed.json` and `llm-manifest.json` atomically, a fragment per finished scenario, and rewrites the journal down to what the seed file does not hold. Ctrl-C kills the children and still merges.
- **`test:desktop`** runs its own Playwright config, separate from `test:browser`, against the stack at `http://localhost:3000`.
  - Setup rejects an address with no Metis server and accepts the app; "App settings" opens the Settings window.
  - Sign-in captures `/native/login`, signs Ana in over HTTP as the API suite's global setup does, posts `/api/auth/native/code` and delivers `metis-suite://auth?…`.
  - It needs `bun run --cwd apps/desktop build` first and runs under `xvfb-run -a`, even on a desktop, so the shell's windows stay off screen and no stray keystroke lands in them; CI does not run it, and neither does `bun run test`.
  - Every launch passes `--ozone-platform=x11`, because Electron 38 and later run as a native Wayland app in a Wayland session and would ignore Xvfb's display.
- **The Maestro flow** checks Android setup and the sign-in screen on an emulator with a development build installed; it is run by hand.
- **`seed` and `replay` are two services on one image.** `replay` starts before preflight and replays recorded model calls, so a run spends no credit and preflight's model checks pass; `seed` runs after preflight's migrations, loads `seed.sql` and every `record/*.sql` into the app database and every `mastra/*.sql` into `sqld-mastra`, seeds the test servers and exits.
