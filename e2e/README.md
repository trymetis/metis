# Metis Suite e2e harness

A throwaway stack (sqld, Dovecot + Postfix, Radicale, RustFS (S3), WebDAV, vsftpd, OpenSSH SFTP, the app, a `seed` service that seeds them and a `replay` service that replays recorded LLM answers and serves the suites' helpers, a service that serves MCP clients' metadata documents, the Cloudflare mail gateway under `wrangler dev`, the Resend gateway with Postgres and a fake Resend API, Redis with an Upstash-compatible HTTP proxy, the BullMQ workflow worker, and a cron that calls the app's workflow tick route every minute) plus two suites that drive it: Vitest (`api/`) for everything that needs no browser, and Playwright (`tests/`) for the UI. The generators that produce its seed data run the app's own code, so they live with the app in `apps/web/scripts/e2e/` (`generate/` and `record/`, one module per step); `bun run generate` and `bun run generate:record` here call them, and they import this package's `lib/` as `@metis/e2e/lib/*`. Run `bun install` from the repository root first. The harness image is built from the repository root (`turbo prune @metis/e2e`), so `compose.yml` points its build context at `..`.

## Images

Every test server is built here from its own Dockerfile, so an update is a reviewable diff, never an opaque new image:

| Service              | Dockerfile                             | Contents                                                                                                                                                     |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mail`               | `mail/`                                | Dovecot and Postfix packages in one container; Postfix only relays Dovecot's submissions over loopback                                                       |
| `caldav`             | `caldav/`                              | Radicale package                                                                                                                                             |
| `s3`                 | `s3/`                                  | RustFS release binary                                                                                                                                        |
| `webdav`             | `webdav/`                              | hacdias/webdav release binary                                                                                                                                |
| `ftp`                | `ftp/`                                 | vsftpd package: plain FTP and explicit FTPS on 21, implicit FTPS on 990                                                                                      |
| `sftp`               | `sftp/`                                | OpenSSH server package, password login, SFTP only                                                                                                            |
| `gateway-cloudflare` | `gateway-cloudflare/`                  | the repository's Cloudflare Email Worker under `wrangler dev`: installed on the `seed`/`replay` Bun image, run on `node:26-slim` because workerd needs glibc |
| `gateway-resend`     | `gateway-resend/`                      | the repository's Resend gateway on the `seed`/`replay` Bun image, storing mail and blobs in the `postgres` service                                           |
| `worker`             | the root `Dockerfile`, target `worker` | the published BullMQ worker image, idle until the runner driver is `bullmq`                                                                                  |

What they trust, and what a change must touch:

- **Base:** `debian:trixie-slim`, pinned by digest in every Dockerfile.
- **Packages:** installed at exact versions from `debian.sources`, which points apt at one `snapshot.debian.org` timestamp. A package cannot move without that timestamp and its version line changing; an upgrade bumps both.
- **Release binaries:** downloaded per architecture and checked against a sha256 written in the Dockerfile, so a swapped file fails the build.

Only eight images come from elsewhere, each pinned by digest: sqld (`ghcr.io/tursodatabase/libsql-server`, the same image production runs), HAProxy (`haproxy`, a Docker Official Image), Node (`node`, a Docker Official Image) for the `gateway-cloudflare` runtime, Redis (`redis`, a Docker Official Image, run with `noeviction` as BullMQ requires), Postgres (`postgres`, a Docker Official Image) for the Resend gateway, SRH (`hiett/serverless-redis-http`, the community Upstash-compatible REST proxy Upstash's docs point to for local work), Bun (`oven/bun`) for the harness, and Go (`golang`, a Docker Official Image) as the builder of the fakes.

### The fakes

`updater`, `resend`, `mcp-client` and `cron` are one static Go binary (`fakes/`, module `github.com/trymetis/metis/e2e/fakes`) in a `scratch` image of about 14 MB, `metis-e2e-fakes`; each service runs it with its role as the command: `updater`, `resend`, `mcp-client` or `cron`. The image has no shell, so their healthchecks run the binary's `health <url>` role. The fake updater registers the handler generated in `apps/updater/gen` (a `replace` directive points the module at `../../apps/updater`), so it serves exactly the protocol the Go updater serves. The image copies `mcp-client/tls/` and `resend/tls/` to `/tls/`. Run `go vet ./...` and `gofmt -l .` in `fakes/` after a change; oxlint and oxfmt do not see Go.

## Environment files

| File           | Committed | Holds                                                                                                                                                                                                                                              |
| -------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.fixture` | yes       | Everything the stack and the generators need: app config, server lists, test-server logins, the sqld key pair and token, the encryption key. These are fixtures for containers that exist only for a test run, so they are seed data, not secrets. |
| `.env`         | no        | Real secrets only. Today that is `LLM_UPSTREAM_KEY`, the OpenRouter key `generate:record` records LLM calls through, and `TYPESAFE_UPSTREAM_KEY`, the TypeSafe key it records decision calls through.                                              |

A value belongs in `.env` only if it unlocks something outside this stack: a paid API, a real account, a shared service. Everything else goes in `.env.fixture`, including values that look like secrets.

No container reads `.env`. Compose interpolates and injects `.env.fixture` only, so the real key never enters the stack. `.env` is needed only to re-record LLM seeds:

```
LLM_UPSTREAM_KEY=sk-or-v1-…
TYPESAFE_UPSTREAM_KEY=apikey_…
```

| Command                        | Reads                                                |
| ------------------------------ | ---------------------------------------------------- |
| `bun run up` / `down` / `logs` | `.env.fixture` (passed to compose with `--env-file`) |
| `bun run generate`             | `.env.fixture`                                       |
| `bun run generate:record`      | `.env.fixture`, then `.env`                          |

Plain `docker compose …` interpolates from `.env`, not the fixture, and stops with `set in e2e/.env.fixture`. Use the scripts, or pass `--env-file .env.fixture` yourself.

## Seed data

- `replay` and `seed` run the same image (`Dockerfile`, `harness/`). `replay` (`harness/replay.ts`) starts first and needs nothing: it replays recorded model calls and serves `/llm-misses`, `/llm-hits`, `/totp`, `/account`, `/pixel/*` and `/console-mail`, so preflight's model checks reach it. `seed` (`harness/seed.ts`) runs once after preflight has migrated the database: it loads `seed.sql` and the recorded fragments, then seeds mail, calendars and files, and exits. The app starts after both.
- `harness/seed.sql` and `harness/enrollment.json` come from `bun run generate`, which needs no running stack: the account, 2FA enrollment, every connection, a `Clients` custom label, `Rebrand` pins on the S3 and WebDAV drives (`Clients/Aozora Ceramics/Rebrand/`), a `Clients/` root restriction on the FTP drive, the `blue` brand, the workflows in `generate/workflow-graphs.ts` (manual, schedule, mail received, Merge, Wait for all, Ask/Branch, an approval, a webhook, and the disabled "Triage new mail": mail received → Ask → Branch → label; their names are in `lib/workflow-seeds.ts` and `lib/late-arrival.ts`) and a scheduled send, all written by the app's own code.
  - A second account, Cy (`E2E_MEMBER_*` in `.env.fixture`), signed up through Ana's invite with 2FA enrolled. Cy is in no workspace of Ana's; the API suite invites Cy where a test needs a member.
  - Manually added MCP clients, one per tool group in `lib/mcp-clients.ts` (every tool on), four for the per-tool checks, one with the default tools (`defaults`), and one for Cy, each with an access token signed for ten years. `enrollment.json` carries the client ids and tokens (`mcpClients`, `member.mcpClient`), and the harness serves them at `/account`.
- `bun run generate:record` runs against the running stack (`bun run up` first) and writes the files below. It runs each scenario in `apps/web/scripts/e2e/record/catalog.ts` in its own process with its own copy of the database, up to five at a time, and calls the same app functions the UI's routes call:
  - `world` first: it removes anything a killed run left behind (the late arrival, the approval folder), opens the first inbox page, marks it read, and adds the mute and read-later rows. Every other scenario starts from its database.
  - `mail:decision` and `mail:llm`: the list's classify batches under the decision classifier and under the LLM classifier, then a summary of every message under those labels. `mail:decision` then classifies the rest of the inbox, which the Unread, Starred and label filters list.
  - `mail:sent`, `mail:drafts`, `mail:archive`, `mail:spam` and `mail:trash`, from `mail:decision`'s database: each folder's first page, classified as the list does it, and a summary of every message on it.
  - `mail:gated`, from `mail:decision`'s database: the two messages the summary-gate test opens by search (`GATED_SUBJECTS`), each classified alone as the search list does, summarized and given smart replies. The chats, workflows, late arrival and MCP calls start from `mail:decision`'s database, as the suite's mail is labelled by the decision classifier.
  - `smart-replies`, the mailbox, calendar and drive chats, the workspace chats (stored, live, each chip, and the approval chat, approved and continued, its folder deleted), `workflows` (the Ask preview and one run of every workflow with a manual or schedule trigger), `late-arrival` (below), and the MCP `summarizeThread` and `previewDecision` calls through their toolkit bodies.
  - The calendar chat's visible range comes from the app's `viewRange` for `CALENDAR_CHAT.date`, and each drive chat's folder path is the drive's root crumb (its account email), as the UI sends them.
  - A scenario that fails, times out or crashes fails alone; it keeps its previous recordings and fragments, the summary lists it, and the run ends with the command that reruns only it (`bun run generate:record --only '<ids>'`). `--plan` shows what a run would have to record without sending anything. The flags and the rules behind this are in `agent-docs/e2e.md`.
- The mail, calendar and drive seed is the cast in `CAST.md`: `seed/mailbox/` builds the 300 messages (`mailbox()`, appended to their folders with their flags in date order), `seed/calendar-events.ts` the Work and Personal events, `seed/drive-files.ts` the shared drive tree on every drive, and `seed/documents.ts` the PDF, DOCX, XLSX and CSV bodies; `seed/assets/` holds the photos and logos.
- The late arrival is `seed/mailbox/late-arrival.ts` → `lateArrival`, outside `mailbox()` so `seedMail` never appends it. The recorder enables "Triage new mail" in its own database, appends the message, records the Ask and the decision classifier for it, then deletes the message. Its runs never leave that database, so the seeded inbox and history stay as they were. `lib/late-arrival.ts` appends and deletes it for both the recorder and the suite.
- `harness/record/<scenario>.sql` come from `bun run generate:record`: the rows only a live run produces, each file holding what its scenario added to its database: `world.sql` the mute and read-later rows, which need real IMAP ids; `workflows.sql` the workflow runs (`workflow_event`, `workflow_run`, `workflow_step_run`, `workflow_wait`; the approval workflow's run stays waiting); every file its `ai_usage`. The harness loads them in name order right after `seed.sql`. Ids stay valid on every fresh stack because the mail container pins `UID_VALIDITY` and the harness appends mail in a fixed order.
- `harness/mastra/chat-workspace-stored.sql` comes from `bun run generate:record`: the stored workspace chat's Mastra database, holding the assistant thread it created (the recorded conversation and its generated title). It is dumped with `CREATE … IF NOT EXISTS` table definitions, since Mastra creates its tables itself, and the harness loads every `mastra/*.sql` into `sqld-mastra`. Opening the thread needs no model call; continuing it does, and has no recording.
- `harness/llm-seed.json` comes from `bun run generate:record`: recorded LLM and decision requests and responses that the harness replays. LLM calls are recorded through OpenRouter and decision calls (`/systemone`) through TypeSafe, so recording spends credit on both; the run prints the OpenRouter credit it spent. A run reuses every recording whose request is unchanged, from this file or from the journal of an earlier run that died (`.record/journal.jsonl`), and sends only new or changed requests upstream. `harness/llm-manifest.json` records which scenario used which recording, so a scenario that finishes drops its stale recordings and one that does not keeps them. `--force '<ids>'` ignores existing recordings for those scenarios; `E2E_LLM_FORCE=1` does it for all.
- The drive tree has one file per preview renderer (PNG, SVG, WAV, Markdown, PDF, CSV, TSV, zip, JSON, a `Dockerfile`) plus the download-only fallbacks (`.pptx`, `.tar.gz`, `.indd`), seeded into every drive on every run.
- The file edge cases (`seed/edge/file-cases.ts`) and the 2,500 bulk files under `edge/bulk-2500/` follow `E2E_EDGE` and are seeded into the S3 bucket only; WebDAV, FTP and SFTP get the drive tree only. The preview edge cases are under `edge/preview/`: 100,000 and 150,000-row CSVs, files just over each preview cap (CSV, Markdown, PNG, PDF, zip, WAV), ragged, BOM, Latin-1, empty and formula CSVs, a 3 MB log, a 2 MB cut through a multi-byte character, a `.txt` full of NUL bytes, an encrypted PDF, an empty zip and a 50,000-entry zip, a WAV with a broken header, and hostile files (`evil.svg`, `evil.html`, `evil.md`, a PDF with an OpenAction script, an HTML `fake.png`, a zip with traversal names). The S3 bucket's CORS allows `GET`, so S3 direct previews succeed; a PUT-only bucket, video, HEIC, Google Drive and OneDrive are not covered.
- `sftp/keys/` holds the SFTP server's fixed host keys. `METIS_SFTP_SERVERS` pins the fingerprint of `ssh_host_ed25519_key.pub`, so regenerating the keys means updating that entry.
- `ftp/tls/` holds the FTPS server's self-signed certificate for `ftp.localhost`. The FTPS entries set `allowInsecureTls`, so regenerating it needs no other change.
- `tls/ca.crt` and `tls/ca.key` are the stack's test CA. It signed `mcp-client/tls/mcp-client.crt` (`mcp.quillmate.app`, `mcp-private.quillmate.app`), `gateway-cloudflare/tls/gateway.crt` (`gateway.localhost`, `localhost`), `resend/tls/api.resend.com.crt` (`api.resend.com`) and `proxy/tls/resend-gateway.pem` (`resend-gateway.localhost`, `localhost`, certificate and key in one file for HAProxy). The app, preflight and Resend gateway containers trust it through `NODE_EXTRA_CA_CERTS`, and so does `bun run test:api`. `tls/generate.sh` reissues every certificate under the CA (and creates the CA when `tls/ca.key` is missing), so a renamed host is one run of it.

## MCP client

The `mcp-client` service (the fakes' `mcp-client` role, `fakes/mcpclient.go`) serves Client ID Metadata Documents, so an MCP client can be taken through `/oauth/consent` as a first-time client without leaving the stack. The suites play the client themselves, on the host (`clients/mcp.ts`; the consent steps in `tests/mcp.ts`).

- `https://mcp.quillmate.app/clients/<name>.json` is a document whose `client_id` is that URL (query string included) and whose one redirect URI is `http://127.0.0.1:47801/callback`; any port on `127.0.0.1` matches it. Every name is its own client, because a client ID one user connected is a conflict for every other user.
- `?cache=<value>` sets the response's `Cache-Control`.
- Broken documents under fixed names: `broken-mismatch`, `broken-oversize`, `broken-redirect`, `broken-slow`, `broken-content-type`, `broken-secret`, and `foreign-redirect` (a redirect URI on another host, which the consent page must name).
- `https://mcp-private.quillmate.app/clients/<name>.json` is the same service on the `default` network, at a private address, which the app must refuse.
- `GET http://localhost:8098/hits` lists `{ path, at }` for every document fetch; `DELETE` clears it.

Start an authorization at the app's `authorization_endpoint` (from `/.well-known/oauth-authorization-server/api/auth`) with a document URL as `client_id`, PKCE and `resource=http://localhost:3000/api/mcp`.

No container needs the internet for this. The app fetches the document itself, through a fetcher that accepts only HTTPS and only hostnames that resolve to public addresses, so the app and `mcp-client` share a third network, `cimd`: it is `internal` like `default`, but its subnet (`11.73.0.0/24`, legacy DoD space in IANA's registry) is outside every special-use range. The network has no route out, so the subnet's real owner is never reached; on the host, the bridge shadows that /24 while the stack runs. There is no public range nobody owns, and an app-side allowlist would bypass the fetcher's SSRF guard.

The client half is not in a container because the issuer and the token audience are `http://localhost:3000/…`, which inside a container is the container itself, and the loopback redirect lands where the browser runs.

## Updater

The `updater` service (the fakes' `updater` role, `fakes/updater.go`) is a fake updater: it serves the real updater protocol (`metis.updater.v1.UpdaterService`, through the handler generated in `apps/updater/gen`) on `/run/metis-updater/updater.sock`, in the `updater-socket` volume the app mounts read-only with `METIS_UPDATER_SOCKET` set, so the dashboard's Updates page and its procedures run unchanged. It moves no containers and copies no database: it keeps the running version, the release list and notes, the undo target, whether the install has snapshots and the last upgrade in memory, and steps an upgrade through pull, snapshot (with snapshots), preflight, switch and ready, and an undo through pull, restore, switch and ready, one step every `stepMs`, answering with the same codes and messages as the Go updater.

- Defaults: running `1.1.0`, releases `1.2.0`, `1.1.0`, `1.0.0`, notes for `1.2.0`, undo target `1.0.0`, snapshots on, `stepMs` `1000`.
- `POST http://localhost:8097/reset` restores them; a JSON body overrides any of `current`, `releases`, `notes`, `rollback`, `snapshots`, `stepMs` and `outcome`, which decides how the next upgrade ends (`succeed`, `preflight-fails` (switched back with snapshots, never installed without), `never-ready` (switched back) or `restore-fails` (needs attention)) and then returns to `succeed`; an undo always succeeds. Reset also brings the socket back up.
- `POST /hold` leaves an upgrade running that never advances, so a second request is refused; `POST /down` and `/up` remove and recreate the socket; `GET /state` returns everything.

The suite drives it through `tests/updater.ts`, and `tests/write/updates.spec.ts` resets it before every test. Each upgrade or undo costs one TOTP code, and `instance-update` allows 10 per user per 5 minutes, which the spec uses exactly.

## Cloudflare gateway

The `gateway-cloudflare` service runs `apps/gateway-cloudflare` under `wrangler dev` with no network access: D1, R2 and `send_email` are wrangler's local simulations, on tmpfs, and `start.sh` applies `schema.sql` to the local D1 before serving. `e2e/gateway-cloudflare/wrangler.jsonc` replaces the deployment's config; `MAIL_DOMAIN` (`inbound.demo.trymetis.email`) and the admin `API_TOKEN` come from `E2E_GATEWAY_DOMAIN` and `E2E_GATEWAY_ADMIN_TOKEN`.

- It serves HTTPS with `gateway-cloudflare/tls/`, because a gateway server entry must be `https://`. The app reaches it as `https://gateway.localhost:8787` (`METIS_CLOUDFLARE_SERVERS`); preflight checks it like any gateway (a 401 from `/v1/health`).
- Mail arrives through wrangler's `POST /cdn-cgi/local/email?from=…&to=…` with a raw message that has a `Message-ID`, which runs the Worker's `email` handler. That endpoint answers only to `localhost`, so the suite calls it at `https://localhost:8787` (`E2E_GATEWAY_URL`), which the certificate also names.
- Nothing is sent: `env.EMAIL.send()` is logged by wrangler and the gateway stores the message in its `sent` folder, which is what the suite checks.
- No address token is seeded. `api/gateway/cloudflare.test.ts` mints tokens through `/v1/tokens` with the admin token and connects a mailbox through the app's own `connections.createCredential`, deleting both afterwards.

## Resend gateway

The `gateway-resend` service runs `apps/gateway-resend` against the `postgres` service (mail and blobs both in Postgres) and a fake Resend API, the `resend` service (the fakes' `resend` role, `fakes/resend.go`). Nothing reaches Resend.

- The fake answers as `api.resend.com`: it is that name's network alias and serves HTTPS with `resend/tls/`, which the e2e CA signed. The gateway, the app's `resend` mailer driver (the `resend` SDK) and the dashboard's Resend check all call `https://api.resend.com` unchanged.
- It implements what those callers use: `POST /emails` (recorded), `GET /domains` and `GET /domains/:id` (one verified domain, `E2E_RESEND_DOMAIN`), and `GET /emails/receiving`, `GET /emails/receiving/:id` and the raw download for inbound mail. Every API call needs `E2E_RESEND_API_KEY`.
- Control, on `http://localhost:8096`: `POST /inbound` with `{ from, to, subject, text }` stores an inbound message and delivers the `email.received` webhook to the gateway, signed with `E2E_RESEND_WEBHOOK_SECRET` the way Resend signs it (svix), and answers with the webhook's status. `GET /sent` lists every `POST /emails`; `DELETE` clears it.
- The gateway serves plain HTTP, so HAProxy terminates TLS for it: the app reaches it as `https://resend-gateway.localhost:8788` (`METIS_RESEND_SERVERS`), and the suite as `https://localhost:8788` (`E2E_RESEND_GATEWAY_URL`). `api/gateway/resend.test.ts` mints address tokens with the admin token and connects a mailbox through `connections.createCredential`, deleting both afterwards.

## Cache, runner and mailer drivers

- `redis` (with `noeviction`) backs both the `redis` cache driver and the BullMQ runner; `srh` puts the Upstash REST API in front of it, so the `upstash` cache driver reaches the same Redis as `http://srh:80`. The suite reads Redis through SRH at `http://localhost:8079` with `E2E_UPSTASH_TOKEN`.
- `worker` is the published BullMQ worker. It loads the stored config, polls it, and stays idle until the runner driver is `bullmq`, so it is the one process in the stack that only learns of a change through the config poll.
- `api/system/` switches each driver through the dashboard's own procedures (`dashboard.system.form` and `update`, one TOTP code each; `instance-config` allows 10 per user per 5 minutes, and `api/support/config.ts` → `setSection` waits out a 429): the cache `memory` → `redis` → `upstash` → `memory`, the runner `internal` → `cron` → `bullmq` → `internal`, and the mailer `log` → `smtp` → `console` → `resend` → `noop` → `log`. Each step checks that the new driver is the one in use, and every chain ends on the stack's default. `api/system/sign-in-alerts.test.ts` switches the mailer to `console` and back to `log` around Cy's sign-ins, so the alert is read from the harness's `/console-mail-hits`.
- The `console` mailer driver posts to `replay`: `POST http://replay:8080/console-mail` with `E2E_CONSOLE_MAIL_TOKEN`, listed at `GET http://localhost:8099/console-mail-hits`.

## Mail delivery

Postfix delivers every recipient on every domain to Ana's inbox, except `*@discard.demo.trymetis.email` and `*@kestrelsupply.com`, which it accepts and drops, and `*@notify.demo.trymetis.email`, which goes to the separate `system` mailbox (IMAP login `system`, Ana's IMAP password). Specs that send mail send to the discard domain, so nothing lands in a folder the app classifies; the instance's own mail under the `smtp` mailer driver goes to the system domain, where `api/system/mailer.test.ts` reads it over IMAP.

## Running the tests

`bun run test` brings the stack down and up again (so every run starts from the seeds), then runs `test:browser` and `test:api`, stopping at the first that fails. The browser suite goes first because its setup classifies the first inbox page, and recorded summaries expect those labels. Both pass `.env.fixture` to the suite and take extra arguments.

- `bun run test:api` runs the Vitest suite against a stack that is already up, on Node with `NODE_EXTRA_CA_CERTS=tls/ca.crt`. Its global setup signs Ana in over HTTP (password, then `replay`'s TOTP), marks the first inbox page read as the browser setup does, and writes the session to `api/.state/` (gitignored); its teardown fails the run on any LLM replay miss. Files run one at a time; inside `api/mcp/tools.test.ts` the tool groups run concurrently, each on its own seeded client. `--project mcp` (or `rpc`, `workflows`, `gateway`, `system`) runs one project.
- `bun run test:browser` runs the Playwright suite on Node with system Chrome (`channel: "chrome"`; nothing is downloaded). `bun run test:browser:ui` opens Playwright's UI mode against a stack that is already up.

The `cron` service (the fakes' `cron` role, `fakes/cron.go`) POSTs `/api/workflows/tick` with `X-Metis-Secret` at the start of every minute. The route answers `404` under any driver but `cron`, so its ticks reach the engine only inside `api/system/runner.test.ts`, which switches the stored runner driver to `cron` through the owner dashboard's procedures, waits for a tick from the container and runs a workflow, then does the same under `bullmq` (checking the tick route answers `404` again) and under `internal`. `CRON_SECRET` in `.env.fixture` is what the container sends; preflight seeds the runner as `internal`, which stores no cron secret, so the test sends the same value when it switches the driver to `cron`.

The desktop shell has its own smoke suite, `bun run test:desktop` (`desktop.config.ts`, `desktop/`), which `bun run test` does not run. It launches the built shell with the `electron` binary against the stack, so run `bun run --cwd apps/desktop build` and `bun run up` first. It needs a display; run it as `xvfb-run -a bun run test:desktop` even on a desktop, so the test windows stay off your screen and your typing cannot land in them. The suite launches Electron with `--ozone-platform=x11`, so this holds in a Wayland session too and, on Ubuntu 24.04 and later, the Chromium sandbox setup `apps/desktop/README.md` points to. Each test gets its own `XDG_CONFIG_HOME`, so it never touches your installed app's settings.

The Android shell has a [Maestro](https://maestro.mobile.dev) flow for setup and the sign-in screen, run by hand: install a development build on an emulator (`bun run --cwd apps/mobile android`), run `adb reverse tcp:3000 tcp:3000` with the stack up, then `maestro test mobile/setup.yaml`.

Playwright:

- Projects, in order: `setup` signs Ana in and opens the first inbox page (as the recorder did); `read` runs in parallel and changes nothing the recordings read; `write` runs in one worker in the order `tests/write/order.list.ts` imports its specs. A failing dependency project skips the ones after it.
- In `setup` and `write` (one worker each), a test fails if it caused an LLM replay miss. In `read` (four workers) a miss cannot be pinned to one test, so the tests running at the time get an `llm-miss` annotation instead; in every project the run fails if any miss happened at all, and `tests/global-teardown.ts` names each distinct missed request (path, model, key, last user text). `GET /llm-hits` lists every replayed request, for specs that prove no request was made.
- `read/chats.spec.ts` runs its tests in order in one worker, and `tests/chat.ts` → `paceChat` keeps its own sends to 15 a minute, under the app's per-user chat limits (20 a minute, shared by the mailbox, calendar and drive chats, and separately for the workspace chat), so the other workers' requests in the same minute still leave a replayed conversation clear of a 429.
- Specs import only Playwright, generic clients (`clients/`) and `@metis/e2e/lib/*`, never `apps/web`. Reports land in `playwright-report/`, artifacts in `test-results/`.

## Server addresses

Every test server has one address that works inside the compose network and on the host, so the app, `seed` and the host-run generators all use the same server entries. `proxy` (HAProxy, TCP mode) is the only container on both networks. Inside the network every `*.localhost` name is one of its aliases; on the host `*.localhost` resolves to loopback, where it publishes the same ports.

| Server                                                                       | Address                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| IMAP · submission                                                            | `imap.localhost:31143` · `imap.localhost:31587`                                                                 |
| CalDAV · S3 · WebDAV                                                         | `caldav.localhost:5232` · `s3.localhost:9000` · `webdav.localhost:6065`                                         |
| FTP and explicit FTPS                                                        | `ftp.localhost:2121`, passive `30000–30009`                                                                     |
| Implicit FTPS                                                                | `ftp.localhost:2990`, passive `30010–30019`                                                                     |
| SFTP                                                                         | `sftp.localhost:2222`                                                                                           |
| Cloudflare gateway (`/v1` · local mail ingest)                               | `https://gateway.localhost:8787` · `https://localhost:8787`                                                     |
| Resend gateway (`/v1`, TLS at the proxy)                                     | `https://resend-gateway.localhost:8788` · `https://localhost:8788`                                              |
| App · replay · MCP client hits · updater control · fake Resend control · SRH | `localhost:3000` · `localhost:8099` · `localhost:8098` · `localhost:8097` · `localhost:8096` · `localhost:8079` |

FTP data connections go to the control connection's host (EPSV), so the proxy forwards each passive range on the same port numbers, and each vsftpd process has its own range. Every FTP client arrives from the proxy's address, which is why vsftpd allows 6 connections per IP: the explicit process serves the app's FTPS and FTP pools (2 + 1) plus a host-run recorder's.
