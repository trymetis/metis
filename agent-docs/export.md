# Export and import — encrypted archives of an install

One export format for every install: an encrypted archive of the app database, the Mastra database and the boot environment, made while the app is in maintenance and loadable into empty databases anywhere.
This doc covers the archive format, its keys, the copy over Hrana, and the `metis` commands that make and read archives. Paths are relative to `apps/cli/` unless they name another folder.
See also [AGENTS.md](../AGENTS.md), [configuration.md](configuration.md) (maintenance mode), [database.md](database.md), [workflow-runtime.md](workflow-runtime.md), [cli.md](cli.md).

## Code map

| Concern                             | Where                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys, fingerprints, passphrase keys | `internal/keys/keys.go` → `ParsePublic`, `ParsePrivate`, `Fingerprint`, `Generate`, `Derive`, `NewKDF`, `MarshalPublic`, `MarshalPrivate`                                                                                                 |
| The archive format                  | `internal/archive/format.go` → `Metadata`, `Header`, `Recipient`, `canonicalHash` · `chunk.go` → `sealer`, `opener`, `chunkNonce`                                                                                                         |
| Writing and reading archives        | `internal/archive/write.go` → `Write`, `TempDir`, `CleanStale` · `read.go` → `ReadMetadata`, `Inspect`, `Extract` · `space_*.go` → `FreeBytes`                                                                                            |
| The Hrana client                    | `internal/hrana/hrana.go` → `New`, `BaseURL`, `Execute`, `Query`, `Batch`, `Transaction` · test server `internal/hrana/hranatest`                                                                                                         |
| Copying a database                  | `internal/dbcopy/dbcopy.go` → `Dump`, `Load`, `Empty`, `Size`                                                                                                                                                                             |
| Export and load from an env file    | `internal/export/export.go` → `Run`, `CheckEncryptionKey`, `CheckMaintenance`, `WaitForWork` · `load.go` → `Load` · `env.go` → `Env`, `excludedKeys`                                                                                      |
| Commands                            | `cmd/metis/export.go` → `newKeygenCommand`, `newDBCommand` (`db export`, `db load`, `db move`), `newExportCommand` (`export decrypt`, `export inspect`, `export recipients`)                                                              |
| On a server                         | `cmd/metis/exports_server.go` → `runServerExport`, `runDBMove`, `stackClient`, `newExportRecipientsCommand` · `cmd/metis/setup_export.go` → `openExport`, `fromExport.loader` · `internal/state/state.go` → `ExportRecipients`, `Running` |
| Export records and S3 output        | `internal/export/record.go` → `RecordColumns`, `record` · `internal/export/s3.go` → `ParseS3`, `Upload` · table `apps/web/src/db/schema.ts` → `exportRecord` · read by `apps/web/src/dashboard/exports.ts` ([dashboard.md](dashboard.md)) |

## Rules

### What an export is

- **An export is one feature.** Whether an archive is a backup or a move is the owner's choice; nothing in the format or the commands tells them apart.
- **An export is taken only from an app in maintenance**, so nothing writes while the databases are copied ([configuration.md](configuration.md) → Maintenance).
  - `db export` asks the app's URL (`--app-url`, else `BETTER_AUTH_URL`) with `Accept: application/json` and needs a 503 carrying `Metis-Maintenance`; its time and `Metis-Version` go into the header.
  - `--force` skips the check for an app that is already down, records `maintenanceSince: null`, and takes the version from `--app-version`, which it then needs.
- **Nothing that writes an archive can read it.** Writers hold public keys only; reading needs the private key or the passphrase.
- **An archive restores only into empty databases**, on its release or a newer one. `dbcopy.Empty` refuses a target with any table, index, trigger or view outside `sqlite_*` and `libsql_*`, naming one.

### Keys

