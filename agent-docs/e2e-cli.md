# CLI end-to-end tests

The `metis` CLI suite in `e2e-cli/`: how its stack installs Metis with the real CLI on a Docker-in-Docker host, the releases and stand-ins `bun run up` publishes, what the browser, API and CLI suites check and in which order, and what the suite borrows from the web suite.
Paths are from the repository root.
See also [AGENTS.md](../AGENTS.md), [e2e.md](e2e.md) (the black-box rule, the web stack, the seed and replay services), [cli.md](cli.md), [updater.md](updater.md), [self-host.md](self-host.md) (the CI job), `e2e-cli/README.md` (running it), `e2e/E2E_MISSES.md` (what neither suite covers).

## Code map

| Concern                       | Where                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scripts                       | `e2e-cli/package.json` → `up`, `down`, `test`, `test:browser`, `test:api`, `test:cli`, `logs`                                                                                                                       |
| The stack                     | `e2e-cli/compose.yml` (project `metis-e2e-cli`) · `bun run up` → `e2e-cli/stack/up.ts` → `up`, `installStack`, `seed`                                                                                               |
| The CLI host                  | `e2e-cli/cli-host/Dockerfile` (`docker:dind`), `start.sh` · helpers `e2e-cli/clients/hosts.ts` → `shell`, `metis`, `docker`, `status`, `install`, `fresh`, `waitReady`                                              |
| Releases built for the stack  | `e2e-cli/stack/build.ts` → `buildStack`, `publishImages`, `publishSite`, `Site`, `TRUST` · `e2e-cli/stack/artifacts.Dockerfile` · `e2e-cli/stack/tar.ts` → `tar`                                                    |
| Release versions              | `e2e-cli/lib/releases.ts` → `releases`                                                                                                                                                                              |
| The stand-ins (one Go binary) | `e2e/fakes/` ([e2e.md](e2e.md)) → `standin.go` (`runServe`, `hostRouter`, `loadCertificates`) · `sh.go` · `githubraw.go` · `cloudflare.go` · `aws.go` · `registry.go` · `calls.go` (the `/calls` log) · `*_test.go` |
| Certificates                  | `e2e/tls/` ([e2e.md](e2e.md)) · HAProxy `e2e-cli/proxy/haproxy.cfg`                                                                                                                                                 |
| The e2e CLI build             | `apps/cli/cmd/metis/e2e_trust.go` ([cli.md](cli.md)) · `e2e_trust_test.go`, run by `.github/workflows/ci.yml`                                                                                                       |
| The browser suite             | `e2e-cli/playwright.config.ts` · `e2e-cli/tests/` → `sign-in.setup.ts`, `updates.list.ts`, `updates.spec.ts`                                                                                                        |
| The API suite                 | `e2e-cli/vitest.api.config.ts` · `e2e-cli/api/updates.test.ts` · `e2e-cli/clients/updates.ts` → `updates`, `settled`, `backTo`                                                                                      |
| The CLI suite                 | `e2e-cli/vitest.config.ts` · `e2e-cli/cli/suite.test.ts` (run order) · one module per area in `e2e-cli/cli/`                                                                                                        |
| CLI suite helpers             | `e2e-cli/cli/support/` → `browser.ts` (`withPage`, `withAnaPage`), `database.ts` (`createNamespaces`, `query`, `fingerprint`), `fakes.ts`, `maintenance.ts`, `remote.ts`, `session.ts`                              |
| Borrowed from the web suite   | `@metis/e2e` → `clients/*`, `api/support/*`, `tests/*` (`e2e/package.json#exports`) · test servers and gateways in `e2e/` · the harness image `e2e/Dockerfile`                                                      |
| Fixture values                | `e2e-cli/.env.fixture` (committed) · `e2e-cli/lib/env.ts` → `env`                                                                                                                                                   |
| CI                            | `.github/workflows/cli.yml` → `smoke` ([self-host.md](self-host.md))                                                                                                                                                |

