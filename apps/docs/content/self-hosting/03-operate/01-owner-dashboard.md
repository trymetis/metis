---
title: Owner dashboard
description: Instance roles and every page of the owner dashboard, from usage stats, accounts, bans, invites and themes to instance settings, history and deploy checks.
---

The owner dashboard shows what your instance is carrying and holds its settings. Only the owner, admins and observers can open it. For users, the dashboard does not exist.

## Instance roles

An instance role decides what someone can do in the dashboard. Every account has one of four roles. Three of them open the dashboard:

| Role         | Who has it                                                                                                                            | What they can do                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**    | The account whose email is `METIS_OWNER_EMAIL`. There is exactly one. Nobody can change, ban, remove or invite it from the dashboard. | Everything in the dashboard. Manages admins, observers and users: changes their role, bans and unbans them, and removes them.                                                                                                                                                                                                                                                                                                            |
| **Admin**    | People the owner makes admins.                                                                                                        | Everything the owner can do in the dashboard: change and reset settings, restore versions, run health checks, acknowledge deploy checks, upgrade and undo, send and revoke account invites, create, edit and delete [instance themes](#themes), and use the [Users](#users) page. Cannot open the **Exports** page. Manages observers and users, including banning them. Cannot make anyone an admin, or change, ban or remove an admin. |
| **Observer** | People the owner or an admin makes observers.                                                                                         | The whole dashboard except the **Exports** page, read-only, including the **Accounts** pages and the **Audit log**. See [What observers see](#what-observers-see).                                                                                                                                                                                                                                                                       |

Every other account has the role **User**. This is the default for a new account. A user works in Metis Suite as usual, but cannot open the dashboard.

The owner and admins have the same powers. They differ in whom they manage on the **Users** page and which roles they can give with an invite. Also, only the owner is shown an invite link when an invite email cannot be sent.

Instance roles are separate from workspace roles (owner, admin and member), and they never open anyone's data. The dashboard shows counts, settings and the audit log, never anyone's mail, events, files or contacts. The audit log does show people's account names (or their email addresses, when they have no name or their account was deleted), the email addresses of invited people, connected accounts, mailboxes, calendars, drives and address books, the names of MCP clients, and the IP addresses and devices changes came from.

### Hand the instance to a new owner

The owner cannot delete their own account. Trying shows "You're this instance's owner. Point METIS_OWNER_EMAIL at another account first, then come back."

To hand the instance to someone else:

1. Set `METIS_OWNER_EMAIL` to the new owner's email. On a server the `metis` CLI runs, run `sudo metis config set METIS_OWNER_EMAIL=bob@example.com`, which writes it to `.env` and restarts the app. On a container platform or Vercel, change the variable there and redeploy.
2. If the new owner already has an account, they sign in and are the owner. If they have no account yet, they create it at `/setup` with the setup code. Open sign-up never creates the owner account. So keep `METIS_SETUP_CODE` set if you may hand the instance to an address that has no account. The **Accounts** card on the **Instance** page says so too, once the owner account exists: "The owner account exists, so the setup code no longer works. Keep it set if you may hand the instance to an address that has no account yet; that new owner claims it at /setup."

When the instance next starts, the previous owner's account becomes an admin, so they keep access to the dashboard. The new owner can change the previous owner's role or remove them, like any other admin. Since the previous owner is no longer the owner, they can also delete their own account. See [Delete your account](/guide/account/delete-your-account).

If the new owner's account was banned, that same start lifts the ban.

## Open the dashboard

Click your initials at the bottom of the left rail and choose **Dashboard**. The item appears only for the owner, admins and observers. **Dashboard** is also in the search dialog. If your account has no two-factor authentication yet, you are sent to set it up first.

The sidebar lists **Overview**, **AI usage**, **Connections**, **Accounts**, **Workspaces**, **Automation**, **MCP clients**, **Themes**, **Audit log** and **System**. Click **Back** to return to your mail. At the bottom of the sidebar is the source code link.

**Accounts** and **System** each have pages under them. Under **Accounts** are **Users** and **Invites**. Click the arrow next to **Accounts** or **System** to show or hide its pages. The list opens by itself while you are on one of its pages.

When the last deploy found problems, a number shows next to **Deploy checks** in the **System** list. While that list is closed, the number shows next to **System** instead, so you see it from every dashboard page. See [Deploy checks](#deploy-checks).

Many cards explain what they are for in an ⓘ after their title. Point to the ⓘ or click it to read the explanation. With the keyboard, move to it with the Tab key and press Enter.

<img src="/images/self-hosting/dashboard-overview.webp" alt="The dashboard Overview page with counts, health cards and the sidebar" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-overview-dark.webp" alt="The dashboard Overview page with counts, health cards and the sidebar" class="hidden dark:block" />

Every page except **Users**, **Invites**, **Themes** and the **System** pages is read-only. Under **System**, the **Exports** page is read-only too, and only the owner sees it.

## What observers see

Observers see every page and every value an admin sees, but none of the controls that change something:

- Settings fields on the **System** pages are disabled, so nothing can be edited or saved. There is no **Add server** button, no remove button on server entries and no **…** menu on settings cards, so no **Reset to environment**.
- The **Health** card has no **Run check** button. Before a check has run, it says "Not checked yet. The instance owner and admins can run checks."
- On **Deploy checks**, a run that nobody acknowledged shows a **Not acknowledged** badge instead of the **Acknowledge** button.
- On **Updates**, there are no **Upgrade** buttons. The **Undo** row shows the version an undo would return to, without a button.
- On **History**, rows have **Compare** but no **Restore**.
- On **Users**, there is no actions menu, so observers cannot change a role, ban, unban or remove anyone.
- On **Invites**, there is no **Invite someone** card and no trash button to revoke an invite.
- On **Themes**, observers see the table and the line above it. There are no checkboxes, no **Create theme** or **Delete** button, and no edit or delete buttons on the rows.

Observers can read the **Audit log**.

## Overview

"What this instance is carrying right now."

- **Counts:** **Users**, **Workspaces**, **Mailboxes**, **Calendars**, **Drives** and **Address books**.
- **Health cards:** **Quarantined connections** (accounts whose provider was removed from the settings), **Scheduled mail pending** (with how many are overdue) and **Scheduled mail failed** (scheduled mail that was given up on). A health card turns red when it is above zero.
- **AI tokens, last 7 days:** a small chart, with a **Full usage** link to **AI usage**.

## AI usage

The tokens every AI feature used, counted per day in UTC. Pick **7 days**, **30 days** (the default) or **90 days**.

- Totals: **Calls**, **Input tokens**, **Output tokens** and **Total tokens**, plus cached reads, cached writes and reasoning tokens.
- Charts: **Tokens per day** and **Tokens by feature**.
- Tables: **By model** (model, driver, calls and tokens) and **Recent calls** (the last 20 in the range).

<img src="/images/self-hosting/ai-usage.webp" alt="The AI usage page with totals, the tokens per day chart and the usage by model" class="dark:hidden" />
<img src="/images/self-hosting/ai-usage-dark.webp" alt="The AI usage page with totals, the tokens per day chart and the usage by model" class="hidden dark:block" />

## Connections

Every connected account on the instance and what it provides.

- **Grants** and **Quarantined** counts. A grant is one connected account, which can provide a mailbox, a calendar, a drive and an address book.
- **By provider:** the grants and the mailboxes, calendars, drives and address books they carry. The table has one row for each provider, with a column for each of these.
- **Quarantined:** accounts whose provider or server is no longer configured. They come back when you configure the provider again, or restore the removed server entry from **History**.

## Accounts

"Who has an account, how they are secured, and the invites waiting to be accepted."

At the top are links to the two pages under **Accounts**: **Users** ("Every account, its instance role and whether it is banned.") and **Invites** ("Account invites waiting to be accepted, and sending new ones.").

- **Counts:** **Accounts** on this instance, **With 2FA** (two-factor authentication turned on), **Banned** (accounts whose ban is still in force, so they cannot sign in), **Account invites** and **Workspace invites** (both pending and not expired).
- **Newest accounts:** up to the 10 newest accounts, newest first. Each row shows the **Name**, the **Email** and when they **Joined**. An account that has not set up two-factor authentication has a grey **2FA setup required** badge after its name.

<img src="/images/self-hosting/dashboard-accounts.webp" alt="The Accounts page with links to Users and Invites, the account and invite counts, and the newest accounts" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-accounts-dark.webp" alt="The Accounts page with links to Users and Invites, the account and invite counts, and the newest accounts" class="hidden dark:block" />

This page is read-only for everyone. To change roles, ban or remove accounts, use [Users](#users). To send or revoke account invites, use [Invites](#invites).

## Users

"Every account on this instance, its instance role and whether it is banned."

The owner, admins and observers all see this page. Only the owner and admins see the actions menu on its rows. Every action in that menu asks you to confirm it's you. Type a code from your authenticator app, or click **Use a backup code instead** in the dialog and type one of your backup codes, or click **Use a passkey instead** if you added a passkey. If **Ask me first with** is set to **Passkey**, or you have no authenticator app, the dialog opens on **Use your passkey** in a browser that supports passkeys. See [Switch between them](/guide/account/two-factor-authentication#switch-between-them).

The page has one card, also called **Accounts**. It says "Instance roles reach the dashboard only, never anyone's mail, calendars, drives or contacts. The owner is set by METIS_OWNER_EMAIL." This is a different card from the **Accounts** card on the **Instance** page.

<img src="/images/self-hosting/dashboard-users.webp" alt="The Users page with the search box, the role, status and two-factor filters, and the list of accounts" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-users-dark.webp" alt="The Users page with the search box, the role, status and two-factor filters, and the list of accounts" class="hidden dark:block" />

### Find an account

Above the list are a search box and three filters. Each filter shows its current choice. The list updates as you type or pick.

- **The search box** ("Search by name or email") finds your text anywhere in a name or an email address. Upper and lower case count as the same for the letters A to Z.
- **The role filter** starts at **All roles**. Pick **Owner**, **Admin**, **Observer** or **User**.
- **The status filter** starts at **Any status**. Pick **Active** or **Banned**.
- **The two-factor filter** starts at **Any 2FA**. Pick **2FA on** or **2FA off**.

A row must match the search and every filter. If no account matches, the card says "No users match."

### What each row shows

Accounts are listed oldest first. Each row shows:

- **Name**, with a grey **2FA setup required** badge if the account has not set up two-factor authentication;
- **Email**;
- **Role**: **Owner**, **Admin**, **Observer** or **User**;
- **Status**: **Active** or **Banned**. A ban with an end date shows when it ends, for example **Banned until Nov 16, 2026**. When that date passes, the row shows **Active** the next time the page loads;
- **Created** and **Last sign-in** (the most recent sign-in, which stays after the person signs out, or a dash if they never signed in);
- **Workspaces owned**;
- for the owner and admins, an actions menu on rows they can manage.

The reason for a ban is not shown in the table. It is in the [Audit log](#audit-log).

### Who can manage whom

The actions menu is the button at the end of a row (**Actions for bob@example.com**). It appears only on rows you can manage:

- **The owner** manages every admin, observer and user.
- **An admin** manages observers and users. An admin cannot manage other admins, themselves or the owner.
- **Nobody** manages the owner's row. The owner's role comes from `METIS_OWNER_EMAIL`.
- **Observers** see no actions menu at all.

The menu holds **Change role**, **Ban…** (or **Unban** for a banned account) and, in red, **Remove…**.

### Change a role

1. Open the row's actions menu and point to **Change role**. The current role has a tick.
2. Pick **Admin**, **Observer** or **User**. Admins do not see **Admin**.
3. The **Change instance role** dialog says, for example, "Make bob@example.com an instance observer. Confirm it's you to continue." For **User**, it says "Make bob@example.com a plain user, so they no longer reach the dashboard. Confirm it's you to continue."
4. Confirm it's you and click **Change role**.

<img src="/images/self-hosting/dashboard-users-role.webp" alt="The Change instance role dialog asking you to confirm it's you to make an account an instance observer" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-users-role-dark.webp" alt="The Change instance role dialog asking you to confirm it's you to make an account an instance observer" class="hidden dark:block" />

### Ban an account

A ban stops someone from using your instance without deleting anything. The owner can ban admins, observers and users. An admin can ban observers and users. Nobody can ban the owner or themselves.

1. Open the row's actions menu and click **Ban…**.
2. The **Ban user** dialog says: "Sign bob@example.com out everywhere within 2 minutes and stop them signing in, their MCP clients and the workflows that run as them. What they linked to workspaces stays linked. Confirm it's you to continue."
3. Pick a **Duration**: **1 day**, **7 days**, **30 days** or **Until unbanned** (the default). The time counts from the moment you ban.
4. If you like, type a **Reason (optional)**, up to 500 characters. The reason is shown in the audit log.
5. Confirm it's you and click **Ban user**. You see "Banned bob@example.com. They're signed out everywhere within 2 minutes."

<img src="/images/self-hosting/dashboard-users-ban.webp" alt="The Ban user dialog with the Duration list set to Until unbanned, an optional reason and the field to confirm it's you" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-users-ban-dark.webp" alt="The Ban user dialog with the Duration list set to Until unbanned, an optional reason and the field to confirm it's you" class="hidden dark:block" />

What a ban does:

- **Signs the person out everywhere within 2 minutes.** This includes any browser tab or app they still have open.
- **Stops every sign-in.** They cannot sign in, in the browser or in the desktop and mobile apps. A password sign-in shows "This account is banned. Ask the instance owner or an admin." on the sign-in page. They can still ask for a sign-in link, but opening it does not sign them in.
- **Stops their MCP clients.** Their clients' requests are refused with "This account is banned. Ask the instance owner or an admin." until the ban ends.
- **Pauses their background work.** Scheduled mail and snoozes they set up are held, not lost, and go ahead once the ban ends. Runs of other workflows that run as them, and that come due during the ban, are blocked with "The workflow's owner is banned from this instance". Those runs stay blocked after the ban ends, until someone retries them. See [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#retry-a-run). Runs that come due after the ban run as usual.

A ban changes nothing else. Nothing is deleted. The person stays a member of their workspaces, with the same roles. Their own workspaces and connected accounts stay. The mailboxes, calendars, drives and address books they linked to workspaces stay linked, and other members keep using them. To delete these, [remove the user](#remove-a-user) instead.

A ban with a duration ends by itself, and there is nothing to unban. The person can sign in again, and their MCP clients work again. A client may ask them to sign in again first.

### Unban an account

1. Open the row's actions menu and click **Unban**.
2. The **Unban user** dialog says: "Let bob@example.com sign in again. Their MCP clients and workflows work again too. Confirm it's you to continue."
3. Confirm it's you and click **Unban user**. You see "Unbanned bob@example.com".

The same people who can ban an account can unban it.

### Remove a user

1. Open the row's actions menu and click **Remove…**.
2. The **Remove user** dialog says: "Delete bob@example.com's account, their workspaces that have no other members, and their connected accounts. Workspaces they share with others must be transferred first. This can't be undone."
3. Confirm it's you and click **Remove user**. You see "Removed bob@example.com".

Removing a user is refused while they own a workspace that has other members. The message says how many such workspaces they own, for example "This person owns 1 workspace with other members. They transfer ownership in Settings → Workspaces first."

To delete your own account, use **Settings**, **Security**. See [Delete your account](/guide/account/delete-your-account).

### If an action is refused

| Message                                                                                     | What it means                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Invalid authenticator or backup code"                                                      | The code was wrong or too old. Wait for a new code and try again.                                                                                                                                                       |
| "Your passkey confirmation expired. Confirm with your passkey again."                       | Too much time passed after you confirmed with your passkey. Click **Confirm again** under **Passkey confirmed**, use your passkey, then click the dialog's button again.                                                |
| "Too many attempts. Try again in 4 minutes."                                                | Role changes, bans, unbans, removals and invites that make someone an admin or observer share one limit: 10 attempts every 5 minutes. The message shows the time left, up to 5 minutes. Wait that long, then try again. |
| "This user isn't banned"                                                                    | The ban already ended, or someone else unbanned the account. Reload the page.                                                                                                                                           |
| "The owner's role comes from METIS_OWNER_EMAIL"                                             | The owner's role cannot be changed in the dashboard. To hand the instance over, see [Hand the instance to a new owner](#hand-the-instance-to-a-new-owner).                                                              |
| "The instance owner can't be banned" or "The instance owner can't be removed"               | Nobody can ban or remove the owner.                                                                                                                                                                                     |
| "You can't ban yourself" or "Delete your own account from Settings → Security instead"      | You cannot ban or remove your own account here.                                                                                                                                                                         |
| "Only the instance owner can grant or change an admin role"                                 | Only the owner can make someone an admin, or change an admin's role.                                                                                                                                                    |
| "Only the instance owner can ban an admin" or "Only the instance owner can remove an admin" | Only the owner can ban or remove an admin.                                                                                                                                                                              |

### Where these changes are recorded

Role changes, bans, unbans and removed users are recorded in the [Audit log](#audit-log) as **Instance role granted**, **Instance role revoked**, **User banned**, **User unbanned** and **User removed**.

A ban reads, for example, "Ana Lopez banned Bob Lee until 2026-11-16 (“Spam”)". The end date, as year, month and day in UTC, shows only for a ban with a duration. The reason in parentheses shows only if one was given, in curly quotes. An unban reads "Ana Lopez unbanned Bob Lee". The banned person also sees both rows in their own [Security activity](/guide/account/security-activity).

## Invites

"Account invites waiting to be accepted. Each one creates an account with its own workspace."

The owner, admins and observers all see this page. Only the owner and admins see the **Invite someone** card and the trash buttons that revoke invites.

<img src="/images/self-hosting/dashboard-invites.webp" alt="The Invites page with the Invite someone card and an empty Pending account invites list" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-invites-dark.webp" alt="The Invites page with the Invite someone card and an empty Pending account invites list" class="hidden dark:block" />

### Invite someone

The **Invite someone** card says "Emails a link to create an account. The account also gets its own workspace."

1. Type the person's email address, for example `carol@example.com`.
2. Pick an instance role: **No role** (the default), **Observer** or **Admin**. Only the owner sees **Admin**.
3. Click **Invite**.
4. If you picked **No role**, the invite is sent straight away. If you picked **Observer** or **Admin**, the **Send invite** dialog opens and says, for example, "Confirm it's you to invite carol@example.com as an instance observer." Confirm it's you and click **Send invite**.

You see "Invite sent to carol@example.com". The person gets an email with a **Create your account** button. When they create their account, they get the role you picked. With **No role**, the new account is a user, like every new account. See [How invites work](/guide/account/invite-people).

Some invites are refused:

- "That email already has an account": the person can already sign in. To give them a role, use **Change role** on the [Users](#change-a-role) page.
- "The instance owner's address can't be invited".
- "That email already has a pending invite": revoke the pending invite first, or wait for it to be used or to expire.
- "Only the instance owner can invite an admin".
- "Too many requests. Try again in 1 hour.", with the time left: each person can send up to 100 account invites an hour. Wait for the time shown, then invite again.

If the invite email cannot be sent, no invite is created. You see "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again." The owner is the exception: the invite is created anyway, and a box shows its link with "The invite email couldn't be sent. As the instance owner you can copy the link and send it yourself; it works only for the invited address." This is recorded in the audit log as **Invite link shown**. Admins are never shown a link. See [Outgoing email](/self-hosting/configure/outgoing-email).

People can also be invited from a workspace's **Members** page, by that workspace's owner and admins. See [Members and roles](/guide/workspaces/members-and-roles#invite-people).

### Pending account invites

The card says "Invites expire after 7 days. Workspace invites are under each workspace's Members."

Above the list are a search box and two filters. Each filter shows its current choice.

- **The search box** ("Search by email") finds your text anywhere in the invited address.
- **The role filter** starts at **All roles**. Pick **No role**, **Observer** or **Admin**.
- **The status filter** starts at **Any status**. Pick **Pending** or **Expired**.

Invites are listed newest first. Each row shows the **Email**, the instance **Role** the invite gives (**Admin**, **Observer** or **No role**), who it was **Invited by** ("Deleted account" if that account is gone), and when it **Expires**, or an **Expired** badge. If no invite matches, the card says "No invites match."

To cancel an invite, click its trash button (**Revoke the invite for carol@example.com**). It asks for no confirmation of any kind. The link in the email stops working. You see the trash button only on invites you could have sent yourself, so an admin sees none on an invite that would make someone an admin.

## Read accounts with an MCP client

The MCP clients of the owner, admins and observers can read the **Accounts** pages through three tools. All three are on by default and not sensitive. None of them can change anything.

- **Instance people** (**Instance (dashboard)** group) reads the counts on the [Accounts](#accounts) page, including the number of banned accounts, and the newest accounts.
- **Instance users** (**Instance (dashboard)** group) reads the list on **Users**. It takes the same search and filters. For each account it also gives the reason for a ban and, for a ban with a duration, when it ends. It cannot change roles, ban or remove anyone.
- **List sign-up invites** (**Account** group) reads the **Pending account invites** card on [Invites](#invites), with the same search and filters.

## Workspaces

How the instance is split up: **Workspaces**, **Shared** (more than one member) and **Personal** (one member). The **All workspaces** table lists each workspace, newest first, with its AI setting, members, mailboxes, calendars, drives and address books.

## Automation

Workflows and the queue of scheduled mail. Use it to see whether background work is running.

The runner card shows a status badge, the runner, its cadence and its tick budget:

| Status          | Meaning                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No tick yet** | The runner has never finished a tick. Start the worker, point your scheduler at the tick endpoint, or read the app's startup log, depending on your runner. |
| **Failing**     | The last tick ended with an infrastructure error. The error is shown.                                                                                       |
| **Delayed**     | Ticks or due work are running later than the cadence allows.                                                                                                |
| **Working**     | Ticks are on time and due work is being drained.                                                                                                            |
| **Idle**        | Ticks are on time and nothing is due.                                                                                                                       |

Below it are the last successful tick, discovery lag, backlog, work waiting to retry, blocked runs, and unconfirmed sends waiting for a person. The page also counts workflows, runs and failures, and the queued, completed and failed scheduled mail. **Recent runs** lists the latest workflow runs and their results.

**Recent runs** can also show the built-in jobs that keep your instance tidy, such as **Prune cached message bodies**, which clears stored message bodies that nobody opened for a while. See [Mail cache](/self-hosting/reference/dashboard-settings#mail-cache).

<img src="/images/self-hosting/dashboard-automation.webp" alt="The Automation page with the runner card and recent workflow runs" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-automation-dark.webp" alt="The Automation page with the runner card and recent workflow runs" class="hidden dark:block" />

See [Background work](/self-hosting/configure/background-work).

## MCP clients

Every external MCP client registered on the instance: **Clients**, **Enabled** and **Via CIMD** (clients that registered themselves by URL). The table shows each client, the workspaces it is hidden from, its status, its tools and when it was last used. Clients are disabled or deleted by their owners, in their own account settings.

## Themes

"The themes every workspace can pick, beside the built-in ones."

A theme is the set of colors a workspace's pages use. Workspace owners and admins pick one for their workspace, in the workspace's settings. They can pick a built-in theme, one of the instance themes you add here, or a custom theme they made for their own workspace. See [Logo and theme](/guide/workspaces/appearance).

The owner and admins can create, edit and delete instance themes. Observers see the table and the line above it, without these controls. None of these actions asks you to confirm it's you.

<img src="/images/self-hosting/dashboard-themes.webp" alt="The Themes page with the Create theme button and one table of themes, each with its colors, type and how many workspaces use it" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-themes-dark.webp" alt="The Themes page with the Create theme button and one table of themes, each with its colors, type and how many workspaces use it" class="hidden dark:block" />

### The themes table

A line above the table says "Workspace owners and admins pick a theme in their workspace’s settings. Editing an instance theme changes every workspace that uses it." Workspaces see your instance themes under **From your instance**.

The table lists your instance themes first, then the seven built-in themes: **Amber**, **Blue**, **Violet**, **Emerald**, **Rose**, **Slate** and **Graphite**. Themes that a workspace made for itself are not listed.

| Column      | What it shows                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkbox    | For the owner and admins, on instance themes only. Use it to [delete several themes at once](#delete-instance-themes).                                                 |
| **Palette** | Five small squares with the theme's colors, in light or dark to match how you see the dashboard now.                                                                   |
| **Name**    | The theme's name.                                                                                                                                                      |
| **Type**    | **Instance** for a theme you added here, or **System** for a built-in theme.                                                                                           |
| **Used by** | How many workspaces use the theme: **None**, **1 workspace** or, for example, **3 workspaces**.                                                                        |
| Buttons     | For the owner and admins, on instance themes only: a pencil button to edit the theme and a trash button to delete it, for example **Edit Ocean** and **Delete Ocean**. |

Built-in themes come with Metis Suite. Their rows have no checkbox and no buttons. To build on one, pick it under **Start from** when you create a theme.

### Create an instance theme

1. Click **Create theme**.
2. The **Create a theme** dialog opens: "Every workspace on this instance can pick it."
3. Type a name and set the colors. To copy the colors of an existing theme, pick it under **Start from**. The list has the built-in themes and your instance themes, each with small squares of its colors before its name. The dialog works as it does in a workspace. See [Set the colors](/guide/workspaces/appearance#set-the-colors).
4. Click **Create theme**.

The new theme is not applied to any workspace. Workspace owners and admins pick it themselves.

To edit one, click its pencil button, change it, and click **Save theme**. Every workspace that uses it changes at once.

You can keep up to 50 instance themes. Each name can be up to 40 characters. An instance theme cannot have the same name as another instance theme or a built-in theme, and upper and lower case count as the same. If saving fails, the dialog says "A theme with that name already exists" or "You can keep up to 50 themes".

### Delete instance themes

To delete one theme, click its trash button. The dialog asks, for example, "Delete Ocean?". If no workspace uses the theme, it says "No workspace uses it." If some do, it says, for example, "Used by 2 workspaces. Those workspaces switch to Graphite." Click **Delete**, or **Cancel** to keep the theme.

To delete several at once:

1. Tick the checkbox of each theme. To pick every instance theme, tick the checkbox in the header (**Select all instance themes**). It never picks a built-in theme. It is greyed out while you have no instance themes, and shows a dash when only some are ticked.
2. The line above the table changes to the number you picked, for example "2 selected", and a **Delete** button shows next to **Create theme**.
3. Click **Delete**. The dialog asks, for example, "Delete 2 themes?". If no workspace uses them, it says "No workspace uses them." If some do, it says, for example, "Used by 3 workspaces in all. Those workspaces switch to Graphite."
4. Click **Delete**, or **Cancel** to keep the themes.

If someone else deleted the themes first, the dialog shows an error. For one theme it is "That theme is gone". For several it is "Those themes are gone", when none of them is left. Reload the page to see the current list. When only some are gone, the rest are deleted with no error.

## Audit log

"Security-relevant changes by every user on this instance."

The owner, admins and observers can all read the audit log.

<img src="/images/self-hosting/dashboard-audit.webp" alt="The Audit log page with the All events card, the search box, the event type list set to All events, and the latest events" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-audit-dark.webp" alt="The Audit log page with the All events card, the search box, the event type list set to All events, and the latest events" class="hidden dark:block" />

The **All events** card lists changes such as turned-off two-factor authentication, added and removed authenticator apps and passkeys, turned-off sign-in alerts, approved MCP clients, disconnected accounts, removed or detached mailboxes, calendars, drives and address books, role changes, removed members, ownership transfers, invites sent, accepted, declined or revoked, invite links shown, instance roles granted or revoked, banned and unbanned users, removed users, deleted workspaces and accounts, undone upgrades, and workflows that were created, edited, turned on, turned off or deleted. The full list of what is recorded is in [Security activity](/guide/account/security-activity#what-is-recorded). Each change is recorded after it succeeds. Reading mail, events, files or contacts is never recorded.

Each row shows:

- **A sentence** that starts with who made the change and says what they did (or "The server CLI" for an undo run with `sudo metis undo`), for example "Alice Martin removed the drive alice@example.com and revoked its access at the provider". A deleted account's row also says how many workspaces were deleted with it, if any, for example "… deleted their account and 2 workspaces with it". [Security activity](/guide/account/security-activity#what-is-recorded) shows how each kind of row reads.
- **A second, lighter line** with these parts, separated by a dot (·): the workspace's name, when the change happened in one; **Workspace Assistant** or **MCP client**, when the change came through one of them, or **Server CLI** for an undo run with `sudo metis undo`; the date and time; and the IP address and device it came from, when known.

The IP address is the visitor's address, found through **Trusted proxies** on the **Proxies** card of the **Instance** page. Behind Cloudflare, it is Cloudflare's address until you list Cloudflare's ranges there. Behind another CDN in front of the Caddy that `metis domain` adds, it is always the CDN's address. See [Proxies](/self-hosting/reference/dashboard-settings#proxies).

The person who made the change, and a member it was done to, are shown by the name on their account today. With no name, or for a deleted account, the row shows their email address. With neither, it says "A deleted account". An undo run with `sudo metis undo` has no person behind it, so its row starts with "The server CLI". Invited people, MCP clients, mailboxes, calendars, drives, address books, connected accounts and workflows are shown as they were named when the change was made.

Names in a sentence are in curly quotes, for example "added the passkey “Work laptop”" or "detached the calendar “Team” from “Design”". This covers workspaces, passkeys, MCP clients, workflows and ban reasons. A connected account, or a removed or detached mailbox, calendar, drive or address book, is in quotes too, unless its name is an email address. People, invited email addresses, tool names, roles and versions are not in quotes. The same sentences appear in **Security activity**, on a workspace's **Activity** page and in the **Audit log** MCP tool.

The newest change is at the top, 50 at a time. Click **Load more** for older ones. The log cannot be edited from the app. If nothing has been recorded yet, the card says "No audit events yet."

### Search and filter the audit log

Above the list are a search box ("Search events") and a list of event types, which starts at **All events**.

- **Search:** looks through the whole log, not only the rows already on screen. The list updates shortly after you stop typing. Search finds your text in:
  - the event type, such as **Workspace invite revoked**. Event type names show only in the event type list, not on rows;
  - the fixed words of the sentence, without the names, email addresses, workspaces, roles, tools or versions in it. For example, "revoked the invite", "turned off" and "deleted their account" find rows, but "role from member" does not. Such a search finds every change of that type;
  - what the change was about, such as an invited person's or member's email address, a client's name, a passkey's name, the email address of a mailbox, calendar, drive or address book, a workflow's name, or the versions of an undone upgrade;
  - the email address of the person who made the change, not their name;
  - the workspace's name;
  - the IP address.
- **Not searched:** people's names, the roles and tool names in a sentence, the device, the date and time, the words **Workspace Assistant**, **MCP client** and **Server CLI** on the second line, "a deleted account" and "The server CLI".
- **Filter:** pick an event type. The list has **Account deleted** and every type in the [Security activity filter](/guide/account/security-activity#filter-by-event-type). **Resource removed** and **Resource detached from a workspace** each cover mailboxes, calendars, drives and address books.
- **Both together:** a row must match both. If no row matches, the card says "No events match your search." **Load more** keeps showing older matches, 50 at a time.

How the text is matched, and other limits:

- Your whole text is matched as one phrase, anywhere inside a field. For example, "invite rev" finds **Workspace invite revoked**, but "revoked invite" does not.
- Upper and lower case count as the same for the letters A to Z only.
- Letters with accents must match in case too.
- The search box takes up to 200 characters.
- There is no filter by date.
- To clear the search, empty the box.
- To clear the filter, pick **All events**.

Account deletions show only here and in the **Audit log** MCP tool below. No user or workspace sees them.

The card says how many days events are kept. Set this with `METIS_AUDIT_RETENTION_DAYS` (see [Environment variables](/self-hosting/reference/environment-variables#audit-log)). A built-in job runs every day at 03:30 UTC and deletes events older than that. It can appear under **Automation**, in **Recent runs**, as **Prune expired audit events**.

The card also says: "Anyone with access to the database can change this log, so it is a record, not tamper-proof evidence." Treat it as a record of what happened on your instance, kept in your own database.

Each user sees their own part of this log under **Settings**, **Security**, **Security activity**. Workspace owners and admins see the changes in their workspace on its **Activity** page, without IP addresses or devices. See [Security activity](/guide/account/security-activity) and [Workspace activity](/guide/workspaces/workspace-activity).

The MCP clients of the owner, admins and observers can read this log with the **Audit log** tool in the **Instance (dashboard)** group. It is on by default for your clients, returns 50 events at a time with the number of days events are kept, and leaves out IP addresses and devices. Each event comes with a one-sentence description that reads like its row on this page, and with the current account names of the people involved. The tool cannot search or filter by event type. It only pages through the log, newest first.

## System

"What this deployment runs on, one driver and one provider per page."

The System page groups cards into **Instance**, **Drivers** and **Providers**:

- **Instance:** **Setup code live** (red, while no account has the owner email), **Invite only** or **Open sign-up**, and the owner email.
- **Drivers:** one card per driver with its state. LLM and phishing detection show **On** or **Off**. Mail shows **Delivering**, **Console only** or **Not delivered**. Cache shows **In process** or **Shared**. The workflow runner shows **Never ticked**, **Failing**, **Delayed**, **Busy** or **Idle**. Database shows the driver.
- **Providers:** the number of entries for each provider, or **Off**, and how many connections and quarantined connections it has.

Warnings appear above the cards. On a new instance you see: "No provider is configured, so no mailbox, calendar, drive or address book can be connected until one is added under Dashboard → System."

Under **System** in the sidebar are these pages:

- **Instance:** the app address, sign-up, the owner, legal consent, drive relay limits, the mail image proxy, how long message bodies are kept, and trusted proxies. See [Sign-up](/self-hosting/configure/sign-up), [Terms and privacy links](/self-hosting/configure/terms-and-privacy), [Drive transfers](/self-hosting/configure/drive-transfers) and [Dashboard settings](/self-hosting/reference/dashboard-settings#instance).
- **History:** every stored version of the configuration (below).
- **Deploy checks:** the warnings from the last deploy (below).
- **Updates:** upgrading to a newer release and undoing the last upgrade. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo).
- **Exports:** every export the `metis` CLI made of this instance, and where each archive went (below). Only the owner sees it.
- **Drivers:** **LLM** (with the decision model), **Phishing detection**, **Mail**, **Cache**, **Workflow runner** and **Database**.
- **Providers:** **Google**, **Microsoft**, **Zoho**, **IMAP**, **CalDAV**, **CardDAV**, **Cloudflare Email**, **Resend**, **Amazon SES**, **S3**, **WebDAV**, **FTP** and **SFTP**.

Every field on these pages is listed in [Dashboard settings](/self-hosting/reference/dashboard-settings).

### Health checks on driver and provider pages

Every driver page and every configured provider page has a **Health** card. The ⓘ next to its title says what the check does. Checks contact the real service, so the card runs them only when you click **Run check** (then **Re-check**). Only the owner and admins see these buttons. Each result shows OK, Warning, Failed or Skipped, how long it took, and when it ran. Provider failures start with "Misconfigured:" or "Unreachable:".

Every deploy also checks your servers and the LLM. It checks the decision model too when one of the decision model's switches is on. Problems appear on the [Deploy checks](#deploy-checks) page.

A provider with no settings shows **Not configured**: "Users cannot connect accounts through this provider."

### Saving changes

The owner and admins can edit settings. Editing a field shows a bar with the number of unsaved changes, **Reset** and **Save changes**. Saving asks you to confirm it's you, then checks the changed settings against the real service before anything is stored. On a server list page, only new entries and entries whose connection settings changed are contacted. If a check fails, you can fix the fields or click **Save anyway**. See [How configuration works](/self-hosting/configure/how-configuration-works#saving-a-change-in-the-dashboard).

<img src="/images/self-hosting/dashboard-save-bar.webp" alt="The Instance page with one unsaved change and the save bar" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-save-bar-dark.webp" alt="The Instance page with one unsaved change and the save bar" class="hidden dark:block" />

If you click another dashboard link with unsaved changes, the dashboard keeps you on the page and the bar asks you to save or reset first. Closing or reloading the tab asks you to confirm. The browser's Back button is not guarded, so save before you use it.

If someone else saved a change while you were editing, saving fails with "The configuration changed since you opened it". Reload the page and make your change again.

### Reset a card to the environment

Every settings card you can edit has a **…** button in its header. Pointing to it shows its name, for example **Sign-up actions**. Its menu has one item, **Reset to environment**. It puts that one card back to the values the app started with. These come from the environment variables and the config file. A setting that neither of them sets gets its default.

You find the menu on these cards:

- **Instance** page: **Sign-up**, **Legal consent**, **Drive relay**, **Mail image proxy**, **Mail cache** and **Proxies**.
- Driver pages: **LLM**, **Decision model**, **Phishing detection**, **Mail**, **Cache** and **Workflow runner**.
- Provider pages: the **OAuth client** card on **Google**, **Microsoft** and **Zoho**, and the server list card on each of the eight server pages.

Read-only cards have no such menu: **App** and **Accounts** on the **Instance** page, **Health** on driver and provider pages, **Status** on the **Workflow runner** page, and **Driver** on the **Database** page.

The app reads the environment and the config file when it starts. If you edit `.env` or the config file, apply the change before you reset, as for [settings fixed at startup](/self-hosting/configure/how-configuration-works#settings-fixed-at-startup). On a server the `metis` CLI runs, run `sudo metis apply` after you edit `.env`. If you skip this, the reset uses the values from before your edit. Instead of editing `.env` and resetting, you can also run `sudo metis config set`, which applies the change and stores the card in one step. See [Change dashboard settings with the metis CLI](/self-hosting/configure/how-configuration-works#change-dashboard-settings-with-the-metis-cli).

A server list is replaced as a whole. Entries you added in the dashboard are removed, and the entries set in the environment come back. If the environment sets no entries for that list, the list ends up empty.

The item is greyed out, with the reason under it:

- "Save or discard your changes first" while the page has unsaved changes. Click **Save changes** or **Reset** on the save bar, then open the menu again.
- "Already matches the environment" when the card already has the environment values. There is nothing to reset.

It is also greyed out while another reset dialog is loading. **Reset to environment** is different from **Reset** on the save bar, which only discards your unsaved edits.

To reset a card:

1. Click the **…** button in the card's header, then **Reset to environment**.
2. A dialog opens, titled "Reset" followed by the section's name and "to environment". On a sign-in provider page, the name is the provider's, for example "Reset Google to environment". It asks: "Replace this section's settings with the values from the environment and config file?" Below that it shows:
   - The configuration warnings for the result, if there are any.
   - If accounts would be quarantined (hidden from every workspace), a box headed "These connections would be quarantined:". It lists each provider, with the server name for a server entry, and how many connections it has.
   - Every field that would change, as the old value, an arrow and the new value. An empty value shows as a dash. Rows of a server list start with the entry's name. A secret that would change shows a **Changed** badge, never its value.
3. If the quarantine box is shown, tick **Reset anyway and quarantine these connections**. **Reset** stays disabled until you do.
4. [Confirm it's you](/guide/account/two-factor-authentication#switch-between-them) and click **Reset**. To stop, click **Cancel**.

The new values are checked against the real service, with the same checks as a save. Then:

- **If the check passes,** you see a message with the section's name followed by "reset to environment as version N", for example "Google reset to environment as version N". The card shows the environment values, and **Reset to environment** in its menu is greyed out with "Already matches the environment".
- **If a check fails,** nothing is stored. A **Check failed** card says "Nothing was reset. The environment values failed this check." A reset has no **Save anyway** button. Fix the environment values and reset again.
- **If you ticked the quarantine box,** the accounts connected through a removed server entry, or through a sign-in provider that the reset cleared, are quarantined. Accounts of a sign-in provider come back when you configure it again. Accounts of a server entry come back only when you restore the earlier version under **History**.
- **If the values are not valid, or the reset would quarantine connections that the dialog did not list,** the dialog shows why and nothing is stored. Close it and choose **Reset to environment** from the card's **…** menu again to see the new list.
- **If someone else saved a change after you opened the page,** you see the usual "The configuration changed since you opened it" message. Reload the page and try again.

Confirmations for **Save changes**, **Save anyway**, **Restore**, **Restore anyway** and **Reset to environment** share one limit: 10 attempts every 5 minutes. Every attempt counts, whether you use an authenticator code, a backup code or a passkey. Past it, you see "Too many attempts. Try again in 4 minutes.", with the time left, up to 5 minutes. Wait that long, then try again.

### History

Every saved change and every reset is a version. The **History** page lists them, newest first: the version (the current one is marked **Current**), its kind (**Seed** for settings preflight stored, **Edit**, **Restore**, **Reset** for a reset to the environment, or **Server** for settings that `metis config set` or another `metis` command stored), the settings that changed, who changed them (or "Preflight"), and when.

- **Compare:** pick two versions in **From** and **To** to see what changed, as old and new values. Secrets show only whether they changed.
- **Restore:** click **Restore** on a row and [confirm it's you](/guide/account/two-factor-authentication#switch-between-them). Every setting that differs is checked against the real service, then stored as a new version. On a server list, only entries that are new or whose connection settings differ are contacted, as for a save. Restoring never rewrites history. When it succeeds, you see "Version N restored as version M".
- **Restore anyway:** if a check fails, you see **Restore refused** and nothing changes. The card has a **Restore anyway** button. Click it, and a dialog titled **Restore version N anyway** says: "The check above failed. Restoring anyway stores this version as it is, so whatever failed the check may not work until it is fixed." Confirm it's you and click **Restore anyway**. The new version shows in the list as an ordinary **Restore**.

<img src="/images/self-hosting/dashboard-history.webp" alt="The History page with the list of stored versions" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-history-dark.webp" alt="The History page with the list of stored versions" class="hidden dark:block" />

You can also reach History from the **History** button on any settings page.

### Exports

"Every encrypted export of this instance the metis CLI made, and where it put each archive. Only the owner sees this page."

Only the owner sees this page. Admins and observers do not see it in the sidebar, and its address shows them a page-not-found error. The page has no buttons to make, delete or restore an export. You make exports with the `metis` CLI, and copy or delete the archives yourself. Deleting an archive does not remove its row. See [Export and import](/self-hosting/operate/export-and-import).

On a Metis Cloud instance, this page does not list the exports you make in the Cloud console. The console's **Exports** tab lists them. See [Export your data](/cloud/your-instance/export-your-data).

The ⓘ next to **Exports** says: "Newest first. The metis CLI records each export when it makes it: sudo metis db export on a server, or metis db export --env-file from any machine." This works on every kind of deployment: a server the `metis` CLI runs, a container platform, Vercel or another Node host.

Each export is one row, newest first. A row has two lines:

- **First line:** when the export was made, in your browser's date format and time zone, then the release the instance ran (such as `1.4.0`) and the size of the archive. An archive loads only on that release or a newer one.
- **Second line:** the archive's file name, then where it was written: **On the server** for `sudo metis db export`, **On a computer** for `metis db export --env-file`, or **In S3**. An archive written to more than one kind of place lists each kind once, separated by commas, for example **On the server, In S3**.

Click a row, or the arrow at its end, to open its details. Each line has a copy button, except **Maintenance since**:

| Detail                | What it shows                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SHA-256**           | The full checksum of the archive. To check a copy, compare it with what `sha256sum` prints for that file.                                               |
| **Migration**         | The last database migration the instance had when the export was made.                                                                                  |
| **From**              | The instance's address at the time of the export.                                                                                                       |
| **Maintenance since** | When maintenance began for the export. An export made with `--force` shows "Not recorded".                                                              |
| A place               | One line for each place the archive was written, labelled **On the server**, **On a computer** or **In S3**, with the full path or the `s3://` address. |
| **Host**              | Below a path, the name of the machine, when it is known.                                                                                                |
| **Endpoint**          | Below an address on an S3-compatible service, the service's address.                                                                                    |
| **Recipient**         | The fingerprint of each key the export is encrypted to, one line per key. A passphrase key has the grey note "passphrase key" after its fingerprint.    |

A long value is cut short to fit one line. Point at it to see the full value. The copy button always copies the full value. When you click it, it shows a tick for a moment. If your browser does not allow the copy, you see "Could not copy".

<img src="/images/self-hosting/dashboard-exports.webp" alt="The Exports page listing recorded exports, with the newest one open to show its checksum, migration, addresses and recipients" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-exports-dark.webp" alt="The Exports page listing recorded exports, with the newest one open to show its checksum, migration, addresses and recipients" class="hidden dark:block" />

With no exports yet, the card says "No exports yet." Below the list, a note says: "These are the places each archive was written. Metis does not check that a file is still there, and an archive kept on the server's own disk does not survive losing that disk."

The CLI records an export right after it finishes the archive and any upload, so an archive never lists itself. An instance restored or loaded from an archive lists the exports made before that one, with the old address after "From". An instance restored from a Metis Cloud export starts with an empty list.

### Deploy checks

Every deploy runs preflight, which records warnings here. To open this page, click **Deploy checks** in the **System** list of the sidebar, right below **History**.

When the last deploy had warnings, a badge with their number shows at the right of **Deploy checks**. While the **System** list is closed, the badge shows next to **System** instead.

- **Filled in the accent color:** nobody has acknowledged the run yet. Pointing to it shows, for example, "2 deploy warnings".
- **Grey:** someone clicked **Acknowledge** on this page. The badge stays grey until the next deploy records a new run. Pointing to it shows, for example, "2 deploy warnings, acknowledged".

With no warnings, or before the first deploy, there is no badge. When you click **Acknowledge**, the badge turns grey at once.

The owner, admins and observers all see the badge. The owner and admins can acknowledge a run. Observers see a **Not acknowledged** badge on this page instead.

See [Troubleshooting](/self-hosting/operate/troubleshooting) for what each warning means and what to do.
