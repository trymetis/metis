---
title: Troubleshooting
description: What the dashboard's deploy checks and warnings mean, and how to fix the most common problems.
---

Start in the owner dashboard. The deploy check bar at the bottom of the sidebar shows whether the last deploy found problems, and the **System** page shows warnings above its cards.

## Read the deploy checks

Every deploy runs preflight, which checks your settings, your servers and your AI models, and records what it found. Click the deploy check bar to open the **Deploy checks** page.

- The **Last run** card says when preflight ran and against which configuration version. Its badge reads **No warnings**, or offers an **Acknowledge** button. Observers see a **Not acknowledged** badge instead of the button.
- Clicking **Acknowledge** clears the highlight on the sidebar bar. It does not fix anything, and the next deploy records a new run.
- If the configuration changed after that run, a note says that some warnings may no longer apply. The next deploy checks again.
- Before the first deploy, the page shows **No preflight run yet**.

<img src="/images/self-hosting/deploy-checks.webp" alt="The Deploy checks page with the Last run card" class="dark:hidden" />
<img src="/images/self-hosting/deploy-checks-dark.webp" alt="The Deploy checks page with the Last run card" class="hidden dark:block" />

Warnings are grouped as follows.

| Group                                          | What it means                                                                                                                                                                                                                                                                                                                                                   | What to do                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seeding**                                    | Settings that preflight stored have a problem. For example, no provider is configured, the `internal` runner was stored on a host that suspends the app, or a decision switch is on while the LLM driver is `disabled`.                                                                                                                                         | Fix the setting under **System**.                                                                                                                          |
| **Environment differs from the stored config** | A setting in the environment or the config file differs from the one stored in the dashboard. The stored value is used. The warning stays on **Deploy checks** until the next deploy.                                                                                                                                                                           | Change the setting in the dashboard, or remove it from the environment. You can also click **Reset to environment** on the setting's card.                 |
| **Server checks**                              | A server in your lists, or an OAuth client, failed its check. People cannot connect through it until it is fixed. For a server list entry, later saves on its page show "Unchanged. The last deploy check reported:" followed by the problem. This stops once you change the entry's connection settings and save, or once a later deploy no longer reports it. | Open the provider page under **System**, fix the entry and click **Run check**.                                                                            |
| **LLM**                                        | Your provider rejected the API key, could not be reached, answered with an error, or does not offer one or more of the four models you entered.                                                                                                                                                                                                                 | Fix the **API key**, **Base URL** or model fields on the **LLM** page under **System**. See [AI models](/self-hosting/configure/ai-models#set-up-the-llm). |
| **Decision model**                             | The decision model is missing an API key, rejected the key, could not be reached, or does not offer the model.                                                                                                                                                                                                                                                  | Fix the **Decision model** card on the **LLM** page under **System**. See [AI models](/self-hosting/configure/ai-models#add-a-decision-model-optional).    |
| **Quarantine**                                 | Some connections were hidden because their provider or server is no longer configured, for example after a reset to the environment removed it.                                                                                                                                                                                                                 | They come back when you configure the provider again, or restore the removed server entry from **History**. Users can also delete those connections.       |

**Reset to environment** uses the environment as it was when the app last started. If you edit `.env` or the config file before you reset, apply the change first, as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup).

## Common problems

### Nobody can connect an account

The **System** page says "No provider is configured, so no mailbox, calendar, drive or address book can be connected until one is added under Dashboard → System." Add a provider. See [OAuth providers](/self-hosting/configure/sign-in-providers) and [Server lists](/self-hosting/configure/server-lists).

### Connecting a Google, Microsoft or Zoho account fails

Check that the redirect URI registered with the provider matches the **Redirect URI** on the provider's page exactly. It changes when your domain changes. Then click **Run check** on the provider page: it tells a wrong client ID or secret apart from other problems.

### Accounts disappeared from every workspace

Their provider or server entry was removed, so they are quarantined. A reset to the environment can also remove one, when you tick **Reset anyway and quarantine these connections**. The **Connections** page lists them. They come back when you configure the provider again, or restore the removed server entry from **History**.

### Sign-in links, sign-in alerts and invitations never arrive

The **Mail** card on the **System** page shows **Console only** or **Not delivered**. Set up Resend or SMTP. See [Outgoing email](/self-hosting/configure/outgoing-email).

### IMAP accounts or instance mail stop working on a server without TLS

When implicit TLS is off, Metis Suite requires STARTTLS, which upgrades the connection to TLS. If the server does not offer it, as with a local test server, the connection fails.

- **IMAP accounts:** open the **IMAP** page under **System**, **Providers**. On the entry, turn on **Allow unencrypted IMAP** or **Allow unencrypted SMTP**, for the side that has no TLS. Click **Save changes** and enter your authenticator code. See [Server lists](/self-hosting/configure/server-lists#imap).
- **Sign-in links and invitations:** open the **Mail** page under **System**, **Drivers**, turn on **Allow unencrypted**, click **Save changes** and enter your authenticator code. See [Outgoing email](/self-hosting/configure/outgoing-email#fields).

Turn these on only for a server that has no TLS. If you can, set up TLS on the server instead.

### Scheduled mail and workflows do not run

Open **Automation**. If the status is **No tick yet** or **Delayed**, the workflow runner is not being woken. See [Background work](/self-hosting/configure/background-work).

### AI features are missing

The **LLM** card on the **System** page shows **Off**. Set up a model. See [AI models](/self-hosting/configure/ai-models). People can also turn AI off for their own workspaces and mailboxes.

If the LLM is set up but AI features fail, look for the **LLM** group on the **Deploy checks** page.

### The app does not start after a change to .env

A setting has a wrong value. The app refuses to start and names the setting. Read the preflight log:

```bash
sudo docker compose --project-directory /opt/metis-suite logs preflight
```

### The app does not start after pinning an older release

The preflight log says the database has changes "which this release does not ship: a newer release migrated it." A newer release already changed your database, and an older release cannot run on it. Pin that newer release again, or a newer one. To go back, use **Undo last upgrade** while it is offered, or restore a backup taken before the newer release. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo#going-back-further).

### An upgrade or undo failed

Open **Dashboard**, **System**, **Updates**. The **Last upgrade** or **Last undo** card says what the updater did. See [When a step fails](/self-hosting/operate/upgrade-and-undo#when-a-step-fails).

### The owner dashboard is missing

Only the owner (the account whose email matches `METIS_OWNER_EMAIL`), admins and observers see **Dashboard** in the user menu. Check that `METIS_OWNER_EMAIL` is exactly your sign-in address. To give someone else access, the owner or an admin opens **Dashboard**, **Accounts**, **Users**, opens the person's actions menu and picks a role under **Change role**. See [Instance roles](/self-hosting/operate/owner-dashboard#instance-roles).

### Someone sees "This account is banned. Ask the instance owner or an admin."

The owner or an admin banned their account. Open **Dashboard**, **Accounts**, **Users** and set the status filter (it shows **Any status**) to **Banned** to find it. A ban with an end date shows it in the **Status** column, and ends by itself. To lift the ban sooner, open the row's actions menu, click **Unban** and enter your authenticator code. The reason for the ban, if one was given, is in the **Audit log**. See [Ban an account](/self-hosting/operate/owner-dashboard#ban-an-account).

### The app does not start: METIS_OWNER_EMAIL is required

The preflight log shows "Invalid configuration" with the line "app.ownerEmail: METIS_OWNER_EMAIL is required: set it to the instance owner's email address". Every instance needs an owner email. Add a line such as `METIS_OWNER_EMAIL=you@example.com` to `.env`, then start the stack again with `sudo docker compose --project-directory /opt/metis-suite up -d`. Use the address of the account that should own the instance. If that account does not exist yet, create it at `/setup` with your setup code. See [First run](/self-hosting/install/first-run).

### Invites fail with "The invite email couldn't be sent"

Metis Suite could not send the invite email, so it created no invite. Check the **Mail** page under **System**, **Drivers**, and click **Run check**. See [Outgoing email](/self-hosting/configure/outgoing-email). When the owner sends an invite in the app and the email fails, the owner is shown the invite link to send by hand instead.

### Saving a setting fails

For messages in the **Upgrade** and **Undo last upgrade** dialogs, see [Errors in the dialog](/self-hosting/operate/upgrade-and-undo#errors-in-the-dialog).

| Message                                         | What to do                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Check failed**, "Nothing was saved."          | A setting did not pass its check against the real service. Fix the fields shown and save again. To store the change as it is, click **Save anyway**. See [Save anyway](/self-hosting/configure/how-configuration-works#save-anyway). |
| **Restore refused**                             | A setting in the version you restore did not pass its check. Nothing changed. To store the version as it is, click **Restore anyway**. See [History](/self-hosting/operate/owner-dashboard#history).                                 |
| "Invalid authenticator or backup code"          | Enter a fresh code from your authenticator app, or a backup code.                                                                                                                                                                    |
| "Too many attempts. Please slow down."          | Wait a few minutes. You can try 10 codes every 5 minutes.                                                                                                                                                                            |
| "The configuration changed since you opened it" | Someone saved a change while you were editing. Reload the page and try again.                                                                                                                                                        |
