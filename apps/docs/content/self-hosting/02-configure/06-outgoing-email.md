---
title: Outgoing email
description: Set how your instance sends its own email, such as sign-in links, sign-in alerts, password resets and invitations.
---

Your instance sends some email of its own: sign-in links, [sign-in alerts](/guide/account/sign-in-alerts), email verification, password resets and invitations. This is separate from your users' mail, which always goes through their own mailboxes.

On a new instance, this email is not delivered. It is written to the server log instead, so you can test without a mail service. To deliver it, use Resend or an SMTP server.

## Choose a driver

Open **Dashboard**, **System**, **Mail** under **Drivers**.

| Driver          | What happens                                                                                                                            | Badge on the System page |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `log` (default) | Each email is written to the app's log instead of being sent.                                                                           | **Console only**         |
| `resend`        | Sent through [Resend](https://resend.com) with your API key.                                                                            | **Delivering**           |
| `smtp`          | Sent through your SMTP server.                                                                                                          | **Delivering**           |
| `noop`          | Nothing is sent or logged. Magic link sign-in, email verification, password reset, workspace invites and sign-in alerts are turned off. | **Not delivered**        |

With `log` or `noop`, your users get no sign-in alerts. They can still turn the **Sign-in alerts** switch on or off in their settings, and the app does not warn them that no alert will arrive.

With `log`, you can read the links in the app's log:

```bash
sudo docker compose --project-directory /opt/metis-suite logs -f app
```

## Fields

| Field                                                          | When                | Notes                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **From**                                                       | `resend` and `smtp` | Required. The sender, for example `Metis Suite <noreply@example.com>`.                                                                                     |
| **From, for sign-in mail**                                     | optional            | A different sender for sign-in links, sign-in alerts, verification and password resets. Set when the instance is first set up; after that, change it here. |
| **From, for invites**                                          | optional            | A different sender for invitations. Set when the instance is first set up; after that, change it here.                                                     |
| **Resend API key**                                             | `resend`            | Your Resend API key.                                                                                                                                       |
| **SMTP URL**                                                   | `smtp`              | A full SMTP URL. Set either the URL or the host.                                                                                                           |
| **SMTP host**, **SMTP port**, **SMTP user**, **SMTP password** | `smtp`              | Use these instead of the URL.                                                                                                                              |
| **Implicit TLS**                                               | `smtp`              | Turn on for a server that uses TLS from the start of the connection, usually on port 465.                                                                  |

<img src="/images/self-hosting/driver-mail-smtp.webp" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="dark:hidden" />
<img src="/images/self-hosting/driver-mail-smtp-dark.webp" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="hidden dark:block" />

Click **Save changes** and enter your authenticator code. Then click **Run check** in the **Health** card. It signs in to the SMTP server or checks the Resend API key. It sends nothing.

To check delivery end to end, send an invitation to an address you can read, from your account settings.

## Send through Resend

Resend sends only from a domain you have verified with it.

1. In Resend, open the **Domains** page and click **Add Domain**. Resend recommends a subdomain, such as `mail.example.com`.
2. Add the DNS records that Resend shows on the **Records** tab to your domain. Copy the values from that tab. If your DNS is on Cloudflare, do not proxy the records.
3. Click **Verify DNS Records** and wait until the domain is verified.
4. Open the **API keys** page and click **Create API Key**. **Sending access** is enough, and it passes the dashboard's check. You can limit the key to your domain. Copy the key: Resend shows it only once.
5. In Metis Suite, open **Dashboard**, **System**, **Mail**. Set **Driver** to `resend` and paste the key into **Resend API key**.
6. Set **From** to an address on the verified domain, such as `Metis Suite <noreply@mail.example.com>`. Also set **From, for sign-in mail** and **From, for invites** to addresses on the verified domain. They keep the sender they had when the instance was set up, and do not change when you change **From**.
7. Click **Save changes**, enter your authenticator code, then click **Run check**.

The check confirms the key only. It does not check the domain. If Resend refuses a message, for example because the From domain is not verified, the server log shows a line that contains `Resend error:`.

See Resend's guides to [adding a domain](https://resend.com/docs/add-a-domain) and [creating an API key](https://resend.com/docs/create-an-api-key).

## Set the starting values in the environment

```bash
METIS_MAIL_DRIVER=smtp
MAIL_FROM=Metis Suite <noreply@example.com>
SMTP_URL=smtps://user:password@smtp.example.com:465
```

For Resend, use `METIS_MAIL_DRIVER=resend` and `RESEND_API_KEY`. Instead of `SMTP_URL`, you can use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SECURE`. `MAIL_FROM_AUTH` and `MAIL_FROM_INVITE` set the two optional senders. After the first start, change these in the dashboard.
