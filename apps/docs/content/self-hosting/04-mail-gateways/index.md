---
title: Mail gateways
description: Give people mailboxes on your own domain through a Cloudflare Email, Resend or Amazon SES gateway.
---

A mail gateway lets people on your instance use addresses on your own domain without a mail server. You run the gateway, register it in the owner dashboard, and give each person a token for their address. The `metis` CLI can deploy a gateway and register it for you with one `metis add` command, on your server or from your own computer.

- [What is a gateway mailbox](/self-hosting/mail-gateways/what-is-a-gateway-mailbox): how gateways work and what to expect from them.
- [Set up the Cloudflare Email gateway](/self-hosting/mail-gateways/cloudflare-email): a Cloudflare Worker for one domain.
- [Set up the Resend gateway](/self-hosting/mail-gateways/resend): a small service for one domain, on Resend and libSQL.
- [Set up the Amazon SES gateway](/self-hosting/mail-gateways/amazon-ses): an AWS Lambda function for one domain, on Amazon SES, S3 and libSQL.
- [Mailbox tokens](/self-hosting/mail-gateways/mailbox-tokens): create, list and revoke the tokens people connect with.
