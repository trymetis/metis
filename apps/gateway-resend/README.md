# metis-resend-mail — Resend backend for Metis Suite

A gateway per domain that receives mail through Resend's inbound webhook,
stores parsed messages in a libSQL database and raw MIME + attachments in a
directory or S3-compatible object storage, sends through `POST https://api.resend.com/emails`, and exposes
the same REST API Metis Suite's Cloudflare provider speaks (`/v1/*`). Metis
talks to this gateway, never to Resend.

**Why a gateway and not a direct integration.** Resend has exactly two API key
permissions: `sending_access` (which can only send) and `full_access` (which is
account-wide and can mint keys and delete domains). Reading inbound mail needs
`full_access`, so a per-mailbox credential that reads mail cannot exist at
Resend. Keeping that key here means Metis stores only a gateway-minted token
scoped to one address, exactly as it does for Cloudflare. Resend also deletes
inbound mail after **30 days**, so this gateway copies bodies, attachments and
raw MIME at ingest — it is the archive, not a cache.

**One deployment serves many mailboxes.** Receiving on a Resend domain is a
catch-all: every address at the domain arrives in one account-wide stream. This
gateway routes each message by its envelope recipient (`received_for`, falling
back to `to`) and **drops mail for addresses that have no token** — minting a
token is what brings an address into existence. Every API token is scoped to
one address; the `API_TOKEN` env var is the **admin token**, which can mint and
revoke mailbox tokens (`/v1/tokens`) but never read mail.

Known-degraded by design, like the IMAP and Cloudflare providers: search is SQL
`LIKE` (case-insensitive for ASCII only), threading is synthesized from `References`, folders are app-level
state, and only mail received after setup exists — there is no history import.

## Prerequisites

- A Resend account with the domain verified and **receiving enabled**
  (`capabilities.receiving`), plus the inbound `MX` record on the domain at the
  lowest priority. A domain with existing MX records should use a subdomain.
- A `full_access` Resend API key.
- A libSQL database of its own: a `sqld` server, a Turso database, or a local
  `file:` path. Any URL `@libsql/client` accepts works.

## Configuration

| Variable                                                  | Required | Purpose                                                                                                                                                                                             |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                            | yes      | libSQL URL (`http://`, `https://`, `libsql://`, `ws://`, `wss://` or `file:`).                                                                                                                      |
| `DATABASE_AUTH_TOKEN`                                     | no       | The database's token, when it needs one.                                                                                                                                                            |
| `MAIL_DOMAIN`                                             | yes      | The domain this deployment serves.                                                                                                                                                                  |
| `API_TOKEN`                                               | yes      | Admin token for `/v1/tokens`. `openssl rand -hex 32`.                                                                                                                                               |
| `RESEND_API_KEY`                                          | yes      | A `full_access` key. Never leaves this service.                                                                                                                                                     |
| `RESEND_WEBHOOK_SECRET`                                   | no       | Svix `whsec_…` signing secret. Without it `/webhooks/resend` returns 503 and nothing is ingested.                                                                                                   |
| `PORT`                                                    | no       | Defaults to `8787`.                                                                                                                                                                                 |
| `POLL_INTERVAL_SEC`                                       | no       | Seconds between catch-up polls of `GET /emails/receiving`. `0` (default) disables it. Use it for local development, where Resend cannot reach the webhook, and as a backstop for missed deliveries. |
| `BLOB_DIR`                                                | no       | Directory for raw MIME and attachments when no object storage is set. Defaults to `data/blobs`; `/data/blobs` in the image.                                                                         |
| `BLOB_ENDPOINT` `BLOB_BUCKET` `BLOB_KEY_ID` `BLOB_SECRET` | no       | S3-compatible object storage (R2, S3, MinIO, RustFS) for raw MIME and attachments. Set all four or none — with none, blobs go in `BLOB_DIR`.                                                        |
| `BLOB_REGION`                                             | no       | Defaults to `auto` (correct for R2).                                                                                                                                                                |

## Setup with the metis CLI

On a Metis server with a domain, one command adds the domain to Resend with
receiving on, creates its DNS records (through Cloudflare when
`CLOUDFLARE_API_TOKEN` is set and the zone is there, otherwise it prints them),
waits for verification, creates the webhook, runs this image with its own
database and registers the gateway in Metis:

```sh
sudo RESEND_API_KEY=... metis add gateway-resend --domain example.com
```

The gateway is served at `resend.` plus your Metis domain (`--host` changes
it). `--database stack` keeps its rows in a namespace on the server's sqld
instead of a sqld of its own, and `--blobs objstore` keeps blobs in the
server's object storage. With the gateway running elsewhere, `metis add
gateway-resend --endpoint https://gateway.example.com --domain example.com`
sets up only the Resend side and prints the values to set on the gateway. Mint
mailbox tokens with `metis gateway token create alice@example.com`.

The steps below do the same by hand.

## Setup

The published image is `ghcr.io/trymetis/metis-gateway-resend`, tagged with
each `gateway-resend-v` release's version (`latest` follows the newest release
that is not a pre-release; `https://sh.trymetis.email/gateway-resend/version.txt`
names it). Any release works with any Metis server, because both speak `/v1`. The container applies `schema.sql` to `DATABASE_URL` on every
start, then serves on port `8787`. Blobs in `BLOB_DIR` live under `/data`, a
volume, so mount one to keep them across a recreated container:

```sh
docker run -d --name metis-resend --env-file .env -p 8787:8787 \
  -v metis-resend-data:/data ghcr.io/trymetis/metis-gateway-resend:latest
```

The image builds from the repository root, because it needs the shared
`@metis/gateway-contract` package:
`docker build -f apps/gateway-resend/Dockerfile -t metis-resend .`

To run from source instead:

```sh
bun install                  # from the repository root
cd apps/gateway-resend

DATABASE_URL=... DATABASE_AUTH_TOKEN=... bun run db:apply
bun run start
```

Then in the Resend dashboard add a webhook pointing at
`https://gateway.example.com/webhooks/resend` subscribed to `email.received`, and copy
its `whsec_…` secret into `RESEND_WEBHOOK_SECRET`.

## Minting a mailbox token

```sh
ADMIN_TOKEN=... bun run token https://... create you@yourdomain.com
ADMIN_TOKEN=... bun run token https://... list
ADMIN_TOKEN=... bun run token https://... revoke you@yourdomain.com
```

The token is shown once. Hand it to the person who owns that address; they
paste it into Metis when connecting the mailbox.

## API

`/v1/*` is the contract `apps/web/src/mail/providers/gateway-client.ts` speaks,
shared with the Cloudflare Worker. Its types, routes and helpers live once in
`packages/gateway-contract`; this service only supplies the libSQL and blob
store behind them, Resend sending, and the webhook. `GET /v1/health` echoes `{ ok, backend: "resend",
domain, address }`; Metis's `verify()` cross-checks the echoed domain and token
address against the configured server entry and the address being connected.

`POST /webhooks/resend` is the only unauthenticated route — it is verified by
Svix signature instead, and is idempotent per Resend email id, because
webhook retries carry no attempt marker.
