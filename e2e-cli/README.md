# Metis Suite CLI e2e suite

A throwaway stack where the real `metis` CLI installs Metis, plus three suites that drive it: Playwright (`tests/`) for the dashboard's Updates page, Vitest (`api/`) for the updates API, and Vitest (`cli/`) for the CLI's commands. Metis (sqld, preflight, the app, the BullMQ worker with Valkey, and the updater) runs on `cli-host`, a Docker-in-Docker server, installed with the real `bootstrap` the way an operator installs it. Compose holds everything outside that install: the web suite's test servers, gateways and `replay` service (built from `../e2e`), one outside sqld for the gateways and the database moves, and `fakes`, the web suite's stand-in server (`../e2e/fakes`) running the stand-ins the CLI and the install call. The design, the rules and the order of the tests are in `agent-docs/e2e-cli.md`.

## Requirements

- Docker with Compose, able to run a privileged container (`cli-host`).
- Bun and Node; run `bun install` from the repository root first.
- Google Chrome: the browser suite and the CLI suite's page checks use system Chrome (`channel: "chrome"`); nothing is downloaded.
- Network access for `bun run up`, which pulls the newest published app release's images and the images the CLI's catalog pins.

## Running the tests

| Command                | Does                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun run up`           | builds the CLIs, images and release files, publishes them to `fakes`, installs Metis on `cli-host`, seeds it |
| `bun run test`         | `down`, `up`, then `test:browser`, `test:api` and `test:cli`, stopping at the first that fails               |
| `bun run test:browser` | the Updates page against the real updater, on a stack that is already up                                     |
| `bun run test:api`     | the updates API against the real updater, on a stack that is already up                                      |
| `bun run test:cli`     | the CLI suite (`cli/suite.test.ts`), on a stack that is already up                                           |
| `bun run logs`         | follows `replay` and `cli-host`                                                                              |
| `bun run up:ss`        | the same stack for the docs screenshots (`apps/docs/AGENTS.md`)                                              |
| `bun run down`         | removes the stack and everything published to it                                                             |

The CLI suite changes the install and ends by replacing it, so run `bun run down` and `bun run up` before running any suite again. Reports land in `playwright-report/`, artifacts in `test-results/`.

To look at the install, run the CLI on `cli-host`: `docker compose --env-file .env.fixture exec cli-host metis status`. The app is at `http://localhost:30050`, the stand-ins' control APIs at `http://localhost:30052`. The stack publishes only `30050` to `30054`, so it can run beside the web stack.

## Where things live

- `compose.yml`: everything outside the install. `stack/`: `up.ts` (build, start, install, seed) and `build.ts` (what is built and published). `lib/releases.ts`: the release versions the stack publishes.
- `cli-host/`: the Docker-in-Docker server. `clients/hosts.ts`: running commands on it.
- `../e2e/fakes/`: the stand-ins, shared with the web suite. `../e2e/tls/`: the test CA and every certificate.
- `.env.fixture`: the committed fixture. It has no `DATABASE_URL`, because the install makes its own databases. Plain `docker compose …` does not read it; use the scripts, or pass `--env-file .env.fixture` yourself.
