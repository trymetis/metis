# Self-host scripts

Where `bootstrap.sh` and `compose.yml` are published for every server release: `https://sh.trymetis.email`, a public Cloudflare R2 bucket of its own. Paths are from the repository root. See also [AGENTS.md](../AGENTS.md), [deployment.md](deployment.md), [downloads.md](downloads.md), [updater.md](updater.md).

## Code map

| Concern                                         | Where                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Publishing                                      | `.github/workflows/docker.yml` → job `publish`                                             |
| Writing one release into the bucket             | `.github/scripts/r2-upload.sh`                                                             |
| Where bootstrap downloads the compose file from | `bootstrap.sh` → `fetch_compose`, with the version `pin_release` sets in `RELEASE_VERSION` |
| Install command on the marketing site           | `apps/www/src/components/site/install-block.tsx` → `LINES`                                 |
| Install commands in the customer docs           | `apps/docs/content/self-hosting/01-install/` (bootstrap and Docker Compose pages)          |

## Files

| Published name | Source                                 | What it is                                                                                  |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `bootstrap`    | `bootstrap.sh` (renamed on upload)     | The install script                                                                          |
| `compose.yml`  | `compose.yml`                          | The Compose file the script deploys                                                         |
| `SHA256SUMS`   | written by `r2-upload.sh`              | The SHA-256 of both, in `sha256sum` format                                                  |
| `release.md`   | `bun run release:notes app-v<version>` | The release notes, in `v<version>/` only; the updater reads them ([updater.md](updater.md)) |

## URLs

| Folder      | URL                                           | Holds                                               |
| ----------- | --------------------------------------------- | --------------------------------------------------- |
| Latest      | `https://sh.trymetis.email/<file>`            | The newest server release that is not a pre-release |
| One release | `https://sh.trymetis.email/v<version>/<file>` | That release, never changed after it is published   |

## Rules

- **The latest release lives at the bucket root.** Install commands download `https://sh.trymetis.email/bootstrap` and save it as `bootstrap.sh`, the name every later command and doc uses.
- **Bootstrap reads the compose file of the release it pinned from here** ([deployment.md](deployment.md)).
- **Only an `app-v<version>` release publishes here, after every image of that release is built.**
  - So the root never points at a version whose images are missing.
  - `<version>` is the images' release version ([deployment.md](deployment.md)).
  - A run by hand (`workflow_dispatch`) skips `publish`.
- **A pre-release writes only `v<version>/`.** `r2-upload.sh` writes the root only when `LATEST` is `true`.
- **The bucket has its own write keys (`SH_R2_ACCESS_KEY_ID`, `SH_R2_SECRET_ACCESS_KEY`, `SH_R2_BUCKET`), separate from the downloads bucket's `DOWNLOADS_R2_*` keys ([downloads.md](downloads.md)).**
  - Operators run `bootstrap.sh` as root, so whoever can write this bucket can run code on every new server.
  - The keys are as sensitive as write access to the repository, and no app release holds them.
  - Only the account id (`R2_ACCOUNT_ID`) is shared.
- **Write order, overwrite refusal and cache headers are those of the downloads bucket**, held once in `r2-upload.sh` ([downloads.md](downloads.md)).
- **These paths never change.** People paste them into terminals, cloud-init files and scripts, so renaming one breaks installs nobody can update.

## How it works

- **`publish` stages `bootstrap.sh` as `out/bootstrap` and `compose.yml` as `out/compose.yml`**, then runs `r2-upload.sh` with an empty latest folder, which is the bucket root.

## Deliberate limits

- **`SHA256SUMS` sits in the same bucket**, so it catches a broken download, not a compromised bucket.