## Rules

### The black box

- **The suite reaches Metis the way an operator does: through the `metis` binary on `cli-host`, the public HTTP API and the UI.** It follows the black-box rule in [e2e.md](e2e.md) and imports nothing from `apps/`.
  - On `cli-host` it reads what the CLI documents (`metis status --json`, `metis.json`, `.env`, `caddy/Caddyfile`, the exports folder) and uses the host's own tools (`docker`, `curl`, `iptables`, `sqlite3`) to inspect or break the install.
  - It reads repository files only to know what to expect: versions from `releases/` and `apps/web/package.json`, migration names from `apps/web/migrations/`, the pinned images from `apps/cli/internal/catalog/services.yml`.
- **`e2e-cli/.env.fixture` is seed data, like the web suite's fixture, and carries no `DATABASE_URL`**: the install makes its own databases and keys. `e2e-cli/lib/env.ts` parses only the keys this suite reads itself.

### The stack

- **Compose holds only what is outside a Metis install; the install itself is made by the `metis` CLI on `cli-host`, a Docker-in-Docker server.**
  - The test servers, the three gateways and `replay` are built from `e2e/` unchanged, so a change to one of them reaches both suites.
  - Every outside database is a namespace on the one compose service `sqld-external`: the two gateways' (`resend`, `ses`, made by `sqld-namespaces` before they start) and the pairs the database tests move to, because a database the server does not run is outside the install.
