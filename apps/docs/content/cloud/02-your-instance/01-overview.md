---
title: Overview
description: Read the status of your instance, the message that says what to do next, and the Details card.
---

The [**Overview**](https://console.trymetis.email/instances/~) tab is the first page of every instance. It shows the instance's status, a message that says what is happening or what to do next, and a **Details** card. While the instance is running, it also shows the **Included AI** card. See [Included AI](/cloud/your-instance/included-ai).

At the top of the page are the instance's name, its status and its address, such as `acme.metis-suite.app`. While the instance is running, **Open instance** at the top right opens it in a new tab.

## Statuses

The status appears at the top of the instance page and on the [**Instances**](https://console.trymetis.email/instances) page. A status with a spinner means work is in progress.

| Status               | What it means                                                                                     | What the Overview shows                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Awaiting payment** | You have not paid for the instance yet.                                                           | **Waiting for payment**, with **Continue to payment**. See [Unpaid instances](/cloud/get-started/create-an-instance#unpaid-instances).                           |
| **Setting up**       | Metis Cloud is setting up the instance after your payment, or starting it again on its kept data. | "Setting up your instance", with **Retry**.                                                                                                                      |
| **Running**          | The instance is up.                                                                               | **Finish setup** with your setup code, until you create the owner account. Then **Your instance is ready**. See [Finish setup](/cloud/get-started/finish-setup). |
| **Suspending**       | The instance is being stopped.                                                                    | "Stopping your instance", with **Retry**.                                                                                                                        |
| **Suspended**        | The instance is stopped, because its subscription is not active or a payment failed.              | "This instance is stopped". See [A stopped instance](#a-stopped-instance).                                                                                       |
| **Resuming**         | The instance is being started again.                                                              | "Starting your instance", with **Retry**.                                                                                                                        |
| **Deleting**         | The instance and its data are being deleted.                                                      | "Deleting this instance": "Its data and backups are being removed. This page refreshes on its own." It has **Retry**.                                            |
| **Deleted**          | The instance is gone.                                                                             | Only the **Details** card. A deleted instance no longer appears on the [**Instances**](https://console.trymetis.email/instances) page.                           |

The page refreshes on its own while the status is **Awaiting payment**, while work is in progress, and while the instance runs and you have not finished setup. It does this only while its browser tab is in front. Once setup is finished, a running instance's page does not refresh on its own. Reload it to see changes, such as a new **Metis version** or a new banner.

## Work in progress and Retry

While the instance is being set up, stopped or started, the Overview says "This usually takes a few minutes. The page refreshes on its own." One of these lines can appear under the message:

- "We are making room for your instance. Setup continues on its own."
- "Your instance is being started again on its kept data."
- "Something went wrong on our side. We have been told and keep trying; you can also press Retry."

If the work seems stuck, click **Retry** to send the current step again. You see "Sent again." If you see "This instance was just retried. Try again in a couple of minutes.", wait and try again. If you see "Could not retry. Try again in a few minutes.", the console could not send the request.

## A stopped instance

When an instance is **Suspended**, the Overview says "This instance is stopped", followed by why:

- "The last payment failed. Update your card in the Billing tab to pay what is owed and start it again." Click **Go to billing** to do so. See [Missed payments](/cloud/billing/missed-payments).
- "The subscription has ended. Subscribe again to start this instance with its data as it was." The subscription is **Cancelled**, **Expired** or **Failed**. Click **Subscribe again** to pay again for the same plan and billing period. See [Subscribe again](/cloud/billing/cancel-a-subscription#subscribe-again).
- "The subscription has ended, and it is too close to deletion to subscribe again." Shortly before the deletion date, **Subscribe again** is no longer offered.
- "The subscription is not active." The subscription is not active for another reason.

If **Subscribe again** cannot open the payment page, you see "Payment could not be started. Try again in a few minutes." under the text.

The message then says until when the data is kept: "Its data is kept until December 5, 2026, then it is deleted together with its backups. You can download an export meanwhile." To keep a copy, see [Export your data](/cloud/your-instance/export-your-data).

## Banners

A banner can appear at the top of the Overview.

**A payment is overdue** shows while the instance runs and its subscription is **Payment overdue**: "The last renewal payment failed. The instance keeps running for a short grace period while the payment is retried. If it still fails, the instance stops until you update your card in the Billing tab." It has **Go to billing**. See [Missed payments](/cloud/billing/missed-payments).

**The last upgrade did not finish** shows after an upgrade or an undo of your instance did not finish, whoever started it: "We have been told and are looking at it. Steps on your instance's Updates page that mention the server, the stack or the updater service are for us; you do not need to do anything there." It goes away once an upgrade or undo succeeds, or once Metis Cloud has dealt with the problem. See [Updates](/cloud/your-instance/updates#if-an-update-does-not-finish).

## The Details card

| Row               | What it shows                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**          | The plan, its price and its billing period. See [Plans and prices](/cloud/billing/plans-and-prices).                                                                                                                      |
| **Health**        | Whether the instance answers. See the table below.                                                                                                                                                                        |
| **Setup**         | **Waiting for the owner** while the instance runs and you have not finished setup. **Done** and the date once you have. Otherwise "-".                                                                                    |
| **Metis version** | The release the instance runs, or "-" until it is known. It changes when Metis Cloud updates the instance, and when you upgrade or undo from the instance's owner dashboard. See [Updates](/cloud/your-instance/updates). |
| **Owner**         | The owner email: the email of your Metis Cloud account. Only this address can create the owner account on the instance.                                                                                                   |

| Health              | What it means                                         |
| ------------------- | ----------------------------------------------------- |
| **Not checked yet** | No check has run yet.                                 |
| **Live and ready**  | The instance answers and is ready to use.             |
| **Live, not ready** | The instance answers, but it is not ready to use yet. |
| **Not responding**  | The instance does not answer.                         |
