# The `metis` CLI — installing and running a server

The Go binary that installs Metis on a Linux server, adds and removes its components, runs the dashboard's updater, and sets up Google and the three mail gateways, on the server or from any machine. Paths are relative to `apps/cli/` unless they name another folder.
See also [AGENTS.md](../AGENTS.md), [deployment.md](deployment.md), [updater.md](updater.md), [self-host.md](self-host.md), [configuration.md](configuration.md), [gateways.md](gateways.md), [database.md](database.md).

## Code map

| Concern                         | Where                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands, modes and root checks | `cmd/metis/main.go` → `checkMode`, `modes`, `needsRoot` · one file per command group in `cmd/metis/`                                                                                                     |
| Setup and the release pin       | `cmd/metis/setup.go` → `runSetup`, `setupForm`, `pinRelease` · `internal/updater/meta.go` → `NewestCompatible`, `FetchMeta`, `CLISatisfies`                                                              |
| Mode detection                  | `internal/mode/mode.go` → `Detect`, `Record` (`/etc/metis/install-dir`)                                                                                                                                  |
| `metis.json` and its lock       | `internal/state/state.go` → `State`, `Load`, `Update`, `Create` · `lock_unix.go` → `Acquire`, `TryAcquire`                                                                                               |
| The service catalog             | `internal/catalog/services.yml` (embedded, compose format) · `catalog.go` → `Load`, `Environment`, `Order`, `Pins`                                                                                       |
| The stack engine                | `internal/stack/stack.go` → `Plan`, `Apply`, `Maintenance`, `RunOnce`, `Wait`, `Pull`, `Exec` · `spec.go` → `BuildSpec`, `Hash`, labels · `engine.go` → `Engine`                                         |
| Env files                       | `internal/envfile/envfile.go` (raw `KEY=VALUE`, mode 600)                                                                                                                                                |
| Secrets and the sqld key        | `internal/secrets/secrets.go` → `Token`, `EncryptionKey`, `NewSqldAuth`                                                                                                                                  |
| sqld namespaces                 | `internal/sqld/sqld.go` → `CreateNamespaces`, `DeleteNamespace`                                                                                                                                          |
| Components and a change         | `internal/components/components.go` (sqld, caddy, redis, worker, objstore) · `updater.go` (the updater and its systemd unit) · `gateways.go` · `install.go` → `Install`, `Runner.Change`, `Runner.First` |
| Dashboard-setting keys          | `internal/components/keys.go` → `InstanceKeys` (checked against `apps/web/src/config/sections.ts` by `keys_test.go`)                                                                                     |
| The Caddyfile                   | `internal/caddy/caddy.go` → `Sites`, `Write`                                                                                                                                                             |
| Docker install                  | `internal/docker/docker.go` → `Ensure`, `Install`                                                                                                                                                        |
| Integrations                    | `internal/google`, `internal/cloudflare`, `internal/resend`, `internal/ses` · artifacts and tokens `internal/gateways`                                                                                   |
| Export and import               | `cmd/metis/export.go` · `internal/keys`, `internal/archive`, `internal/hrana`, `internal/dbcopy`, `internal/export` ([export.md](export.md))                                                             |
| Config, Google, gateway tokens  | `cmd/metis/config.go` → `runConfig`, `runRemoteConfig` · `google.go` → `connectGoogle` · `components.go` → `newGatewayCommand`                                                                           |
| Self-update                     | `cmd/metis/selfupdate.go`                                                                                                                                                                                |
| Forms and output                | `internal/ui/ui.go`                                                                                                                                                                                      |
| The release track               | `CHANGELOG.md` · `bootstrap.sh` (the shim) · `licenses.tpl` · `.github/workflows/cli.yml` ([self-host.md](self-host.md))                                                                                 |

## Rules

### Modes

