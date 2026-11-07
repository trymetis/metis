---
title: Requirements
description: The server, network access and accounts you need before you install Metis Suite.
---

This page is for the bootstrap script and Docker Compose, which run the whole stack on one server. It lists what the server needs. If you deploy on a container platform, on Vercel or on another Node host, skip this page. Go straight to [Deploy on a container platform](/self-hosting/install/deploy-on-a-container-platform) or [Deploy on Vercel or another Node host](/self-hosting/install/deploy-on-vercel). Each one lists what it needs.

## Server

- **An Ubuntu server.** The bootstrap script installs Docker from Docker's Ubuntu package repository with `apt-get`. Other systems are not covered by the script.
- **Root access.** You run the script as root, or with `sudo`.
- **OpenSSL 3.** The script uses it to generate keys for the bundled database server. Current Ubuntu releases include it.
- **Docker with the Compose plugin.** If Docker is not installed, the script installs Docker Engine and the Compose plugin for you. If Docker is already installed, the script only adds the Compose plugin when it is missing. The stack needs Docker Compose v2.

No minimum CPU, memory or disk size is published. Size the server for the number of people who will use it and the amount of mail they keep.

The server must stay on all the time. By default, background work (scheduled sends, snooze reminders and workflows) runs inside the app, so a server that sleeps or scales to zero stops that work. See [Background work](/self-hosting/configure/background-work) for other options.

## Network

- **Outbound access** to `ghcr.io` (where the Metis Suite images and the list of releases come from) and `sh.trymetis.email` (where the script downloads the Compose file). When the script installs Docker, it also needs `download.docker.com` and your Ubuntu package mirrors.
- **Ports 80 and 443** reachable from the internet once you serve the instance on a domain. Port 443 is used over TCP, and over UDP for HTTP/3.
- **A domain name** that you can point at the server, for HTTPS. You can install first and add the domain later. Until then, the app is reachable only from the server itself, through an SSH tunnel.

### Open the ports in your cloud firewall

On a cloud server, your provider's firewall may block these ports even when the server allows them. Open port 80 over TCP, and port 443 over both TCP and UDP, to the internet:

- **AWS Lightsail:** an Ubuntu instance opens only ports 22 and 80 at first. Add **HTTPS** (TCP 443), and a **Custom** rule for UDP 443. The IPv4 and IPv6 firewalls are separate, so add the rules to both. See [Lightsail firewalls](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html).
- **AWS EC2:** in **Security Groups**, select the server's group and click **Edit inbound rules**. Click **Add rule** for **HTTP**, **HTTPS**, and **Custom UDP** on port 443, from **Anywhere-IPv4** (and **Anywhere-IPv6** if you use IPv6). Click **Save rules**. See [EC2 security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/changing-security-group.html).
- **Google Compute Engine:** create an ingress firewall rule with source `0.0.0.0/0`, TCP ports `80,443` and UDP port `443`. See [VPC firewall rules](https://docs.cloud.google.com/firewall/docs/using-firewalls).
- **DigitalOcean:** if the Droplet has a cloud firewall, open it under **Networking**, **Firewalls**, then **Rules**. Add inbound rules for **HTTP** and **HTTPS**, and a **Custom** rule for UDP port 443. See [DigitalOcean firewall rules](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/).

## Accounts and services

You need at least one way for users to connect their mail, calendars, files or contacts. Pick any of these:

- An OAuth client from Google, Microsoft or Zoho. See [OAuth providers](/self-hosting/configure/sign-in-providers).
- Your own IMAP, CalDAV, CardDAV, S3, WebDAV, FTP or SFTP servers. See [Server lists](/self-hosting/configure/server-lists).
- A mail gateway on your own domain. See [Mail gateways](/self-hosting/mail-gateways).

You can add these after the install, from the owner dashboard. These are optional:

- An API key for an AI model provider, to turn on the assistant and other AI features. See [AI models](/self-hosting/configure/ai-models).
- A Resend account or an SMTP server, so the instance can send sign-in links, sign-in alerts and invitations. See [Outgoing email](/self-hosting/configure/outgoing-email).
