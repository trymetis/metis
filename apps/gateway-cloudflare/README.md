# metis-cf-mail — Cloudflare Email backend for Metis Suite

A single Worker per domain that receives mail via Email Routing (per-address
rules or catch-all → `email()` handler), stores parsed messages in D1 and raw
MIME + attachments in R2, sends via the Email Sending binding
(`env.EMAIL.send()`, public beta, Workers **Paid** plan), and exposes the REST
API Metis Suite's `cloudflare` provider speaks (`/v1/*`). The routes, types and
helpers of that API live once in `packages/gateway-contract`; this Worker only
supplies the D1 and R2 store behind them, Email Sending, and ingest.

**One deployment serves many mailboxes.** Every message is keyed by
`to_address` (the envelope recipient), and every API token is scoped to one
address — a token for `alice@domain.com` can only read, send as, and delete
Alice's mail. The `API_TOKEN` Worker secret is the **admin token**: it can only
mint and revoke mailbox tokens (`/v1/tokens`), never read mail. In Metis, each
address on the domain is its own mailbox connection with its own token.

Known-degraded by design, like the IMAP provider: search is SQL `LIKE`,
threading is synthesized from `References`, folders are app-level D1 state, and
only mail received after setup exists — there is no history import.

## Prerequisites

- The domain is a zone on this Cloudflare account (Email Routing needs
  Cloudflare DNS).
- Workers Paid plan (Email Sending to arbitrary recipients).
- An API token with `Zone → Email Routing:Edit`, `Zone → DNS:Edit` for the
  setup script, and account permission to deploy Workers for wrangler.

## Setup with the metis CLI

On a Metis server, one command creates everything below (the D1 database, the
R2 bucket, the Worker from the newest release's `gateway-cloudflare.zip`, its
workers.dev route, Email Routing and Email Sending with their DNS records) and
registers the gateway in Metis:

```sh
sudo CLOUDFLARE_API_TOKEN=... metis add gateway-cloudflare --domain example.com
```

`--addresses alice@example.com,bob@example.com` routes only those addresses
instead of the whole domain. From any other machine, `metis add
gateway-cloudflare --remote --domain example.com` does the same and prints the
admin token and the server entry; `--version 0.2.0` deploys that release instead
of the newest. `metis remove gateway-cloudflare --domain example.com` undoes it, and
`--purge` also deletes the D1 database and the R2 bucket. Mint mailbox tokens
with `metis gateway token create alice@example.com`.

The steps below do the same by hand.

## Initial setup (once per domain)

```sh
bun install                  # from the repository root
cd apps/gateway-cloudflare

bun run db:create            # prints the D1 database id
# → paste the id into wrangler.jsonc (database_id), set MAIL_DOMAIN
bun run r2:create
bun run db:apply             # applies schema.sql to the remote D1

bun run secret               # API_TOKEN (admin) — generate: openssl rand -hex 32
bun run deploy               # prints the workers.dev URL

CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
  MAIL_ADDRESSES=alice@yourdomain.com,bob@yourdomain.com \
  bun run setup
```

`setup.ts` is idempotent and does the zone-side wiring via the Cloudflare API:

1. Enables Email Routing on the zone (Cloudflare adds the MX/SPF records).
2. **With `MAIL_ADDRESSES` set**: creates one routing rule per address
   (`literal` matcher → this Worker) and disables the catch-all, so mail for
   unlisted addresses is rejected with 550 at SMTP time. The zone limit is 200
   rules. **Without it**: points the catch-all at the Worker instead — every
   address and ad-hoc alias on the domain is accepted (more spam surface, but
   aliases work with zero provisioning).
3. Onboards the domain for Email Sending
   (`POST /zones/:id/email/sending/subdomains`).
4. Creates the sending DNS records it requires (SPF/DKIM/DMARC + `cf-bounce`
   MX) that are not already present.

Re-run it with more `MAIL_ADDRESSES` whenever an address is added. Override
the worker name with `WORKER_NAME=...`.

## Published build

Every `gateway-cloudflare-v` release publishes the built Worker as
`https://sh.trymetis.email/gateway-cloudflare/vVERSION/gateway-cloudflare.zip`,
listed in that folder's `SHA256SUMS` (`gateway-cloudflare/version.txt` names
the newest release; any release works with any Metis server): wrangler's bundled `index.js` and its source map, built
with `bun run build` and `bun run package` here. It carries no bindings; whoever
deploys it supplies the D1 database, the R2 bucket, `send_email`, `MAIL_DOMAIN`
and `API_TOKEN` as in `wrangler.jsonc`.

## Minting mailbox tokens (once per address)

```sh
ADMIN_TOKEN=... bun run token https://metis-cf-mail.you.workers.dev \
  create alice@yourdomain.com
```

Prints the token once — it is stored only as a sha256 hash. `revoke <address>`
kills it, `list` shows which addresses have one. Creating again rotates it.
Under catch-all mode, mail for an address without a token is still stored and
becomes visible the moment a token for it is minted.

## Connecting in Metis Suite

Register the deployment on the Metis server — one entry per domain, and the
provider only exists while at least one is set:

```
METIS_CLOUDFLARE_SERVERS=[{"name":"CF Mail Server 1","domain":"yourdomain.com","endpoint":"https://metis-cf-mail.you.workers.dev"}]
```

Each entry appears as its own choice in the add-mailbox dialog, labeled by its
name. Users pick it and enter only:

- **Email address** — the address the token was minted for.
- **Mailbox token** — that address's token (the admin token is refused).

The endpoint is resolved server-side from the config and never shown to users.
Metis verifies against `GET /v1/health`, checks the Worker's domain against the
configured one, and rejects an email that doesn't match the token's address —
all before saving anything.

## Limits worth knowing

- D1 row cap is 2 MB — bodies are truncated at 1 MB; raw MIME and attachments
  live in R2, not D1.
- Email Sending: 3,000 emails/month included on Workers Paid, then $0.35/1k;
  max 50 recipients per send; still beta.
- Email Routing: max 200 routing rules per zone — beyond that, use catch-all
  mode.
