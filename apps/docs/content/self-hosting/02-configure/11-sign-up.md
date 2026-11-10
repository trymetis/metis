---
title: Sign-up
description: Choose between invite-only accounts and open sign-up for anyone who can reach your instance.
---

A new instance is invite-only. Apart from the owner, people join only when they are invited. You can open sign-up instead, so anyone who can reach your instance can create an account.

| Mode                  | What people see on the sign-in page                                                          |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Invite only (default) | A note: "Accounts are by invitation only. Ask the instance owner or an admin to invite you." |
| Open sign-up          | Two tabs: **Sign in** and **Create account**.                                                |

Every account needs two-factor authentication in both modes.

## Change the mode

1. Open **Dashboard**, **System**, **Instance**.
2. In the **Sign-up** card, turn **Invite only** on or off. When it is on, accounts are created only through invites, never through open sign-up with an email and password.
3. Click **Save changes** and enter your authenticator code.

The **Sign-up** card's badge shows **Invite only** or **Open**. On the System page, the **Instance** card shows **Setup code live** while a setup code is set and no account has the owner's email. Otherwise it shows **Invite only** or **Open sign-up**.

With open sign-up, the **Create account** tab refuses the owner's address with "This address is the instance owner's. Create it at /setup." The owner account is created only on the setup page, with the setup code.

To set the starting mode before the first start, use `METIS_SIGNUP_DISABLED`: `true` (the default) for invite only, `false` for open sign-up.

## Invitations

There are two kinds of invite:

- **Account invites** let someone create an account. Only the instance owner and instance admins send them, from **Dashboard**, **Accounts**, **Invites**. An account invite can also make the new account an admin or observer. See [Invites](/self-hosting/operate/owner-dashboard#invites).
- **Workspace invites** add someone to one workspace. That workspace's owner and admins send them from its **Members** page, or while they create it. See [Members and roles](/guide/workspaces/members-and-roles#invite-people).

Other users cannot send account invites. The MCP clients of the instance owner and instance admins can send account invites too. An invite sent by a client always makes the new account a plain user, never an admin or observer.

The mode decides who can send a workspace invite to an address that has no account yet:

| Mode         | Workspace invite to an address with no account                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invite only  | Works only when the sender is the instance owner or an instance admin. Anyone else sees "Ask the instance owner or an instance admin to invite this person." |
| Open sign-up | Works for every workspace owner and workspace admin.                                                                                                         |

In both modes, the invited person creates their account straight from the invite link and joins the workspace.

The mode is checked again when the person opens the link and creates their account. If you switch to invite-only, workspace invites already sent to addresses with no account stop working, unless their sender is the instance owner or an instance admin. The invite page then shows "Ask the instance owner or an instance admin to invite this person."

Account invites are checked again too. An account invite stops working if its sender is no longer the instance owner or an instance admin, or was deleted, or can no longer give the role in the invite. The invite page then shows "This invite is no longer valid. Ask the instance owner or an instance admin to invite you again." See [How invites work](/guide/account/invite-people).

Invitations are sent by email, so set up [outgoing email](/self-hosting/configure/outgoing-email) first. If an invite email cannot be sent, no invite is created. The one exception is the owner, sending from the app: they are shown the invite link to send by hand.

The dashboard's **Accounts** page counts the invitations that are still pending. To change instance roles, ban or remove accounts, use **Accounts**, **Users**. See [Users](/self-hosting/operate/owner-dashboard#users).
