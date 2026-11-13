---
title: Environment variables
description: Every environment variable a Metis Suite instance reads, grouped by topic, with defaults.
---

Each variable is one of two kinds:

- **Startup:** read every time the app starts. Change it in `.env` and restart the app.
- **Starting value:** read once, the first time preflight runs, to fill in a setting the owner then manages in the dashboard. After that, change it under **Dashboard**, **System**. When a release adds a new group of settings to the dashboard, such as the **Decision model** card, preflight reads that group's variables once, on the first run after that update. A new field in a group you already have is not read on an existing instance: set it in the dashboard. To apply a starting value again later, apply your `.env` change as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup), then click **Reset to environment** on the setting's card. This resets every field on that card. See [How configuration works](/self-hosting/configure/how-configuration-works).

Any variable can also come from the optional config file. A missing or wrong value stops the app from starting with an "Invalid configuration" error. The error names each setting by a key, not by its variable name. For the startup settings, it is the config file key. For example:

```
Invalid configuration:
  - auth.secret: Too small: expected string to have >=32 characters
  - encryption.key: must be 32 bytes, base64-encoded
  - db.app.url: Turso needs a libsql:// URL
  - app.ownerEmail: METIS_OWNER_EMAIL is required: set it to the instance owner's email address
```

| Key in the error                       | Variable                                            |
| -------------------------------------- | --------------------------------------------------- |
| `auth.url`, `auth.secret`              | `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`             |
| `encryption.key`                       | `METIS_ENCRYPTION_KEY`                              |
| `db.app.url`, `db.app.authToken`       | `DATABASE_URL`, `DATABASE_AUTH_TOKEN`               |
| `db.mastra.url`, `db.mastra.authToken` | `MASTRA_DATABASE_URL`, `MASTRA_DATABASE_AUTH_TOKEN` |
| `app.ownerEmail`                       | `METIS_OWNER_EMAIL`                                 |
| `app.setupCode`                        | `METIS_SETUP_CODE`                                  |

## Core