- **Keys are P-256 key pairs in standard PEM**: the public key as SubjectPublicKeyInfo (`PUBLIC KEY`), the private key as PKCS#8 (`PRIVATE KEY`) or SEC1 (`EC PRIVATE KEY`, what `openssl ecparam -genkey` writes, after its `EC PARAMETERS` block). Any other key type is refused, naming the type found.
- **A fingerprint is the first 16 bytes of SHA-256 over the uncompressed public point, in lowercase hex.**
- **A passphrase key is an opt-in recipient, not a mode.** Argon2id (t=3, m=64 MiB, p=4, RFC 9106's second recommended set) turns the passphrase and a random 16-byte salt into a seed; HKDF-SHA256 with info `metis-export/v1/p256/` plus a counter turns it into a P-256 key, taking the first counter `ecdh.P256().NewPrivateKey` accepts.
  - `metis keygen --from-passphrase` writes only the `.pub`, with PEM headers `Metis-KDF`, `Metis-KDF-Params` and `Metis-KDF-Salt`; the recipient entry in each archive carries the same parameters, so `--passphrase` re-derives the key from the archive alone.
- **The CLI never stores keys, passphrases or database tokens.**

### The archive format (`metis-export/v1`)

- **The archive is a tar file named `metis-export-20261111T100000Z.tar` (its creation time in UTC).** Its entries come in this order:
  - `metadata.json`, unencrypted;
  - `app.sqlite.gz.enc`, `mastra.sqlite.gz.enc` and `boot.env.gz.enc`;
  - any further files the header lists.
- **`metadata.json` is `{format, header, files}`.**
  - `header` holds `createdAt`, `appVersion`, `migration` (the last id in `schema_migration`), `source` (`turso` for a `*.turso.io` host, otherwise `sqld`), `maintenanceSince`, `files` (entry names) and `recipients`.
  - The outer `files` lists each entry's ciphertext size and SHA-256, which `export inspect` checks without a key.
- **The header is bound into every byte.** `H` is the SHA-256 of the header as canonical JSON: keys sorted, no whitespace, no HTML escaping. `H0` is the same hash with `recipients` removed.
  - Readers hash the header exactly as stored (`RawHeader`), so a field a newer writer adds still verifies.
- **Key wrapping:** one random 32-byte export key `K` per archive.
  - For each recipient `R`, a fresh ephemeral key `E` gives `S = ECDH(E, R)`.
  - `W = HKDF-SHA256(S, salt = E.pub ‖ R.pub, info "metis-export/v1/wrap")`.
  - `K` is sealed with AES-256-GCM under `W` with a zero nonce and `H0` as associated data. The zero nonce is safe because each `W` seals once.
- **File encryption:** each file's key is `HKDF-SHA256(K, info "metis-export/v1/file/" + entry name)`. Its gzip stream is cut into 64 KiB chunks.
  - Chunk `i` is sealed with AES-256-GCM under a 12-byte nonce: 11 bytes of big-endian `i`, then `0x01` for the last chunk and `0x00` otherwise.
  - `H` is every chunk's associated data. An empty file is one empty last chunk.
- **A reader accepts the last-chunk flag only at the end of an entry.** So a dropped tail, a reordered chunk, an edited header and a wrong tag all stop with an error that names the file.
- **Nothing partial is left behind.**
  - Each file decrypts to `NAME.partial` and is renamed only after its size and SHA-256 match `metadata.json`; a failed extract removes what it wrote.
  - The archive is written as `NAME.tar.partial`, fsynced and then renamed.

### Copying databases

- **Databases are real SQLite files, read and written through the Hrana pipeline** (`POST URL/v2/pipeline`), so one path serves Turso, any sqld and the server's own sqld, and a decrypted file opens in `sqlite3`. A `libsql://` URL becomes `https://`.
- **Every column is read as `+"column"`.** SQLite's unary plus returns the value unchanged and drops the declared type, so the pure-Go driver never turns `TIMESTAMP` or `DATE` text into a `time.Time`.
- **Dump order is tables, rows, `sqlite_sequence`, then indexes, triggers and views, in creation order.**
  - Each table is read by `rowid` keyset, inserting the `rowid` too, or by primary key for a `WITHOUT ROWID` table.
  - A page is at most 1000 rows and about 8 MB: a first query reads each row's byte length (`length(CAST(column AS BLOB))`) and the page stops before 8 MB, because sqld refuses a result over about 10 MB ("Response is too large").
  - `sqlite_sequence` goes in last, so `AUTOINCREMENT` counters (`instance_config.version`) never step back.
  - Generated columns are skipped (`pragma_table_xinfo` → `hidden`).
  - The local file must pass `PRAGMA integrity_check`.
- **Load sends batches of at most 500 statements or 1 MiB as one `Transaction`:** `PRAGMA foreign_keys = OFF`, `BEGIN`, the statements, `COMMIT`, then `ROLLBACK` only when `COMMIT` did not run.
  - Each step runs only if the step before it succeeded, so a failing statement commits nothing of its batch.
  - The explicit `ROLLBACK` is there because the Hrana spec leaves an open transaction on a closed stream undefined; sqld rolls it back, other servers need not.
- **A text or blob value over 4 MiB is sent as a SQL literal** (`x'…'`, cast to text for text), because sqld refuses a parameter over about 5 MB ("string or blob too big") but accepts a larger literal.
  - Triggers are created after the rows, so loading fires none.
  - Each table's row count is then compared with the file, and any difference fails, naming the table.
- **The migration table travels with the data**, so preflight on the target sees every applied migration and refuses a database newer than its release ([database.md](database.md)).

### `db export` and `db load` from any machine

- **`db export --env-file FILE`** runs these steps in order:
  1. reads the file with no interpolation, dropping a trailing carriage return and one pair of surrounding quotes, and unescaping `\n`, `\"` and `\\` inside double quotes;
  2. names every missing one of `DATABASE_URL`, `MASTRA_DATABASE_URL`, `METIS_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `METIS_OWNER_EMAIL`, because a platform that hides sensitive values on pull leaves them empty;
  3. checks the encryption key;
  4. checks maintenance;
  5. checks free space;
  6. waits out running work;
  7. copies both databases and writes `boot.env` into a temporary folder;
  8. writes the archive.
- **The encryption key must open the current `instance_config.servers` value** (`v1:IV:TAG:BODY`, AES-256-GCM, the format of `apps/web/src/db/crypto.ts`) before anything else runs, because an archive made with the wrong key restores an instance that cannot read its own secrets.
- **Running work is waited out through its leases.**
  - The export polls every 5 s until no `workflow_run` and no `workflow_tick` row has `lease_expires_at` in the future (milliseconds).
  - Leases last `RUN_LEASE_MS` and `DISCOVERY_LEASE_MS` (`apps/web/src/workflow/tick.ts`), so work cut off when maintenance began is visible for at most that long.
  - After 5 minutes it stops, naming the likely cause: a worker on another host without `METIS_MAINTENANCE`.
- **Free space must cover twice the databases' `page_count × page_size`, plus 10 %**: the plain copies and the encrypted entries exist together until the archive is written.
- **`boot.env` is the env file minus `excludedKeys`** (the database variables, `METIS_DB_DRIVER`, the sqld keys, `METIS_MAINTENANCE`, `METIS_UPDATER_SOCKET`, the force-keys variable) and every `--drop-env` key.
  - A value with a line break is refused, naming it, because a raw env file cannot carry it.
- **`db load FILE`** works in this order:
  1. checks that both targets are empty;
  2. decrypts beside the archive;
  3. loads the app database, then the Mastra database;
  4. prints `boot.env` with the four database variables and `METIS_DB_DRIVER`, or writes it with `--write-env` (mode 600);
  5. says which release's preflight to run with it before deploying.
  - The targets must be what the app accepts (`dbConfigSchema` in `apps/web/src/config/schema.ts`), checked before anything else: both `libsql://` (driver `turso`) or both `http(s)://` or `ws(s)://` (driver `sqld`), each with a token.
  - `--app-url` sets a new `BETTER_AUTH_URL`, and the command then says the OAuth redirect URIs must be registered again and every MCP client must sign in again.
- **`export decrypt` writes the plain files, mode 600; `export inspect` prints the header and checks every entry without a key.**

### Where an archive goes and how it is recorded

- **`--out` takes a local folder or `s3://bucket/prefix`.**
  - The archive is always built locally first: in `--out`, the current folder for S3 from any machine, or `exports/` on a server.
  - An S3 upload uses the AWS SDK's `s3` commands with the default credential chain, `--s3-region`, and `--s3-endpoint` for S3-compatible stores. With an endpoint it uses path-style addressing, and request checksums only where required, because many S3-compatible stores reject the SDK's default ones.
  - Files up to 64 MiB go up in one `PutObject`, and larger ones as a multipart upload in 16 MiB parts, aborted on failure. The object carries `x-amz-meta-sha256`, and a `HeadObject` size check confirms it before the local copy is deleted.
  - `--keep-local` keeps the local copy, and both places are recorded.
- **Every export outside Metis Cloud writes one `export_record` row into the app database it copied, right after the archive and any upload are finished**, so an archive never lists itself; the next export carries it.
  - The row holds the creation time, release, last migration, maintenance time, file name, size and SHA-256 of the archive, the recipient fingerprints, and the instance's address. It also holds every place the file went (`instance`, `local` with the machine's hostname, or `s3` with any endpoint) as JSON.
  - The CLI writes it by a direct insert, because the app is frozen; `RecordColumns` must match the migration `0010_export_records`, which `TestRecordColumnsMatchTheMigration` checks by reading the migration file.
  - Against a release without the table the CLI writes nothing and says the dashboard does not list it; a failed insert is a warning, never a failed export.
