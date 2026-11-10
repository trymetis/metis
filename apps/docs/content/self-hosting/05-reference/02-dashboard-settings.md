---
title: Dashboard settings
description: Every setting on the System pages of the owner dashboard, with the environment variable that sets its starting value.
---

These settings live under **Dashboard**, **System**. Saving any of them asks for your authenticator code and checks the change against the real service first. On a server list, only new entries and entries whose connection settings changed are checked. See [What a save checks](/self-hosting/configure/how-configuration-works#what-a-save-checks). Secret fields show only **Set** or **Not set**. Leave a secret empty to keep the stored value.

The **Set by** column names the environment variable that gives each field its starting value. Fields marked (startup only) come only from that variable, and change only with an edit to `.env` and a restart. **Reset to environment** on a card returns its fields to the values from their **Set by** variables or the config file, as they were when the app last started, or to their defaults. See [Reset a card to the environment](/self-hosting/operate/owner-dashboard#reset-a-card-to-the-environment).

## Instance

| Card                 | Field                                                                       | Set by                                                        |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **App**              | **Public URL**, **Secure cookies** (read-only)                              | `BETTER_AUTH_URL` (startup only)                              |
| **Accounts**         | **Setup code** (**Live**, **Used** or **Not set**), owner email (read-only) | `METIS_SETUP_CODE`, `METIS_OWNER_EMAIL` (startup only)        |
| **Sign-up**          | **Invite only**                                                             | `METIS_SIGNUP_DISABLED`                                       |
| **Legal consent**    | **Terms URL**, **Privacy policy URL**, **Version**                          | `METIS_TERMS_URL`, `METIS_PRIVACY_URL`, `METIS_LEGAL_VERSION` |
| **Drive relay**      | **Max transfer size (MB)**, **Transfers per user, per process**             | `METIS_DRIVE_RELAY_MAX_MB`, `METIS_DRIVE_RELAY_CONCURRENCY`   |
| **Mail image proxy** | **Proxy remote images**, **Max image size (MB)**                            | `METIS_MAIL_IMAGE_PROXY`, `METIS_MAIL_IMAGE_PROXY_MAX_MB`     |
| **Mail cache**       | **Keep message bodies (days)**                                              | `METIS_MAIL_CACHE_DAYS`                                       |
| **Proxies**          | **Trusted proxies**                                                         | `METIS_TRUSTED_PROXIES`                                       |

When **Proxy remote images** is on, people can load remote images in received mail through your instance. This hides their device from the sender, but the sender can still tell that the message was opened. The card shows **On** or **Off**.

### Mail cache

The **Mail cache** card says: "How long this instance keeps copies of message bodies it has shown."

When someone opens a message, your instance stores a copy of its body (the text and content of the message). The next time anyone opens that message, it opens faster, because it comes from this copy. The instance also stores the bodies it reads to write a thread summary. A body larger than about 4 MB is not stored.

The card has one field, **Keep message bodies (days)**: "Days a message's body stays stored after it was last opened. Subjects, senders, AI labels, summaries and phishing checks are kept; an older message's body is fetched again when it is opened."

| Rule        | Value                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Value       | A whole number of days, from 1 to 3650.                                                                                                                            |
| Wrong value | Refused. The message starts with "Mail cache: Invalid configuration".                                                                                              |
| Saving      | **Save changes** and your authenticator code. The card runs no check against another service. Every process uses the new value within 30 seconds, with no restart. |
| Reset       | **Reset to environment** puts back the value of `METIS_MAIL_CACHE_DAYS` or the config file key `mailCache.retentionDays`.                                          |
| Default     | 30.                                                                                                                                                                |

#### When stored bodies are cleared

- The period counts from the last time the message was opened. Each time someone opens it, the period starts again.
- Every day at 03:45 UTC, a built-in job clears the stored body of each message that nobody opened within that many days. It can appear under **Automation**, in **Recent runs**, as **Prune cached message bodies**. See [Automation](/self-hosting/operate/owner-dashboard#automation).
- The subject, the sender, the preview text, AI labels, thread summaries and phishing check results stay stored.
- When someone opens a message whose body was cleared, the instance fetches the body from the mail provider again, and stores a new copy. Writing a thread summary does the same.
- If you lower the value, more bodies are cleared at the next daily run. If you raise it, bodies that were already cleared do not come back. They are fetched again only when someone opens the message.

### Proxies

The **Proxies** card says: "How this instance finds a visitor's address behind a load balancer or CDN. Workflow webhook IP allow lists use the Workflow runner's own list."

A proxy is a server that passes requests on to your instance, such as a load balancer, a CDN or the bundled Caddy server. Most proxies add the address of the computer that connected to them to the end of the `X-Forwarded-For` header. Each address in that header is called a hop. The bundled Caddy server replaces any `X-Forwarded-For` it receives, so behind it the header holds one hop: the computer that connected to Caddy.

The card has one optional field, **Trusted proxies**: "IP addresses or CIDR ranges, comma separated, of the proxies in front of this instance. Their X-Forwarded-For hops are skipped when finding a visitor's address for rate limits, sign-in limits and the audit log."

| Rule        | Value                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entries     | Up to 50, separated by commas.                                                                                                                                                  |
| Each entry  | An IP address, such as `198.51.100.7`, or a CIDR range (a block of addresses), such as `198.51.100.0/24`. The number after the slash is 0 to 32 for IPv4 and 0 to 128 for IPv6. |
| Wrong entry | Refused. The message ends with "must be an IP address or CIDR range".                                                                                                           |
| Saving      | **Save changes** and your authenticator code. The card runs no check against another service. Every process uses the new list within 30 seconds, with no restart.               |
| Reset       | **Reset to environment** puts back the value of `METIS_TRUSTED_PROXIES` or the config file key `proxies.trustedProxies`.                                                        |
| Default     | Empty.                                                                                                                                                                          |

#### How the visitor's address is found

- The app reads `X-Forwarded-For` from right to left. It skips every hop in your list and takes the first one that is not in it.
- A port is removed. `203.0.113.7:51234` counts as `203.0.113.7`, and `[2001:db8::1]:443` counts as `2001:db8::1`.
- If every hop is in your list, the app takes the address in the `cf-connecting-ip` header, which Cloudflare adds. Without that header, it takes the first hop.
- Apart from `cf-connecting-ip`, the app never reads `X-Real-IP` or any other CDN header.

The address it finds is used for:

- the limits on sign-up and on creating the owner account;
- the limits on sign-in, two-factor codes, magic links, password resets and verification emails;
- the IP address in the [audit log](/self-hosting/operate/owner-dashboard#audit-log);
- the address shown in [sign-in alerts](/guide/account/sign-in-alerts) and on the [signed-in devices](/guide/account/signed-in-devices) list.

If the app finds no usable address, the audit log row has no IP address, sign-in alerts say "Unknown", the signed-in devices list says "IP unknown", and all such requests share one limit.

#### When to fill it in

- **Behind the bundled Caddy, or behind one load balancer** that adds the caller's address to the end of `X-Forwarded-For`: leave the field empty.
- **Cloudflare in front of the bundled Caddy:** list Cloudflare's address ranges. The app then takes the visitor's address from `cf-connecting-ip`. If you do not, every visitor who comes through one Cloudflare server gets that server's address. They share one rate limit, and the audit log shows the same address for all of them. See [Behind Cloudflare or another CDN](/self-hosting/install/domain-and-https#behind-cloudflare-or-another-cdn).
- **Another CDN in front of the bundled Caddy:** listing the CDN's ranges does not help. Caddy replaces the `X-Forwarded-For` header that the CDN sends with the CDN server's address, and the app reads no other CDN's header. Visitors still share the CDN server's address.
- **A CDN in front of your own proxy**, where that proxy keeps the CDN's `X-Forwarded-For` and adds the CDN server's address after it: list the CDN's address ranges.
- **List only the proxies in front of your instance.** A list that is too wide, such as `0.0.0.0/0`, lets a caller choose their own address.
- **Keep the app private behind the proxy.** A caller who reaches the app directly can send any address in `X-Forwarded-For`.

The **Trusted proxies** field on the **Workflow runner** page is a separate list. It serves only the **Only from these IPs** check of webhook triggers. When a chain of proxies sits in front of your instance, you usually list the same addresses in both. See [Webhooks that only accept some addresses](/self-hosting/configure/background-work#webhooks-that-only-accept-some-addresses).

## Drivers

| Page                             | Fields                                                                                                                                                                                                                                                                                                          | Set by                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM**                          | **Driver**, **API key**, **Base URL**, **Provider name**, **Structured outputs**, **Chat and agents model**, **Smart replies model**, **Classifier model**, **Summaries model**, **Images in summaries**                                                                                                        | `METIS_LLM_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`                                                                                          |
| **LLM**, **Decision model** card | **Driver**, **Model**, **Base URL**, **API key**, **Inbox labels**, **Summary gate**, **Workflow Ask and Branch**, **Inbox label calls at a time**                                                                                                                                                              | `METIS_DECISION_*`, `OPENAI_API_KEY`                                                                                                          |
| **Phishing detection**           | **Driver**, **Backend URL**                                                                                                                                                                                                                                                                                     | `METIS_PHISHING_DETECTION_DRIVER`, `BACKEND_URL`                                                                                              |
| **Mail**                         | **Driver**, **From**, **From, for sign-in mail**, **From, for invites**, **Resend API key**, **SMTP URL**, **SMTP host**, **SMTP port**, **SMTP user**, **SMTP password**, **Implicit TLS**, **Allow unencrypted**, and, for `console` (Metis Cloud instances only), **Console endpoint** and **Console token** | `METIS_MAIL_DRIVER`, `MAIL_FROM*`, `RESEND_API_KEY`, `SMTP_*`, and on Metis Cloud instances only, `CONSOLE_MAIL_URL` and `CONSOLE_MAIL_TOKEN` |
| **Cache**                        | **Driver**, **URL**, **Token**                                                                                                                                                                                                                                                                                  | `METIS_CACHE_*`                                                                                                                               |
| **Workflow runner**              | **Driver**, **Cadence (seconds)**, **Tick budget (ms)**, **Batch size**, **Concurrency**, **Redis URL**, **Queue prefix**, **Cron secret**, **Keep step data (days)**, **Keep run history (days)**, **Public URL for webhooks and push**, **Trusted proxies** (webhooks only)                                   | `METIS_WORKFLOW_*`, `CRON_SECRET`                                                                                                             |
| **Database** (read-only)         | **Driver**, **App database**, and the address of the AI memory database                                                                                                                                                                                                                                         | `METIS_DB_DRIVER`, `DATABASE_URL`, `MASTRA_DATABASE_URL` (startup only)                                                                       |

Fields that apply only to some drivers appear only when that driver is selected.

## Providers

| Page                      | Fields per entry                                                                                                                                                                                                | Set by                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Google**, **Microsoft** | **Client ID**, **Client secret**, plus the **Redirect URI** to register                                                                                                                                         | `GOOGLE_*`, `MICROSOFT_*`  |
| **Zoho**                  | **Client ID**, **Client secret**, **Region**, plus the **Redirect URI** to register                                                                                                                             | `ZOHO_*`                   |
| **IMAP**                  | **Name**, **IMAP host**, **IMAP port**, **IMAP implicit TLS**, **Allow unencrypted IMAP**, **SMTP host**, **SMTP port**, **SMTP implicit TLS**, **Allow unencrypted SMTP**, **Accept invalid TLS certificates** | `METIS_IMAP_SERVERS`       |
| **CalDAV**                | **Name**, **CalDAV URL**, **Accept invalid TLS certificates**                                                                                                                                                   | `METIS_CALDAV_SERVERS`     |
| **CardDAV**               | **Name**, **CardDAV URL**, **Accept invalid TLS certificates**                                                                                                                                                  | `METIS_CARDDAV_SERVERS`    |
| **Cloudflare Email**      | **Name**, **Domain**, **Worker endpoint**                                                                                                                                                                       | `METIS_CLOUDFLARE_SERVERS` |
| **Resend**                | **Name**, **Domain**, **Gateway endpoint**                                                                                                                                                                      | `METIS_RESEND_SERVERS`     |
| **S3**                    | **Name**, **Endpoint**, **Region**, **Access key ID**, **Secret access key**, **Path-style addressing**, **Accept invalid TLS certificates**, **Transfers**, **Part size** (only with `relay`), **Checksums**   | `METIS_S3_SERVERS`         |
| **WebDAV**                | **Name**, **WebDAV URL**, **Accept invalid TLS certificates**                                                                                                                                                   | `METIS_WEBDAV_SERVERS`     |
| **FTP**                   | **Name**, **Host**, **Port**, **TLS**, **Accept invalid TLS certificates**, **Pool size**                                                                                                                       | `METIS_FTP_SERVERS`        |
| **SFTP**                  | **Name**, **Host**, **Port**, **Host key (SHA256)**, **Pool size**                                                                                                                                              | `METIS_SFTP_SERVERS`       |

For what each field does, see [OAuth providers](/self-hosting/configure/sign-in-providers) and [Server lists](/self-hosting/configure/server-lists).

## Not in the dashboard

These are set only in the environment, and need a restart: the app address and secret, the encryption key, the setup code, the owner email, the source code link, the databases, how long the audit log keeps events (`METIS_AUDIT_RETENTION_DAYS`) and the drive relay secret. See [Environment variables](/self-hosting/reference/environment-variables).