| Variable               | Kind    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Default                             |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `BETTER_AUTH_URL`      | Startup | The address people use to reach the app. An `https://` address turns on secure cookies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `http://localhost:3000`             |
| `BETTER_AUTH_SECRET`   | Startup | The app's secret. At least 32 characters. Required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                     |
| `METIS_ENCRYPTION_KEY` | Startup | Protects stored passwords and tokens. 32 random bytes, base64 (`openssl rand -base64 32`). Required. Back it up.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                     |
| `METIS_SETUP_CODE`     | Startup | Opens `/setup`, where the owner creates the owner account. It works only while no account has the `METIS_OWNER_EMAIL` address. Keep it set if you may hand the instance to an address that has no account yet. At least 8 characters.                                                                                                                                                                                                                                                                                                                                        | Not set                             |
| `METIS_OWNER_EMAIL`    | Startup | Required. The email of the instance owner, who always has full access to the owner dashboard. `/setup` accepts only this address. The owner's account cannot be deleted or banned, and this address cannot be invited, except to a workspace once its account exists. To hand the instance to someone else, set this to their email and restart the app. The previous owner's account then becomes an admin. Without it, the app and preflight do not start. See [Hand the instance to a new owner](/self-hosting/operate/owner-dashboard#hand-the-instance-to-a-new-owner). | None                                |
| `METIS_SOURCE_URL`     | Startup | Where the **Source code** link on every page goes. See [Source code link](/self-hosting/configure/source-code-link).                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `https://github.com/trymetis/metis` |

## Database

| Variable                     | Kind    | What it does                                                                                                                   | Default |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `METIS_DB_DRIVER`            | Startup | `sqld` (a libSQL server, as in the Compose stack), `turso`, or `local` (a file, for development only, never for a deployment). |         |
| `DATABASE_URL`               | Startup | The app database: `http(s)://` or `ws(s)://` for sqld, `libsql://` for Turso, `file:` for local.                               |         |
| `DATABASE_AUTH_TOKEN`        | Startup | Its token. Required for sqld and Turso.                                                                                        |         |
| `MASTRA_DATABASE_URL`        | Startup | The AI memory database. A separate database on the same driver.                                                                |         |
| `MASTRA_DATABASE_AUTH_TOKEN` | Startup | Its token. Required for sqld and Turso.                                                                                        |         |
| `SQLD_AUTH_JWT_KEY`          | Startup | The bundled database server's public key. The bootstrap script generates it.                                                   |         |
| `SQLD_ADMIN_KEY`             | Startup | The key for the bundled database server's admin access. The bootstrap script generates it.                                     |         |

For a stack you set up without the bootstrap script, `bash bootstrap.sh sqld-auth` prints a matching `SQLD_AUTH_JWT_KEY` and token pair.

### Create the databases on Turso

With Turso, you need two separate databases: one for the app and one for AI memory. Use the [Turso CLI](https://docs.turso.tech/quickstart), signed in to your Turso account. The names below are examples.

1. Create the two databases:

   ```bash
   turso db create metis-app
   turso db create metis-memory
   ```

2. Get the URL of each one, and copy it exactly as printed. It starts with `libsql://`.

   ```bash
   turso db show metis-app --url
   turso db show metis-memory --url
   ```

3. Create a token for each one:

   ```bash
   turso db tokens create metis-app
   turso db tokens create metis-memory
   ```

   Do not use `--read-only`, because the app writes to both databases. If you give a token an end date with `--expiration`, replace it before that date.

4. Set the variables:

   | Variable                     | Value                        |
   | ---------------------------- | ---------------------------- |
   | `METIS_DB_DRIVER`            | `turso`                      |
   | `DATABASE_URL`               | The URL of `metis-app`.      |
   | `DATABASE_AUTH_TOKEN`        | The token of `metis-app`.    |
   | `MASTRA_DATABASE_URL`        | The URL of `metis-memory`.   |
   | `MASTRA_DATABASE_AUTH_TOKEN` | The token of `metis-memory`. |

Leave both databases empty. Preflight creates the app's tables, and the AI memory database sets itself up when the app first uses it. In the dashboard's database health checks, the two show as **App database** and **Mastra database**. See Turso's guides to [creating a database](https://docs.turso.tech/cli/db/create), [showing its URL](https://docs.turso.tech/cli/db/show) and [creating a token](https://docs.turso.tech/cli/db/tokens/create).

## OAuth providers

| Variable                                         | Kind           | What it does                         | Default |
| ------------------------------------------------ | -------------- | ------------------------------------ | ------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | Starting value | Your Google OAuth client.            | Not set |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Starting value | Your Microsoft app registration.     | Not set |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`           | Starting value | Your Zoho OAuth client.              | Not set |
| `ZOHO_REGION`                                    | Starting value | `com`, `in`, `eu`, `com.au` or `jp`. | `com`   |

## Server lists

Each is a JSON array of server entries, used as a starting value. See [Server lists](/self-hosting/configure/server-lists).

Every entry has a `name` (1 to 64 characters, unique) and an optional `id` (letters, digits, `-` and `_`, unique). Hosts are hostnames, never URLs.

| Variable                   | Keys, with defaults                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METIS_IMAP_SERVERS`       | `imap.host`, `imap.port` (993), `imap.secure` (true), `imap.plain` (false; only with `imap.secure` false), `smtp.host`, `smtp.port` (465), `smtp.secure` (true), `smtp.plain` (false; only with `smtp.secure` false), `allowInsecureTls` (false)                                                                                                                                            |
| `METIS_CALDAV_SERVERS`     | `url` (the full URL, with `https://`), `allowInsecureTls` (false)                                                                                                                                                                                                                                                                                                                           |
| `METIS_CARDDAV_SERVERS`    | `url` (the full URL, with `https://`), `allowInsecureTls` (false). For example, `[{"name":"Fastmail Contacts","url":"https://carddav.fastmail.com/dav/"}]`                                                                                                                                                                                                                                  |
| `METIS_CLOUDFLARE_SERVERS` | `domain` (a bare domain such as `example.com`), `endpoint` (an `https://` URL)                                                                                                                                                                                                                                                                                                              |
| `METIS_RESEND_SERVERS`     | `domain`, `endpoint` (an `https://` URL)                                                                                                                                                                                                                                                                                                                                                    |
| `METIS_SES_SERVERS`        | `domain`, `endpoint` (an `https://` URL, the gateway's function URL)                                                                                                                                                                                                                                                                                                                        |
| `METIS_S3_SERVERS`         | `endpoint` (`http://` or `https://`), `region` (`us-east-1`), `accessKeyId`, `secretAccessKey`, `forcePathStyle` (true), `allowInsecureTls` (false), `transfer` (`direct` or `relay`, default `direct`), `partSize` (a size with its unit such as `"64 MB"`, 5 MB to 5 GB, default `32 MB`; used only with `transfer` `relay`), `checksums` (`required` or `supported`, default `required`) |
| `METIS_WEBDAV_SERVERS`     | `url`, `allowInsecureTls` (false)                                                                                                                                                                                                                                                                                                                                                           |
| `METIS_FTP_SERVERS`        | `host`, `port` (21), `secure` (`explicit`, `implicit` or `none`, default `explicit`), `allowInsecureTls` (false), `poolSize` (1 to 10, default 2)                                                                                                                                                                                                                                           |
| `METIS_SFTP_SERVERS`       | `host`, `port` (22), `hostKeySha256` (required, as `ssh-keygen -l` prints it), `poolSize` (1 to 10, default 3)                                                                                                                                                                                                                                                                              |

## Drive transfers

| Variable                        | Kind           | What it does                                                                          | Default |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------- | ------- |
| `METIS_DRIVE_RELAY_SECRET`      | Startup        | Needed for relayed drives (WebDAV, FTP, SFTP and relayed S3). At least 32 characters. | Not set |
| `METIS_DRIVE_RELAY_MAX_MB`      | Starting value | The largest relayed file, in MB.                                                      | `256`   |
| `METIS_DRIVE_RELAY_CONCURRENCY` | Starting value | Relayed transfers one person can run at a time.                                       | `3`     |

## Mail images

These are starting values for the **Mail image proxy** card on the dashboard's **Instance** page.

| Variable                        | Kind           | What it does                                                                                                | Default |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_MAIL_IMAGE_PROXY`        | Starting value | When `true`, remote images in mail load through your instance instead of straight from the sender's server. | `false` |
| `METIS_MAIL_IMAGE_PROXY_MAX_MB` | Starting value | The largest image the proxy loads, in MB. At most 100.                                                      | `10`    |

## Proxies

This is the starting value for the **Proxies** card on the dashboard's **Instance** page. See [Proxies](/self-hosting/reference/dashboard-settings#proxies).

| Variable                | Kind           | What it does                                                                                                                                                                                                                               | Default |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `METIS_TRUSTED_PROXIES` | Starting value | IP addresses or CIDR ranges, comma separated, of the proxies in front of your instance. Up to 50. Their entries in `X-Forwarded-For` are skipped when the app finds a visitor's address for rate limits, sign-in limits and the audit log. | Not set |

On an instance that already runs, the first preflight after the update that adds the **Proxies** card reads this variable once. After that, change the list in the dashboard.

## Mail cache

This is the starting value for the **Mail cache** card on the dashboard's **Instance** page. See [Mail cache](/self-hosting/reference/dashboard-settings#mail-cache).

| Variable                | Kind           | What it does                                                                                                                                                                                                                | Default |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_MAIL_CACHE_DAYS` | Starting value | How many days your instance keeps its copy of a message's body after the message was last opened. A whole number from 1 to 3650. A daily job clears older copies. In the config file, the key is `mailCache.retentionDays`. | `30`    |

On an instance that already runs, the first preflight after the update that adds the **Mail cache** card reads this variable once. **History** lists this as a **Seed** version. After that, change the value in the dashboard.

## AI model (LLM)

| Variable                       | Kind           | What it does                                                                                                | Default    |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `METIS_LLM_DRIVER`             | Starting value | `openai`, `anthropic`, `openai-compatible` or `disabled`.                                                   | `disabled` |
| `OPENAI_API_KEY`               | Starting value | The key for `openai`. Also the starting key of the `openai` decision model.                                 |            |
| `ANTHROPIC_API_KEY`            | Starting value | The key for `anthropic`.                                                                                    |            |
| `METIS_LLM_API_KEY`            | Starting value | The key for `openai-compatible`. Optional.                                                                  |            |
| `METIS_LLM_BASE_URL`           | Starting value | The API address, for `openai-compatible`.                                                                   |            |
| `METIS_LLM_NAME`               | Starting value | A name for the provider, for `openai-compatible`. Optional.                                                 |            |
| `METIS_LLM_STRUCTURED_OUTPUTS` | Starting value | Use structured outputs, for `openai-compatible`. When off, summaries need about an 8k-token context window. | `false`    |
| `METIS_LLM_CHAT_MODEL`         | Starting value | The model for the assistant and agents. Required when a driver is on.                                       |            |
| `METIS_LLM_SMART_REPLY_MODEL`  | Starting value | The model for suggested replies. Required when a driver is on.                                              |            |
| `METIS_LLM_CLASSIFIER_MODEL`   | Starting value | The model for labels. Required when a driver is on.                                                         |            |
| `METIS_LLM_SUMMARY_MODEL`      | Starting value | The model for summaries. Required when a driver is on.                                                      |            |
| `METIS_LLM_SUMMARY_VISION`     | Starting value | Send images to the summaries model.                                                                         | `false`    |

## Decision model

All of these are starting values for the **Decision model** card on the dashboard's **LLM** page. See [AI models](/self-hosting/configure/ai-models#add-a-decision-model-optional).

| Variable                          | Kind           | What it does                                                                   | Default                      |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| `METIS_DECISION_DRIVER`           | Starting value | `systemone`, `openai` or `disabled`.                                           | `disabled`                   |
| `METIS_DECISION_MODEL`            | Starting value | The model. Required unless disabled.                                           |                              |
| `METIS_DECISION_BASE_URL`         | Starting value | The server address, for `systemone`.                                           | `https://api.typesafe.ai/v1` |
| `METIS_DECISION_API_KEY`          | Starting value | The key, for `systemone`. Optional. The `openai` driver uses `OPENAI_API_KEY`. |                              |
| `METIS_DECISION_CLASSIFIER`       | Starting value | Use it for inbox labels.                                                       | `false`                      |
| `METIS_DECISION_SUMMARY_GATE`     | Starting value | Use it as the summary gate.                                                    | `false`                      |
| `METIS_DECISION_WORKFLOW_NODE`    | Starting value | Use it in workflow Ask and Branch steps.                                       | `false`                      |
| `METIS_DECISION_CLASSIFIER_BATCH` | Starting value | Inbox label calls at a time, 1 to 25.                                          | `5`                          |

A decision switch does nothing while the LLM driver is `disabled`, because AI is off for the whole instance. If preflight stores a switch that is on without an LLM, the deploy checks show a warning. The dashboard refuses to save a change that leaves a switch on without an LLM.

## Phishing detection

| Variable                          | Kind           | What it does                                                    | Default    |
| --------------------------------- | -------------- | --------------------------------------------------------------- | ---------- |
| `METIS_PHISHING_DETECTION_DRIVER` | Starting value | `metis` or `disabled`.                                          | `disabled` |
| `BACKEND_URL`                     | Starting value | The phishing detection backend's address. Required for `metis`. |            |

## Outgoing email

| Variable                                           | Kind           | What it does                                                                                                                                                                                                                                                                                                                     | Default                           |
| -------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `METIS_MAIL_DRIVER`                                | Starting value | `log` (write to the server log), `noop`, `resend` or `smtp`. `console` (send to the Metis Cloud console) is set only on Metis Cloud instances.                                                                                                                                                                                   | `log`                             |
| `MAIL_FROM`                                        | Starting value | The sender. Required for `resend` and `smtp`.                                                                                                                                                                                                                                                                                    | `Metis Suite <noreply@localhost>` |
| `MAIL_FROM_AUTH`                                   | Starting value | The sender for sign-in mail, including sign-in alerts.                                                                                                                                                                                                                                                                           | `MAIL_FROM`                       |
| `MAIL_FROM_INVITE`                                 | Starting value | The sender for invitations.                                                                                                                                                                                                                                                                                                      | `MAIL_FROM`                       |
| `RESEND_API_KEY`                                   | Starting value | Your Resend API key, for `resend`.                                                                                                                                                                                                                                                                                               |                                   |
| `SMTP_URL`                                         | Starting value | A full SMTP URL, for `smtp`. Set this or `SMTP_HOST`.                                                                                                                                                                                                                                                                            |                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Starting value | The SMTP server, in parts.                                                                                                                                                                                                                                                                                                       |                                   |
| `SMTP_SECURE`                                      | Starting value | Use TLS from the start of the connection.                                                                                                                                                                                                                                                                                        |                                   |
| `SMTP_PLAIN`                                       | Starting value | Allows an unencrypted connection when the server offers no STARTTLS. Without it, the connection must upgrade with STARTTLS or it fails. Only for a local server that has no TLS. Cannot be `true` together with `SMTP_SECURE=true`. With `SMTP_URL`, the URL decides implicit TLS: `smtp://` counts as off and `smtps://` as on. | `false`                           |
| `CONSOLE_MAIL_URL`                                 | Starting value | Set only on Metis Cloud instances. A self-hosted instance cannot use it. Where the instance sends its own email, for `console`.                                                                                                                                                                                                  |                                   |
| `CONSOLE_MAIL_TOKEN`                               | Starting value | Set only on Metis Cloud instances. A self-hosted instance cannot use it. The instance's credential for `console`.                                                                                                                                                                                                                |                                   |

## Cache

| Variable             | Kind           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Default  |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `METIS_CACHE_DRIVER` | Starting value | `memory`, `redis` or `upstash`. Sessions are stored in the database, so sign-in works on every process and survives a restart. The cache holds copies of sessions and the rate-limit counters. With `memory`, each process counts rate limits on its own and loses the counts on restart, and a sign-out may not end the session on other processes right away. The cache also holds short-lived copies of some search results and of address suggestions, and the list of messages AI labels was not sure about. With `memory`, each process keeps its own copies and loses them on restart. A new address suggestion can then take up to 10 minutes to show on another process. Adding or deleting a custom label clears the not-sure list only on the process that handled it. Use `redis` or `upstash` when you run more than one process. | `memory` |
| `METIS_CACHE_URL`    | Starting value | For `redis`, a `redis://` or `rediss://` URL. For `upstash`, the database's REST URL, which starts with `https://`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |          |
| `METIS_CACHE_TOKEN`  | Starting value | For `upstash` only: the database's REST token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |          |

The dashboard sets the same values on the **Cache** page under **System**, in the **URL** and **Token** fields. Where to find them on Upstash:

- **`upstash`:** open the database in the Upstash console. Copy the `HTTPS` value of the **Endpoint** field into **URL**, and the **Token** into **Token**.
- **`redis` with Upstash:** under **Connect**, **TCP**, copy the connection string. It looks like `rediss://default:your-token@example-12345.upstash.io:6379`, with your token, endpoint and port. The **Token** field does not appear for `redis`. The token is part of the connection string.

See Upstash's guides to the [REST API](https://upstash.com/docs/redis/features/restapi) and [connecting a client](https://upstash.com/docs/redis/howto/connectclient). The **Health** card's check writes, reads and deletes a value, and a failed check stops the save.

## Background work

See [Background work](/self-hosting/configure/background-work).

| Variable                         | Kind           | What it does                                                                                                                                                                                                                                        | Default           |
| -------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `METIS_WORKFLOW_RUNNER_DRIVER`   | Starting value | `internal`, `cron` or `bullmq`.                                                                                                                                                                                                                     | `internal`        |
| `METIS_WORKFLOW_CADENCE_SEC`     | Starting value | Seconds between ticks (`internal`, `bullmq`), and the shortest time between trigger checks. 1 to 86400.                                                                                                                                             | `60`              |
| `METIS_WORKFLOW_TICK_BUDGET_MS`  | Starting value | How long one tick may run, 1000 to 600000 (at most 55000 under `cron`).                                                                                                                                                                             | `45000`           |
| `METIS_WORKFLOW_BATCH_SIZE`      | Starting value | Work taken per round, 1 to 500.                                                                                                                                                                                                                     | `25`              |
| `METIS_WORKFLOW_CONCURRENCY`     | Starting value | Work run at the same time, 1 to 64.                                                                                                                                                                                                                 | `4`               |
| `METIS_WORKFLOW_REDIS_URL`       | Starting value | Your Redis, for `bullmq`.                                                                                                                                                                                                                           |                   |
| `METIS_WORKFLOW_QUEUE_PREFIX`    | Starting value | The queue name prefix, for `bullmq`.                                                                                                                                                                                                                | `metis-workflows` |
| `CRON_SECRET`                    | Starting value | The secret your scheduler sends in `X-Metis-Secret`, for `cron`.                                                                                                                                                                                    |                   |
| `METIS_WORKFLOW_STEP_DATA_DAYS`  | Starting value | Days a finished run keeps each step's input and output, 0 to 365. `0` clears them when the run ends.                                                                                                                                                | `7`               |
| `METIS_WORKFLOW_HISTORY_DAYS`    | Starting value | Days runs stay in the history, 1 to 3650.                                                                                                                                                                                                           | `90`              |
| `METIS_WORKFLOW_PUBLIC_URL`      | Starting value | The HTTPS address that webhooks and providers reach this instance at. Without it, webhook addresses use `BETTER_AUTH_URL`, and Google Calendar, Google Drive and Microsoft triggers check for changes instead of getting push.                      | Not set           |
| `METIS_WORKFLOW_TRUSTED_PROXIES` | Starting value | IP addresses or CIDR ranges, comma separated, whose `X-Forwarded-For` is believed. Up to 50. Used only by the **Only from these IPs** check of webhook triggers. Rate limits, sign-in limits and the audit log use `METIS_TRUSTED_PROXIES` instead. | Not set           |

The last four variables are read only by the first preflight of a new instance. On an instance that already runs, they are not read, even after the update that adds them, and setting them only adds a warning to the deploy checks. Set **Keep step data (days)**, **Keep run history (days)**, **Public URL for webhooks and push** and **Trusted proxies** under **Dashboard**, **System**, **Workflow runner** instead. You can also apply your `.env` change as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup), then click **Reset to environment** on the **Workflow runner** card, which applies them. This resets the whole card to the environment, not only these four fields.

## Sign-up and legal

| Variable                | Kind           | What it does                                      | Default |
| ----------------------- | -------------- | ------------------------------------------------- | ------- |
| `METIS_SIGNUP_DISABLED` | Starting value | `true` for invite only, `false` for open sign-up. | `true`  |
| `METIS_TERMS_URL`       | Starting value | Your terms of service.                            | Not set |
| `METIS_PRIVACY_URL`     | Starting value | Your privacy policy.                              | Not set |
| `METIS_LEGAL_VERSION`   | Starting value | The version of your terms that people agree to.   | `1`     |

## Audit log

See [Owner dashboard](/self-hosting/operate/owner-dashboard#audit-log).

| Variable                     | Kind    | What it does                                                                                                                                                                                                                                                                           | Default |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_AUDIT_RETENTION_DAYS` | Startup | How many days the audit log keeps each event. A whole number, 1 or more. Every day at 03:30 UTC, events older than this are deleted, so lowering it removes older events at the next run. It cannot be changed in the dashboard. In the config file, the key is `audit.retentionDays`. | `365`   |

## Other

| Variable               | Kind    | What it does                                                                                                  | Default        |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| `METIS_CONFIG_PATH`    | Startup | The path of the config file. If the file does not exist, the app does not start.                              | Not set        |
| `METIS_UPDATER_SOCKET` | Startup | Connects the app to the updater. The Compose stack sets it for you. Without it, there is no **Updates** page. | Set by Compose |

## Bootstrap script

These are read by the bootstrap script only. See [Install with the bootstrap script](/self-hosting/install/install-with-bootstrap).

| Variable                                                        | What it does                                            | Default                                             |
| --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `METIS_DOMAIN`                                                  | Your domain. When set, Caddy serves the app over HTTPS. | Not set                                             |
| `METIS_VERSION`                                                 | The release to install, such as `1.2.3`.                | The newest release                                  |
| `INSTALL_DIR`                                                   | Where the stack is installed.                           | `/opt/metis-suite`                                  |
| `APP_PORT`                                                      | The port the app listens on, on `127.0.0.1`.            | `3000`                                              |
| `COMPOSE_URL`                                                   | A full URL for the Compose file.                        | The Compose file of the release the script installs |
| `APP_IMAGE`, `PREFLIGHT_IMAGE`, `WORKER_IMAGE`, `UPDATER_IMAGE` | Exact images to use instead of a release.               |                                                     |
| `SQLD_IMAGE`, `CADDY_IMAGE`                                     | Other images for the database server and Caddy.         |                                                     |
