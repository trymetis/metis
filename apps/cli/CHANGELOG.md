# Changelog

Notable changes to the Metis server CLI, the `metis` binary that installs and runs a server, released under `cli-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Changed

- `metis domain mail.example.com` is now `metis domain set mail.example.com`, and `metis domain --remove` is now `metis domain remove`.
- `metis add` and `metis remove` take each component as its own subcommand with only its own flags, so `metis add worker --replicas 2` works as before while a flag another component uses, such as `metis add worker --purge`, is refused instead of ignored. `metis gateway token` works the same way: `--name` belongs to `create` only.
- On a server with a domain, an upgrade, an undo, `metis db export` and `metis db move` answer visitors from Caddy for the whole time the app is away: the maintenance page for a browser and a 503 with `Retry-After` for everything else. The app and workers are stopped instead of restarted into maintenance, so these take less time. If the site cannot be taken out of maintenance afterwards, the command and the Updates page say so and name `sudo metis apply`, which ends it. A server without a domain works as before.
- The Caddyfile is in `caddy/Caddyfile` in the install folder. The next `metis` command that applies the stack moves it there and recreates the Caddy container.

### Added

- `metis gateway token create ADDRESS --name NAME` gives a gateway mailbox a sender name, and `metis gateway token name ADDRESS NAME` changes it (or removes it with `""`) without a new token.

### Fixed

- `metis update` and `metis undo` print each step's name before that step's progress lines. A step's first lines could show under the previous step's name, and a step that finished within half a second was not named at all.
- After `metis domain set`, Caddy picks up later changes: `metis add gateway-resend` and `metis add objstore --direct` are served on their host names without recreating Caddy.
- An error that starts with a setting's name or an address prints it as written, such as `METIS_DRIVE_RELAY_MAX_MB`, instead of `Metis_drive_relay_max_mb`.

## Releases

- [0.1.0](../../releases/cli-v0.1.0.md) - 2026-11-13
