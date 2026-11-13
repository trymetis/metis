# Operator-defined servers and credential drivers

How IMAP+SMTP, CalDAV, CardDAV, the three mail gateways, S3, WebDAV, FTP and SFTP are configured by the operator and connected by users with only their own login.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [connections.md](connections.md), [configuration.md](configuration.md), [mail.md](mail.md), [calendar.md](calendar.md), [gateways.md](gateways.md), [drive-providers.md](drive-providers.md).

## Code map

| Concern                    | Where                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry schemas and lists    | `src/config/schema.ts` → `imapServersSchema` … `sftpServersSchema` (built by the private `serverListSchema`), `serverEntryId` · seeded from env in `src/config/from-env.ts`, stored in `instance_config.servers` ([configuration.md](configuration.md))                                                                  |
| Editing entries            | `src/dashboard/config-forms.ts` → `LIST_FIELDS`, `sectionFromForm` (the System provider pages, [dashboard.md](dashboard.md))                                                                                                                                                                                             |
| Stored reference documents | `src/connections/credential-schema.ts` → `connectionCredentialsSchema` · column `connection.credentials` in `src/db/schema.ts`                                                                                                                                                                                           |
| Reference → full details   | `src/connections/servers.ts` → `resolveServerCredentials` · used by `src/connections/connection-store.ts` → `resolveConnectionAuth`, `src/server/routes/connections.ts` → `createCredential` and `src/connections/quarantine.ts` → `reconcileQuarantine`, `backfillServerIds`                                            |
| Long-lived clients         | `src/drive/providers/s3/client.ts` → `s3Client` · `src/drive/providers/ftp/pool.ts` → `retireFtpServers` · `src/drive/providers/sftp/client.ts` → `retireSftpServers` · `src/mail/providers/imap-pool.ts` → `retireImapServers` · driven by `src/config/watch.ts`                                                        |
| Driver kinds               | `src/connections/types.ts` → `ProviderDriver` · `src/connections/registry.ts` → `getCredentialDriver`                                                                                                                                                                                                                    |
| Credential driver factory  | `src/connections/drivers/credential.ts` → `createCredentialDriver`, `credentialAccountId` · per provider `src/connections/drivers/{imap,caldav,carddav,s3,webdav,ftp,sftp}.ts` · gateways `src/connections/drivers/gateway.ts` → `createGatewayDriver`, per gateway `src/connections/drivers/{cloudflare,resend,ses}.ts` |
| Probes                     | `src/connections/verify-servers.ts` → `verifyConnectServers`, `serverChecks`                                                                                                                                                                                                                                             |

## Rules

- **The operator defines servers; users bring only their own login.**
  - The entry carries what the service needs: hosts, endpoints and, for S3, the access key pair.
  - The user supplies only what they choose: login, token, or bucket + prefix.
  - The server only ever connects to hosts an entry names.
- **Every entry has a stable `id`, and the id is the key connections reference.**
  - Names and ids are each unique per provider; the list schemas refuse duplicates.
  - An entry without an `id` gets `serverEntryId(provider, name)`, a hash of provider and name, so redeploying the same env keeps it.
  - An entry added in the dashboard gets a random id, and renaming an entry there keeps its id, so its connections survive.
  - Removing an entry quarantines its connections ([connections.md](connections.md)).
- **Resolution matches by `serverId` when the stored reference has one, else by name.** Preflight's `backfillServerIds` adds the id to a reference that carries only a name.
- **`allowInsecureTls` is per entry and off by default, on every server kind that speaks TLS.**
  - IMAP/SMTP: `rejectUnauthorized: false` (`imap-pool.ts`, `imap.ts`).
  - CalDAV and CardDAV: an `undici` `Agent` passed as tsdav's `fetchOptions.dispatcher` (`insecureAgent` in `src/calendar/providers/caldav.ts` and `src/contacts/providers/carddav.ts`).
  - S3, WebDAV and FTP: see [drive-providers.md](drive-providers.md).
- **An IMAP entry's IMAP or SMTP side without implicit TLS (`secure: false`) must upgrade with STARTTLS, unless that side sets `plain: true`.**
  - IMAP gets imapflow's `doSTARTTLS: true` and SMTP nodemailer's `requireTLS` (`src/mail/providers/imap-pool.ts` → `requiresStartTls`), so a server that never offers STARTTLS, or an attacker stripping it from the cleartext capability list, fails the connection instead of sending the login unencrypted.
  - `plain` keeps the opportunistic upgrade, for a local server without TLS; the schema refuses it together with `secure: true`.
  - The dashboard save probe only reads the greeting, so an entry whose server offers no STARTTLS saves and fails at connect.
- **The row stores a reference, never the server details.** `connection.credentials` holds `{provider, serverId, server, …}` plus only what the user chose; `createCredential` writes the resolved entry's id and name, whatever the client sent.
  - It is sealed with `encryptedText` and is the one encrypted JSON document, parsed at the store boundary by `credential-schema.ts` and absent from `CONNECTION_COLUMNS` ([connections.md](connections.md)).
  - The entry id is kept in plain text in `connection.server` and the name in `connection.server_name` (both null for OAuth), so counts and labels never decrypt credentials.
  - `CONNECTION_COLUMNS.server` is the label (`serverLabel`, falling back to `server` when `server_name` is null).
- **Changing an entry never cuts a transfer in flight.** Each long-lived client retires a changed entry's connections only once they are idle; the mechanics per provider are in [drive-providers.md](drive-providers.md) and [mail.md](mail.md).
- **A reference joins its config entry through `resolveServerCredentials` only.**
  - At runtime through `resolveConnectionAuth`; at connect time through `createCredential`; in `reconcileQuarantine` and `backfillServerIds`.
  - At runtime a missing entry resolves to null, so the connection's calls fail until quarantine marks it.
- **A credential provider serves exactly one resource** (`credentialResourceFor` is the first entry of `PROVIDER_RESOURCES`), so CalDAV and CardDAV are separate server lists and separate connections even when one server and login serve both.
- **A credential driver has only `verify(credentials, email)` over an already-resolved entry.** `ProviderDriver` is a union on `kind`, and both connection routes reject the wrong kind.

## How it works

- **Account identity.** `credentialAccountId` hashes `<key>|<server name>`, both trimmed and lowercased.
  - The key is the email by default, `user|root` for WebDAV, FTP and SFTP, and `bucket|prefix` for S3.
  - So the same login on two entries is two connections.
- **Connect.** The connect dialog renders one button per `connectServers()` entry. `connections.createCredential` resolves the named entry, runs the driver's `verify`, upserts the connection and optionally attaches it to a workspace.
- **Probes.** Preflight probes every entry in the stored config (`verifyConnectServers`) and warns on failures without failing the run; a dashboard save probes the candidate entries and refuses on a failure ([dashboard.md](dashboard.md)).

## Deliberate limits

- **Reconnecting after a rename creates a second connection.** Account identity hashes the entry name, not its id; the renamed entry's existing connections keep working.
