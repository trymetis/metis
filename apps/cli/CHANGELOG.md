# Changelog

Notable changes to the Metis server CLI, the `metis` binary that installs and runs a server, released under `cli-v<version>` tags. The server app has its own [changelog](../web/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior.

## Unreleased

### Changed

- `metis domain set`, `metis domain remove` and moving a server to a new address (`metis db load --app-url`, setting up from an export at another address) warn that every user's passkeys stop working at the new address and how users get back in.
- The maintenance page on a server with a domain says how long maintenance has lasted and reloads by itself when the app is back, instead of "Try again in a few minutes."

## Releases

- [0.1.1](../../releases/cli-v0.1.1.md) - 2026-11-17
- [0.1.0](../../releases/cli-v0.1.0.md) - 2026-11-13
