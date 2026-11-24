---
title: Environment variables
description: Every environment variable a Metis Suite instance reads, grouped by topic, with defaults.
---

Each variable is one of three kinds:

- **Startup:** read every time the app starts. On a server the `metis` CLI runs, change it with `sudo metis config set`, which writes `.env` and restarts the app. On a platform, change it there and redeploy.
- **Starting value:** read once, the first time preflight runs, to fill in a setting the owner then manages in the dashboard. After that, change it under **Dashboard**, **System**. When a release adds a new group of settings to the dashboard, such as the **Decision model** card, preflight reads that group's variables once, on the first run after that update. A new field in a group you already have is not read on an existing instance: set it in the dashboard. To apply a starting value again later, apply your `.env` change as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup), then choose **Reset to environment** from the **…** menu in the setting's card header. This resets every field on that card. On a server the `metis` CLI runs, `sudo metis config set` does both in one step. See [How configuration works](/self-hosting/configure/how-configuration-works).
- **Set by the CLI:** the `metis` CLI sets it for one run. Do not put it in `.env` or a platform's environment.

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
| `maintenance.since`                    | `METIS_MAINTENANCE`                                 |
| `rateLimitOverrides`                   | `METIS_RATELIMIT_OVERRIDES`                         |

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

| Variable                     | Kind    | What it does                                                                                                                               | Default |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `METIS_DB_DRIVER`            | Startup | `sqld` (a libSQL server, as on a server the `metis` CLI runs), `turso`, or `local` (a file, for development only, never for a deployment). |         |
| `DATABASE_URL`               | Startup | The app database: `http(s)://` or `ws(s)://` for sqld, `libsql://` for Turso, `file:` for local.                                           |         |
| `DATABASE_AUTH_TOKEN`        | Startup | Its token. Required for sqld and Turso.                                                                                                    |         |
| `MASTRA_DATABASE_URL`        | Startup | The AI memory database. A separate database on the same driver.                                                                            |         |
| `MASTRA_DATABASE_AUTH_TOKEN` | Startup | Its token. Required for sqld and Turso.                                                                                                    |         |
| `SQLD_AUTH_JWT_KEY`          | Startup | The public key the server's database server (sqld) checks tokens with. `metis setup` generates it.                                         |         |
| `SQLD_ADMIN_KEY`             | Startup | The key for the admin access of the server's database server. `metis setup` generates it.                                                  |         |

For a sqld server you run yourself, `metis sqld-auth` prints a new `SQLD_AUTH_JWT_KEY` and the token that goes with it, as `DATABASE_AUTH_TOKEN` and `MASTRA_DATABASE_AUTH_TOKEN`. It runs on any computer with the `metis` CLI.

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

| Variable             | Kind           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Default  |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `METIS_CACHE_DRIVER` | Starting value | `memory`, `redis` or `upstash`. Sessions are stored in the database, so sign-in works on every process and survives a restart. With `memory`, each process counts rate limits on its own and loses the counts on restart, and a sign-out may not end the session on other processes right away. With `memory`, a new person from mail can also take up to 10 minutes to show in address suggestions and search on another process. Other processes can also show an old list of calendars, address books and saved contacts in search for up to 1 minute, and drive changes for up to 30 seconds. After a custom label is added, renamed or deleted, messages that AI labels left without a label can stay without one for up to 7 days on the other processes. Use `redis` or `upstash` when you run more than one process. | `memory` |
| `METIS_CACHE_URL`    | Starting value | For `redis`, a `redis://` or `rediss://` URL. For `upstash`, the database's REST URL, which starts with `https://`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |          |
| `METIS_CACHE_TOKEN`  | Starting value | For `upstash` only: the database's REST token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |          |

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

The last four variables are read only by the first preflight of a new instance. On an instance that already runs, they are not read, even after the update that adds them, and setting them only adds a warning to the deploy checks. Set **Keep step data (days)**, **Keep run history (days)**, **Public URL for webhooks and push** and **Trusted proxies** under **Dashboard**, **System**, **Workflow runner** instead. You can also apply your `.env` change as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup), then choose **Reset to environment** from the **…** menu on the **Workflow runner** card, which applies them. This resets the whole card to the environment, not only these four fields.

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

## Rate limits