- **The mode is decided once per run by whether `/etc/metis/install-dir` exists.** It names the install folder (`/opt/metis-suite` unless `metis setup --dir` chose another).
  - **Server mode**: Linux (amd64 or arm64) with Docker; every command that changes the server runs as root.
  - **Remote mode**: any machine, no root, no Docker needed. Anything but the commands below stops with "This machine has no Metis install".
  - Remote commands touch only outside services: `connect google`, `config set` and `unset` with `--env-file`, the gateway commands with `--remote` or `--endpoint`, `gateway token` with `--endpoint`, `sqld-auth`, `version` and `self-update`.
  - The export commands run in both modes: `keygen`, `db export` with `--env-file`, `db load`, `export decrypt` and `export inspect` ([export.md](export.md)); `db export` without `--env-file`, `db move` and `export recipients` run only on a server, as root.
  - The macOS and Windows builds always run in remote mode.
- **A remote command takes what it needs from flags or `--env-file` and caches nothing.**
  - Commands that run a server release's artifact away from a server (the preflight image for `config set`) take `--version X.Y.Z`, because the app does not expose its version.
  - The gateway commands take the gateway's own newest release unless `--version` names one.
- **Fresh installs only.** `metis setup` refuses a folder that is not empty and a machine that already has an install; nothing reads or converts a bootstrap or compose install.

### The install folder

| Path                                                                                        | What it is                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `metis.json`                                                                                | The state: components and their options, the app's pinned images, the updater's record. Mode 600, no secrets |
| `metis.lock`                                                                                | The `flock` target of every mutating command and the updater                                                 |
| `.env`                                                                                      | The app's environment, mode 600                                                                              |
| `env/objstore.env`, `env/sqld-resend.env`                                                   | RustFS's keys; `sqld-resend`'s JWT key                                                                       |
| `env/gateway-resend.env`, `env/gateway-cloudflare-DOMAIN.env`, `env/gateway-ses-DOMAIN.env` | Each gateway's environment or admin `API_TOKEN`                                                              |
| `Caddyfile`                                                                                 | Written from the components that need a public host                                                          |
| `exports/`                                                                                  | Export archives `sudo metis db export` writes, mode 700 ([export.md](export.md))                             |
| `snapshots/pending`, `snapshots/current`                                                    | The updater's sqld snapshots ([updater.md](updater.md))                                                      |
| `cache/gateways/VERSION/`                                                                   | Downloaded gateway zips                                                                                      |

- **Secrets live only in the env files.** `metis.json` holds names, versions, ids and options.
- **`metis.json` also holds `exportRecipients` (public key PEMs) and `running` (an export or a database move in progress)**, so a command that finds the lock taken says which one runs instead of waiting through it.
- **`metis.json` is written by one package** (`internal/state`): under `metis.lock`, re-read, changed, written to `metis.json.tmp` and renamed.
  - Reads take no lock, because the rename is atomic; the updater holds the lock for a whole upgrade, so a shared lock would block the dashboard's status reads.
  - A file with a newer `schemaVersion` is refused with `metis.json was written by Metis CLI 0.4.0; run sudo metis self-update`.
- **A mutating command fails at once while an upgrade holds the lock** (`An upgrade is running (started 14:02). Run metis status to follow it.`) and waits when another short command holds it.
- **Gateway resources are named from the domain** (`metis-mail-example-com`, `metis-ses-example-org`), so `remove` finds them in remote mode, where there is no state.

### The catalog and the stack

