---
title: Missed payments
description: What happens when a renewal fails, how to start a stopped instance again, and how long its data is kept.
---

When a renewal payment fails, the subscription shows **Payment overdue** or **On hold**. This page explains each stage and what you can do.

## Payment overdue

While the subscription is **Payment overdue**, the instance keeps running.

The instance's [**Overview**](https://console.trymetis.email/instances/~) shows **A payment is overdue** with "The last renewal payment failed. The instance keeps running for a short grace period while the payment is retried. If it still fails, the instance stops until you update your card in the Billing tab." Click **Go to billing** to open the [**Billing**](https://console.trymetis.email/instances/~/billing) tab.

The [**Billing**](https://console.trymetis.email/instances/~/billing) tab shows the same message, which ends "If it still fails, the instance stops until you update your card here."

While a payment is overdue, the **Subscription** card shows no buttons. You cannot update the card, switch the billing period or cancel the subscription in this state.

## The instance stops

When the subscription goes **On hold**, the instance stops. Its badge shows **Suspending**, then **Suspended**.

The instance's [**Overview**](https://console.trymetis.email/instances/~) shows **This instance is stopped** with "The last payment failed. Update your card in the Billing tab to pay what is owed and start it again." The message also shows, in bold, the date its data is kept until.

The [**Billing**](https://console.trymetis.email/instances/~/billing) tab shows **The last payment failed**.

## Start the instance again

1. On the [**Overview**](https://console.trymetis.email/instances/~), click **Go to billing**. Or click [**Billing**](https://console.trymetis.email/instances/~/billing) in the sidebar.
2. In **The last payment failed**, click **Update card**.
3. Enter a card on the Dodo Payments page. What you owe is charged to it.

Once the payment goes through, the same instance starts again with its data. The [**Overview**](https://console.trymetis.email/instances/~) shows **Starting your instance**, and the badge changes from **Suspended** to **Resuming**, then **Running**.

See [Update your card](/cloud/billing/update-your-card) for the messages you may see.

## If the subscription ends while the instance is stopped

If the subscription becomes **Cancelled**, **Expired** or **Failed**, **Update card** is no longer offered. Until shortly before the deletion date, the [**Overview**](https://console.trymetis.email/instances/~) and the [**Billing**](https://console.trymetis.email/instances/~/billing) tab offer **Subscribe again** instead. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).

## How long the data is kept

A stopped instance keeps its data for 30 days from the day it stopped. The [**Overview**](https://console.trymetis.email/instances/~) shows the exact date.

After that date, the instance is deleted together with its backups. While this happens, the [**Overview**](https://console.trymetis.email/instances/~) shows **Deleting this instance**. Then the instance disappears from [**Instances**](https://console.trymetis.email/instances). It stays on the account [**Billing**](https://console.trymetis.email/billing) page with its name in grey.

A deleted instance cannot be brought back, not even by a later payment. To use Metis Cloud again, create a new instance.

## Keep a copy of your data

You can download an export while the instance is stopped. Two-factor authentication must be on for your console account. See [Export your data](/cloud/your-instance/export-your-data) and [Two-factor authentication](/cloud/account/two-factor-authentication).
