---
title: Outgoing email
description: Set how your instance sends its own email, such as sign-in links, sign-in alerts, password resets and invitations.
---

Your instance sends some email of its own: sign-in links, [sign-in alerts](/guide/account/sign-in-alerts), email verification, password resets and invitations. This is separate from your users' mail, which always goes through their own mailboxes.

On a new self-hosted instance, this email is not delivered. It is written to the server log instead, so you can test without a mail service. On a new Metis Cloud instance, it goes to the instance's [**Mail**](https://console.trymetis.email/instances/~/mail) tab in the Metis Cloud console instead (see [Instance mail](/cloud/your-instance/instance-mail)). To deliver it, use Resend or an SMTP server.

## Choose a driver

Open **Dashboard**, **System**, **Mail** under **Drivers**.

| Driver          | What happens                                                                                                                                                                                                                                                                | Badge on the System page |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `log` (default) | Each email is written to the app's log instead of being sent.                                                                                                                                                                                                               | **Console only**         |
| `resend`        | Sent through [Resend](https://resend.com) with your API key.                                                                                                                                                                                                                | **Delivering**           |
| `smtp`          | Sent through your SMTP server.                                                                                                                                                                                                                                              | **Delivering**           |
| `console`       | Only for Metis Cloud instances. Each email goes to the instance's [**Mail**](https://console.trymetis.email/instances/~/mail) tab in the Metis Cloud console. A self-hosted instance cannot use it. This driver has nothing to do with the **Console only** badge of `log`. | **Delivering**           |
| `noop`          | Nothing is sent or logged. Magic link sign-in, email verification, password reset, invites and sign-in alerts are turned off.                                                                                                                                               | **Not delivered**        |

No invite is created when its email is not sent. This happens with `noop`, and when sending fails, for example because the SMTP server refuses it. The sender sees "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again." The one exception is the owner, sending from the app: the invite is created and the owner is shown its link to send by hand. The audit log records this as **Invite link shown**. See [How invites work](/guide/account/invite-people#if-the-invite-email-cannot-be-sent).

With `log` or `noop`, your users get no sign-in alerts. They can still turn the **Sign-in alerts** switch on or off in their settings, and the app does not warn them that no alert will arrive.

With `log`, you can read the links in the app's log. On a server the `metis` CLI runs:

```bash
sudo metis logs app --follow
```

Press Ctrl+C to stop. `-f` works the same as `--follow`.

## Fields

| Field                                                          | When                | Notes                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **From**                                                       | `resend` and `smtp` | Required. The sender, for example `Metis Suite <noreply@example.com>`.                                                                                                                                                                                                                                 |
| **From, for sign-in mail**                                     | optional            | A different sender for sign-in links, sign-in alerts, verification and password resets. Set when the instance is first set up; after that, change it here.                                                                                                                                             |
| **From, for invites**                                          | optional            | A different sender for invitations. Set when the instance is first set up; after that, change it here.                                                                                                                                                                                                 |
| **Resend API key**                                             | `resend`            | Your Resend API key.                                                                                                                                                                                                                                                                                   |
| **SMTP URL**                                                   | `smtp`              | A full SMTP URL. Set either the URL or the host.                                                                                                                                                                                                                                                       |
| **SMTP host**, **SMTP port**, **SMTP user**, **SMTP password** | `smtp`              | Use these instead of the URL.                                                                                                                                                                                                                                                                          |
| **Implicit TLS**                                               | `smtp`              | Turn on for a server that uses TLS from the start of the connection, usually on port 465.                                                                                                                                                                                                              |
| **Allow unencrypted**                                          | `smtp`              | Off by default. With **Implicit TLS** off, the connection must upgrade with STARTTLS, or it fails. Turn this on only for a local server that has no TLS. With an **SMTP URL**, the URL decides implicit TLS: `smtp://` counts as off and `smtps://` as on, whatever the **Implicit TLS** switch shows. |
| **Console endpoint**, **Console token**                        | `console`           | Only for Metis Cloud instances, which start with both set. A self-hosted instance cannot use them.                                                                                                                                                                                                     |

<img src="/images/self-hosting/driver-mail-smtp.webp" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="dark:hidden" />
<img src="/images/self-hosting/driver-mail-smtp-dark.webp" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="hidden dark:block" />

Like other hosting providers, Metis Cloud blocks outgoing SMTP ports 25 and 465 to protect its servers' IP reputation and prevent spam. Use port 587 with **Implicit TLS** off (STARTTLS). Resend is not affected.

Click **Save changes** and enter your authenticator code. Then click **Run check** in the **Health** card. It signs in to the SMTP server or checks the Resend API key. It sends nothing. With `console`, there is nothing to check.

If **Implicit TLS** and **Allow unencrypted** are both off and your SMTP server does not offer STARTTLS, the check fails. The check also runs when you click **Save changes**, so the change is not saved. If you want to store it anyway, click **Save anyway** on the **Check failed** card. Outgoing email then fails until the SMTP server offers STARTTLS, or until you turn on **Implicit TLS** or **Allow unencrypted**. See [Save anyway](/self-hosting/configure/how-configuration-works#save-anyway).

If **Implicit TLS** and **Allow unencrypted** are both on when you click **Save changes**, nothing is saved, and the error ends with "Allow unencrypted applies only when implicit TLS is off".

To check delivery end to end, send an account invite to an address you can read, from **Dashboard**, **Accounts**, **Invites**. Then revoke it with its trash button under **Pending account invites**.

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

For Resend, use `METIS_MAIL_DRIVER=resend` and `RESEND_API_KEY`. Instead of `SMTP_URL`, you can use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SECURE`. `SMTP_PLAIN=true` sets **Allow unencrypted**. `MAIL_FROM_AUTH` and `MAIL_FROM_INVITE` set the two optional senders. After the first start, change these in the dashboard.