- **Service definitions are the embedded `internal/catalog/services.yml`, in compose format, loaded with compose-go; it is never published and never run by compose.** The CLI drives the Docker Engine API through the Moby Go modules and never runs `docker` or `docker compose`.
  - `${…}` in it resolves from `metis.json` (`APP_IMAGE`, `PREFLIGHT_IMAGE`, `WORKER_IMAGE`, `GATEWAY_RESEND_VERSION`, `APP_PORT`, `METIS_INSTALL_DIR`, the updater socket source, the object storage data source) and from `.env` (sqld's keys).
  - Every third-party image is pinned by digest; a CLI release that bumps one lists it in `apps/cli/CHANGELOG.md`.
- **Only containers labelled `email.trymetis.managed=true` are ever touched.** `email.trymetis.component` names the component and `email.trymetis.spec` the spec hash.
- **A container is recreated only when its spec hash changes**: the SHA-256 of its config, host config and network config, the image's local id and the hash of every env file it reads.
- **Apply order**: network and volumes, then sqld and `sqld-resend` (healthy, then the namespaces), Redis and object storage, preflight, the app, the workers, the Resend gateway, Caddy, the updater in docker mode.
  - Preflight runs when the app is created or recreated, or when a change forces it; an unchanged Caddy is reloaded.
  - Managed containers of components that are off are removed last.
- **Volumes are removed only by `metis remove … --purge`.**
- **Preflight runs once before a new app container, and a failed preflight leaves the old app running** with the last 2000 bytes of its log in the error.
- **`stack.Maintenance` puts the app and every worker in maintenance, or takes them out, by recreating them** ([configuration.md](configuration.md)).
  - On: each is recreated from its catalog spec with `METIS_MAINTENANCE` set to the current UTC time in the container's environment only; `.env` never holds it.
  - Off: each is recreated from its catalog spec as it is, which is the spec an apply wants, so an unchanged container is only started if stopped.
  - It never runs preflight and touches nothing but `app` and `worker`; any later apply also ends maintenance, because the spec hash differs.

### Components

| Component            | Requires                | Add                                                                                                                                                            | Remove                                                                                                                                      |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sqld`               | —                       | On in setup unless another database is chosen; the stack URLs and a JWT pair in `.env`                                                                         | Refused while `DATABASE_URL`, `MASTRA_DATABASE_URL` or `gateway-resend --database stack` uses it                                            |
| `caddy`              | a domain                | `metis domain HOST`: `METIS_DOMAIN`, `BETTER_AUTH_URL=https://HOST`, the Caddyfile                                                                             | `metis domain --remove`: `BETTER_AUTH_URL=http://localhost:PORT`; refused under `objstore --direct` or the Resend gateway                   |
| `updater`            | —                       | `--systemd` (default when systemd is PID 1) or `--docker` ([updater.md](updater.md))                                                                           | The app loses `METIS_UPDATER_SOCKET`, so the Updates page disappears                                                                        |
| `redis`              | —                       | Valkey with `noeviction`                                                                                                                                       | Refused while `worker` is on                                                                                                                |
| `worker`             | `redis` (added with it) | `--replicas N`; forces the runner to `bullmq` on `redis://redis:6379`                                                                                          | Forces the runner to `internal`, then stops the workers                                                                                     |
| `objstore`           | —                       | RustFS with a `drive` bucket, created once it runs; `--data-dir` binds a host folder; `--direct` adds `storage.` plus the domain and CORS for the app's origin | Removes the `metis-objstore` server entry; connected drives are quarantined at preflight; a `--data-dir` folder is kept even with `--purge` |
| `gateway-resend`     | `caddy`                 | See Integrations                                                                                                                                               | Deletes the webhook; `--purge` also the volumes or the `resend` namespace                                                                   |
| `gateway-cloudflare` | a Cloudflare zone       | See Integrations                                                                                                                                               | Deletes its rules and Worker; `--purge` also D1 and R2                                                                                      |
| `gateway-ses`        | an AWS account          | See Integrations                                                                                                                                               | Deletes its rule and resources; `--purge` also the bucket                                                                                   |

- **Every change runs in one order**: under the lock, the component edits `metis.json` and the env files, the Caddyfile is rewritten, then one apply runs, with one preflight forcing the keys the change owns ([configuration.md](configuration.md)).
- **Re-running `metis add` changes a component in place** and moves a gateway to its newest release, or to the one `--version` names.
- **The runner switch forces the whole `workflowRunner` section**, so runner settings changed on the dashboard return to their `.env` values or defaults; `add worker` and `remove worker` say so before they run, and `--yes` accepts it.
- **CLI-owned server entries carry `metis-` ids** (`metis-objstore`, `metis-cloudflare-DOMAIN`, `metis-resend-DOMAIN`, `metis-ses-DOMAIN`), so forcing a server list replaces only them.

### Configuration

- **`metis config set` and `unset` force only the dashboard settings among their keys**, because preflight refuses anything else; `InstanceKeys` is the CLI's copy of `SECTION_ENV_VARS`, and a test fails when they drift.
- **`metis config set METIS_MAINTENANCE=…` on a server warns and goes ahead.** The value lands in `.env`, so the app stays in maintenance through every update, undo and apply until `config unset`; the updater's own maintenance lives only in the container environment ([updater.md](updater.md)).
- **`METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS` reaches one preflight container and no file**, so later preflights, upgrades included, never re-apply it ([configuration.md](configuration.md)).
- **Remote `config set --env-file` updates the file, lists the values to set on the platform, and stores dashboard settings once** through the release's preflight image when Docker runs on the machine, or prints that `docker run` line.

### Integrations

- **Cloud credentials are read from the environment, otherwise asked for, and never written to disk:** `CLOUDFLARE_API_TOKEN`; the AWS SDK's default chain; `RESEND_API_KEY` (which the Resend gateway's own env file then holds, because the gateway needs it).
- **Gateway artifacts are downloaded or pulled, never built on the server**, from each gateway's own release track ([gateways.md](gateways.md)): the newest release named by `GATEWAY/version.txt`, or `--version` (`apps/cli/internal/gateways` → `Resolve`, `Artifact`, `SourceFile`).
  - The Resend image is pulled by that version's tag.
  - `gateway-cloudflare.zip` and `gateway-ses.zip` are checked against `GATEWAY/vVERSION/SHA256SUMS` and cached under `cache/gateways/GATEWAY/VERSION/`.
  - Schemas and `wrangler.jsonc` come from the `GATEWAY-vVERSION` tag on GitHub.