- **A Metis Cloud export writes no row.** The CLI treats an env file holding `CONSOLE_MAIL_URL` (the `console` mail driver, [configuration.md](configuration.md)) as Cloud, where the archive goes to the console and the file the CLI wrote is gone after the upload; the console lists it instead.
  - The archive itself never carries `CONSOLE_MAIL_URL`, because Cloud drops it, so an instance restored from a Cloud archive records its own exports.

### On a server the `metis` CLI runs

- **`sudo metis db export` freezes the app itself and keeps the archive in `exports/`.**
  - Recipients come from `--recipient`, else `metis.json` → `exportRecipients` (`metis export recipients add | list | remove`, or `setup --recipient`); with none it stops.
  - Under `metis.lock`, with `running` set to `export`, it checks the required variables, the encryption key and free space before anything changes, then runs `stack.Maintenance(true)` and stops `metis-gateway-resend`.
  - It copies the Resend gateway's database as `gateway-resend.sqlite.gz.enc`, then runs the export with the release `metis.json` pins.
  - Afterwards it starts the gateway again and ends maintenance, unless `--keep-down` (for a move).
  - The maintenance time is the CLI's own, so the export makes no HTTP check.
- **The CLI reaches the stack's sqld from the host through its published port, naming the namespace in the `Host` header** (`stackClient`: `app.sqld`, `mastra.sqld`, `resend.sqld`, `sqld-resend`), because those names resolve only inside the `metis` network.
- **`sudo metis setup --from-export FILE` restores an archive onto a fresh server.**
  - It decrypts beside the install folder, takes the owner and the domain from the archive's `boot.env` (`exportDomain`), and refuses a release older than the archive's ("This export needs Metis 1.4.0 or later; run sudo metis self-update").
  - `.env` is `boot.env` plus this server's database variables; the app's secrets are kept, never regenerated.
  - Both databases load right after sqld and its namespaces exist and before the first preflight (`Install.AfterSqld`), so preflight sees the restored `schema_migration`.
  - It warns when `BETTER_AUTH_URL` changes and when the stored mailer is the Cloud-only `console` driver.
