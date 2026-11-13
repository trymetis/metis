---
title: What is a gateway mailbox
description: How a mail gateway lets people use addresses on your own domain without running a mail server.
---

A mail gateway is a small service you run for one of your domains. It receives mail for addresses on that domain, keeps it, and sends mail from those addresses. Metis Suite talks to the gateway, and people use those addresses as normal mailboxes. You do not need to run a full mail server.

There are three gateways:

| Gateway                                                          | Receives with                                | Stores mail in                                              | Sends with               |
| ---------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| [Cloudflare Email](/self-hosting/mail-gateways/cloudflare-email) | Cloudflare Email Routing                     | Cloudflare D1 and R2                                        | Cloudflare Email Sending |
| [Resend](/self-hosting/mail-gateways/resend)                     | Resend's inbound webhook                     | Your libSQL database, and a folder or S3-compatible storage | Resend                   |
| [Amazon SES](/self-hosting/mail-gateways/amazon-ses)             | Amazon SES receiving, through a receipt rule | Your libSQL database and an S3 bucket                       | Amazon SES               |

## How it fits together

- **One gateway per domain** serves many mailboxes.
- **Each address has its own mailbox token.** You create a token for each address and give it to the person who owns it. A token can read and send mail only for its own address. See [Mailbox tokens](/self-hosting/mail-gateways/mailbox-tokens).
- **The gateway has an admin token** that can only create and revoke mailbox tokens. It cannot read mail.
- **You register the gateway in the owner dashboard**, under **System**, **Providers**, **Cloudflare Email**, **Resend** or **Amazon SES**, with a **Name**, the **Domain** and the gateway's address. Each entry appears in the connect dialog under its name.
- **Users connect** by picking that entry and entering their **Email address** and **Mailbox token**. Metis Suite checks the gateway's domain and the token's address before it saves anything.

## What to expect

Gateway mailboxes work like IMAP mailboxes, with a few limits:

- Search is simple text matching.
- Conversations are put together from the message headers.
- Folders exist only in Metis Suite.
- Only mail received after you set up the gateway is there. Older mail is not imported.
