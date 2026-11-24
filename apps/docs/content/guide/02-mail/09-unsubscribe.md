---
title: Unsubscribe from mailing lists
description: Leave a mailing list from one message, or find and leave many lists at once in the Subscriptions folder.
---

Newsletters and promotional mail usually offer a way to unsubscribe. Metis Suite finds that option for you, so you can leave a list with one click.

Unsubscribing applies to the whole mailbox. If you share the mailbox, everyone stops getting that sender's list.

## How unsubscribing works

Metis Suite uses the best option the sender offers:

- **Automatic**: the sender supports one-click unsubscribe, and Metis Suite does it for you.
- **We'll email them**: Metis Suite sends an unsubscribe email to the sender's unsubscribe address. This email gets no signature and no workspace footer.
- **Finish on their site**: the sender's unsubscribe page opens in a new tab, and you finish there.

## Unsubscribe from one message

1. Open a message from the mailing list.
2. Click **Unsubscribe** in the toolbar.

The button only appears when the sender offers a way to unsubscribe. It is not shown in **Drafts** or **Sent**.

After you click it, the button changes:

- **Unsubscribed**: you are off the list.
- If the sender's page opened in a new tab, the button shows **Unsubscribed**; point at it to see that you still need to finish on their page.
- If it failed, the button goes back to **Unsubscribe**, and its tooltip says it failed. Click the button to retry. If Metis Suite could not try at all, for example because you reached the unsubscribe limit (see [Limits](#limits)), a message at the bottom of the screen says why.

Metis Suite can look for the unsubscribe option in up to 60 messages a minute. If you open more, the **Unsubscribe** button shows greyed out, and its tooltip says "Too many requests. Try again in 20 seconds.", or the time left (at most 1 minute). So the button can also show on a message whose sender offers no way to unsubscribe. The button checks again on its own after the wait. If it is still greyed out after a minute, open the message again. If the sender offers no way to unsubscribe, the button then goes away.

## Find all your mailing lists

Open **Subscriptions** in the sidebar. Metis Suite scans your most recent Inbox mail for mailing lists. While it looks, you see "Scanning your inbox for mailing lists…".

The heading then shows how many senders it found and how many recent emails it checked. Each sender's row shows:

- the sender's name and how many of their messages it found
- how unsubscribing works for them (**Automatic**, **We'll email them** or **Finish on their site**)
- the date, address and subject of their latest message
- an **Unsubscribe** button

<img src="/images/mail/subscriptions.webp" alt="The Subscriptions folder listing mailing lists found in the inbox" class="dark:hidden" />
<img src="/images/mail/subscriptions-dark.webp" alt="The Subscriptions folder listing mailing lists found in the inbox" class="hidden dark:block" />

### Unsubscribe from one sender

Click **Unsubscribe** on the sender's row. The row shows "Working…" and then **Unsubscribed**. If the sender's page opens in a new tab, finish there. **Open again** opens their page a second time.

### Unsubscribe from many senders

1. Tick the checkbox on each sender, or tick **Select all**.
2. Click **Unsubscribe** at the top. It shows how many senders you picked, for example **Unsubscribe (3)**.

### Scan again

Click **Rescan** to check your latest mail again.

If you click **Rescan** within 5 minutes of the last scan, you see the same list. Mail that arrived since then shows only after those 5 minutes. Each sender's **Unsubscribed** state is always up to date.

## Limits

- The scan looks at your latest 100 Inbox emails. When a Zoho mailbox is involved, it looks at the latest 50.
- If no mailing lists are found, the page says "No mailing lists found in your recent inbox."
- A sender with no unsubscribe option cannot be unsubscribed here. You may see "This sender didn't offer a way to unsubscribe."
- Each mailbox can be scanned 10 times every 5 minutes, by everyone who can see it together. **All inboxes** has its own 10 scans every 5 minutes. Searching subscriptions, and asking the assistant or a connected AI app about your mailing lists, also use up these limits.
- Past the limit, you see "Too many scans. Try again in 3 minutes.", or the time left, in place of the list. Wait for that time (at most 5 minutes), then click **Rescan**.
- You can click **Unsubscribe** up to 30 times a minute, in the toolbar, on this page, in search, and through the assistant or a connected AI app together. Unsubscribing from up to 25 selected senders at once with **Unsubscribe (3)** counts as one time. Past that, you see "Too many unsubscribe requests. Try again in 20 seconds.", or the time left. In the toolbar and in search, it shows in a message at the bottom of the screen. On the **Subscriptions** page, it shows on the row of each sender you picked. Wait for that time (at most 1 minute), then continue.
