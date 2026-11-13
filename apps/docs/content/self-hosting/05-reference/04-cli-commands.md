---
title: CLI commands
description: Every command of the metis CLI, where it runs, whether it needs sudo, and its flags.
---

The `metis` CLI installs and runs Metis Suite on a Linux server. It also runs on your own computer, to set up Google and mail gateways for an instance on a container platform or Vercel.

## Install the CLI

### On the server

The install script installs the CLI as `/usr/local/bin/metis` and starts `metis setup`. See [Install with the metis CLI](/self-hosting/install/install-with-bootstrap).

```bash
curl -fsSL https://sh.trymetis.email/bootstrap -o bootstrap.sh
sudo sh bootstrap.sh
```

The script is for servers only. To update the CLI later, run `sudo metis self-update`. See [Update the metis CLI](/self-hosting/operate/upgrade-and-undo#update-the-metis-cli).

### Install the CLI on your computer

Download the file for your system from `https://sh.trymetis.email/cli/`:

| System                | File                      |
| --------------------- | ------------------------- |
| Linux, amd64 (x86_64) | `metis-linux-amd64`       |
| Linux, arm64          | `metis-linux-arm64`       |
| macOS, Intel          | `metis-darwin-amd64`      |
| macOS, Apple silicon  | `metis-darwin-arm64`      |
| Windows               | `metis-windows-amd64.exe` |

`https://sh.trymetis.email/cli/SHA256SUMS` lists the checksum of each file. For example, on a Mac with Apple silicon:

```bash
curl -fsSLO https://sh.trymetis.email/cli/metis-darwin-arm64
curl -fsSL https://sh.trymetis.email/cli/SHA256SUMS | grep ' metis-darwin-arm64$' | shasum -a 256 -c -
chmod +x metis-darwin-arm64
sudo mv metis-darwin-arm64 /usr/local/bin/metis
```

The second command prints `metis-darwin-arm64: OK` when the download is complete and unchanged. On Windows, rename the file to `metis.exe` and put it in a folder on your `PATH`.

A fixed version of the CLI is in its own folder, such as `https://sh.trymetis.email/cli/v0.1.0/`.

## On the server or on your computer

The CLI decides each time it runs where it is:

- **On the server:** the machine has a Metis Suite install. Run every command there with `sudo`.
- **On your computer:** any other machine. The CLI needs no root and no Docker there, except where a command says so. A Mac or Windows computer is always in this mode.

On your computer, only these commands work: `connect google`, `config set` and `config unset` with `--env-file`, the mail gateway commands with `--remote` or `--endpoint`, `gateway token` with `--endpoint`, `sqld-auth`, `version` and `self-update`. Any other command says "This machine has no Metis install" on Linux, or, for example, "metis status runs on the Linux server that hosts Metis" on a Mac or Windows.

On the server, a command that changes the server stops without `sudo`, for example with "metis add changes the server; run it with sudo".

## Commands

"Where" says where a command runs. "sudo on the server" says whether to run it with `sudo` there. Commands that only read the server, such as `status` and `logs`, still talk to Docker, so they need `sudo` too.

| Command                                                | Where                                   | sudo on the server | What it does                                                                    | Flags                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metis setup`                                          | A Linux server with no install          | Yes                | Installs Metis Suite on this server.                                            | `--dir`, `--domain`, `--owner-email`, `--database-url`, `--database-token`, `--with`, `--version`, `--app-port`, `--env`, `--env-file`, `--yes`. See [Install without questions](/self-hosting/install/install-with-bootstrap#install-without-questions). |
| `metis status`                                         | Server                                  | Yes                | Shows the components, the containers and the last upgrade.                      | `--json`: print JSON.                                                                                                                                                                                                                                     |
| `metis apply`                                          | Server                                  | Yes                | Brings the containers in line with the install's settings and `.env`.           | `--yes`: apply without asking.                                                                                                                                                                                                                            |
| `metis add COMPONENT`                                  | Server; gateways also on your computer  | Yes                | Adds a component, or changes one that is already on.                            | `--yes`, and the component's own flags. See [Manage components](/self-hosting/operate/manage-components).                                                                                                                                                 |
| `metis remove COMPONENT`                               | Server; gateways also on your computer  | Yes                | Removes a component.                                                            | `--domain`, `--remote`, `--endpoint`, `--region`, `--yes`, `--purge`.                                                                                                                                                                                     |
| `metis logs COMPONENT`                                 | Server                                  | Yes                | Shows a component's container logs (`app`, `sqld`, `worker` and the others).    | `-f`, `--follow`: keep printing new lines. `--tail`: how many lines to start from, or `all` (default 100).                                                                                                                                                |
| `metis restart COMPONENT`                              | Server                                  | Yes                | Restarts a component's containers. It does not read `.env` again.               | None                                                                                                                                                                                                                                                      |
| `metis domain mail.example.com`                        | Server                                  | Yes                | Serves Metis Suite on a domain with HTTPS. `--remove` stops it.                 | `--remove`, `--yes`. See [Domain and HTTPS](/self-hosting/install/domain-and-https).                                                                                                                                                                      |
| `metis config set KEY=VALUE`, `metis config unset KEY` | Server; your computer with `--env-file` | Yes                | Changes the environment, and stores the dashboard settings among the variables. | `--env-file`, `--version`, `--yes`. See [How configuration works](/self-hosting/configure/how-configuration-works#change-dashboard-settings-with-the-metis-cli).                                                                                          |
| `metis connect google`                                 | Server or your computer                 | Yes                | Creates the Google OAuth client with you, checks it and stores it.              | `--client-id`, `--client-secret`, `--project`, `--env-file`, `--version`, `--yes`. See [OAuth providers](/self-hosting/configure/sign-in-providers#set-up-google-with-the-metis-cli).                                                                     |
| `metis gateway token create ADDRESS`, `list`, `revoke` | Server; your computer with `--endpoint` | Yes                | Creates, lists or revokes mailbox tokens on the gateway that serves an address. | `--endpoint`, `--admin-token`. See [Mailbox tokens](/self-hosting/mail-gateways/mailbox-tokens).                                                                                                                                                          |
| `metis sqld-auth`                                      | Anywhere                                | No                 | Prints a new sqld key and the token that goes with it.                          | None                                                                                                                                                                                                                                                      |
| `metis update`                                         | Server                                  | Yes                | Upgrades to the newest release, or to the release you name, such as `1.4.0`.    | `--no-backup`: skip the database snapshot, so the upgrade has no undo. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo#upgrade-from-the-terminal).                                                                                          |
| `metis undo`                                           | Server                                  | Yes                | Undoes the last upgrade: the previous release with its database snapshot.       | None                                                                                                                                                                                                                                                      |
| `metis self-update`                                    | Anywhere                                | Yes                | Replaces the CLI with the newest version, or with the version you name.         | `--yes`: apply the new container settings without asking.                                                                                                                                                                                                 |
| `metis version`                                        | Anywhere                                | No                 | Prints the CLI version, such as "metis 0.1.0", and the images it uses.          | `--licenses`: print the licenses of the third-party code in the CLI.                                                                                                                                                                                      |

In this table, `COMPONENT` stands for the name of a component and `ADDRESS` for an email address, such as `alice@example.com`.

The components are `sqld`, `caddy` (only through `metis domain`), `updater`, `redis`, `worker`, `objstore`, `gateway-cloudflare`, `gateway-resend` and `gateway-ses`. Preflight is not a component: its output is in the error of the command that ran it.

On Windows, `metis self-update` does not replace the file. It prints "Download the new CLI from https://sh.trymetis.email/cli/metis-windows-amd64.exe and replace metis.exe with it."

## Flags on every command

| Flag           | What it does                                                                   |
| -------------- | ------------------------------------------------------------------------------ |
| `--accessible` | Ask questions as plain prompts, for screen readers. `TERM=dumb` does the same. |
| `--help`       | Show the command's help.                                                       |

`metis --version` prints the CLI version. On `metis setup`, `metis config`, `metis connect google` and the gateway commands, `--version` names a release of Metis Suite instead.

## Questions and --yes

Some commands ask a question before they change anything, such as "Go ahead?" or "Apply these changes?". `--yes` answers **Yes**. Without a terminal, for example in a script, a question fails with, for example, "Go ahead? Pass --yes to go ahead without a terminal". A field the command must ask for fails with "this needs an answer and there is no terminal to ask on".

## What a change prints

A command that changes the server prints what it does to the containers:

```
  + create   metis-worker-1
  ~ recreate metis-app
  - remove   metis-redis
  > run preflight
```

While it works, it prints faint lines such as `pulling`, `creating metis-app` and `running preflight`.

The containers are named `metis-app`, `metis-sqld`, `metis-worker-1` (then `-2`, `-3` and so on), `metis-redis`, `metis-objstore`, `metis-caddy`, `metis-gateway-resend`, `metis-sqld-resend` and `metis-updater` (when the updater runs as a container). Their data is in Docker volumes, which only `metis remove` with `--purge` deletes. See [Backups](/self-hosting/operate/backups#docker-volumes).