- **DNS records go through Cloudflare when a token is set and the zone is on that account; otherwise they are printed.** Resend and SES verification is polled every 15 s for up to 10 minutes, and re-running the command resumes.
- **Every resource a gateway command creates is named from the domain** (`metis-mail-DOMAIN` for Cloudflare, `metis-ses-DOMAIN` for SES, with dots as dashes), so `metis remove` finds them even in remote mode, where there is no `metis.json`.
- **`metis add gateway-cloudflare` builds the gateway on the zone's account** (`apps/cli/internal/cloudflare/cloudflare.go` → `DeployGateway`).
  - It creates or reuses the D1 database `metis-mail-DOMAIN` (and runs the tag's `schema.sql` in it), the R2 bucket `metis-mail-DOMAIN-raw` and the Worker `metis-mail-DOMAIN` with its bindings, then turns on the Worker's workers.dev address, which becomes the endpoint.
  - Email Routing gets its DNS records; with `--addresses`, one literal rule per address points at the Worker and the catch-all goes off, otherwise the catch-all points at it. Email Sending gets the domain and its DNS records.
  - The Worker's `API_TOKEN` goes to `env/gateway-cloudflare-DOMAIN.env`. `metis remove` deletes the routing rules and catch-all that point at the Worker, and the Worker; `--purge` also D1 and R2.
- **`metis add gateway-resend` runs the gateway in the stack and wires Resend to it** (`apps/cli/internal/components/gateways.go` → `resendGateway`).
  - `--database own` (default) runs `sqld-resend` with its own key in `env/sqld-resend.env`; `stack` uses the `resend` namespace on the server's sqld, which Undo last upgrade then rolls back with the app.
  - `--blobs dir` (default) keeps raw mail in `/data/blobs` on the gateway's volume; `objstore` uses a `gateway-resend` bucket on the server's RustFS.
  - `--host` defaults to `resend.` plus the app's domain, which Caddy serves. The key must have full access; receiving is turned on for the domain, and the webhook's id stays in `metis.json` so a re-run keeps it.
  - `env/gateway-resend.env` holds the database, blobs, `MAIL_DOMAIN`, `API_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `POLL_INTERVAL_SEC=300`, the polling backstop for missed webhooks.
- **`metis add gateway-ses` creates the deployment `apps/gateway-ses/README.md` lists** (`apps/cli/internal/ses/ses.go`).
  - The bucket, the IAM role, the function (`nodejs24.x`, `arm64`) and its function URL in `RESPONSE_STREAM` mode with the public invoke permission.
  - The `-failed` SQS queue for receipts that keep failing (two retries, kept up to six hours), and the receipt rule.
  - It refuses a region that receives no SES mail and, while the account is in the sandbox, offers the production access request.
  - The function's `API_TOKEN` goes to `env/gateway-ses-DOMAIN.env`; `metis remove` deletes the rule, function, URL, queue and role, and `--purge` also the bucket.
- **The SES gateway's rule joins the active rule set; a set is created only when none is active, and removing deletes only that rule.**
- **The SES database must be reachable from Lambda over the internet**; the server's own sqld is never offered.
- **In remote mode the gateway commands print instead of storing.** They print the admin token once, the server entry and its `METIS_*_SERVERS` variable, for Dashboard → System or `metis config set --env-file`. `gateway-resend --endpoint` does only the Resend side for a gateway that runs elsewhere and prints the values to set on it.
- **The objstore server entry, `metis-objstore`, uses the relay**: `http://objstore:9000` with path-style requests, so files pass through the app. With `--direct` it points at `https://storage.` plus the domain and moves files straight between browsers and storage, which is why RustFS then allows the app's origin ([drive.md](drive.md)).
- **Google OAuth clients cannot be created by API.** `metis connect google` uses `gcloud`'s token, when gcloud is signed in, only to create the project and turn on the APIs, then guides the consent screen and the client with deep links and checks the pasted pair against Google's token endpoint (`invalid_grant` means it is right).
  - The audience step says Internal for a Google Workspace (only its members connect), otherwise External and then Publish app, with Google's unverified-app screen and its lifetime limit of 100 new users; it never suggests Testing, whose tokens expire after 7 days.

### Releases

- **The CLI is its own release track, `cli-v*`**, published to `sh.trymetis.email/cli/` with the root `bootstrap` shim ([self-host.md](self-host.md)); `metis setup` and the updater install only app releases whose `metis.json` names a `minCli` this CLI meets.
- **The CLI never updates itself on its own.** `sudo metis self-update` checks the binary against `SHA256SUMS`, replaces it by rename, restarts the updater and applies the new catalog after asking.

## How it works

- **Setup.** Checks root, Linux and an empty folder, installs Docker on Debian or Ubuntu, then runs the form; every field is also a flag, and with no terminal a missing value fails at once naming its flag.
  - It pins the release, writes `.env` (the auth and relay secrets, the encryption key, the setup code, the owner, the database) and `metis.json`, records `/etc/metis/install-dir` and applies.
  - It prints the URL, the setup code and the encryption key warning; gateways and Google chosen in the form are set up after the first apply.
- **The shim** (`bootstrap.sh`) downloads `metis-linux-ARCH` and `SHA256SUMS` from `cli/` (or `cli/vMETIS_CLI_VERSION/`), checks it, installs it as `/usr/local/bin/metis` and runs `metis setup` with its own arguments.
- **Status.** `metis status` lists each component with its health, every managed container, the app version and the last upgrade; each gateway shows its version and, when its folder's `version.txt` answers within 3 s, a newer release that is out; an SES gateway also shows its failed receipts.
- **Domain.** `metis domain HOST` also creates the A record for the server's public address (from `https://1.1.1.1/cdn-cgi/trace`) through Cloudflare when it can.

## Deliberate limits

- **One server.** The CLI manages the Docker Engine it runs on; workers scale with `--replicas` on the same host.
- **Gateways move to a newer release only when an operator re-runs `metis add`**; `metis status` says when one is out. The Cloudflare and SES gateways need cloud credentials the server does not keep.
- **Google stays partly manual**: the consent screen, publishing and the client are made in the Cloud Console.
- **`--direct` object storage needs a domain**, because browsers fetch files from its public host.
- **Self-update is manual**, so a compromised app cannot make root replace its own binary.
- **Gateways in setup are interactive only**, because each needs a domain; unattended installs add them with `metis add` afterwards.
