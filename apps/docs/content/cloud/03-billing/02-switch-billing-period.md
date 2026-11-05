---
title: Switch billing period
description: Move an instance between monthly and yearly billing on the same plan.
---

You can move an instance from monthly to yearly billing, or from yearly to monthly. The plan stays the same. For the prices, see [Plans and prices](/cloud/billing/plans-and-prices).

## Switch

1. Open the instance and click [**Billing**](https://console.trymetis.email/instances/~/billing) in its sidebar.
2. In the **Subscription** card, click **Switch to yearly** (or **Switch to monthly** if you pay yearly).
3. Read the dialog. It shows the new price, which starts today, and says "The change is prorated against what you have already paid, and any difference is charged to your saved payment method now."
4. Click **Switch**. To keep your current period, click **Cancel**.

You see "Switching to yearly billing." or "Switching to monthly billing."

If the payment fails, your billing period does not change.

## When you can switch

The switch button shows only when all of these are true:

- the subscription is **Active**;
- you have not cancelled it (the status is not **Cancels at period end**);
- no payment for the instance is still processing.

Before your first payment, the **Subscription** card reads "No subscription yet. It starts once you have paid." The instance keeps the period you chose at checkout.

## A payment is processing

While a payment for the instance is still going through, the switch button is hidden. The [**Billing**](https://console.trymetis.email/instances/~/billing) tab shows **A payment is processing** instead.

This is often the charge from a switch you just made. A switch takes effect once its payment goes through, and you cannot switch again until then. A UPI payment can take up to two days.

## Messages

| Message                                                                                                                    | What it means                                             |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| "Billing could not be switched. Try again in a few minutes."                                                               | The switch did not start. Try again later.                |
| "A payment for this instance is still processing. Switch once it has gone through; a UPI payment can take up to two days." | Wait for the earlier payment to finish.                   |
| "Billing can be switched while the subscription is active."                                                                | The subscription is not active, so it cannot be switched. |
