---
title: How invites work
description: Who can send account invites and workspace invites, what the invite email holds, and how to accept, decline or sign up from an invite.
---

An invite brings someone into your Metis Suite instance, into a workspace, or both. Every invite is sent by email to one address.

## The two kinds of invite

| Kind                 | What it does                                                                             | Who can send it                        | Where                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| **Account invite**   | Lets someone create an account on your instance. The new account gets its own workspace. | The instance owner and instance admins | **Dashboard**, **Accounts**, **Invites**                               |
| **Workspace invite** | Adds someone to one workspace, as a member or an admin.                                  | The workspace's owner and admins       | The workspace's **Members** page, or the **Create a workspace** dialog |

The instance owner and instance admins are the people who run your Metis Suite instance from its dashboard. Instance observers can see the dashboard but change nothing. These instance roles are separate from your role in a workspace. They never give anyone access to other people's mail, calendars, drives or contacts.

If you are not the instance owner or an instance admin, you cannot send account invites. To bring someone new in, invite them to one of your workspaces, as described below, or ask your instance owner or an instance admin.

- To send a workspace invite, see [Members and roles](/guide/workspaces/members-and-roles#invite-people) and [Create a workspace](/guide/workspaces/create-a-workspace#invite-people-while-you-create-it).
- To send an account invite, see [Owner dashboard](/self-hosting/operate/owner-dashboard#invites).

### Invite someone who has no account yet

A workspace invite can go to someone who has no account on your instance yet. The person then creates their account straight from the invite link. This works in two cases:

- Your instance has open sign-up, so anyone can create an account.
- The person who sends the invite is the instance owner or an instance admin.

Otherwise the invite is refused with "Ask the instance owner or an instance admin to invite this person."

## Rules for every invite

- **One address.** Only the invited email address can use the invite.
- **Used once.** After someone accepts or declines it, the link stops working.
- **7 days.** An invite expires 7 days after it was sent.
- **Can be revoked.** Until it is used, it can be canceled. Workspace owners and admins do this under **Pending invites** on the **Members** page. The instance owner and admins do it with the trash button under **Pending account invites** in **Dashboard**, **Accounts**, **Invites**. An instance admin cannot revoke an invite that makes someone an admin.
- **Can be declined.** The invited person can turn down a workspace invite.
- **10 an hour.** Each person can send up to 10 invites an hour into each workspace. Account invites have their own limit of 10 an hour per person.

Some invites are refused when you send them:

- "That email already has an account": you sent an account invite to someone who can already sign in. Invite them to a workspace instead.
- "That email already has a pending invite": an invite to this address is still waiting. Wait for it to be used, or revoke it and send a new one.
- "That person is already a member of this workspace": they are in the workspace already.
- "The instance owner's address can't be invited": this address belongs to the owner of your instance. Once the owner has an account, you can invite them to a workspace.

### If the invite email cannot be sent

If Metis Suite cannot send the email, no invite is created. You see "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again."

There is one exception. If you are the instance owner, the invite is created anyway and a box shows the link: "The invite email couldn't be sent. As the instance owner you can copy the link and send it yourself; it works only for the invited address." Click the copy button next to the link and send it to the person yourself. This is recorded in your [Security activity](/guide/account/security-activity) as **Invite link shown**.

Nobody else is ever shown an invite link.

## The invite email

- **An account invite** has the subject "Ana Lopez invited you to Metis Suite", with the sender's name, and a **Create your account** button.
- **A workspace invite** has the subject "Ana Lopez invited you to Design on Metis Suite", with the sender's name and the workspace's name, and an **Accept invite** button.

Both say that the invite expires in 7 days. The button opens the invite page.

## What the invite page shows

What you see depends on whether you are signed in, and whether the invited address already has an account.

| Your situation                             | What you see                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed in with the invited address         | A heading such as "Join Design as a member" (or "as an admin"), who invited you, and the **Accept** and **Decline** buttons.                          |
| Signed in with another address             | **Invite unavailable**: "This invite was sent to a different email address. Sign out, then open the link again and sign in with the invited account." |
| Signed out, and the address has an account | The heading, "Sign in with the invited account to accept.", and a **Sign in to accept** button.                                                       |
| The address has no account yet             | A form to create your account. See [Create your account from an invite](#create-your-account-from-an-invite).                                         |

### Accept or decline a workspace invite

1. Open the invite email and click **Accept invite**.
2. If you are signed out, click **Sign in to accept**. Sign in with the invited address and enter your two-factor code. You then come back to the invite page.
3. Click **Accept** to join, or **Decline** to turn it down.

- **Accept:** you join the workspace with the role in the invite, and the workspace opens.
- **Decline:** you see "Invite declined" and "Nothing was added to your account." Click **Back to inbox** to return to your workspaces. The invite cannot be used again.

### Create your account from an invite

If the invited address has no account yet, the invite page is a form to create one.

- For an account invite, the heading is "Create your account".
- For a workspace invite, the heading names the workspace and your role, such as "Join Design as a member".

Below the heading, a line says who invited you, for example "Ana Lopez invited you to Design on Metis Suite. Pick a password to create your account." If the invite also makes you an instance admin or observer, the line adds, for example, "You'll also be an instance admin, with access to the owner dashboard."

1. Your **Email address** is already filled in. You cannot change it.
2. Enter your **Name**.
3. Enter a **Password** of at least 8 characters.
4. If your instance has terms, tick the box to agree to them.
5. Click **Create account**.

Metis Suite then:

- creates your account and a workspace of your own, named after you, such as "Ana's workspace";
- for a workspace invite, adds you to that workspace and makes it your default, so signing in opens it;
- gives you the instance role the invite holds, if it holds one (admin or observer). Otherwise your account is a user, with no access to the dashboard;
- takes you straight to two-factor setup. Continue with [Sign in for the first time](/guide/get-started/sign-in-for-the-first-time), from **Confirm your password**.

You do not need to verify your email. The invite already proves the address is yours.

### If the invite does not work

The page shows **Invite unavailable** and a reason. Click **Go to sign in** to leave.

| Message                                                                                            | What to do                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This invite link is no longer valid"                                                              | The invite expired, was already used, was declined or was revoked. Ask for a new invite.                                                                                                                            |
| "This invite link isn't valid. Ask whoever invited you to resend it."                              | The link is incomplete. Copy the whole link from the email, or ask for a new invite.                                                                                                                                |
| "That email already has an account"                                                                | This is an account invite, but you already have an account. Sign in instead.                                                                                                                                        |
| "The instance owner's address can't be invited"                                                    | This address is now the instance owner's. The owner creates the account on the setup page with the setup code.                                                                                                      |
| "This invite is no longer valid. Ask the instance owner or an instance admin to invite you again." | The person who sent this account invite can no longer send it, for example because they are no longer an instance admin or their account was deleted. Ask the instance owner or an instance admin for a new invite. |
| "Ask the instance owner or an instance admin to invite this person."                               | The instance became invite-only after this workspace invite was sent, and its sender cannot invite new people to the instance. Ask the instance owner or an instance admin to invite you.                           |
| "This invite was sent to a different email address. …"                                             | You are signed in with another account. Sign out, open the link again and sign in as invited.                                                                                                                       |

## Where invites are recorded

Sending, accepting, declining and revoking an invite are recorded. You see the changes you made in your [Security activity](/guide/account/security-activity). Workspace owners and admins see the workspace invites of their workspace on its **Activity** page. See [Workspace activity](/guide/workspaces/workspace-activity).
