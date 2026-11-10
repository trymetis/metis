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

- **People with an account** can accept the invite from the link.
- **People with no account yet** create their account straight from the invite link, and join the workspace at the same time. This works when your instance has open sign-up, or when you are also the instance owner or an instance admin. Otherwise the invite is refused with "Ask the instance owner or an instance admin to invite this person."
- An invite works only for the email address you invited. If someone signed in with another account opens the link, they cannot use it to join.
- You can send up to 10 invites an hour into this workspace. Invites you send into your other workspaces count separately.
- If some invites fail, they stay in the dialog with the reason, after "These invites failed." Fix them and send again, or close the dialog.
- If the invite email cannot be sent, no invite is created. The instance owner is the exception: the dialog shows the link so they can copy it and send it themselves. Nobody else is shown the link.

For every rule and message, see [How invites work](/guide/account/invite-people).

### Pending invites

Owners and admins see invites that have not been accepted yet under **Pending invites**, below the list of members. Each one shows the email address, the role and the date it expires.

To cancel an invite:

1. Click its trash icon (**Revoke invite to** and the address).
2. The dialog asks "Cancel the invite to" and the address. Click **Cancel invite**. To keep it, click **Keep invite**.

The link stops working right away. You can invite the person again at any time.

### Accepting an invite

When someone clicks **Accept invite** in the email, the invite page opens:

- **Signed in with the invited address:** they see a heading such as "Join Design as a member" (or "as an admin"), with **Accept** and **Decline**. **Accept** adds them to the workspace and opens it. **Decline** shows "Invite declined" and the invite cannot be used again.
- **Signed out, with an account:** they click **Sign in to accept**, sign in, and come back to the invite.
- **Signed in with another address:** they see **Invite unavailable**: "This invite was sent to a different email address. Sign out, then open the link again and sign in with the invited account." The page does not show which address was invited.
- **No account yet:** they see a form to create their account, with the invited address filled in. Their new account joins your workspace, which becomes their default workspace.

If the invite expired, was used, was declined or was revoked, they see **Invite unavailable** with "This invite link is no longer valid". Send them a new invite. See [How invites work](/guide/account/invite-people#what-the-invite-page-shows).

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

## If a member's account is banned

The instance owner or an instance admin can ban an account, so that person can no longer sign in to your instance. A ban deletes nothing in your workspace:

- The person stays on the **Members** page, with the same role.
- The mailboxes, calendars, drives and address books they added stay in the workspace. Other members keep using them.
- Scheduled mail and snoozes they set up are held, not lost, and go ahead once the ban ends.
- Runs of their other workflows that come due during the ban are blocked, and stay blocked after the ban ends, until someone retries them. Runs that come due after the ban run as usual. See [Who a workflow runs as](/guide/workflows/how-workflows-work#who-a-workflow-runs-as) and [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs#retry-a-run).

When the ban ends, they can use the workspace again. If they should not come back, [remove them](#remove-a-member). The mailboxes, calendars, drives and address books they connected then leave the workspace too.
