---
title: Members and roles
description: See who is in a workspace, invite people, manage pending invites, change roles, transfer ownership and remove members.
---

Every workspace has a **Members** page in its settings. It lists everyone in the workspace. If your role allows it, you also invite, manage and remove people there.

## Open the Members page

You can reach the **Members** page in three ways:

- Click the workspace tile at the top of the left rail and choose **Members**.
- In the workspace settings, click **Members** in the list on the left, under **General**.
- Open [search](/guide/search/search-your-workspace) and pick the command **Go to members**.

The page is titled **Members** and says "Everyone in" followed by the workspace's name. Each row shows the member's first letter, their name, and their email address followed by "joined" and the date they joined.

<img
  src="/images/workspaces/members-page.webp"
  alt="The Members page listing the workspace's members with their roles"
  class="dark:hidden"
/>
<img
  src="/images/workspaces/members-page-dark.webp"
  alt="The Members page listing the workspace's members with their roles"
  class="hidden dark:block"
/>

At the end of each row:

- **The role.** The owner sees a **Member** or **Admin** picker on every other row. Everyone else sees the role as a label.
- **Transfer ownership.** Only the owner sees this button, on every row but their own.
- **A trash icon** that removes the member. Owners and admins see it on every row except the owner's.

While the list loads, you see "Loading members…". If it cannot load, you see "Could not load members".

## Roles

A workspace has three roles:

- **Owner**: there is exactly one. The owner can do everything, including changing roles, transferring ownership and deleting the workspace.
- **Admin**: invites and removes members, manages the workspace's settings, and can remove any resource from the workspace. Only the owner changes roles.
- **Member**: uses the workspace and adds their own resources.

For the full comparison, see [Roles and permissions](/guide/reference/roles-and-permissions).

Role changes, ownership transfers, removed members, invites and workflow changes are recorded. Owners and admins see them on the workspace's **Activity** page. See [Workspace activity](/guide/workspaces/workspace-activity).

## Invite people

Owners and admins can invite people from the **Members** page.

1. Click **Invite**. A dialog titled "Invite to" followed by the workspace's name opens.
2. Type an email address and choose **Member** or **Admin**. Add more rows with **Add another**, or paste several addresses at once.
3. Click **Send invite** (or **Send invites**).

<img
  src="/images/workspaces/invite-dialog.webp"
  alt="The Invite dialog with one address filled in"
  class="dark:hidden"
/>
<img
  src="/images/workspaces/invite-dialog-dark.webp"
  alt="The Invite dialog with one address filled in"
  class="hidden dark:block"
/>

Each person gets an email titled with your name and the workspace's name, with an **Accept invite** button. Invites expire after 7 days.

- A workspace invite works only for someone who already has an account on your Metis Suite instance, unless your instance lets anyone sign up. To invite someone who has no account yet, first send them an account invite. See [Account](/guide/account).
- An invite works only for the account with the email address you invited. If someone else opens the link, they cannot use it to join.
- Metis Suite does not show the invite link in the dialog, so the person needs the email to join.
- If you send too many invites in a short time, the dialog lists the addresses that failed.

### Pending invites

Owners and admins see invites that have not been accepted yet under **Pending invites**, below the list of members. Each one shows the email address, the role and the date it expires.

To cancel an invite:

1. Click its trash icon (**Revoke invite to** and the address).
2. The dialog asks "Cancel the invite to" and the address. Click **Cancel invite**. To keep it, click **Keep invite**.

The link stops working right away. You can invite the person again at any time.

### Accepting an invite

When someone clicks **Accept invite**:

- If they are signed out, they see "Sign in to accept". They click **Go to sign in**, and after signing in they come back to the invite.
- If it works, they see "You're in!" and the workspace opens.
- If it does not, they see "Couldn't accept invite" with the reason:
  - "Invite not found", "Invite already used" or "Invite expired": ask an owner or admin for a new invite.
  - "This invite was sent to a different email address. Sign in with that account to accept it.": they are signed in with another account. They sign out, sign in with the account for the invited address, and open the invite again.

## Manage a member

Owners and admins manage members straight from the rows of the **Members** page. Nobody can change, transfer to or remove the owner, so the owner's row has none of these controls.

### Change a member's role

Only the owner can change roles. Use the **Member** or **Admin** picker on the member's row.

- **Making someone an admin** asks for your authenticator code. The dialog "Make this member an admin?" explains that they will be able to change the workspace's AI and privacy settings, "and manage its mailboxes, calendars, drives and address books." Enter the code and click **Make admin**.
- **Changing an admin back to member** needs no code.

### Transfer ownership

Only the owner can transfer ownership.

1. On the row of the member who should become the owner, click **Transfer ownership**.
2. The dialog "Transfer ownership?" says the workspace will belong to them and you will become an admin.
3. Enter your authenticator code and click **Transfer ownership**.

### Remove a member

Owners and admins can remove members. Admins can also remove other admins. Nobody can remove the owner.

1. Click the trash icon on the member's row.
2. The dialog asks "Remove" followed by their address and the workspace's name. It says they "lose access to every mailbox, calendar, drive and address book in this workspace." Click **Remove**.

The person loses access right away to everything in the workspace. The mailboxes, calendars, drives and address books they connected themselves leave the workspace at the same moment, and stay on their own account.

You can also do these things from [search](/guide/search/results-and-actions#members): find the member, open the list of actions and pick **Make admin**, **Make member**, **Transfer ownership** or **Remove from workspace**. The same rules apply: only the owner sees the first three, and owners and admins see **Remove from workspace**. In search you can also email a member, invite them to an event, search everything with them, or ask the assistant about them.

## Leaving a workspace

There is no **Leave** button.

- **A member** asks an owner or admin to remove them.
- **If you are an admin**, click the trash icon on your own row on the **Members** page and confirm. After that, you are taken back to your workspaces.
- **The owner** must transfer ownership first.