- **`sudo metis db move --to URL --token T --mastra-url URL --mastra-token T` copies both databases and switches the app onto them.**
  - It checks both targets (the same rules as `db load`), then puts the app in maintenance under the lock with `running` set to `move` and copies both databases.
  - It rewrites the database variables in `.env` and applies, which recreates the app on the new databases with preflight.
  - The old sqld data stays until `metis remove sqld --purge`.

- **Plain SQLite files live only in a `.metis-export-tmp-*` folder beside the output, mode 700**, removed on success, on failure, and by the next run when a crash left one.

## Deliberate limits

- **The Resend gateway's stored messages are not in an export; only its database is.** The raw messages live in its volume or bucket, which the operator backs up separately.
- **`setup --from-export` does not restore the Resend gateway's database.** The archive carries it, and `export decrypt` writes it out, but the gateway is set up after the first apply.
- **A failed restore removes the half-made install** (`undoFailedRestore`: the `metis-*` containers and volumes, the install folder, `/etc/metis/install-dir`), so `setup` can run again; the loader runs before the app exists, so nothing else was made.
- **An archive in `exports/` sits on the same disk as the server** and does not survive losing it; the CLI and the dashboard both say so.
- **A record says where an archive was written, not that it is still there.** Nothing deletes or checks a record when a file is moved or removed.

- **The CLI cannot freeze a serverless or container-platform app itself.** The operator sets `METIS_MAINTENANCE` on the platform and redeploys; the CLI only checks it.
- **Plaintext SQLite files exist briefly** in the mode-700 temporary folder while an export, load or decrypt runs, because SQLite needs a file.
- **Exports are not in the app's audit log**, because the app is in maintenance while they run.
- **Inbound webhooks during maintenance get 503** and depend on their senders retrying.
- **A passphrase-derived key is only as strong as the passphrase**: anyone with the archive can try passphrases offline against its salt.
- **A load that fails on the Mastra database leaves the app database loaded**; both targets are checked empty first, so the fix is emptying them and loading again.
- **libSQL-only schema features do not survive the copy.** Vector indexes and other objects the pure-Go SQLite cannot create would fail the dump; neither database uses them today.