| Variable                    | Kind    | What it does                                                                                                                                                                          | Default |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_RATELIMIT_OVERRIDES` | Startup | Changes the built-in rate limits. A JSON object. It cannot be changed in the dashboard. In the config file, the key is `rateLimitOverrides`. See [below](#metis_ratelimit_overrides). | Not set |

### METIS_RATELIMIT_OVERRIDES

A rate limit sets how many times something may be done within a window of time. Metis Suite has built-in rate limits for mail, calendar, drive, contacts, AI features, invites, sign-in and more. With this variable, you can raise or lower each limit listed below. When neither this variable nor the config file's `rateLimitOverrides` is set, every limit keeps its default. An empty variable counts as not set.

The value is a JSON object with up to two keys:

- **`app`:** the app's own limits, by name.
- **`auth`:** the limits for sign-in, sign-up, password resets, two-factor, emailed sign-in links, signing in to the desktop and mobile apps, and the sign-in requests of MCP clients.

Each limit you change is an object with one or both of these fields:

| Field       | What it sets                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `limit`     | How many times something may be done within the window. A whole number, 1 or more. |
| `windowSec` | The length of the window, in seconds. A whole number, 1 or more.                   |

Set at least one of the two. A field you leave out keeps its default, and so does every limit you do not name. No other field is allowed.

On a server the `metis` CLI runs, put the value in single quotes so your shell passes it as one piece:

```bash
sudo metis config set 'METIS_RATELIMIT_OVERRIDES={"app":{"mailSession":{"limit":600}},"auth":{"paths":{"/sign-in/email":{"limit":20}}}}'
```

This example raises the mail limit to 600 requests a minute for each person, and email and password sign-in to 20 a minute from each IP address. The other limits keep their defaults. It is not a dashboard setting, so the command only writes it to `.env` and restarts the app and the workers (preflight runs first). On a container platform or Vercel, set it on the app (and on the worker, if you run one) and redeploy.

When someone reaches a limit, they see the same message as with the defaults. It says what there was too much of and when to try again, for example "Too many requests. Try again in 42 seconds." The wait it shows is at most the `windowSec` you set. From 1 minute up, it is rounded up to whole minutes, so a `windowSec` of 90 can show "Try again in 2 minutes". The [User Guide](/guide/reference/usage-limits) gives the message for each feature.

These limits show no message:

- `agentReferenceSuggest`: the `@` list in **Workspace AI** stays closed.
- `mailContacts`: **To**, **Cc** and **Bcc** in the composer show no address suggestions at all, saved contacts included. While the composer stays open, they come back after the window. Search suggestions and search's **Contacts** results leave out only people from mail. Reaching `mailSession` hides address suggestions in the composer the same way.
- `mailClassify`: AI labels wait and appear after the window.
- `smartReplies`: smart replies keep loading and appear after the window.
- `mailImageProxy`: remote images do not load; after the window, opening the message again loads them.

With the `memory` cache and more than one process, a person can go past a limit. Use `redis` or `upstash` instead. See `METIS_CACHE_DRIVER` under [Cache](#cache).

#### Limits in `app`

Unless the table says otherwise, each limit counts per person.

| Name                      | Default `limit` | Default `windowSec` | What it limits                                                                                                                                                                                       |
| ------------------------- | --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailSession`             | 300             | 60                  | Every mail request, across all of a person's mailboxes, including **Print** and **View original**                                                                                                    |
| `calendarSession`         | 300             | 60                  | Every calendar request                                                                                                                                                                               |
| `driveSession`            | 300             | 60                  | Every drive request                                                                                                                                                                                  |
| `addressBookSession`      | 300             | 60                  | Every contacts request                                                                                                                                                                               |
| `mailSend`                | 60              | 60                  | Sending mail                                                                                                                                                                                         |
| `scheduleSend`            | 30              | 60                  | Scheduling a send                                                                                                                                                                                    |
| `resolveSend`             | 20              | 60                  | Opening or resolving unconfirmed sends and unconfirmed workflow steps                                                                                                                                |
| `mailImageProxy`          | 600             | 60                  | Remote images loaded through the mail image proxy                                                                                                                                                    |
| `mailContacts`            | 20              | 60                  | Address suggestions while writing, plus people from mail in search's **Contacts** results and in search suggestions for `from:`, `to:`, `cc:`, `attendee:`, `organizer:` and `email:`                |
| `mailUnsubscribeInfo`     | 60              | 60                  | Checking whether a message can be unsubscribed from                                                                                                                                                  |
| `mailUnsubscribe`         | 30              | 60                  | Unsubscribing ("Too many unsubscribe requests")                                                                                                                                                      |
| `mailSubscriptionsScan`   | 10              | 300                 | Scans for mailing lists ("Too many scans"), per mailbox, and separately for **All inboxes**                                                                                                          |
| `mailClassify`            | 30              | 60                  | AI labels                                                                                                                                                                                            |
| `threadSummary`           | 30              | 60                  | Thread summaries                                                                                                                                                                                     |
| `phishingAnalyze`         | 30              | 60                  | Phishing checks                                                                                                                                                                                      |
| `smartReplies`            | 30              | 60                  | Smart replies                                                                                                                                                                                        |
| `draftApology`            | 30              | 60                  | **Draft reply** in the **Draft an apology** dialog                                                                                                                                                   |
| `draftStance`             | 30              | 60                  | The stance buttons and **Stance** in the composer                                                                                                                                                    |
| `rewriteText`             | 30              | 60                  | **Rewrite** in the composer                                                                                                                                                                          |
| `aiChat`                  | 20              | 60                  | Messages to the Mail, Calendar, Drive and Contacts AI panels, as one shared limit                                                                                                                    |
| `aiWorkspaceChat`         | 20              | 60                  | Messages to **Workspace AI** (the **Workspace Assistant**)                                                                                                                                           |
| `agentReferenceSuggest`   | 240             | 60                  | The `@` list in **Workspace AI**                                                                                                                                                                     |
| `search`                  | 240             | 60                  | Searches ("Too many searches")                                                                                                                                                                       |
| `searchSuggest`           | 240             | 60                  | Search suggestions of workspace values and the **In a resource** menu ("Too many suggestions")                                                                                                       |
| `driveDownload`           | 120             | 60                  | Drive downloads                                                                                                                                                                                      |
| `driveRelayDownload`      | 120             | 60                  | Relayed drive downloads                                                                                                                                                                              |
| `driveRelayUpload`        | 600             | 60                  | Relayed drive uploads                                                                                                                                                                                |
| `mcp`                     | 120             | 60                  | Calls, per MCP client                                                                                                                                                                                |
| `cimdMetadataFetch`       | 20              | 60                  | Fetching an MCP client's metadata document, per origin. A client over the limit is refused with "client_id URL is not permitted by the server's fetch policy", which does not say when to try again. |
| `workflowTestRun`         | 10              | 60                  | Workflow test runs                                                                                                                                                                                   |
| `workflowDecisionPreview` | 10              | 60                  | **Try on recent mail** in the workflow editor                                                                                                                                                        |
| `workflowInbound`         | 120             | 60                  | Webhook calls, per webhook trigger                                                                                                                                                                   |
| `inviteSend`              | 100             | 3600                | Invites, per inviter in each workspace. Account invites, such as those sent from **Dashboard**, **Accounts**, **Invites**, are counted on their own for each inviter, with the same values.          |
| `signupFirst`             | 10              | 3600                | Creating the owner account on `/setup`, per IP address                                                                                                                                               |
| `signupInvitePreview`     | 30              | 3600                | Opening an invite link, per IP address                                                                                                                                                               |
| `signupInvite`            | 10              | 3600                | Accepting an invite, per IP address                                                                                                                                                                  |
| `connectionsCredential`   | 10              | 3600                | Connecting an account with a password ("Too many connection attempts")                                                                                                                               |
| `userPreferences`         | 30              | 60                  | Changes to privacy and preference settings                                                                                                                                                           |
| `dataExport`              | 5               | 600                 | Data exports ("Too many exports")                                                                                                                                                                    |

