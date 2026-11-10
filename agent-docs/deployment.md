# Deployment — compose, bootstrap and the Docker images

How an instance is deployed: `compose.yml`, `bootstrap.sh`, the two Dockerfiles and their images, release tags, health endpoints and build traps.
Paths are from the repository root.
See also [AGENTS.md](../AGENTS.md), [updater.md](updater.md), [self-host.md](self-host.md), [workflow-runtime.md](workflow-runtime.md), [database.md](database.md), [configuration.md](configuration.md). The operator-facing install guide is `apps/docs/content/self-hosting/`.

## Code map

| Concern                         | Where                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deployment                  | `compose.yml`                                                                                                                                                                                     |
| Driving it                      | `bootstrap.sh` → `cmd_deploy` · release pins `pin_release`, `latest_release` · the compose download `fetch_compose`                                                                               |
| Health endpoints                | `apps/web/src/app/api/livez/route.ts`, `apps/web/src/app/api/readyz/route.ts` · the database probe `apps/web/src/db/readiness.ts` → `databasesReady`                                              |
| Images                          | `Dockerfile` (`runner`, `worker`, `updater`) · `preflight.Dockerfile` (the preflight image)                                                                                                       |
| Publishing                      | `.github/workflows/docker.yml` → jobs `release`, `build`, `publish` · tags `.github/scripts/image-tags.sh`                                                                                        |
| Release notes                   | `releases/` · each track's `CHANGELOG.md` · `packages/releases/src/index.ts` (`releaseFieldsSchema`, `readReleases`, `publishedNotes`) · `packages/releases/src/cli.ts` (`cut`, `check`, `notes`) |
| Standalone output and tracing   | `apps/web/next.config.ts` → `output` (when `NEXT_BUILD_OUTPUT=standalone`), `outputFileTracingIncludes`                                                                                           |
| One-shot preflight              | `apps/web/scripts/preflight.ts`                                                                                                                                                                   |
| Worker entry                    | `apps/web/scripts/workflow-worker.ts`                                                                                                                                                             |
| License file                    | `apps/web/scripts/licenses.ts` (run by the `tools` stage)                                                                                                                                         |
| Other images built the same way | `e2e/Dockerfile`, `apps/gateway-resend/Dockerfile`                                                                                                                                                |

## Rules

### Compose and bootstrap

- **`compose.yml` is the deployment, and `bootstrap.sh` only drives it.**
  - Compose owns every image default, network and volume.
  - Bootstrap passes only `APP_PORT`, `METIS_INSTALL_DIR` and `COMPOSE_PROFILES`.
- **Every bootstrap deploy re-pins all four images.** `pin_release` writes `APP_IMAGE`, `PREFLIGHT_IMAGE`, `WORKER_IMAGE` and `UPDATER_IMAGE` into `.env` on every run.
  - Precedence: a caller-exported `*_IMAGE`, then `METIS_VERSION`, then the highest `X.Y.Z` app tag in GHCR (`latest_release`).
  - With no release found it warns and pins the rolling `latest*` tags.
  - Between bootstrap runs the updater owns the app's three pins ([updater.md](updater.md)), so re-running bootstrap moves the app too.
- **Bootstrap downloads the `compose.yml` of the release it pinned**, from `https://sh.trymetis.email/v<version>/` ([self-host.md](self-host.md)).
  - Bootstrap starts, stops and retires services by name, and those names must match the pinned images.
  - With the `latest*` tags pinned it downloads the bucket-root `compose.yml`; `COMPOSE_URL` overrides both.
  - So bootstrap, compose and the images always come from one release, and a compose change on `main` never reaches a pinned install.
- **The root stack runs `sqld` (profile `sqld`), the one-shot `preflight`, `app`, the `updater`, and Caddy (profile `proxy`).**
  - The runner defaults to `internal`, so the stack has no worker and no Redis.
  - The `worker` image is published for operators who choose `bullmq`; they run it with their own Redis ([workflow-runtime.md](workflow-runtime.md)).
