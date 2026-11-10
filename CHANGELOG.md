# Changelog

Notable changes to the Metis Suite server: the app, worker, preflight and updater images, `compose.yml` and `bootstrap.sh`, released together under `app-v<version>` tags. The desktop and mobile apps have their own changelogs in [`apps/desktop/`](apps/desktop/CHANGELOG.md) and [`apps/mobile/`](apps/mobile/CHANGELOG.md).

Each release's notes are in [`releases/`](releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

### Upgrade notes

- `METIS_OWNER_EMAIL` is now required: the app and preflight stop at start until it is set to the instance owner's email, and `bootstrap.sh` asks for it (or fails in a non-interactive run). An instance without it stops at preflight until you add it to `.env`.
- Contains a database migration that moves sign-up and workspace invites into one invite table, keeping every pending and accepted invite (older duplicate pending invites to the same workspace collapse into the newest), adds instance roles and account bans to each account, and records each account's last sign-in, starting from its newest session.
- Sign-up invite emails sent before this release link to `/invite/signup`, which no longer exists. Revoke and resend those invites from Dashboard → Accounts → Invites.
- Settings → Invites is gone. Account invites are sent from the dashboard's new Accounts → Invites page by the owner or an instance admin; workspace invites stay under each workspace's Settings → Members.

### Added

- Instance roles: the owner can make accounts **Admins**, who have the same dashboard powers as the owner, and the owner or an admin can make accounts **Observers**, who see the whole dashboard read-only. Neither role opens anyone's mail, calendars, drives or contacts, and the owner's MCP tools follow the same roles.
- Dashboard → Accounts replaces People: an overview of accounts, two-factor adoption, bans and pending invites, with a **Users** page that searches and filters every account by role, status and two-factor and changes roles, bans, unbans and removes users from each row's menu, and an **Invites** page that searches and filters account invites and sends and revokes them, optionally with an instance role. MCP clients of the owner, admins and observers can read both lists with the same filters through the new **Instance users** tool and **List sign-up invites**.
- The owner or an admin can ban an account for a day, a week, a month or until unbanned, with an optional reason. A banned user is signed out everywhere, can't sign in, and their MCP clients and workflows stop; the mailboxes, calendars, drives and address books they linked stay usable by the other members of each workspace.
- Invites can be declined, and one page now handles every invite: accept or decline when signed in, sign in to accept, or create the account with the invited email filled in.

### Changed

- `/setup` now stays open until an account with the owner address exists, so ownership can be handed over by changing `METIS_OWNER_EMAIL` and the new owner claims the address there with the setup code. The previous owner becomes an admin at the next start.
- When sign-up is invite-only, inviting someone without an account into a workspace needs the owner or an instance admin; workspace owners and admins still invite existing users.
- A workspace invite whose email can't be sent, or that the `noop` mailer would drop, is no longer created; only the instance owner is shown the link to send by hand, and that is recorded in the audit log.
- An invite is checked again when it creates an account: invites sent before sign-up turned invite-only, or by someone who has since lost their instance role, stop working.
- Self sign-up refuses the owner's address; the owner account is created only at `/setup`.
- Invites sent, accepted, declined and revoked, instance role changes and removed users are recorded in the audit log.

## Releases

- [0.3.1](releases/app-v0.3.1.md) - 2026-11-08
- [0.3.0](releases/app-v0.3.0.md) - 2026-11-07
- [0.2.2](releases/app-v0.2.2.md) - 2026-11-05
- [0.2.1](releases/app-v0.2.1.md) - 2026-10-30
- [0.2.0](releases/app-v0.2.0.md) - 2026-10-28
- [0.1.2](releases/app-v0.1.2.md) - 2026-10-27
- [0.1.1](releases/app-v0.1.1.md) - 2026-10-26
- [0.1.0](releases/app-v0.1.0.md) - 2026-10-24