These limits count attempts at **Confirm it's you** for one action. Their message is "Too many attempts. Try again in", followed by the time left.

| Name                 | Default `limit` | Default `windowSec` | The action                                                                                                                                                                |
| -------------------- | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcpClientCreate`    | 10              | 300                 | Adding an MCP client                                                                                                                                                      |
| `mcpClientEnable`    | 10              | 300                 | Turning an MCP client on                                                                                                                                                  |
| `mcpConsentRegister` | 10              | 300                 | Approving an MCP client when it asks for access                                                                                                                           |
| `deleteAccount`      | 5               | 300                 | Deleting your account                                                                                                                                                     |
| `transferOwnership`  | 10              | 300                 | Transferring a workspace's ownership                                                                                                                                      |
| `mailboxPolicyOn`    | 10              | 300                 | Turning on AI or phishing detection for a mailbox                                                                                                                         |
| `calendarAiOn`       | 10              | 300                 | Turning on AI for a calendar                                                                                                                                              |
| `driveAiOn`          | 10              | 300                 | Turning on AI for a drive                                                                                                                                                 |
| `addressBookAiOn`    | 10              | 300                 | Turning on AI for an address book                                                                                                                                         |
| `workspaceDelete`    | 10              | 300                 | Deleting a workspace                                                                                                                                                      |
| `workspacePolicy`    | 10              | 300                 | Changing a workspace's AI and phishing detection settings                                                                                                                 |
| `memberRole`         | 10              | 300                 | Making a member an admin                                                                                                                                                  |
| `instanceUsers`      | 10              | 300                 | Changing a role, banning, unbanning and removing someone on the dashboard's **Users** page, and sending an account invite with an admin or observer role from **Invites** |
| `instanceConfig`     | 10              | 300                 | In the dashboard: **Save changes**, **Save anyway**, **Restore**, **Restore anyway** and **Reset to environment**                                                         |
| `instanceUpdate`     | 10              | 300                 | Upgrading and undoing an upgrade in the dashboard                                                                                                                         |

#### Limits in `auth`

These limits count per IP address. `auth` has three keys:

- **`default`:** every other sign-in and account request that is not in the table below, such as signing out. 60 per 60 seconds.
- **`twoFactor`:** the other two-factor requests, such as setting up or removing a method, backup codes and starting a passkey check. 3 per 10 seconds.
- **`paths`:** the limits below, by path.

| Path                         | Default `limit` | Default `windowSec` | What it covers                                                                                                                  |
| ---------------------------- | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/sign-in/email`             | 10              | 60                  | Signing in with email and password                                                                                              |
| `/sign-in/magic-link`        | 5               | 3600                | Asking for a sign-in link (**Email me a sign-in link**)                                                                         |
| `/sign-up/email`             | 5               | 3600                | **Create account**, when open sign-up is on                                                                                     |
| `/request-password-reset`    | 5               | 3600                | Asking for a reset link (**Forgot password?**)                                                                                  |
| `/send-verification-email`   | 5               | 3600                | **Resend verification email**                                                                                                   |
| `/two-factor/verify`         | 10              | 60                  | The two-factor check at sign-in, and confirming with a passkey in **Confirm it's you**                                          |
| `/native/code`               | 10              | 60                  | **Continue as** (followed by the account's email) on the browser page that signs in the desktop or mobile app                   |
| `/native/exchange`           | 10              | 60                  | The desktop or mobile app finishing its sign-in                                                                                 |
| `/native/connect-ticket`     | 20              | 60                  | Connecting an account from the desktop or mobile app                                                                            |
| `/magic-link/verify`         | 5               | 60                  | Opening the link from an **Email me a sign-in link** email                                                                      |
| `/oauth2/authorize`          | 30              | 60                  | The browser page where you sign in and approve an MCP client that asks for access                                               |
| `/oauth2/token`              | 20              | 60                  | An MCP client getting or renewing its access                                                                                    |
| `/oauth2/register`           | 5               | 60                  | An MCP client trying to register itself. Metis Suite refuses these registrations, so this only limits how often they are tried. |
| `/oauth2/introspect`         | 100             | 60                  | Checking whether an access token is valid                                                                                       |
| `/oauth2/revoke`             | 30              | 60                  | An MCP client giving up its access                                                                                              |
| `/oauth2/userinfo`           | 60              | 60                  | An MCP client reading the signed-in account's basic details                                                                     |
| `/oauth2/client/rotate-keys` | 5               | 60                  | Replacing an OAuth client's keys                                                                                                |
| `/sign-in/*`                 | 3               | 10                  | Any other sign-in request                                                                                                       |
| `/sign-up/*`                 | 3               | 10                  | Any other sign-up request                                                                                                       |
| `/change-password`           | 3               | 10                  | Changing a password                                                                                                             |
| `/change-email`              | 3               | 10                  | Changing an email address                                                                                                       |

For the requests an MCP client makes itself, the IP address is the one of the machine it runs on.

Over an `auth` limit, the answer has the status `429` and a `Retry-After` header that gives the wait in seconds. The wait is the time left in the window, so it is at most the `windowSec` of that limit.

- **A browser that opens a sign-in address**, such as the link in a sign-in email or the page where an MCP client asks for access, gets a page titled **Too many requests**. It says "Try again in" and the time left, for example "Try again in 42 seconds." The page is never cached.
- **Every other request**, such as the token requests an MCP client makes, gets the body `{"message":"Too many requests. Please try again later."}`. The body does not say when to try again; only the header does.
- **The forms on the Metis Suite sign-in pages** show their own line under the form, such as "Too many requests. Try again in 1 minute."

After the wait, open the link again or let the MCP client try again.

Only the paths in this table can be changed. The two-factor lockout (10 failed attempts, then 15 minutes) and the limit of 5 wrong codes in one sign-in are not part of this variable and cannot be changed.

#### In the config file

In the config file, the key is `rateLimitOverrides`, with the same `app` and `auth` objects inside it. For example, in YAML:

```yaml
rateLimitOverrides:
  app:
    mailSession:
      limit: 600
  auth:
    paths:
      "/sign-in/email":
        limit: 20
```

In TOML, put each path in quotes:

```toml
[rateLimitOverrides.app]
mailSession = { limit = 600 }

[rateLimitOverrides.auth.paths]
"/sign-in/email" = { limit = 20 }
```

The key can also hold the same JSON as a string. See [The optional config file](/self-hosting/configure/how-configuration-works#the-optional-config-file) for how it combines with the environment.

#### When a value is wrong

A wrong value stops the app, the worker and preflight from starting. On a server the `metis` CLI runs, `metis config set` shows "Preflight failed:" and the app that was running keeps running. Fix the value and run the command again. The error names what is wrong:

| Problem                                                                 | Line in the error                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Not JSON, not an object, or a top-level key other than `app` and `auth` | `rateLimitOverrides: METIS_RATELIMIT_OVERRIDES must be a JSON object with app and auth overrides` |
| A limit with neither `limit` nor `windowSec`                            | `rateLimitOverrides.app.mailSession: set limit, windowSec or both`                                |
| A name in `app` that does not exist                                     | `rateLimitOverrides.app: Unrecognized key: "mailSesion"`                                          |
| A path that cannot be changed                                           | `rateLimitOverrides.auth.paths: Unrecognized key: "/sign-out"`                                    |
| A key in `auth` other than `default`, `twoFactor` and `paths`           | `rateLimitOverrides.auth: Unrecognized key: "path"`                                               |
| A field other than `limit` and `windowSec`                              | `rateLimitOverrides.app.mailSession: Unrecognized key: "scope"`                                   |
| `0` for `limit`                                                         | `rateLimitOverrides.app.mailSession.limit: Too small: expected number to be >=1`                  |
| `0` for `windowSec`                                                     | `rateLimitOverrides.app.mailSession.windowSec: Too small: expected number to be >=1`              |
| A number in quotes                                                      | `rateLimitOverrides.app.mailSession.limit: Invalid input: expected number, received string`       |
| A number that is not whole                                              | `rateLimitOverrides.app.mailSession.limit: Invalid input: expected int, received number`          |

A limit with only an unknown field also shows the line `set limit, windowSec or both`.

## Maintenance mode

| Variable            | Kind    | What it does                                                                                                                                                                                                    | Default |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_MAINTENANCE` | Startup | Puts the app in maintenance mode while it is set. The value is the time maintenance began, such as `2026-11-11T10:00:00Z`. In the config file, the key is `maintenance.since`. See [below](#metis_maintenance). | Not set |

### METIS_MAINTENANCE

Maintenance mode closes your instance for a while, for example while you copy or move its database. While the variable is set, a browser that opens a page gets the maintenance page with the status `200`, every other request gets the status `503`, and the app writes nothing. The two health endpoints, `/api/livez` and `/api/readyz`, answer as usual. So do the site icons (`/favicon.ico`, `/icon.svg`, `/apple-icon.png`) and the app's built script, style and font files.

The value is the time maintenance began, as an ISO 8601 date and time with a time zone offset, for example `2026-11-11T10:00:00Z` or `2026-11-11T11:00:00+01:00`. An empty value counts as not set. In a TOML config file, put the value in quotes, such as `since = "2026-11-11T10:00:00Z"` under `[maintenance]`. Without quotes, the app refuses to start. A value in another format, or a time later than the server's clock, stops the app from starting:

```
Invalid configuration:
  - maintenance.since: METIS_MAINTENANCE must be an ISO 8601 date-time with an offset, such as 2026-11-11T10:00:00Z
```

For a time in the future, the line reads "maintenance.since: METIS_MAINTENANCE must not be later than now".

What people and services get while it is set:

- **A browser that opens a page** gets the maintenance page, with the status `200`. The page says **Down for maintenance**. Below it is how long maintenance has lasted and when it began in UTC, for example "Down for 5 min. Since 10:00 UTC on 11 November 2026." Then it says "This page reloads by itself when the app is back. Contact your administrator if this takes longer than expected."
  - The time it has lasted reads "less than a minute", or for example "5 min", "2 h", "2 h 15 min", "3 d" or "3 d 4 h". It updates every 30 seconds.
  - Within about 30 seconds after maintenance ends, the page reloads on the address the visitor opened. While the app restarts, the page keeps waiting.
  - If maintenance begins again with a new time, an open page reloads within about 30 seconds and shows the new time.
  - The **Source code** link shows at the bottom, for example "Source code · v1.4.0". The browser tab reads **Down for maintenance • Metis Suite**, and the page asks search engines not to index it. It uses the default Metis Suite colors, never a workspace's brand. It is light or dark as the visitor last chose in Metis Suite in that browser, and dark if they never chose.
- **Every other request** gets the status `503` and a short JSON answer, such as `{"error":"maintenance","since":"2026-11-11T10:00:00.000Z"}`. This covers API and MCP calls, the sign-in requests the app sends itself, webhooks and push under `/api/inbound/`, the cron tick and [relayed drive transfers](/self-hosting/configure/drive-transfers). The app's own data requests and relayed transfers get this answer even from a browser. A browser that opens another address under `/api/`, such as a file download or a sign-in callback, gets the maintenance page instead. The app tells the two apart by the request's `Accept` header: a request that accepts `text/html` gets the page. A plain `curl` request gets the JSON answer.

Both kinds of answer carry these headers, so a script can tell maintenance from a failure:

| Header              | Value                                  |
| ------------------- | -------------------------------------- |
| `Retry-After`       | `300` (seconds)                        |
| `Metis-Maintenance` | The time maintenance began, in UTC     |
| `Metis-Version`     | The release that runs, such as `1.4.0` |

The `503` answer also carries `Cache-Control: no-store`.

No background work runs in maintenance mode. Under the `internal` runner, the app does not start it. A `bullmq` worker that has the variable stays idle. Under `cron`, the tick endpoint answers `503`. See [Background work](/self-hosting/configure/background-work).

The health endpoints do not change, so a load balancer that checks them keeps sending traffic to the instance while the databases answer. To check for maintenance, see [Health checks](/self-hosting/operate/health-checks#maintenance-mode).

On a container platform or Vercel, set the variable on the app (and on the worker, if you run one) and redeploy. To end maintenance, remove it and redeploy. Set it before you stop or move the database, and remove it only once the database answers again.

On a server the `metis` CLI runs, the CLI puts the site in maintenance on its own during an upgrade or an undo, and during `sudo metis db export` and `sudo metis db move`. It does this without writing to `.env`. How depends on whether the server has a domain:

- **With a domain**, the CLI does not use this variable. It stops the app and the workers, and Caddy (the web server that serves your domain) answers every address on the domain until the app answers again. A browser that opens or reloads an address on the domain gets a plain page with the same lines as the app's page, with the status `503`. It reloads the same way once the app answers. In a browser with JavaScript turned off, the "Down for" part is missing and the page does not reload by itself. It has no **Source code** link, and it is light or dark as the visitor's device is set. Every other request gets the status `503` and a short JSON answer, such as `{"error":"maintenance","since":"2026-11-11T10:00:00Z"}`. That includes a form submitted from a tab that is already open and the app's own requests from that tab. Both answers carry `Cache-Control: no-store` and the three headers above. `Metis-Version` is the release the server ran when maintenance began, and is left out when the server runs images that are not a release. The health endpoints answer `503` too, because Caddy answers for every address.
- **Without a domain**, the CLI starts the app and the workers again with this variable set, so they run in maintenance mode as described above. For an upgrade or an undo, maintenance ends when the CLI switches releases.

See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo) and [On a server the metis CLI runs](/self-hosting/operate/export-and-import#on-a-server-the-metis-cli-runs).

To hold a server in maintenance yourself, for example while you work on its database, set the variable with `metis config set`:

```bash
sudo metis config set METIS_MAINTENANCE=2026-11-11T10:00:00Z
```

It warns "METIS_MAINTENANCE goes into .env, so the app stays in maintenance through every metis update, undo and apply until sudo metis config unset METIS_MAINTENANCE. Upgrades and undo put the app in maintenance on their own." Then it stores the variable and applies it as for any other variable.

<img
  src="/images/self-hosting/terminal-maintenance.webp"
  alt="The metis config set command for METIS_MAINTENANCE warning that the variable goes into .env, so the app stays in maintenance through every metis update, undo and apply until it is unset, and that upgrades and undo put the app in maintenance on their own, then progress lines, the list of changes and Stored in /opt/metis-suite/.env and applied"
  class="dark:hidden"
/>
<img
  src="/images/self-hosting/terminal-maintenance-dark.webp"
  alt="The metis config set command for METIS_MAINTENANCE warning that the variable goes into .env, so the app stays in maintenance through every metis update, undo and apply until it is unset, and that upgrades and undo put the app in maintenance on their own, then progress lines, the list of changes and Stored in /opt/metis-suite/.env and applied"
  class="hidden dark:block"
/>

To end maintenance, run:

```bash
sudo metis config unset METIS_MAINTENANCE
```

## Other

| Variable                                   | Kind           | What it does                                                                                                                                                   | Default        |
| ------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `METIS_CONFIG_PATH`                        | Startup        | The path of the config file. If the file does not exist, the app does not start.                                                                               | Not set        |
| `METIS_UPDATER_SOCKET`                     | Startup        | Connects the app to the updater. The `metis` CLI sets it when the updater component is on. Without it, there is no **Updates** page.                           | Set by the CLI |
| `METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS` | Set by the CLI | Set by the `metis` CLI for one preflight run only. Never put it in `.env` or a platform's environment. See [below](#metis__updater__force_update_config_keys). | Not set        |

### METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS

The name has two underscores in the middle, on each side of `UPDATER`. It is a comma-separated list of variable names. When preflight runs with it, it stores the dashboard cards those variables belong to from the environment, over the values stored in the database. This is how `metis config set`, `metis config unset` and other `metis` commands change dashboard settings. See [Change dashboard settings with the metis CLI](/self-hosting/configure/how-configuration-works#change-dashboard-settings-with-the-metis-cli).

- The whole card is stored, from the environment and the defaults. A variable that several cards share stores each of them.
- On a server list, only the entries whose id starts with `metis-` are replaced. Entries added in the dashboard stay.
- A name that is not a dashboard setting stops preflight before anything changes, for example: "`METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS` names FOO, which is not an instance setting".
- A value that fails its checks also stops preflight, and nothing is stored.
- **History** shows the result as a **Server** version.

The `metis` CLI passes it to one preflight run. Never set it yourself in `.env` or in a platform's environment, and above all never on a platform whose build or start command runs preflight on every deploy: every later preflight would overwrite what the owner or an admin changed in the dashboard. You type it yourself only for a one-off run: the `docker run` command that `metis config set --env-file` prints when Docker is not running on your computer, or a single preflight run from a checkout of a deployment that is not a release. See [Use the metis CLI from your computer](/self-hosting/install/deploy-on-vercel#use-the-metis-cli-from-your-computer).

## The metis CLI

These variables are read by the `metis` CLI or its install script, not by the app. See [CLI commands](/self-hosting/reference/cli-commands).

| Variable                                                    | What it does                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METIS_CLI_VERSION`                                         | The CLI version the install script installs, such as `0.1.0`. Without it, the script installs the newest CLI.                                                                      |
| `CLOUDFLARE_API_TOKEN`                                      | A Cloudflare API token. Used to create the DNS records for your domain and the mail gateways, and to set up the Cloudflare Email gateway.                                          |
| `RESEND_API_KEY`                                            | A Resend API key with full access, for the Resend gateway. Without it, the CLI asks for one.                                                                                       |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE` | AWS credentials for the Amazon SES gateway, read the usual AWS way. With `sudo`, pass the key on the command line, as `sudo` does not pass on `AWS_PROFILE` or your own AWS files. |

The CLI never stores the Cloudflare token or the AWS credentials. It keeps the Resend key, because the Resend gateway on your server needs it.

The CLI also writes `METIS_DOMAIN` to `.env` when you set a domain. The app does not read it.

What the install chooses (the release, the install folder, the app's port and the domain) is set with `metis setup` flags. See [Install with the metis CLI](/self-hosting/install/install-with-bootstrap#install-without-questions).
