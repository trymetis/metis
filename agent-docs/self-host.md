# Self-host files

Where the `metis` CLI, its `bootstrap` shim, each server release's metadata and the gateway zips are published: `https://sh.trymetis.email`, a public Cloudflare R2 bucket of its own. Paths are from the repository root. See also [AGENTS.md](../AGENTS.md), [deployment.md](deployment.md), [downloads.md](downloads.md), [updater.md](updater.md).

## Code map

| Concern                               | Where                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Publishing the CLI and the shim       | `.github/workflows/cli.yml` → jobs `release`, `build`, `smoke`, `publish`       |
| Publishing a server release's files   | `.github/workflows/docker.yml` → job `publish`                                  |
| Writing one release into the bucket   | `.github/scripts/r2-upload.sh`                                                  |
| The shim                              | `apps/cli/bootstrap.sh`                                                         |
| A server release's `metis.json`       | `bun run release:meta app-v<version>` → `packages/releases/src/cli.ts` → `meta` |
| Install command on the marketing site | `apps/www/src/components/site/install-block.tsx` → `LINES`                      |
| Install commands in the customer docs | `apps/docs/content/self-hosting/01-install/`                                    |

## Files

| Published name             | Folders                       | Source                                                                                                     | What it is                                                                                         |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bootstrap`                | root, `cli/`, `cli/vVERSION/` | `apps/cli/bootstrap.sh` (renamed on upload)                                                                | The shim: downloads the Linux `metis` binary, checks it against `SHA256SUMS`, runs `metis setup`   |
| `metis-linux-amd64` …      | `cli/`, `cli/vVERSION/`       | `cli.yml` → `build`                                                                                        | The CLI for `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64` (`.exe`) |
| `THIRD_PARTY_LICENSES.txt` | `cli/`, `cli/vVERSION/`       | `go-licenses report` over `apps/cli/licenses.tpl`                                                          | The licenses of the third-party code in the Linux amd64 binary                                     |
| `version.txt`              | `cli/`                        | written by `r2-upload.sh` (`VERSION_MANIFEST`)                                                             | The newest CLI version                                                                             |
| `metis.json`               | `vVERSION/`                   | `bun run release:meta app-v<version>`                                                                      | `{"version":"1.4.0","minCli":"0.1.0"}`: the oldest CLI the server release runs on                  |
| `gateway-ses.zip`          | `vVERSION/`                   | `apps/gateway-ses` → `bun run build`, `bun run package`                                                    | The Amazon SES gateway's Lambda zip ([gateways.md](gateways.md))                                   |
| `gateway-cloudflare.zip`   | `vVERSION/`                   | `apps/gateway-cloudflare` → `bun run build` (`wrangler deploy --dry-run --outdir dist`), `bun run package` | The Cloudflare Email Worker's built module and source map                                          |
| `release.md`               | `vVERSION/`, `cli/vVERSION/`  | `bun run release:notes <tag>`                                                                              | The release notes; the updater reads a server release's ([updater.md](updater.md))                 |
| `SHA256SUMS`               | every folder                  | written by `r2-upload.sh`                                                                                  | The SHA-256 of every file in its folder, in `sha256sum` format                                     |

## URLs

| Folder             | URL                                               | Holds                                                        |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------ |
| The shim           | `https://sh.trymetis.email/bootstrap`             | The shim of the newest CLI release that is not a pre-release |
| Latest CLI         | `https://sh.trymetis.email/cli/<file>`            | The newest CLI release that is not a pre-release             |
| One CLI release    | `https://sh.trymetis.email/cli/v<version>/<file>` | That CLI release, never changed after it is published        |
| One server release | `https://sh.trymetis.email/v<version>/<file>`     | That server release, never changed after it is published     |

## Rules

- **The install command downloads `https://sh.trymetis.email/bootstrap` and saves it as `bootstrap.sh`**, the name every later command and doc uses; flags after `bootstrap.sh` go to `metis setup`.
  - `METIS_CLI_VERSION` makes the shim download one CLI release from `cli/v<version>/` instead of `cli/`.
- **A server release (`app-v<version>`) writes only `v<version>/`, never the bucket root**, after every image of that release is built.
  - `docker.yml` runs `r2-upload.sh` with `LATEST` `false`, so nothing at the root or under `cli/` moves with a server release.
  - `v<version>/metis.json` names the oldest CLI the release runs on, from the `cli` field of its release file ([deployment.md](deployment.md)).
  - A gateway is deployed against one server release, so its zip has only a versioned URL.
- **A CLI release (`cli-v<version>`) writes `cli/v<version>/`, and `cli/` plus the root `bootstrap` unless it is a pre-release.**
  - The root `bootstrap` is copied separately with `cache-control: public, max-age=300`, outside `r2-upload.sh`, because it is the only file at the root.
- **A run by hand (`workflow_dispatch`) of `docker.yml` skips `publish`**; `cli.yml` runs only on a published release.
- **The bucket has its own write keys (`SH_R2_ACCESS_KEY_ID`, `SH_R2_SECRET_ACCESS_KEY`, `SH_R2_BUCKET`), separate from the downloads bucket's `DOWNLOADS_R2_*` keys ([downloads.md](downloads.md)).**
  - Operators run the shim as root, so whoever can write this bucket can run code on every new server.
  - The keys are as sensitive as write access to the repository, and no app release holds them.
  - Only the account id (`R2_ACCOUNT_ID`) is shared.
- **Write order, overwrite refusal and cache headers are those of the downloads bucket**, held once in `r2-upload.sh` ([downloads.md](downloads.md)).
- **These paths never change.** People paste them into terminals, cloud-init files and scripts, so renaming one breaks installs nobody can update.

## How it works

- **`cli.yml` → `build` cross-compiles every binary on one Linux runner** with `CGO_ENABLED=0`, `-trimpath` and the version set through `-ldflags -X github.com/trymetis/metis/apps/cli/internal/version.Version`.
  - Before each build it writes that target's `go-licenses` report to `apps/cli/internal/version/licenses.txt`, which `metis version --licenses` embeds; the committed file is a placeholder.
- **`cli.yml` → `smoke` installs the Linux amd64 binary on the runner and runs `metis setup --yes --with updater`, waits for `/api/readyz`, then adds, checks and removes the workers**, before anything is published.
  - When no published app release runs on the new CLI yet, setup says so and the job ends with a notice instead of failing.
- **`docker.yml` → `publish` builds both gateway zips** after installing `@metis/gateway-ses` and `@metis/gateway-cloudflare`, and writes `metis.json` with `bun run release:meta`. wrangler's dry run needs no Cloudflare credentials, and `wrangler.jsonc`'s placeholder ids stay, because whoever deploys supplies the bindings.

## Deliberate limits

- **`SHA256SUMS` sits in the same bucket**, so it catches a broken download, not a compromised bucket.
