---
title: Instance mail
description: Read the email your Cloud instance sends on the console's Mail tab, and set up your own SMTP server or Resend to deliver it.
---

Your instance sends some email of its own: sign-in links, sign-in alerts, email verification, password resets and invitations. This is separate from your mail, which always goes through the mailboxes you connect.

On a new Cloud instance, this email appears on the [**Mail**](https://console.trymetis.email/instances/~/mail) tab of the instance in the console. To send it through your own mail service, set up your own SMTP server or Resend in the instance's owner dashboard.

## Read the instance mail

1. Open your instance in the console.
2. Click [**Mail**](https://console.trymetis.email/instances/~/mail) in the sidebar.

The **Instance mail** card says "Sign-in links, verification, resets and invites your instance sends. Each message is kept for one hour." If nothing was sent in the last hour, it says "Nothing in the last hour."

Each row shows the subject, the address it was sent to, and how long ago it was sent, such as "5m ago". Click a row to open it. You see the links in the message first, then its text. Click a link to open it in a new tab. Only the text of a message and its `https://` links are shown.

What to know:

- **Each message is kept for one hour.** After that, it is gone.
- **The tab lists the 50 newest messages.**
- **It shows mail to everyone on your instance.** When your instance sends a sign-in link or an invitation to someone else, you see it here too, labelled with their address.
- **The tab refreshes on its own while it is open**, as long as its browser tab is in front.

## Send it through your own mail service

To send this email through your own mail service, set up SMTP or Resend:

1. Open your instance and click your initials at the bottom of the left rail. Choose **Dashboard**.
2. Open **System**, then **Mail** under **Drivers**. On a new Cloud instance, **Driver** shows `console`. This driver sends the mail to the console's [**Mail**](https://console.trymetis.email/instances/~/mail) tab. The card's badge reads **Delivering**, because the mail is delivered to that tab.
3. Set **Driver** to `resend` or `smtp`, and fill in the fields.
4. Click **Save changes** and enter your authenticator code.
5. Send an invitation to an address you can read, to check that it arrives.

[Outgoing email](/self-hosting/configure/outgoing-email) explains the drivers, every field and how to set up Resend. On a Cloud instance, these parts of that page do not apply:

- On a new Cloud instance, mail is not written to a server log, and you cannot read the server log. With the `log` or `noop` driver, the mail is not delivered, and it does not appear on the [**Mail**](https://console.trymetis.email/instances/~/mail) tab either.
- You cannot set starting values in the environment.

## SMTP ports on Cloud

A Cloud instance cannot send mail over SMTP ports 25 and 465. Like other hosting providers, Metis Cloud blocks these ports to protect its servers' IP reputation and prevent spam. If you use `smtp`, use port 587 with STARTTLS: set **SMTP port** to `587` and leave **Implicit TLS** off. Resend is not affected.
