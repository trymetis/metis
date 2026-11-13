# Changelog

Notable changes to the Metis server CLI, the `metis` binary that installs and runs a server, released under `cli-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Added

- `metis setup` installs Metis on a Linux server (amd64 or arm64), installing Docker on Debian and Ubuntu, with a guided form or flags for unattended installs, and starts the newest release this CLI supports. Install it with `curl -fsSL https://sh.trymetis.email/bootstrap -o bootstrap.sh && sudo sh bootstrap.sh`.
- `metis add` and `metis remove` turn components on and off: sqld, the updater (systemd service or container), workers with Redis, object storage on the server (with a `drive` bucket ready to connect), and the Cloudflare Email, Resend and Amazon SES mail gateways.
- `metis domain` serves Metis on a domain with HTTPS and creates the DNS record through Cloudflare when it can.
- `metis update` and `metis undo` upgrade and roll back from the terminal, and the Updates page keeps working through the updater component.
- `metis config set` and `unset` change the server's settings, including ones edited on the dashboard; `metis connect google` creates and checks the Google sign-in client; `metis gateway token` mints and revokes mailbox tokens.
- `metis status`, `logs`, `restart` and `apply` show and repair what runs on the server; `metis self-update` installs a newer CLI.
- The gateway, Google and config commands also run from macOS, Windows or any Linux machine against a server or a platform deployment.

## Releases