- **A `.env` whose database URL is one of `LEGACY_SQLD_URLS` is refused, never rewritten** (`refuse_legacy_database_urls`). Those URLs name services this compose file does not run; rewriting them would start the app on empty namespaces while the data sits in a volume this stack does not mount.

### Releases and images

- **Every release is addressable by its version.** On a GitHub release tagged `app-v<version>`, `docker.yml` pushes `:<version>`, `:<version>-preflight`, `:<version>-worker` and `:<version>-updater` beside the `<sha>*` tags.
  - It also pushes the `latest*` tags unless the release is a pre-release.
  - A run by hand (`workflow_dispatch`) pushes `latest*` and `<sha>*` only, and skips `publish`.
  - Releases tagged `desktop-v*` or `mobile-v*` build no images ([downloads.md](downloads.md)).
- **A pre-release image is reachable only by pinning it.** `latest_release` and the updater's `fetchReleases` accept only `X.Y.Z` tags.
- **An `app-v*` tag must match `apps/web/package.json` → `version`, and `releases/app-v<version>.md` must exist with notes; `docker.yml` fails the run before building otherwise.**
  - `bun run release:notes <tag>` checks the file and prints its published notes, which is also how the release body is written (`gh release create app-v<version> --verify-tag --notes-file …`).
  - The updater shows that body as the release's notes on Dashboard → Updates ([updater.md](updater.md)).
  - That field is the version the app shows beside its source link on every platform, including hosts no tag reaches ([ui.md](ui.md)).
- **Every release's notes are one file in the root `releases/` folder, `<track>-v<version>.md` for the `app`, `desktop` and `mobile` tracks; the track and version come from the file name, and the YAML frontmatter holds the fields `releaseFieldsSchema` allows (`date` is required).**
  - Each track's `CHANGELOG.md` holds `## Unreleased`, then `## Releases`, a list of that track's files, newest first.
  - `@metis/releases` is the only reader: the docs changelog page, the CLI and CI all parse files through `readReleases`, so a new field is one schema line.
  - `bun run release <tag>` moves `## Unreleased` into the new file and adds its list line; it never bumps versions, commits or tags.
  - `bun run release:check` runs in CI and fails on a misnamed file, frontmatter the schema rejects, empty notes, or a list that differs from the files.
- **What a release publishes is `publishedNotes(release)`, never the raw file.** The GitHub release body and every `v<version>/release.md` come from `bun run release:notes <tag>`, so fields reach published notes only through that function.
  - The `release` and `publish` jobs install only this package (`bun install --filter @metis/releases`).
  - Bump it in the commit the tag points at.
- **The updater is the only container with the Docker socket**, and the app reaches it only through its socket ([updater.md](updater.md)).
- **Preflight is its own image and a one-shot service.** The app and worker wait on it with `service_completed_successfully`.
  - As the app's entrypoint it would re-run the whole server verification and quarantine pass on every restart.
  - It would also turn a failed schema load into a crash-loop instead of one non-zero exit the operator sees.
