# Changelog

Notable changes to the Metis Suite server: the app, worker and preflight images and the mail gateways, released together under `app-v<version>` tags. The server CLI, the desktop app and the mobile app have their own changelogs in [`apps/cli/`](../cli/CHANGELOG.md), [`apps/desktop/`](../desktop/CHANGELOG.md) and [`apps/mobile/`](../mobile/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

### Upgrade notes

- `METIS_OWNER_EMAIL` is now required: the app and preflight stop at start until it is set to the instance owner's email, and `bootstrap.sh` asks for it (or fails in a non-interactive run). An instance without it stops at preflight until you add it to `.env`.
- Contains a database migration that adds a table for email signatures and two workspace columns for the mail footer.
- Contains a database migration that moves sign-up and workspace invites into one invite table, keeping every pending and accepted invite (older duplicate pending invites to the same workspace collapse into the newest), adds instance roles and account bans to each account, and records each account's last sign-in, starting from its newest session.
- Sign-up invite emails sent before this release link to `/invite/signup`, which no longer exists. Revoke and resend those invites from Dashboard → Accounts → Invites.
- Settings → Invites is gone. Account invites are sent from the dashboard's new Accounts → Invites page by the owner or an instance admin; workspace invites stay under each workspace's Settings → Members.
- The Resend mail gateway stores its mail in libSQL instead of Postgres, so a Resend gateway that ran on Postgres starts empty after the upgrade, with no mail and no mailbox tokens: create each address's token again. Point `DATABASE_URL` at a libSQL database (sqld, Turso or a local file) and set `DATABASE_AUTH_TOKEN` when it needs one; `DB_SCHEMA` is gone.

### Added

- Email signatures: each person, each mailbox and each workspace can keep signatures, with separate defaults for new messages and for replies and forwards. Your own default wins over the mailbox's, which wins over the workspace's. The composer adds the default, swaps it when you change the From address, and lets you pick another or none; `{{name}}` and `{{email}}` fill in the sender. Manage them under workspace Settings → Signatures.
- Workspace mail footer: owners and admins can add a footer, such as a legal notice, to every message sent through Metis from the workspace. Senders can't remove it, and changing it is recorded in the audit log.
- Mail sent or drafted by the AI agents, MCP clients and workflows gets the sender's default signature, with an option to leave it out, and sent mail gets the workspace footer.
- The Workspace Assistant and MCP clients can list, add, edit and delete signatures and set the workspace footer. Saving, deleting and the footer need approval in the assistant and are off by default for MCP clients.
- Instance roles: the owner can make accounts **Admins**, who have the same dashboard powers as the owner, and the owner or an admin can make accounts **Observers**, who see the whole dashboard read-only. Neither role opens anyone's mail, calendars, drives or contacts, and the owner's MCP tools follow the same roles.
- Dashboard → Accounts replaces People: an overview of accounts, two-factor adoption, bans and pending invites, with a **Users** page that searches and filters every account by role, status and two-factor and changes roles, bans, unbans and removes users from each row's menu, and an **Invites** page that searches and filters account invites and sends and revokes them, optionally with an instance role. MCP clients of the owner, admins and observers can read both lists with the same filters through the new **Instance users** tool and **List sign-up invites**.
- The owner or an admin can ban an account for a day, a week, a month or until unbanned, with an optional reason. A banned user is signed out everywhere, can't sign in, and their MCP clients and workflows stop; the mailboxes, calendars, drives and address books they linked stay usable by the other members of each workspace.
- Invites can be declined, and one page now handles every invite: accept or decline when signed in, sign in to accept, or create the account with the invited email filled in.
- Custom labels can be renamed and recolored from the mail sidebar, and take any color from a picker as well as a brighter palette with pink, indigo and cyan added. Renaming keeps the label on its emails and in workflows. The Workspace Assistant and MCP clients get a matching **Edit label** tool.
- The drive grid view is an icon view: large icons, image thumbnails, names under each item, folders first and arrow-key navigation.
- An Amazon SES mail gateway: a Lambda function that receives mail for a domain through SES and an S3 bucket, keeps it in a libSQL database and sends through SES. Register it under Dashboard → System → Amazon SES or with `METIS_SES_SERVERS`, and connect its addresses with mailbox tokens like the Cloudflare and Resend gateways.
- Each release publishes the mail gateways: the Resend gateway as the image `ghcr.io/trymetis/metis-gateway-resend`, and the Amazon SES and Cloudflare Email gateways as `gateway-ses.zip` and `gateway-cloudflare.zip` under `https://sh.trymetis.email/vVERSION/`, listed in that folder's `SHA256SUMS`.
- An undo run with `metis undo` on the server is recorded in the audit log like one from Dashboard → Updates, shown as made by the **Server CLI**.
- Dashboard → System → History marks settings stored by the server CLI with a **Server** badge, so a change made with `metis config set` or `metis add` is told apart from dashboard edits.
- Preflight can store chosen settings from the environment over the dashboard's for one run, which the server CLI uses to apply `metis config set`, components and gateways without opening the dashboard.

### Changed

- Approvals for the AI agents now appear above the chat box with the details of what will run, one at a time. Enter approves, Escape declines, and typing a message declines with that message as the reason. Tool calls in the chat collapse into one expandable row.
- The rail's first button is now a gear that opens workspace settings, and the account menu lists every settings page, including Privacy, MCP clients and Security.
- Contacts drops its sidebar: the address-book switcher and a **Show** menu for books and groups sit above the contact list, and **New contact** is in the header.
- Workspace Settings → Signatures shows each mailbox as a collapsible section and each signature as a row that expands to its preview. Previews fill in `{{name}}` and `{{email}}`, and the workspace section has a **Preview as** mailbox picker.
- The workspace mail footer fills in `{{name}}` and `{{email}}` for each sender.
- MCP client setup and removal say whether to run a command in a terminal, add text to a config file or follow steps in the client.
- `/setup` now stays open until an account with the owner address exists, so ownership can be handed over by changing `METIS_OWNER_EMAIL` and the new owner claims the address there with the setup code. The previous owner becomes an admin at the next start.
- When sign-up is invite-only, inviting someone without an account into a workspace needs the owner or an instance admin; workspace owners and admins still invite existing users.
- A workspace invite whose email can't be sent, or that the `noop` mailer would drop, is no longer created; only the instance owner is shown the link to send by hand, and that is recorded in the audit log.
- An invite is checked again when it creates an account: invites sent before sign-up turned invite-only, or by someone who has since lost their instance role, stop working.
- Self sign-up refuses the owner's address; the owner account is created only at `/setup`.
- Invites sent, accepted, declined and revoked, instance role changes and removed users are recorded in the audit log.
- The Resend mail gateway keeps its mail in a libSQL database and raw mail and attachments in a directory (`BLOB_DIR`) or S3-compatible storage, instead of Postgres.
- Dashboard → Updates refuses a release that needs a newer server CLI and says to run `sudo metis self-update` on the server first.

### Removed

- `bootstrap.sh`, `compose.yml` and the updater image are no longer published. New servers are installed and run with the `metis` CLI: `curl -fsSL https://sh.trymetis.email/bootstrap -o bootstrap.sh && sudo sh bootstrap.sh`.

### Fixed

- Mail list previews for Cloudflare Email, Resend and IMAP mailboxes show the message's text instead of raw HTML, CSS and codes like `&nbsp;`, and Gmail previews show `'` and `&` instead of `&#39;` and `&amp;`.

## Releases

- [0.3.1](../../releases/app-v0.3.1.md) - 2026-11-08
- [0.3.0](../../releases/app-v0.3.0.md) - 2026-11-07
- [0.2.2](../../releases/app-v0.2.2.md) - 2026-11-05
- [0.2.1](../../releases/app-v0.2.1.md) - 2026-10-30
- [0.2.0](../../releases/app-v0.2.0.md) - 2026-10-28
- [0.1.2](../../releases/app-v0.1.2.md) - 2026-10-27
- [0.1.1](../../releases/app-v0.1.1.md) - 2026-10-26
- [0.1.0](../../releases/app-v0.1.0.md) - 2026-10-24
