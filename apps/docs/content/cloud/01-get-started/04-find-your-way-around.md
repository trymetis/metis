---
title: Find your way around
description: Learn the console's top bar and account menu, the Instances page and the tabs of an instance.
---

The Metis Cloud console has three parts: a top bar on every page, the [**Instances**](https://console.trymetis.email/instances) page that lists your instances, and the page of each instance with its own tabs.

## The top bar

On the left, the top bar shows where you are. **Metis Cloud** always takes you back to the [**Instances**](https://console.trymetis.email/instances) page. Inside an instance, the path reads **Metis Cloud**, **Instances**, then the name of the instance, such as `acme`. On the page for a new instance, it reads **Metis Cloud**, **Instances**, **New instance**.

On the right is your account menu: a button with your initials and your name. Click it to see your name and email, and these items:

| Item                                                      | What it opens                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [**Instances**](https://console.trymetis.email/instances) | The list of your instances.                                                                                                     |
| [**Billing**](https://console.trymetis.email/billing)     | The subscriptions and invoices for every instance on your account. See [Invoices](/cloud/billing/invoices).                     |
| [**Settings**](https://console.trymetis.email/settings)   | Your Metis Cloud account: profile, password, two-factor authentication and deleting the account. See [Account](/cloud/account). |
| **Sign out**                                              | Signs you out and returns you to the sign-in page.                                                                              |

## The Instances page

The [**Instances**](https://console.trymetis.email/instances) page says "Each instance is a private Metis Suite at its own address." It lists your instances, newest first, with these columns:

- **Instance**: the name, with the address under it, such as `acme.metis-suite.app`.
- **Status**: where the instance is in its life, such as **Running**. See [Statuses](/cloud/your-instance/overview#statuses).
- **Plan**: the plan and billing period, such as "Personal, Monthly".
- **Created**: the date you created it.

Click a row to open that instance. On a narrow screen, the **Plan** and **Created** columns are hidden.

To create another instance, click **New instance** at the top right. When you have no instances yet, the page shows **No instances yet** with a **New instance** button. See [Create an instance](/cloud/get-started/create-an-instance).

Each instance belongs to the Metis Cloud account that created it. Only you can see it in the console.

## The instance page

At the top of an instance's page are its name, its status and its address. While the instance is running, **Open instance** at the top right opens it in a new tab.

The sidebar on the left lists the instance's tabs:

| Tab                                                                 | What it shows                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Overview**](https://console.trymetis.email/instances/~)          | The state of the instance and what to do next, its details and its included AI. See [Overview](/cloud/your-instance/overview).                              |
| [**Mail**](https://console.trymetis.email/instances/~/mail)         | The email your instance sends, such as sign-in links and invites. See [Instance mail](/cloud/your-instance/instance-mail).                                  |
| [**Exports**](https://console.trymetis.email/instances/~/exports)   | Downloadable copies of the instance. See [Export your data](/cloud/your-instance/export-your-data).                                                         |
| [**Billing**](https://console.trymetis.email/instances/~/billing)   | The subscription, the included AI, the values for your own AI provider, and the invoices. See [Billing](/cloud/billing).                                    |
| [**Settings**](https://console.trymetis.email/instances/~/settings) | Automatic updates and deleting the instance. See [Updates](/cloud/your-instance/updates) and [Delete an instance](/cloud/your-instance/delete-an-instance). |

To make the sidebar smaller, click the sidebar button at the left of the top bar, or press **Ctrl** + **B** (**⌘** + **B** on a Mac). The sidebar then shows only icons. Hover over an icon to see its name. Do the same again to show the full sidebar.

On a small screen, the sidebar is hidden. Click the sidebar button to open it.

Links in these docs to an instance tab open that tab for your instance. If you have several instances, you first choose one on **Choose an instance**. If you have none, you see **No instances yet**.

## If a page does not load

If a console page cannot load, it shows **This page could not be loaded**: "Try again in a moment. If it keeps happening, go back to your instances." Click **Try again** to load the page again, or **Back to instances** to go to the [**Instances**](https://console.trymetis.email/instances) page.
