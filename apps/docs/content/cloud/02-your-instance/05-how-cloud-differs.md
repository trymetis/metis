---
title: How Cloud differs
description: What works differently on a Metis Cloud instance, and which parts of the Self-Hosting Guide do not apply to you.
---

A Cloud instance runs the same Metis Suite as a self-hosted one. You and your team use it as the [User Guide](/guide) describes, and you manage it from the owner dashboard as the [Self-Hosting Guide](/self-hosting) describes. This page lists what is different on Cloud.

## Setup and the owner

Metis Cloud installs your instance and serves it at its own address, such as `acme.metis-suite.app`. You do not install anything, set up a server, or set up a domain and HTTPS.

The owner is the account that uses the email of your Metis Cloud account. You create it on the instance's setup page with the setup code from the console. See [Finish setup](/cloud/get-started/finish-setup). As the owner, you open the owner dashboard from your initials at the bottom of the left rail. See [Owner dashboard](/self-hosting/operate/owner-dashboard).

## Instance mail

The email your instance sends, such as sign-in links and invitations, appears on the console's [**Mail**](https://console.trymetis.email/instances/~/mail) tab. To send it through your own mail service, set up your own SMTP server or Resend in the dashboard. See [Instance mail](/cloud/your-instance/instance-mail).

## SMTP ports

A Cloud instance cannot send mail over SMTP ports 25 and 465. Like other hosting providers, Metis Cloud blocks these ports to protect its servers' IP reputation and prevent spam. Use port 587 with STARTTLS (**Implicit TLS** off). This applies to the instance's outgoing email and to the SMTP server of any entry in a server list. Resend is not affected.

## AI

Your instance comes with AI models that Metis Cloud provides. As on any instance, AI is off for each mailbox, calendar, drive and address book until its owner turns it on. See [How AI works in Metis Suite](/guide/assistant/how-ai-works). Your instance uses included models for the LLM and the decision model, each with a monthly credit. You can switch to your own provider at any time. See [Included AI](/cloud/your-instance/included-ai).

## Phishing detection

Phishing detection is off on Cloud instances. In the dashboard, **System**, **Phishing detection** shows the badge **Off**.

## Connecting accounts

A new Cloud instance does not offer signing in with Google to connect accounts.

## Server lists

A new Cloud instance starts with server lists set by Metis Cloud. As the owner, you can edit them in the dashboard, as on any instance. See [Server lists](/self-hosting/configure/server-lists).

## Updates

Metis Cloud updates your instance to each new release in the hour you pick, and emails you after each automatic update. You can change the hour or turn this off, and you can still upgrade and undo yourself from the owner dashboard. See [Updates](/cloud/your-instance/updates).

## Backups

Metis Cloud backs up every running instance each night and keeps the two most recent backups. The backups are deleted with the instance. There is no button to restore a backup. For a copy of your own, download an export. It is an encrypted archive that you open with the `metis` CLI on your own computer, and you can restore it on your own server. See [Export your data](/cloud/your-instance/export-your-data).

## Self-Hosting pages that do not apply

These parts of the Self-Hosting Guide are about running the server, which Metis Cloud does for you:

- The whole [Install](/self-hosting/install) section. [Finish setup](/cloud/get-started/finish-setup) replaces its first-run page.
- [Environment variables](/self-hosting/reference/environment-variables), [Ports and endpoints](/self-hosting/reference/ports-and-endpoints), and the [CLI commands](/self-hosting/reference/cli-commands) you run on the server. The mail gateway commands you run on your own computer work for a Cloud instance too. See [Mail gateways](/self-hosting/mail-gateways).
- [Backups](/self-hosting/operate/backups). Metis Cloud backs up your instance, as described above.
- [Manage components](/self-hosting/operate/manage-components), which is about the parts of the server.
- The server commands on [Health checks](/self-hosting/operate/health-checks) and [Troubleshooting](/self-hosting/operate/troubleshooting). The **Health** row on the console's [**Overview**](https://console.trymetis.email/instances/~) shows whether your instance answers.
