---
title: Manage components
description: Add, change and remove the parts of a server the metis CLI runs, such as the updater, workers, object storage and mail gateways.
---

On a server the `metis` CLI runs, the app always runs. Everything around it is a component: a part you add or remove with one command. This page lists the components and what each command does. Run every command on the server, with `sudo`.

## The commands

| Command                     | What it does                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sudo metis add worker`     | Adds a component, or changes one that is already on. Ends with "worker is on".                                         |
| `sudo metis remove worker`  | Removes a component. Ends with "worker is off".                                                                        |
| `sudo metis status`         | Shows each component, marked "ok" or "NOT HEALTHY".                                                                    |
| `sudo metis logs worker`    | Shows a component's log. See [Health checks](/self-hosting/operate/health-checks#check-the-server-with-the-metis-cli). |
| `sudo metis restart worker` | Restarts a component's containers.                                                                                     |

Each change shows what it does to the containers, for example:

```
  + create   metis-worker-1
  ~ recreate metis-app
  - remove   metis-redis
  > run preflight
```

When the app is created again, preflight runs first. If preflight fails, the app that was running keeps running, and the error shows the end of preflight's output.

Both `add` and `remove` take `--yes`, to go ahead without asking. `remove` also takes `--purge`, which deletes the component's data too: its Docker volumes, or its resources at a cloud provider. Without `--purge`, the data stays.

An unknown name is refused with, for example, "redis2 is not a component; the components are sqld, caddy, updater, redis, worker, objstore, gateway-cloudflare, gateway-resend, gateway-ses". Removing a component that is not on is refused with, for example, "worker is not on".

## Run add again to change a component

`metis add` on a component that is on changes it in place. It uses exactly the flags you give it. A flag you leave out goes back to its default:

- `worker` without `--replicas` goes back to one worker.
- `objstore` without `--data-dir` moves back to the Docker volume, and without `--direct` back to relayed transfers.
- `gateway-resend` without `--database` and `--blobs` goes back to `own` and `dir`.

Nothing copies data when a component moves, for example from a folder to a volume.

## Questions before a change

Some changes warn you and ask "Go ahead?" first. Answer **Yes**, or pass `--yes`:

- Adding or removing `worker`: the workflow runner settings go back to their `.env` values or defaults.
- Adding `sqld` on an install that uses another database: the app moves to an empty database.
- Removing `objstore` or `gateway-resend`: drives or mailboxes connected through it are quarantined (hidden from every workspace).

Some components need another one. Adding `worker` adds `redis` too, with the notice "Added redis, which worker needs". The Resend gateway and `objstore --direct` need a domain: set one first with `metis domain`. See [Domain and HTTPS](/self-hosting/install/domain-and-https).

## sqld

The database server. It holds the app database and the AI memory database, in the `metis-sqld` volume. `metis setup` adds it unless you choose another database. `metis status` shows it as "namespaces app and mastra".

- `sudo metis add sqld` on an install that uses another database, such as Turso, warns, for example: "DATABASE_URL is libsql://metis-app-acme.turso.io. The app moves to an empty database on the server's sqld; nothing is copied from the current one."
- `sudo metis remove sqld` is refused while something uses it, for example: "sqld is in use by DATABASE_URL, MASTRA_DATABASE_URL; point them at another database first". The Resend gateway on `--database stack` counts too.
- `--purge` deletes the `metis-sqld` volume, with both databases in it.

## caddy

The web server that serves the app over HTTPS. It comes and goes with your domain, so you never add or remove it yourself:

- `sudo metis add caddy` is refused with "Caddy comes with a domain: run metis domain mail.example.com".
- `sudo metis remove caddy` is refused with "Caddy goes with the domain: run metis domain --remove".

See [Domain and HTTPS](/self-hosting/install/domain-and-https).

## updater

Runs upgrades and undo, and gives the dashboard its **Updates** page. `metis setup` adds it unless you leave it out.

```bash
sudo metis add updater
```

| Flag        | What it does                                                                   |
| ----------- | ------------------------------------------------------------------------------ |
| `--systemd` | Run it as a systemd service. This is the default when the server runs systemd. |
| `--docker`  | Run it as a container.                                                         |

Pass one of them, not both ("pass --systemd or --docker, not both"). On a server without systemd, `--systemd` is refused with "--systemd needs systemd as PID 1; use --docker".

`sudo metis remove updater` prints "The Updates page disappears from the dashboard; upgrade with metis update". You can still upgrade and undo with `sudo metis update` and `sudo metis undo`. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo).

## redis

Redis (Valkey) for the workers' queue. `metis status` shows it as "Valkey, noeviction". `metis add worker` adds it for you. Removing it while the workers run is refused with "the workers use redis; run metis remove worker first". `--purge` deletes the `metis-redis` volume.

## worker

Workers run background work outside the app. `--replicas` sets how many worker containers run (default 1). See [Workers on a server the metis CLI runs](/self-hosting/configure/background-work#workers-on-a-server-the-metis-cli-runs).

## objstore

S3-compatible object storage on the server, listed as **Server storage** for drives. `--data-dir` keeps the files in a folder of the server, and `--direct` lets browsers transfer files through `storage.` followed by your domain. See [Storage on your server](/self-hosting/configure/drive-transfers#storage-on-your-server).

## Mail gateways

`gateway-cloudflare`, `gateway-resend` and `gateway-ses` set up a mail gateway for a domain, and add it to the matching server list. Each has its own flags. On `remove`, they take `--domain`, `--remote`, `--endpoint`, `--region`, `--yes` and `--purge`. See:

- [Set up the Cloudflare Email gateway](/self-hosting/mail-gateways/cloudflare-email)
- [Set up the Resend gateway](/self-hosting/mail-gateways/resend)
- [Set up the Amazon SES gateway](/self-hosting/mail-gateways/amazon-ses)

A gateway stays on the release it was set up for. After you upgrade, run its `metis add` command again to move it to the new release. `metis status` shows the gap, for example "1.3.2, app 1.4.0: run metis add again to move it".

## While a change runs

Only one command changes the server at a time. While an upgrade runs, every command that changes the server stops at once with, for example, "An upgrade is running (started 14:02). Run metis status to follow it." Wait until it ends, then run the command again.
