# Mail gateways — the `/v1` contract, Cloudflare Email, Resend and Amazon SES

The three mail backends that are separate services speaking one HTTP contract, and the one client Metis uses for all of them. Paths are from the repository root. See also [AGENTS.md](../AGENTS.md), [servers.md](servers.md), [mail.md](mail.md), [search.md](search.md), `apps/gateway-cloudflare/README.md`, `apps/gateway-resend/README.md`, `apps/gateway-ses/README.md`.

## Code map

| Concern                            | Where                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire types, folders, limits        | `packages/gateway-contract/src/wire.ts` → `WireEmail`, `FOLDERS`                                                                                                                                                                                               |
| The `/v1` route table + auth       | `packages/gateway-contract/src/router.ts` → `handleRequest`, `GatewayStore`, `Gateway`                                                                                                                                                                         |
| Shared helpers                     | `packages/gateway-contract/src/text.ts` → `snippetOf`, `firstMessageId`, `normalizeThreadKey`, `likePattern` · `cursor.ts` → `encodeCursor` · `crypto.ts` → `sha256Hex`                                                                                        |
| Token CLI                          | `packages/gateway-contract/src/token-cli.ts` (bin `metis-gateway-token`; each gateway's `bun run token`; usage printed by the CLI)                                                                                                                             |
| Cloudflare Worker                  | `apps/gateway-cloudflare/src/index.ts` → default export `email` / `fetch` · `apps/gateway-cloudflare/wrangler.jsonc` · `schema.sql`                                                                                                                            |
| Resend gateway: HTTP               | `apps/gateway-resend/src/app.ts` → `handleRequest` · `server.ts` · `env.ts` · `webhook.ts` → `verifyWebhook`                                                                                                                                                   |
| Resend gateway: ingest and storage | `apps/gateway-resend/src/ingest.ts` → `ingestReceived` · `poll.ts` → `startPolling`, `pollReceived` · `resend.ts` · `db.ts` · `blob.ts` → `blobs` · `apps/gateway-resend/Dockerfile`                                                                           |
| SES gateway: Lambda and HTTP       | `apps/gateway-ses/src/lambda.ts` → `handler` · `app.ts` → `handle` · `send.ts` → `sendMail` · `env.ts`                                                                                                                                                         |
| SES gateway: ingest and storage    | `apps/gateway-ses/src/ingest.ts` → `ingestReceipt` · `store.ts` → `store`, `deleteUnreferencedRaw` · `schema.sql` · `scripts/apply-schema.ts` · deployment list in `apps/gateway-ses/README.md`                                                                |
| Metis's one client                 | `apps/web/src/mail/providers/gateway-client.ts` → `gatewayMail`, `GatewayTarget`                                                                                                                                                                               |
| Metis's adapter entry              | `apps/web/src/mail/adapter.ts` → `MAIL_ADAPTERS` (`cloudflare`, `resend` and `ses` all map to `gatewayMail`)                                                                                                                                                   |
| Metis-side verify                  | `apps/web/src/connections/drivers/gateway.ts` → `createGatewayDriver` · per gateway `apps/web/src/connections/drivers/{cloudflare,resend,ses}.ts` · `apps/web/src/mail/providers/{cloudflare,resend,ses}.ts` → `cloudflareVerify`, `resendVerify`, `sesVerify` |
| Provider list                      | `apps/web/src/connections/types.ts` → `GATEWAY_PROVIDERS`, `isGatewayProvider`                                                                                                                                                                                 |

## Rules

### The contract

- **A gateway is a separate service that speaks `/v1` and owns the provider's secrets.** `cloudflare`, `resend` and `ses` are the three (`GATEWAY_PROVIDERS`); Metis stores only a per-address gateway token.
- **The contract is provider-neutral (it is `MailAdapter` over HTTP), so Metis has one client for every gateway.**
  - `gatewayMail` over a `GatewayTarget`, one `MAIL_ADAPTERS` entry shape, one driver factory (`createGatewayDriver`) and one config entry shape.
  - `mail/providers/{cloudflare,resend,ses}.ts` hold only `verify`.
- **Another backend is a new gateway**: a `GATEWAY_PROVIDERS` entry, a `MAIL_ADAPTERS` entry and a driver, all reusing the gateway pieces above.
- **The contract is written once, in `packages/gateway-contract`, using only APIs both the Workers runtime and Bun have.** A gateway supplies its storage behind `GatewayStore` (D1 + R2, libSQL + a directory or S3, or libSQL + S3), its sending through `Gateway.send`, its ingest, and any extra routes of its own (Resend's webhook). Nothing below `/v1` is shared between gateways: each runs in its own environment (a Worker, a container, a Lambda function).
- **The gateway owns its storage**; Metis's schema and migrations never include it.
- **Every `app-v*` release publishes each gateway's artifact** ([self-host.md](self-host.md), [deployment.md](deployment.md)): the Resend image `ghcr.io/trymetis/metis-gateway-resend:VERSION`, and `gateway-ses.zip` and `gateway-cloudflare.zip` under `https://sh.trymetis.email/vVERSION/`.
- **The `metis` CLI sets each gateway up from those artifacts** ([cli.md](cli.md)): `metis add gateway-cloudflare`, `gateway-resend` and `gateway-ses` create the provider's resources for the running app version, write the admin `API_TOKEN` to `env/` and store a `metis-` server entry; `metis gateway token` mints and revokes mailbox tokens. Each README keeps the manual steps.
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
- **The Resend gateway stores every `date` as `toISOString()` text**, because keyset paging compares dates as strings.
  - `isoDate` (`src/ingest.ts`) parses Resend's `created_at`, rewrites its Postgres-style form (`2023-04-03 22:13:42.674981+00`) when plain parsing fails, and falls back to the time of ingest.
- **Directory blob keys are checked segment by segment** (`KEY_SEGMENT` in `src/blob.ts`), so a Resend attachment id cannot escape `BLOB_DIR`.

### Amazon SES

- **The SES gateway is a Lambda function behind a function URL, with rows in libSQL and raw mail and attachments in the receiving S3 bucket.**
  - It is a zip, not an image, because Lambda runs container images only from ECR in the function's own region.
  - The zip is one ESM bundle with no native modules (`@libsql/client/web`), so one artifact runs on `arm64` and `x86_64`.
- **The function URL streams responses** (`RESPONSE_STREAM`, `awslambda.streamifyResponse` in `lambda.ts`), so raw messages and attachments over Lambda's 6 MB buffered limit download from the same endpoint the server entry names.
  - The function stays outside a VPC, because function URLs do not stream inside one.
- **SES invokes the function with metadata only.** `Records[].ses.mail.messageId` is also the object key the receipt rule's S3 action wrote (no prefix), and `receipt.recipients` are the envelope recipients the rule matched.
- **One row per claimed recipient, all pointing at one raw object.**
  - A recipient is claimed when its lowercased address is on `MAIL_DOMAIN` and has a token row; mail with no claimed recipient has its raw object deleted.
  - Each row gets its own attachment copies under `att/ROW_ID/INDEX`, so the router's per-row attachment keys work unchanged.
  - The raw object is deleted with its last row: `deleteBlobs` deletes attachment keys directly and a raw key only when no row still names it (`deleteUnreferencedRaw`).
- **SES ingest is idempotent per `(to_address, ses_message_id)` and `(to_address, Message-ID)`**: a redelivered event finds its rows and stores nothing.
- **A spam or virus verdict of `FAIL` stores the message in the Spam folder.**
- **SES replaces any `Message-ID` a sender supplies**, so the gateway writes none and returns SES's own (`<MessageId@email.amazonses.com>` in us-east-1, `<MessageId@REGION.amazonses.com>` elsewhere), which threads the Sent copy.
- **The S3 client uses path-style requests and follows region redirects**, so the bucket may sit in another receiving region than the function.
- **The execution role sends only from the gateway's domain**: `Resource` names the domain identity and `identity/*@DOMAIN`, with `StringLike` on `ses:FromAddress`; `StringLike` is case-sensitive, so `MAIL_DOMAIN` is lowercased and `/v1/send` sends as the token's lowercased address. A new mailbox needs no IAM change.
- **The role may list the bucket**, so a missing object is a `NoSuchKey` (404 to the client), not a 403.
- **The gateway's rule joins the active rule set**; only when none is active is one created and activated, and removing the gateway deletes only its rule, because one active set per region governs all receiving.

## How it works

- **Cloudflare ingest.** The Worker's `email` handler normalizes the envelope recipient, skips a known `(to_address, Message-ID)`, puts the raw message in R2 (`RAW`), then indexes it in D1 (`DB`). Its `fetch` handler serves `/v1` through `handleRequest`.
- **Resend ingest.**
  - The webhook (`verifyWebhook`) delivers new email ids; with `POLL_INTERVAL_SEC` above 0, `startPolling` also polls `GET /emails/receiving` as a catch-up for local development and missed deliveries.
  - `ingestReceived` resolves the recipient (`received_for`, else `to`) and stores raw MIME and attachments in `blobs` (S3-compatible storage through the AWS SDK, or `BLOB_DIR` when none is configured) before writing the row in libSQL.
- **SES ingest.** SES receives for the domain, its receipt rule writes the raw message to the bucket and invokes the function asynchronously with the receipt event. `ingestReceipt` keeps the claimed recipients that have no row yet, reads and parses the object once (`postal-mime`), writes each row's attachments and row, and deletes the raw object when no row ended up naming it. A failed invocation falls to Lambda's asynchronous retries and the function's failure destination; the raw message stays in the bucket.
- **SES HTTP.** `lambda.ts` turns a function URL event into a `Request`, runs the contract's `handleRequest` and streams the `Response` through `awslambda.HttpResponseStream`. `/v1/send` builds the MIME message with nodemailer's `MailComposer` and sends it with SESv2 `SendEmail` (`Content.Raw`), naming every recipient in `Destination` so Bcc is delivered.
- **Threading and cursors.** Gateways synthesize threads from Message-ID headers (`firstMessageId`, `normalizeThreadKey`) and page with a keyset cursor (`encodeCursor`).

## Deliberate limits

- **Gateways are degraded like IMAP**: SQL `LIKE` search (`likePattern`, [search.md](search.md); SQLite ignores case for ASCII only), synthesized threading, app-level folders, and no mail from before the gateway's setup.
- **The SES gateway has no catch-up poll**: a receipt event that keeps failing ends in the function's failure destination, with the raw message still in the bucket.
- **A sandboxed SES account sends only to verified addresses** until AWS grants production access for the region.
- **Gateway mailboxes exist only in self-hosted setups.** Metis Cloud does not support them, so they never count as "Metis storing mail".
