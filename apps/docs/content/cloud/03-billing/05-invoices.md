---
title: Invoices
description: See your subscriptions and payments, and download an invoice as a PDF.
---

You can see your payments in two places. Both list each payment, with a **PDF** button for the invoice of each paid one.

## Every instance: the account Billing page

Open the account menu (your name at the top right) and click [**Billing**](https://console.trymetis.email/billing).

The **Subscriptions** card has one row for each instance you have paid for.

| Column               | What it shows                                                           |
| -------------------- | ----------------------------------------------------------------------- |
| **Instance**         | The instance name. Click it to open that instance's **Billing** tab.    |
| **Plan**             | The plan and billing period, for example "Personal, Monthly".           |
| **Price before tax** | What the subscription costs each period, before tax.                    |
| **Status**           | The subscription status. See [Statuses](#statuses).                     |
| **Renews or ends**   | The next billing date, or the end date if you cancelled. Otherwise "-". |

A deleted instance stays in the list, with its name in grey and no link.

The **Invoices** card lists every payment on your account, newest first.

## One instance: the Billing tab

Open the instance and click [**Billing**](https://console.trymetis.email/instances/~/billing) in its sidebar.

The **Subscription** card shows the **Plan**, the **Price before tax**, the **Status** and the **Next charge** date (or **Ends on**, if you cancelled).

The **Invoices** card lists every payment for this instance.

## The invoices table

| Column        | What it shows                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Date**      | When the payment was made.                                                                          |
| **Instance**  | The instance it paid for (account [**Billing**](https://console.trymetis.email/billing) page only). |
| **Amount**    | What you were actually charged.                                                                     |
| **Status**    | **Paid**, **Processing**, **Failed** or **Cancelled**.                                              |
| **Paid with** | The card network and last four digits, for example "visa ending 4242". "-" when there is no card.   |
| **Invoice**   | A **PDF** button for paid payments. "-" for the others.                                             |

On a narrow screen some columns are hidden. On a narrow screen the button shows only a download icon.

If you have no payments yet, the table reads "No payments yet."

## Download an invoice

Click **PDF** on a payment with the status **Paid**. The invoice downloads as a PDF file.

Only paid payments have an invoice.

## Statuses

A subscription shows one of these:

| Status                    | What it means                                                                                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Active**                | The subscription is paid and renews on its next billing date.                                                                                                                                                                                                                                                        |
| **Cancels at period end** | You cancelled it. It ends on the date under **Ends on** on the instance's [**Billing**](https://console.trymetis.email/instances/~/billing) tab, or **Renews or ends** on the account [**Billing**](https://console.trymetis.email/billing) page. See [Cancel a subscription](/cloud/billing/cancel-a-subscription). |
| **Payment overdue**       | A renewal failed. The instance keeps running for now. See [Missed payments](/cloud/billing/missed-payments).                                                                                                                                                                                                         |
| **On hold**               | A payment failed and the instance is stopped until it is paid.                                                                                                                                                                                                                                                       |
| **Cancelled**             | The subscription has ended. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).                                                                                                                                                                                                             |
| **Expired**               | The subscription has ended. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).                                                                                                                                                                                                             |
| **Failed**                | The subscription has ended. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).                                                                                                                                                                                                             |

You may also see **Paused** or **Pending**.
