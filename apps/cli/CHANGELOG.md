# Changelog

Notable changes to the Metis server CLI, the `metis` binary that installs and runs a server, released under `cli-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Added

- `metis gateway token create ADDRESS --name NAME` gives a gateway mailbox a sender name, and `metis gateway token name ADDRESS NAME` changes it (or removes it with `""`) without a new token.

## Releases

- [0.1.0](../../releases/cli-v0.1.0.md) - 2026-11-13
