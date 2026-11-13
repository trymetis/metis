# Mail gateways — the `/v1` contract, Cloudflare Email and Resend

The two mail backends that are separate services speaking one HTTP contract, and the one client Metis uses for both. Paths are from the repository root. See also [AGENTS.md](../AGENTS.md), [servers.md](servers.md), [mail.md](mail.md), [search.md](search.md), `apps/gateway-cloudflare/README.md`, `apps/gateway-resend/README.md`.

## Code map

| Concern                            | Where                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire types, folders, limits        | `packages/gateway-contract/src/wire.ts` → `WireEmail`, `FOLDERS`                                                                                                                                                                          |
| The `/v1` route table + auth       | `packages/gateway-contract/src/router.ts` → `handleRequest`, `GatewayStore`, `Gateway`                                                                                                                                                    |
| Shared helpers                     | `packages/gateway-contract/src/text.ts` → `snippetOf`, `firstMessageId`, `normalizeThreadKey`, `likePattern` · `cursor.ts` → `encodeCursor` · `crypto.ts` → `sha256Hex`                                                                   |
| Token CLI                          | `packages/gateway-contract/src/token-cli.ts` (bin `metis-gateway-token`; each gateway's `bun run token`; usage printed by the CLI)                                                                                                        |
| Cloudflare Worker                  | `apps/gateway-cloudflare/src/index.ts` → default export `email` / `fetch` · `apps/gateway-cloudflare/wrangler.jsonc` · `schema.sql`                                                                                                       |
| Resend gateway: HTTP               | `apps/gateway-resend/src/app.ts` → `handleRequest` · `server.ts` · `env.ts` · `webhook.ts` → `verifyWebhook`                                                                                                                              |
| Resend gateway: ingest and storage | `apps/gateway-resend/src/ingest.ts` → `ingestReceived` · `poll.ts` → `startPolling`, `pollReceived` · `resend.ts` · `db.ts` · `blob.ts` → `blobs` · `apps/gateway-resend/Dockerfile`                                                      |
| Metis's one client                 | `apps/web/src/mail/providers/gateway-client.ts` → `gatewayMail`, `GatewayTarget`                                                                                                                                                          |
| Metis's adapter entry              | `apps/web/src/mail/adapter.ts` → `MAIL_ADAPTERS` (`cloudflare` and `resend` both map to `gatewayMail`)                                                                                                                                    |
| Metis-side verify                  | `apps/web/src/connections/drivers/gateway.ts` → `createGatewayDriver` · per gateway `apps/web/src/connections/drivers/{cloudflare,resend}.ts` · `apps/web/src/mail/providers/{cloudflare,resend}.ts` → `cloudflareVerify`, `resendVerify` |
| Provider list                      | `apps/web/src/connections/types.ts` → `GATEWAY_PROVIDERS`, `isGatewayProvider`                                                                                                                                                            |

## Rules

### The contract

- **A gateway is a separate service that speaks `/v1` and owns the provider's secrets.** `cloudflare` and `resend` are the two (`GATEWAY_PROVIDERS`); Metis stores only a per-address gateway token.
- **The contract is provider-neutral (it is `MailAdapter` over HTTP), so Metis has one client for every gateway.**
  - `gatewayMail` over a `GatewayTarget`, one `MAIL_ADAPTERS` entry shape, one driver factory (`createGatewayDriver`) and one config entry shape.
  - `mail/providers/{cloudflare,resend}.ts` hold only `verify`.
- **A third backend is a new gateway**: a `GATEWAY_PROVIDERS` entry, a `MAIL_ADAPTERS` entry and a driver, all reusing the gateway pieces above.
- **The contract is written once, in `packages/gateway-contract`, using only APIs both the Workers runtime and Bun have.** A gateway supplies its storage behind `GatewayStore` (D1 + R2, or Postgres + blob storage), its sending through `Gateway.send`, its ingest, and any extra routes of its own (Resend's webhook).
- **The gateway owns its storage**; Metis's schema and migrations never include it.
- **`snippetOf` builds every gateway snippet from the HTML's visible text, and from the plain text only when that is empty.**
  - It reads at most 64 KB from `<body>`, drops `head`, `title`, `style`, `script`, `noscript`, `template`, `xml`, `svg` and comments, decodes entities, and strips the invisible filler characters newsletters pad their preview text with.
  - It runs once at ingest and at send with a bounded cost, so it fits the Workers CPU limit; the list serves the stored snippet as is.

### Tokens

- **Every API token is scoped to one address and stored as a sha256 row.**
  - `/v1/send` sends only as the token's own address.
  - The admin `API_TOKEN` manages tokens; the mailbox routes refuse it.
- **Metis refuses an admin token or a mismatched one at connect time** ([servers.md](servers.md)): `createGatewayDriver`'s `verify` requires the email on the entry's domain, the health echo's domain to match the entry, and the token's address to equal the email.

### Cloudflare

- **Cloudflare Email is one Worker per domain, serving many mailboxes**: every row is keyed by the envelope recipient.
- **The Worker writes raw MIME to R2 before parsing it**, so a parse failure still leaves the raw message for the operator.
- **Cloudflare ingestion is idempotent per `(to_address, Message-ID)`**, because retries come from the sending MTA and carry no attempt marker.

### Resend

- **Resend has to be a gateway, because no per-mailbox Resend credential can read mail.**
  - Its API keys are `sending_access` (send only, pinnable to one `domain_id`) or `full_access` (account-wide: mints keys, deletes domains), and reading inbound needs `full_access`.
  - An account-wide key in `connection.credentials` would break the encryption threat model ([connections.md](connections.md)), so the gateway holds it.
- **The Resend gateway is the archive.** Resend deletes inbound after 30 days, so the gateway copies raw MIME and attachments to its own storage at ingest.
- **Resend ingest is idempotent per Resend email id.**
- **A Resend domain receives as a catch-all, so the gateway keeps mail only for addresses with a token row.** Minting a token is what brings an address into existence and establishes ownership.
- **List and read traffic stay inside the Resend gateway's own store**, because Resend's rate limit is per team.

## How it works

- **Cloudflare ingest.** The Worker's `email` handler normalizes the envelope recipient, skips a known `(to_address, Message-ID)`, puts the raw message in R2 (`RAW`), then indexes it in D1 (`DB`). Its `fetch` handler serves `/v1` through `handleRequest`.
- **Resend ingest.**
  - The webhook (`verifyWebhook`) delivers new email ids; with `POLL_INTERVAL_SEC` above 0, `startPolling` also polls `GET /emails/receiving` as a catch-up for local development and missed deliveries.
  - `ingestReceived` resolves the recipient (`received_for`, else `to`) and stores raw MIME and attachments in `blobs` (S3-compatible storage, or Postgres when none is configured) before writing the row.
- **Threading and cursors.** Gateways synthesize threads from Message-ID headers (`firstMessageId`, `normalizeThreadKey`) and page with a keyset cursor (`encodeCursor`).

## Deliberate limits

- **Gateways are degraded like IMAP**: SQL `LIKE` search (`likePattern`, [search.md](search.md)), synthesized threading, app-level folders, and no mail from before the gateway's setup.
- **Gateway mailboxes exist only in self-hosted setups.** Metis Cloud does not support them, so they never count as "Metis storing mail".