- **The worker is a separate image because it needs a real `node_modules`** (libSQL's native binding, `bullmq`, `ioredis`), which `.next/standalone` is not. It fails loudly and exits instead of crash-looping inside the web container.
- **Every image builds with the repository root as context**, because each one starts from `turbo prune`.
- **The sqld image is pinned by digest (`SQLD_IMAGE`).** Its version tags do not match what `latest` reports, so patches arrive by bumping the pin and re-running bootstrap.

### Health

- **Health follows the Kubernetes convention and answers with a status code only.**
  - `/api/livez` answers 200 while the process serves requests.
  - `/api/readyz` answers 200 only when `config` resolved and `select 1` succeeds on both the app and Mastra connections within `PROBE_TIMEOUT_MS`; otherwise 503.
  - The readiness failure reason goes to the log once per distinct error (`[readyz]`).
  - A verbose form sits behind `ownerSession`.

### Build traps

- **The preflight image carries only `preflight.mjs` and `libsql`.**
  - `preflight.Dockerfile` bundles everything else into `preflight.mjs`, including every migration, `@libsql/client`, `ws`, `ssh2` and `ssh2-sftp-client`.
  - `libsql` stays external because it loads its native binding from a target computed at runtime.
  - `cpu-features` stays external because ssh2 loads it, like its own `sshcrypto.node`, inside a `try/catch`; neither addon is built in these images, so ssh2 uses pure-JS crypto.
- **The preflight image installs `libsql` fresh, at the exact version `bun.lock` pins.**
  - The `modules` stage reads the version from the pruned lockfile and installs with `--production --ignore-scripts --linker hoisted`.
  - Only the musl binaries are kept (`rm -rf node_modules/@libsql/*-gnu*`), because the runtime is Alpine.
- **Never "clean up" the libsql entries in `next.config.ts`.** Without them the app boots and dies on the first query looking for a `.node` file.
  - `libsql/index.js` resolves its binding through `@neon-rs/load` from a runtime target (`currentTarget()` + `detect-libc`), so output-file tracing cannot find it ([vercel/next.js#97973](https://github.com/vercel/next.js/issues/97973)).
  - `outputFileTracingIncludes` force-includes it from Bun's isolated store (globs resolve from `apps/web`).
  - `libsql` and `@libsql/client` stay in `serverExternalPackages`.
- **The builder stage runs `next build` on node.** Bun segfaults tearing down after a Next 16 + Turbopack build in a container ([oven-sh/bun#36866](https://github.com/oven-sh/bun/issues/36866)); the build finishes and then dies, so `RUN` discards a complete `.next/standalone`.
- **Declare every peer a dependency needs in the workspace that uses it** (`@tiptap/suggestion` for `@tiptap/extension-mention`). `turbo prune @metis/web` drops auto-installed peers, so `next build` in the image fails with `Module not found`.
- **`better-sqlite3` must stay out of `trustedDependencies`.** Bun runs `node-gyp rebuild` for a trusted package with a `binding.gyp`, which needs Python, and the Alpine `deps` stage has none.
- **`apps/web/.env.example` must validate as a whole.** The builder copies it to `.env` for `next build` and deletes it from the standalone output afterwards; `@/config` validates it when page-data collection first imports it ([configuration.md](configuration.md)).
  - The build never reads the database: `instrumentation.ts` skips loading the stored config during `phase-production-build`.
- **A Vercel deploy needs `NODE_OPTIONS=--experimental-require-module` in the project's environment.**
  - Next never bundles jsdom (it is on Next's built-in external list), so `isomorphic-dompurify` loads it from `node_modules`, and its `html-encoding-sniffer` `require()`s the ESM-only `@exodus/bytes`.
  - Node allows `require()` of ESM by default and the images' `node:26-alpine` runtime needs no flag, but Vercel turns it off, so every route that sanitizes mail HTML fails with `ERR_REQUIRE_ESM`.
- **The worker bundle is `workflow-worker.mjs`, with `ssh2`, `ssh2-sftp-client` and `@opentelemetry/api` external.**
  - `.mjs` because the standalone `package.json` has no `"type": "module"`.
  - Under the isolated layout `ssh2` resolves only from inside `ssh2-sftp-client`, so both stay external with the native and Redis packages.
  - `@opentelemetry/api` is not installed: `posthog-node`, which Mastra brings into the worker for the AI steps, imports it as an optional peer with a dynamic `import()` inside a `try/catch`. The bundler fails on the unresolvable specifier, so it stays external, and at run time the import fails and is caught.

### sqld

- **One sqld holds both databases as namespaces** (`--enable-namespaces`): `app` and `mastra`, each its own SQLite file ([database.md](database.md)).
  - sqld picks the namespace from the Host subdomain, so the service carries the network aliases `app.sqld` and `mastra.sqld`.
  - One JWT key authorizes both.
- **sqld's admin API requires `SQLD_ADMIN_KEY` and is published only on `127.0.0.1`, on an ephemeral host port.**
  - It can create and delete namespaces, so without the key any local process could drop a database.
  - The ephemeral port avoids colliding with whatever already uses 9090.
- **Bootstrap creates the namespaces before preflight runs**, because the sqld image has no curl and preflight needs the `app` namespace.

## How it works

- **Bootstrap (`cmd_deploy`).**
  - On a fresh host it installs Docker and writes `/opt/metis-suite/.env` (mode 600; `INSTALL_DIR` overrides the path).
  - It pins the release (`pin_release`, which also sets `RELEASE_VERSION`), then downloads and validates `compose.yml` (`fetch_compose`).
  - `deploy_stack` runs `pull`, retires the services whose profile is off (`retire_inactive_services`) and runs `up -d --remove-orphans`.
  - `up -d` recreates only services whose image or config changed, so a redeploy leaves an unchanged sqld running.
- **Preflight** (`bun run --cwd apps/web preflight`, idempotent, once per deployment; `--conditions=react-server` because `credentials.ts` imports `server-only`) runs in order:
  - applies pending migrations, creating the schema of an empty database from `0000_baseline` ([database.md](database.md));
  - seeds the stored config when the table is empty, else warns where the environment differs ([configuration.md](configuration.md));
  - creates or revises the system workflows (`ensureSystemWorkflows`, [workflow-graph.md](workflow-graph.md)), so ticks only run work;
  - probes every server and OAuth client in the stored config (`verifyConnectServers`, [servers.md](servers.md));
  - checks the decision model when a decision feature is on;
  - runs `backfillServerIds` and `reconcileQuarantine` ([connections.md](connections.md));
  - records every warning for the dashboard's Deploy checks ([dashboard.md](dashboard.md)).
  - It warns on a failed probe and exits non-zero only when the run itself fails (a failed or unknown migration, a database error), so one bad server never blocks a deploy.
- **Profiles from the `.env`** (`compose_profiles`): `sqld` when `METIS_DB_DRIVER=sqld` and `DATABASE_URL=http://app.sqld:8080`; `proxy` (`caddy`) when `METIS_DOMAIN` is set.
  - Bootstrap writes `METIS_DB_DRIVER=sqld` with the two namespace URLs unless `turso` is exported; `turso`, or `sqld` at an external URL, leaves the stack's sqld off.
- **Bootstrap resolves only the env-only variables** (domain, auth URL and secret, encryption key, database variables, relay secret, setup code, owner), generating or prompting where needed.
  - Every variable in `PASSTHROUGH_VARS` is copied into `.env` only when it is exported, so the first seed uses it ([configuration.md](configuration.md)).
- **Namespaces.** With the `sqld` profile, `deploy_stack` runs `create_sqld_namespaces` first: `compose up -d --wait sqld`, then `POST /v1/namespaces/<ns>/create` on the admin port for `app` and `mastra`. A response saying `already exists` counts as success, so redeploys are idempotent.
- **`bootstrap.sh domain <host>`** writes `METIS_DOMAIN` and `BETTER_AUTH_URL=https://<host>` and redeploys. Caddy obtains the certificate on the first request, so ports 80 and 443 must be reachable.
- **The app publishes only `127.0.0.1:${APP_PORT}`.** With a domain it is reached through Caddy; without one, through an SSH tunnel.
- **The containers read `.env` with `format: raw`**, so values reach them verbatim with no `$` interpolation.
- **sqld** keeps both namespaces in the `metis_sqld` volume and is health-checked with `GET /health` over bash's `/dev/tcp`, because the image has no curl or wget.
  - Preflight waits for it with `service_healthy` and `required: false`, so a Turso deployment with the profile off still starts.
- **Published images.**
  - `runner` serves `node apps/web/server.js` from the standalone output, which mirrors the repository layout because `outputFileTracingRoot` is the repository root.
  - `worker` carries the full install and `workflow-worker.mjs`.
  - `updater` is the `metis-updater` binary on `docker:29-cli`, which ships the Docker CLI and the compose plugin it calls.
  - `docker.yml` builds one matrix job per image, each with its own build cache scope.
- **A deployment needs `runner`, `preflight` and `updater`, plus sqld unless the databases are elsewhere.**
- **A platform that builds from source uses `apps/web` as the project root and `bun run preflight && bun run start` as the start command**; the images build from the repository root (`docker build --target runner .`).
