---
title: Cancel a subscription
description: Stop an instance's subscription at the end of the period, keep it after all, what happens when it ends, and how to subscribe again.
---

Cancelling stops the subscription at the end of the period you have paid for. The instance keeps running until then, and you are not charged again.

## Cancel

1. Open the instance and click [**Billing**](https://console.trymetis.email/instances/~/billing) in its sidebar.
2. In the **Subscription** card, click **Cancel subscription**.
3. The dialog **Cancel at the end of the period?** shows the date the instance runs until.
4. Click **Cancel subscription** to confirm, or **Keep it** to close the dialog.

You see "The subscription ends at the end of the period."

The **Subscription** card then shows:

- the status **Cancels at period end**;
- an **Ends on** row in place of **Next charge**;
- a **Keep subscription** button.

You cannot switch the billing period while a cancellation is pending.

## Keep the subscription after all

Before the period ends, click **Keep subscription** on the [**Billing**](https://console.trymetis.email/instances/~/billing) tab. You see "Subscription kept." The subscription renews as before.

## When the period ends

1. The subscription becomes **Cancelled** or **Expired**.
2. The instance stops. Its badge shows **Suspending**, then **Suspended**.
3. The [**Overview**](https://console.trymetis.email/instances/~) shows **This instance is stopped** with "The subscription has ended. Subscribe again to start this instance with its data as it was." It also shows, in bold, the date its data is kept until.
4. 30 days after the instance stops, it is deleted together with its backups.

Until shortly before that date, you can subscribe again and start the same instance. See [Subscribe again](#subscribe-again). You can also download an export during those 30 days. See [Export your data](/cloud/your-instance/export-your-data).

## Subscribe again

A stopped instance whose subscription is **Cancelled**, **Expired** or **Failed** offers **Subscribe again**. You find it in two places:

- On the [**Overview**](https://console.trymetis.email/instances/~), in **This instance is stopped**.
- On the instance's [**Billing**](https://console.trymetis.email/instances/~/billing) tab, in **The subscription has ended**. This message reads "Subscribe again to start this instance with its data as it was." It also shows the instance's plan and its price, and the date its data is deleted with its backups.

To subscribe again:

1. Click **Subscribe again**.
2. Pay on the Dodo Payments page that opens. The new subscription has the same plan and billing period as before.
3. After you pay, you return to the instance's [**Overview**](https://console.trymetis.email/instances/~).

The same instance starts again with its data. Its badge changes from **Suspended** to **Resuming**, then **Running**.

Your earlier payments stay listed with the new ones, and each paid one keeps its **PDF** invoice. You see them on the **Invoices** card of the instance's [**Billing**](https://console.trymetis.email/instances/~/billing) tab, and on the **Invoices** card of the account [**Billing**](https://console.trymetis.email/billing) page. See [Invoices](/cloud/billing/invoices).

**Subscribe again** is offered until shortly before the deletion date. After that, the [**Overview**](https://console.trymetis.email/instances/~) shows "The subscription has ended, and it is too close to deletion to subscribe again." There is no button. You can still download an export until the instance is deleted.

If your subscription is **On hold** after a failed payment, you do not subscribe again. You pay what is owed with **Update card** instead. See [Missed payments](/cloud/billing/missed-payments).

## Delete the instance instead

If you want the instance gone now, delete it from its [**Settings**](https://console.trymetis.email/instances/~/settings) tab. This cancels the subscription at once, without a refund for the rest of the period. See [Delete an instance](/cloud/your-instance/delete-an-instance).

## Messages

| Message                                                              | What it means                                                                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "The subscription could not be changed. Try again in a few minutes." | The change did not go through. Try again later.                                                                                               |
| "The subscription is not active."                                    | Only an active subscription can be cancelled or kept.                                                                                         |
| "This instance is already paid for."                                 | You cannot subscribe again now. The instance may have been paid for in the meantime, or it may now be too close to deletion. Reload the page. |
| "Payment could not be started. Try again in a few minutes."          | The payment page did not open. Try again later.                                                                                               |
