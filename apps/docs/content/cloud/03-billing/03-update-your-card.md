---
title: Update your card
description: Change the card that pays for an instance, or pay what is owed after a failed payment.
---

You change the card for one instance's subscription at a time, on a Dodo Payments page. The Metis Cloud console never sees your card number.

## Change the card

1. Open the instance and click [**Billing**](https://console.trymetis.email/instances/~/billing) in its sidebar.
2. Click **Update card**.
3. Enter the new card on the Dodo Payments page that opens.

The **Update card** button shows in the **Subscription** card while the subscription is **Active** or **Cancels at period end**.

## Pay after a failed payment

When a payment fails and the subscription goes **On hold**, the instance stops. The [**Billing**](https://console.trymetis.email/instances/~/billing) tab then shows **The last payment failed** with "The instance is stopped until it is paid. Update your card to pay what is owed; the instance starts again once the payment goes through."

1. Click **Update card** in that message.
2. Enter a card on the Dodo Payments page. What you owe is charged to it.

Once the payment goes through, the same instance starts again. Its badge changes from **Suspended** to **Resuming**, then **Running**. The [**Overview**](https://console.trymetis.email/instances/~) shows **Starting your instance** while it starts.

For the rest of this situation, see [Missed payments](/cloud/billing/missed-payments).

## When you cannot update the card

**Update card** is offered only while the subscription is **Active**, **Cancels at period end** or **On hold**. It is not offered while a payment is overdue, or once a subscription is **Cancelled**, **Expired** or **Failed**.

After a subscription ends, you can subscribe again instead. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).

## Messages

| Message                                                                     | What it means                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| "A card update was just started. Try again in a minute."                    | You clicked **Update card** moments ago. Wait a minute and click it again. |
| "The card can be changed only while the subscription is active or on hold." | The subscription is in another state, so its card cannot be changed.       |
| "The card update could not be started. Try again in a few minutes."         | Something went wrong. Try again later.                                     |
