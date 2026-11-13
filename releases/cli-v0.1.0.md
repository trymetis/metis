---
date: 2026-11-13
---

### Added

- `metis setup` installs Metis on a Linux server (amd64 or arm64), installing Docker on Debian and Ubuntu, with a guided form or flags for unattended installs, and starts the newest release this CLI supports. Install it with `curl -fsSL https://sh.trymetis.email/bootstrap -o bootstrap.sh && sudo sh bootstrap.sh`.
- `metis add` and `metis remove` turn components on and off: sqld, the updater (systemd service or container), workers with Redis, object storage on the server (with a `drive` bucket ready to connect), and the Cloudflare Email, Resend and Amazon SES mail gateways.
- `metis add` deploys each mail gateway's newest release, or the one `--version` names, and `metis status` says when a newer gateway release is out.
- `metis domain` serves Metis on a domain with HTTPS and creates the DNS record through Cloudflare when it can.
- `metis update` and `metis undo` upgrade and roll back from the terminal, and the Updates page keeps working through the updater component.
- While an upgrade or undo copies or restores the database, visitors see a maintenance page instead of an error, and a later step or a failed snapshot always takes the app out of maintenance again.
- `metis config set` and `unset` change the server's settings, including ones edited on the dashboard; `metis connect google` creates and checks the Google sign-in client; `metis gateway token` mints and revokes mailbox tokens.
- `metis status`, `logs`, `restart` and `apply` show and repair what runs on the server; `metis self-update` installs a newer CLI.
- The gateway, Google and config commands also run from macOS, Windows or any Linux machine against a server or a platform deployment.
- On a server: `sudo metis db export` puts the app in maintenance, writes an encrypted archive to the install's `exports/` folder, with the Resend gateway's database when it runs, and brings the app back; `metis export recipients` and `metis setup --recipient` set the keys it encrypts to; `metis setup --from-export` restores an archive onto a new server; and `metis db move` moves the databases to Turso or another sqld.
- `metis db export --out s3://bucket/prefix` uploads the archive to S3 or an S3-compatible store (`--s3-endpoint`), and every export is recorded for the dashboard's Exports page.
- Export and import from any machine, against Turso or any sqld: `metis keygen` makes a key pair or a passphrase key, `metis db export --env-file` writes an encrypted archive of a deployment in maintenance, `metis db load` loads one into two empty databases, and `metis export decrypt` and `inspect` open and check archives.
