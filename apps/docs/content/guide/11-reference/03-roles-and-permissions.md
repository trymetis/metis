---
title: Roles and permissions
description: What the owner, admins and members of a workspace can see and do.
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

Whatever their role, only the person who connected a mailbox, calendar, drive or address book can turn AI on or off for it (the robot icon on its row), or phishing detection for a mailbox (the shield icon). Everyone else sees whether it is on. The workspace's own [AI and privacy settings](/guide/workspaces/ai-and-privacy) can still turn these features off, or require phishing detection.

## Changes that need your authenticator code

These actions ask for a code from your authenticator app before they take effect:

- Making a member an admin (the owner).
- Transferring ownership (the owner).
- Deleting the workspace (the owner).
- Changing the workspace's AI or phishing detection rules (owners and admins).
- Turning AI or phishing detection on for a resource (the person who connected it).

Turning AI or phishing detection off for a resource, and changing an admin back to a member, need no code.
