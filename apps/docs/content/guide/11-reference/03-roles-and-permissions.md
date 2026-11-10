---
title: Roles and permissions
description: What the owner, admins and members of a workspace can see and do, and what the instance roles owner, admin, observer and user allow.
---

Every member of a workspace has one of three roles. Each workspace has exactly one **owner**. The person who creates a workspace is its first owner. You manage members on the workspace's **Members** settings page, or from search. See [Members and roles](/guide/workspaces/members-and-roles).

## What each role can do

| Action                                                                                                     | Owner                         | Admin       | Member                       |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- | ---------------------------- |
| See the **Members** page                                                                                   | Yes                           | Yes         | Yes                          |
| Use workspace search                                                                                       | Yes                           | Yes         | Yes                          |
| Invite people, and see and cancel pending invites                                                          | Yes                           | Yes         | No                           |
| Remove members (anyone except the owner), on the **Members** page or from search                           | Yes                           | Yes         | No                           |
| Leave the workspace by removing themselves                                                                 | No (transfer ownership first) | Yes         | No (ask an owner or admin)   |
| Change a member's role between **Member** and **Admin**, on the **Members** page or from search            | Yes                           | No          | No                           |
| Transfer ownership, on the **Members** page or from search                                                 | Yes                           | No          | No                           |
| Delete the workspace                                                                                       | Yes                           | No          | No                           |
| See the workspace's [Activity](/guide/workspaces/workspace-activity) page                                  | Yes                           | Yes         | No                           |
| Change the workspace's AI and phishing detection rules                                                     | Yes                           | Yes         | See only                     |
| Change the workspace's logo and color                                                                      | Yes                           | Yes         | See only                     |
| Change the workspace signatures and the mail footer                                                        | Yes                           | Yes         | See only                     |
| Add, change and delete their own signatures for any mailbox in the workspace                               | Yes                           | Yes         | Yes                          |
| Add their own mailboxes, calendars, drives and address books                                               | Yes                           | Yes         | Yes                          |
| Remove a resource they connected from the workspace                                                        | Yes                           | Yes         | Yes                          |
| Remove a resource someone else connected                                                                   | Yes                           | Yes         | No                           |
| Detach a mailbox, calendar, drive or address book with the **Detach from this workspace** action in search | Yes                           | Yes         | No                           |
| Choose which calendars, address books and drive folders the workspace shows                                | Any account                   | Any account | Only accounts they connected |
| See, create, edit and delete contacts in the address books the workspace shows                             | Yes                           | Yes         | Yes                          |

## Who can see each resource

Every member sees every mailbox, calendar, drive and address book added to the workspace, whatever their role. The calendars, address books and drive folders that the workspace hides are hidden for every member alike. Every member can also create, edit and delete contacts in every address book the workspace shows, including address books someone else connected.

To keep a resource away from a workspace's members, do not add it to that workspace. If it is already there, remove it from the workspace. See [Add and remove resources](/guide/workspaces/add-resources).

## Settings only the person who connected a resource can change

Whatever their role, only the person who connected a mailbox, calendar, drive or address book can turn AI on or off for it (the robot icon on its row), or phishing detection for a mailbox (the shield icon). Everyone else sees whether it is on. The workspace's own [AI and privacy settings](/guide/workspaces/ai-and-privacy) can still turn these features off, or require phishing detection. Only the person who connected a mailbox can change its **Mailbox signatures**. Everyone else sees them. See [Signatures and the mail footer](/guide/mail/signatures).

## Changes that need your authenticator code

These actions ask for a code from your authenticator app before they take effect:

- Making a member an admin (the owner).
- Transferring ownership (the owner).
- Deleting the workspace (the owner).
- Changing the workspace's AI or phishing detection rules (owners and admins).
- Turning AI or phishing detection on for a resource (the person who connected it).

Turning AI or phishing detection off for a resource, and changing an admin back to a member, need no code.

## Instance roles

Besides workspace roles, every account also has an instance role. An instance role is about running your Metis Suite instance from its dashboard. It is separate from workspace roles: you can be an instance admin and a plain member of a workspace, or the owner of a workspace and a plain instance user.

Instance roles never open anyone's mail, calendars, drives or contacts. The dashboard shows counts, settings and the audit log, never the content of anyone's mailboxes, calendars, drives or address books.

There are four instance roles. Three of them open the dashboard:

| Role         | Who has it                                                                                             | What they can do in the dashboard                                                                                                                                                                       | Whom they manage                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Owner**    | One account, chosen by whoever runs your server. Nobody can change, ban or remove it in the dashboard. | Everything: change settings, restore and reset them, run health checks, acknowledge deploy checks, upgrade and undo upgrades, read the audit log, invite people to create an account, and manage users. | Admins, observers and users. Only the owner can make someone an admin, or change, ban or remove an admin. |
| **Admin**    | People the owner makes admins.                                                                         | Everything the owner can do.                                                                                                                                                                            | Observers and users. An admin cannot make anyone an admin, or change, ban or remove an admin.             |
| **Observer** | People the owner or an admin makes observers.                                                          | See the whole dashboard, including its accounts and the audit log, but change nothing.                                                                                                                  | Nobody.                                                                                                   |

Everyone else has the instance role **User**, which is the default. A user works in Metis Suite as usual, but has no access to the dashboard.

People with the owner, admin or observer role see **Dashboard** in their account menu and in search. Users do not see it.

Managing someone means changing their instance role, banning or unbanning them, or removing their account. All of these ask for your authenticator code. Nobody can ban themselves. An account invite can also make the new account an admin or observer. If it does, sending it asks for your code too. An account invite with no role needs no code. See [How invites work](/guide/account/invite-people).

A ban signs the person out everywhere within 2 minutes and stops them signing in until the ban ends. It does not remove them from any workspace. See [If a member's account is banned](/guide/workspaces/members-and-roles#if-a-members-account-is-banned).

For the dashboard itself, see [Owner dashboard](/self-hosting/operate/owner-dashboard#instance-roles).
