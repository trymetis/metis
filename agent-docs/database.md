# Database — schema, drivers and sqld

Where the schema lives and how it reaches a database through migrations, the one driver with two connections (app + Mastra), what sqld means for code, and Drizzle naming. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [auth.md](auth.md), [connections.md](connections.md), [deployment.md](deployment.md), [configuration.md](configuration.md).

## Code map

| Concern                            | Where                                                                                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema, the single source of truth | `src/db/schema.ts` (re-exports Better Auth's tables from `src/db/auth-schema.ts`) · `timestamp` helper                                                                      |
| App client                         | `src/db/index.ts` → `db`, `Executor`                                                                                                                                        |
| Column encryption                  | `src/db/crypto.ts` → `encryptedText` ([connections.md](connections.md))                                                                                                     |
| Mastra's store                     | `src/mastra/storage.ts` → `storage` (`LibSQLStore` over `config.db.mastra`)                                                                                                 |
| Driver and connection shapes       | `src/config/schema.ts` → `dbConfigSchema`                                                                                                                                   |
| Migrations                         | `migrations/NNNN_name.ts`, each exporting a `Migration`, listed in order in `migrations/index.ts` → `MIGRATIONS`, from `0000_baseline` · applied rows in `schema_migration` |
| The runner and the interface       | `src/db/migrations.ts` → `migrateDatabase`, `Migration`, `MigrationDb`, `schemaMigration` · run by `scripts/preflight.ts` and `scripts/migrate.ts` (`db:migrate`)           |
| The drift check                    | `scripts/check-migrations.ts` (`db:check`, run in CI)                                                                                                                       |
| `db:push` / `db:export`            | `drizzle.config.ts`                                                                                                                                                         |
| sqld key and token generation      | `apps/cli/internal/secrets` → `NewSqldAuth`; `metis sqld-auth` prints a pair                                                                                                |

## Rules

- **`src/db/schema.ts` is the single source of truth for the shape; `migrations/` is the only way a shape reaches a database.**
- **A schema change ships a hand-written migration in the same change, and `bun run db:check` passes.**
  - The check applies every migration to an empty database and compares it with `drizzle-kit export` of `schema.ts`, table by table: columns, indexes and foreign keys.
- **Migrations are forward-only and never edited once released.** A fix is a new migration.
- **Every migration is a TypeScript module with one shape, `{ id, up(db) }`, listed in number order in `migrations/index.ts`.**
  - A schema-only change is `schemaMigration(id, statements)`, one string per statement.
  - A migration that moves data reads with `db.read`, computes the new rows, then calls `db.apply` once with every statement.
  - `db.apply` runs the statements and the `schema_migration` row as one `client.migrate()` batch with foreign keys off, so a migration commits or rolls back whole. SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so a migration never opens its own.
- **A migration is frozen: from `src/` it imports only the interface in `src/db/migrations.ts`.** It carries its own copy of every shape it reads or writes, so running it on an old database later behaves as it did when released.
- **A migration preserves data.** A rename is `ALTER TABLE … RENAME`, never a drop and an add; a backfill is an `UPDATE` in the same file.
- **A change SQLite's `ALTER TABLE` cannot make follows SQLite's table rebuild:** create `__new_<table>`, `INSERT … SELECT`, drop the old table, rename the new one, recreate its indexes.
  - The runner turns foreign keys off around each migration, so dropping a parent table cascades into nothing.
  - The new table's `CREATE TABLE` and its indexes come from `bun run --cwd apps/web db:export`.
- **The project owner applies migrations to a database, never an agent:** preflight on every deploy, or `bun run db:migrate` from the root.
  - `db:push` serves only a scratch database that never runs preflight; a pushed database has no `schema_migration` rows, so preflight would re-apply what push already changed.
- **Always give a camelCase property an explicit snake_case column name** (`text("next_due_at", …)`). Drizzle uses the JS name in queries but SQLite keeps the name the column was created with, so a mismatch is a runtime `no such column`.
- **One `METIS_DB_DRIVER` (`sqld`, `turso` or `local`) fixes the shape of both connections, `app` and `mastra`.**
  - The URL schemes and the required `authToken` per driver are in `dbConfigSchema`.
  - Both connections use the same driver; a mixed pair fails validation.
- **Mastra's database is separate from the app's**, so its writes never contend for the app database's single writer lock and no migration touches its `mastra_*` tables (Mastra creates those itself).
- **`local` is dev-only: never deploy it or verify against it.** Anything that tests contention, multiple processes or the workflow runner under load runs on sqld. The reasons are under Deliberate limits.
- **Keep transactions short and database-only.** sqld serializes writes and rolls back an interactive transaction open for 5 s once another writer is waiting; the holder's commit then fails with `TRANSACTION_TIMEOUT`, and no setting changes this.
- **Functions that may run inside a transaction take an `Executor`** (`typeof db | Tx`), so the caller decides.

## How it works

- **sqld JWT auth.** sqld holds only the Ed25519 public key (`SQLD_AUTH_JWT_KEY`); the app holds an EdDSA JWT with the claim `{"a":"rw"}`.
  - The key is server-wide, so one token authorizes every namespace; `metis setup` writes it into `DATABASE_AUTH_TOKEN` and `MASTRA_DATABASE_AUTH_TOKEN`.
  - The private key is discarded, so rotating means generating a new pair.
- **Namespaces.** The stack's sqld holds `app` and `mastra` as separate databases, reached at `http://app.sqld:8080` and `http://mastra.sqld:8080` ([deployment.md](deployment.md)).
- **Migrating** (`migrateDatabase`).
  - A database with a `user` table but no `schema_migration` table predates migrations: the runner creates the table and records `0000_baseline` as applied without running it.
  - It refuses a database holding a migration id the release does not ship, because a newer release migrated it; preflight fails and the updater restores its snapshot ([updater.md](updater.md)).
  - Each pending migration's `up` runs, and its one `db.apply` goes through `@libsql/client`'s `migrate()`: foreign keys off, one transaction with the statements and the `schema_migration` row, foreign keys back on. A failing statement rolls back that migration only, and an `up` that never applies fails.
  - After the run it compares `PRAGMA foreign_key_check` with the count before and fails when the migrations added violations.
- **Migrations are bundled, not read from disk.** Preflight, `db:migrate` and `db:check` import `MIGRATIONS`, so `preflight.mjs` carries every migration and the preflight image ships no migration files.

## Deliberate limits

- **There are no down migrations.** Going back past a migration means restoring a database backup or the updater's snapshot, which only undoes the last upgrade ([updater.md](updater.md)).
- **The e2e scratch databases come from `drizzle-kit export`**, not from the migrations (`scripts/e2e/scratch-db.ts`); `db:check` is what proves the two agree.
- **The one data backfill outside migrations is preflight's `backfillServerIds`** ([servers.md](servers.md)), because it reads the instance config.
- **`local` fails exactly where a mail client needs it to hold**, so it serves a single `next dev` and nothing else.
  - It contends with itself: `@libsql/client` pools up to 20 connections to one file with a busy timeout of 0, so two overlapping writes in one process (two requests, or a request and a workflow tick) fail at once with `SQLITE_BUSY`.
  - It silently loses writes: in `libsql` 0.5.29 a statement that fails with `SQLITE_BUSY` stays active while its connection reports no transaction; the pool reuses it, every later write on it reports success without committing, and it holds the write lock until the process restarts.
  - A busy timeout does not fix it, because the driver is synchronous: waiting for the lock freezes the event loop, including the code that holds the lock.
  - It can leave auth broken: Better Auth writes on startup, and if that write hits `SQLITE_BUSY`, sign-in stays broken until a restart.
  - It cannot be shared: the web app and the bullmq worker are separate processes, and two processes on one file hit all of the above.