- **The two suites share `e2e/fakes/` and `e2e/tls/`.** `FAKES` in `e2e-cli/compose.yml` names the stand-ins this stack starts, and every certificate, this suite's included, is a folder of `e2e/tls/` issued by `e2e/tls/generate.sh`.
- **Both stacks can be up at once.** This stack publishes only `localhost:30050` to `30054` (the app, `replay`, the stand-ins' control, the registry and ttyd), and `E2E_APP_URL` and `E2E_HARNESS_URL` in `e2e-cli/.env.fixture` point the shared helpers (`e2e/clients/harness.ts` → `APP`, `HARNESS`) at them.
  - Everything else the web stack publishes stays inside this stack's network, where the install and the seed reach it under the same names and ports.
- **The stack's Redis is `cache-redis`.** The install's Valkey is `redis` on the install's own network and would shadow that name for the app, so the fixture points at `cache-redis`, which `srh` fronts.

### Releases and images

- **Every release the updater sees is published to the stand-ins, and all but `previous` are built from the working tree** (`stack/build.ts`).
  - `previous` is the newest `releases/app-v*.md`; its three published images come from `ghcr.io/trymetis/metis`, so the migration test starts from what servers run and `bun run up` fails when they cannot be pulled.
  - `current`, which the stack installs, is the version in `apps/web/package.json`, or the next patch when that version is already published, so it is always newer than `previous`.
  - `next`, a release whose preflight exits 1, one whose app never listens and one whose `metis.json` needs a newer CLI are derived from `current` (`lib/releases.ts` → `releases`).
  - `cli` is the newest `releases/cli-v*.md` and `cliNext` its next patch; both are built from `apps/cli`, and the site's `cli/version.txt` names `cliNext`, so `self-update` has a newer CLI to take.
- **Only the test build trusts the test CA.** The app, preflight, worker and Resend gateway images get one layer that copies `e2e/tls/ca.crt` in and sets `NODE_EXTRA_CA_CERTS` (`TRUST`); the CLI and the updater trust it through the `-tags e2e` build ([cli.md](cli.md)).
- **Third-party images reach the install only from the registry stand-in**, which answers as `ghcr.io`, `registry-1.docker.io` and `gcr.io`; every `bun run up` copies the catalog's pinned images into it with `crane copy`, keeping their digests.
- **The build writes no file outside Docker, and nothing published survives `bun run down`.**
  - The Dockerfiles that add the CA layer reach `docker build` on stdin; images are pushed to the registry stand-in through `E2E_REGISTRY` (`127.0.0.1:30053`).
  - `artifacts.Dockerfile` builds the two `-tags e2e` CLIs and the Cloudflare and SES gateway zips, and its output streams as a tar into `fakes` through `docker compose cp -`.
  - The small release files (`bootstrap`, each `metis.json` and its notes, each `version.txt`) are a tar built in memory (`stack/tar.ts`) and copied the same way.

### Stand-ins

- **Every outside service the CLI and the install call is a stand-in in the one `fakes` binary, routed by host name on `:443`.** `hostRouter` picks the handler by `Host`, and the certificate is picked by SNI from the folders `loadCertificates` reads under `/tls/`; the host names are `fakes`' network aliases in `e2e-cli/compose.yml`.
  - Control APIs sit on `:8080` under each stand-in's name (`E2E_FAKES_URL`, `localhost:30052` on the host), the SES function URL on `:8081`, and the cron ticks run in the same process.
- **A stand-in implements the outside service's contract and answers only the calls the CLI and the gateways make**, so a CLI change that calls another endpoint fails against it until the stand-in answers that endpoint.
  - State lives in the `fakes` container (the registry's blobs on its disk), so an add followed by a remove works; Cloudflare, Resend and AWS list every call at `GET /calls`, which the tests read through `cli/support/fakes.ts`.
  - The GitHub stand-in serves only the gateway files `fakes/Dockerfile` copies in; the repository is never mounted, so no other file can be read through it.
- **The `:443` server speaks HTTP/1.1 only** (`TLSNextProto` in `standin.go`), because the registry library handles one upload at a time and parallel uploads on one HTTP/2 connection stall every push.

### Suites

- **`bun run test` is `down`, `up`, `test:browser`, `test:api`, `test:cli`; the CLI suite runs last because it changes the install and then replaces it.** Any suite after it needs `bun run down` and `bun run up` first.
- **The browser and API suites test the dashboard's updates against the real updater and leave `current` running.** They reuse the web suite's sign-in, fixtures and helpers through `@metis/e2e`.
- **The CLI suite is one Vitest file that runs one module per area in a fixed order** (`cli/suite.test.ts`), so the stack stays usable as long as it can and each step knows what the previous one left.
- **A page that exists only in the middle of that order is checked from the same file** with Playwright's `chromium` on system Chrome (`cli/support/browser.ts`), signed in with a cookie from an HTTP sign-in (`cli/support/session.ts`).
- **`no-await-in-loop` is off in `e2e-cli/oxlint.config.mts`**, as for the web suite ([e2e.md](e2e.md)): commands and polls run in order on one host.

## How it works

- **`bun run up`** (`stack/up.ts` → `up`) starts `fakes` and `proxy`, runs `buildStack`, starts the rest of the compose services, installs Metis on `cli-host`, seeds it, and prints the services' states.
- **The install** (`installStack`) writes `/opt/e2e/stack.env` on `cli-host` (the fixture without the keys `STACK_ONLY` names), fetches the real `bootstrap` from the `sh` stand-in, pins the e2e CLI with `METIS_CLI_VERSION`, and runs `metis setup` with `--with updater,worker`, the `current` version and that env file.
  - `metis setup` writes the env file's lines after the components' own, so the fixture's `internal` runner holds and the installed worker idles until a test switches the runner.
- **`cli-host`** trusts the CA in its system store and in `/etc/docker/certs.d/` for each registry name.
  - `install` in `clients/hosts.ts` passes `--app-port` so the install's own address is the one the host reaches, `http://localhost:30050`; `socat` forwards `:3100` to that port with `backlog=1024`, and `proxy` publishes it. socat's default backlog of 5 makes `proxy` drop connections when a test opens many at once.
  - `bun run up:ss` installs on the CLI's default port instead (`E2E_CLI_APP_PORT`), because the terminal screenshots run `bootstrap` the way an operator types it.
  - `start.sh` removes the `ndots` option from `/etc/resolv.conf` before `dockerd` starts, because Docker's inner resolver forwards a single-label name such as `caldav` to the outer one only while no `ndots` option is set.
- **The seed is the web suite's** ([e2e.md](e2e.md)). `seed` stops the app and the workers, runs the harness image (pushed as `registry.localhost/metis-e2e/harness`) on the install's `metis` network with the fixture and the install's `.env`, then runs `metis restart` for `app` and `worker`.
  - The app and the workers are stopped because a running workflow runner would take its feeds' first reading while the mail and calendars are half seeded.
- **The browser suite** signs Ana in (`tests/sign-in.setup.ts`), then runs `tests/updates.spec.ts` through `updates.list.ts`: an upgrade to `next` and its undo, a failing preflight, a release that never becomes ready, one that needs a newer CLI, an upgrade the updater did not finish, and an updater that stops answering.
  - For the unfinished upgrade it drops `cli-host`'s connections to the registry so the pull hangs, then kills `metis-updater` mid-upgrade.
- **The API suite** (`api/updates.test.ts`) checks the updater's refusals as oRPC errors and an upgrade refused while another runs; its `afterAll` undoes back to `current`.
- **The CLI suite** runs the commands that keep the install usable first and ends that part with the install's own export; an update that needs attention then breaks the install.
  - After that, `fresh` empties the machine for remote mode, and the later modules restore the export onto it, move its databases, and install fresh again for the remote export, the migration test and `/setup`.
  - Maintenance is checked as an operator causes it: `config set METIS_MAINTENANCE` freezes the app, and `cli/support/maintenance.ts` checks the pages, the JSON 503s and the health checks.
  - `cli/update.ts` runs `metis update` on an install with a domain and probes through Caddy from `cli-host`: every request is answered, with the maintenance 503 during the snapshot, preflight and switch steps; one shell call reads `metis.json`, probes and reads it again, so a sample counts only when the step did not change around it.
  - `cli/update.ts` reads the upgrade's step from `metis.json` before and after each probe of the app, so a 503 is tied to the `SNAPSHOT` and `PREFLIGHT` steps.
  - The needs-attention case runs `metis update` with a short `METIS_UPDATER_READY_TIMEOUT` and removes the pending snapshot while the update waits for readiness, so the restore fails.
  - The gateway modules check the calls the stand-ins logged and the server entries in `.env`; `domain set` is checked over HTTPS on `cli.localhost` once `cli-host` trusts Caddy's local root (`cli/domain.ts` → `trustCaddy`).
  - Remote mode runs on a machine with only the CLI (`cli/support/remote.ts` → `installCliOnly`), and `gateway token --endpoint` goes to the compose `gateway-resend`.
  - `db move` goes from the install's sqld to one outside pair and on to a second; `createNamespaces` makes each pair through sqld's admin API, reached as `NAMESPACE.sqld-external:8080`.
  - The remote export reads the second pair with `db export --env-file --force` on a machine with no install, `db load` fills a third pair, and `fingerprint` compares every table's row count and `sqlite_sequence`.
  - The migration test installs the published `previous`, updates to `current`, and reads `schema_migration` over the install's sqld before and after, so it sees which migrations preflight applied.
  - The last module installs `current` fresh and takes `/setup` through the printed setup code, the owner's account and 2FA enrollment.

## Deliberate limits

- **The stack builds the CLI for the host's architecture only** (`TARGETARCH` in `artifacts.Dockerfile`), so `bootstrap` on `cli-host` finds only that binary.
- **`bun run up` needs the network**: the published `previous` images, the catalog's pinned images and the build stages' base images are pulled from their real registries.
- **The commands and states the suite does not reach are listed in `e2e/E2E_MISSES.md`.**
