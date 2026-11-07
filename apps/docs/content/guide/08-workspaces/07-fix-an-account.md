---
title: Fix an account that stops working
description: Reconnect an account that needs it, and what to do when an account becomes unavailable.
---

Sometimes a connected account stops working. This page covers the two cases you may see.

## "This account needs to be reconnected."

This message means the provider no longer accepts Metis Suite's access, for example after you change your password at the provider or remove Metis Suite's access there.

To fix it, connect the same account again:

- **Google, Microsoft or Zoho:** open the workspace's **Mailboxes** page, click **Add mailbox**, then **Connect a new mailbox**, and pick the same provider. Sign in with the same account. For a calendar, drive or address book, use **Add calendar**, **Add drive** or **Add address book** in the same way, then **Connect a new account**.
- **A server login (IMAP, CalDAV, CardDAV, WebDAV, FTP, SFTP and others):** pick the same server and fill in the login form again, with your new password.

Metis Suite updates the existing connection. The account stays in all its workspaces, with all its settings. You do not need to add it to your workspaces again.

For the full connect steps, see [Connect an account](/guide/workspaces/connect-an-account).

## Unavailable accounts

An account becomes unavailable when your instance owner removes the provider or server it uses.

- It disappears from every workspace, without a message there.
- Your account settings and workspace settings pages show a banner, such as "1 unavailable account." Click **Review** to open the **Connections** page.
- On the **Connections** page, the account is still listed, so you can disconnect it if you want. The page does not mark which account is the unavailable one.
- You cannot reconnect it while the provider is missing. If your instance owner adds the provider back, the account comes back by itself.

Click the X on the banner to hide it. It is hidden in this browser only, and it comes back if the list of unavailable accounts changes.
