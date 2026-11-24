---
title: Phishing detection
description: Turn on phishing detection by pointing Metis Suite at a phishing detection backend.
---

Phishing detection checks messages for phishing and shows the verdict as a badge. People can also ask the assistant to check a message. It is off on a new instance.

Phishing detection needs a separate backend service. That service is not part of Metis Suite. Your instance sends it the raw message, and it answers with a verdict.

## Turn it on

1. Open **Dashboard**, **System**, **Phishing detection** under **Drivers**.
2. Set **Driver** to `metis`.
3. Enter the **Backend URL**: the address of the phishing detection backend.
4. Click **Save changes** and [confirm it's you](/guide/account/two-factor-authentication#switch-between-them), then click **Save**.
5. In the **Health** card, click **Run check**. It calls the backend's `/health` endpoint.

The backend must be able to reach your instance's address, because it checks that each request really comes from your instance. Your instance must be able to reach the **Backend URL** too.

| Health result                         | What it means                                                       |
| ------------------------------------- | ------------------------------------------------------------------- |
| "reachable, but /health answered ..." | A warning. The backend answered, but its health check did not pass. |
| "responded ..."                       | The check failed. The backend answered with an error.               |
| "Phishing detection is disabled."     | **Driver** is `disabled`.                                           |

To set the starting value before the first start, use:

```bash
METIS_PHISHING_DETECTION_DRIVER=metis
BACKEND_URL=https://phishing.example.com
```

## What it sends

Metis Suite sends the raw message to the backend at the **Backend URL** for a verdict. People can also turn phishing detection off for a workspace, or for a mailbox in a workspace.

## Turn it off

Set **Driver** to `disabled` and save. While it is off, the phishing badge, the assistant's phishing tool and the matching MCP tool are hidden.
