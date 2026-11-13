---
title: Health checks
description: The two endpoints your uptime monitor or load balancer can use to check the instance.
---

Metis Suite has two health endpoints for uptime monitors and load balancers. Both answer with a status code only, with no body, and need no sign-in.

| Endpoint      | Answers `200` when                                           | Otherwise |
| ------------- | ------------------------------------------------------------ | --------- |
| `/api/livez`  | The app process is serving requests. It checks nothing else. | No answer |
| `/api/readyz` | The settings loaded and both databases answer.               | `503`     |

For example:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" https://mail.example.com/api/readyz
```

Use `/api/livez` to decide whether to restart the app, and `/api/readyz` to decide whether to send it traffic. The updater also waits for `/api/readyz` after an upgrade.

When `/api/readyz` answers `503`, the reason is written only to the app's log, never to the response. On a server the `metis` CLI runs, read it with:

```bash
sudo metis logs app
```

## Check the server with the metis CLI

On a server the `metis` CLI runs, `metis status` shows the state of everything at once:

```bash
sudo metis status
```

It prints:

- A heading with the release, such as "Metis 1.4.0".
- One line for each component, marked "ok" or "NOT HEALTHY", with a detail. For example, the app shows its version, sqld "namespaces app and mastra", Caddy the hosts it serves (such as "serving mail.example.com"), and Redis "Valkey, noeviction". A mail gateway shows its release. When that differs from the app's, it adds, for example, "app 1.4.0: run metis add again to move it". An Amazon SES gateway also shows, when the command has AWS credentials, how many mails failed to reach it, for example ", 2 failed receipt(s) in metis-ses-example-com-failed".
- A table of the containers, with their state and health.
- The last upgrade or undo, such as "Last upgrade: 1.3.2 → 1.4.0, succeeded", with its error if it failed.

Add `--json` to get the same facts as JSON, for a script or a monitor.

To read a component's log, name it:

```bash
sudo metis logs app
sudo metis logs worker --follow
sudo metis logs sqld --tail all
```

| Flag             | What it does                                   | Default |
| ---------------- | ---------------------------------------------- | ------- |
| `-f`, `--follow` | Keep printing new lines. Press Ctrl+C to stop. | Off     |
| `--tail`         | How many lines to start from, or `all`.        | `100`   |

When a component has several containers, such as several workers, each line starts with the container's name, for example `worker-1 | `. The Cloudflare Email and Amazon SES gateways run outside the server, so they have no log here: the command says, for example, "gateway-cloudflare has no containers".

To restart a component's containers, run `sudo metis restart app` (or another component). It prints, for example, "Restarted metis-app". A restart does not read `.env` again: after you edit `.env`, run `sudo metis apply` instead. See [CLI commands](/self-hosting/reference/cli-commands).

## Checks inside the dashboard

The owner dashboard has deeper checks that contact each service: the **Health** card on every driver and provider page under **System**. The card runs its checks when you click **Run check**. Saving a change also checks the changed settings. Every deploy checks your servers and the LLM. It also checks the decision model when one of the decision model's switches is on. Problems appear on the **Deploy checks** page. See [Troubleshooting](/self-hosting/operate/troubleshooting#read-the-deploy-checks) and [Owner dashboard](/self-hosting/operate/owner-dashboard#health-checks-on-driver-and-provider-pages).
