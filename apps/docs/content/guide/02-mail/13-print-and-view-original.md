---
title: Print and view the original
description: Print a message, or see its raw source with every header and its sender checks.
---

**Print** and **View original** are the last buttons in the message toolbar, after **Delete** and **Draft apology**. In **Drafts** there is no **Draft apology**, so they come right after **Delete**.

<img src="/images/mail/message-toolbar.webp" alt="The message toolbar with Delete, Draft apology, Print and View original on its second row" class="dark:hidden" />
<img src="/images/mail/message-toolbar-dark.webp" alt="The message toolbar with Delete, Draft apology, Print and View original on its second row" class="hidden dark:block" />

## Print a message

1. Open the message.
2. Click **Print** in the toolbar.

A new browser tab opens with the message. When the page has loaded, your browser's print dialog opens. You can print the message or save it as a PDF.

The print page shows only the message you have open. Earlier messages in the conversation are not included. It is always light, even when Metis Suite is dark. A long message prints across several pages.

At the top of the page you see:

- The subject, as a heading. A message without a subject shows "(no subject)".
- **From:**, **To:** and **Date:** lines. A line with nothing to show is left out. The date is shown in your own time zone.

Below that is the message body, as it looks in the reader. A plain-text message keeps its line breaks. If the message has no body, the page shows "No content".

<img src="/images/mail/print-page.webp" alt="The print page with the subject as a heading, the From, To and Date lines, and the message body" class="dark:hidden" />
<img src="/images/mail/print-page-dark.webp" alt="The print page with the subject as a heading, the From, To and Date lines, and the message body" class="hidden dark:block" />

The print page follows your privacy choices for the open message:

- **Remote images** (pictures that load from the sender's servers) show only if the open message shows them. For example, they show after you click **Load images**, for a sender whose images always load, or when **Load remote images automatically** is on. Otherwise they stay blocked. See [Privacy and safety](/guide/mail/privacy-and-safety).
- **Known trackers** are removed.
- **Links** are cleaned, unless you turned **Clean tracking from links** off. See [Privacy settings](/guide/account/privacy-settings).

## View the original message

1. Open the message.
2. Click **View original** in the toolbar.

A new browser tab opens with the heading **Original message**. This page helps you check where a message really came from. It follows your device's light or dark setting.

<img src="/images/mail/view-original.webp" alt="The Original message page with the summary box, the Download original and Copy to clipboard buttons, and the raw source" class="dark:hidden" />
<img src="/images/mail/view-original-dark.webp" alt="The Original message page with the summary box, the Download original and Copy to clipboard buttons, and the raw source" class="hidden dark:block" />

### The summary box

A box at the top lists these rows, in this order. A **Message ID**, **Date**, **From** or **To** row with no value shows a dash. A message without a subject shows "(no subject)".

| Row            | What it shows                                                                             |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Message ID** | The message's unique ID.                                                                  |
| **Date**       | The date as written in the message itself, for example `Mon, 21 Sep 2026 09:15:00 +0000`. |
| **From**       | The sender.                                                                               |
| **To**         | The recipients.                                                                           |
| **Subject**    | The subject.                                                                              |
| **SPF**        | The SPF result.                                                                           |
| **DKIM**       | The DKIM result.                                                                          |
| **DMARC**      | The DMARC result.                                                                         |

SPF, DKIM and DMARC are standard checks on the sender, run by the mail server that received the message.

The **SPF**, **DKIM** and **DMARC** rows show the result in capital letters:

- **PASS** shows in green.
- **FAIL** shows in red.
- Any other result, for example **SOFTFAIL** or **NONE**, shows without a color.
- **Not reported** means the message carries no result for that check.

When the results name a mail server, a note under the box says "Authentication results as reported by" followed by the server's name. The results are what that server reported. If the receiving server did not add its own results, the sender could have written them, so treat them as a hint and not as proof.

### Save or copy the source

Under the summary box there are two buttons:

- **Download original** saves the whole message as an `.eml` file. The file is named after the subject, or `message.eml` if there is none.
- **Copy to clipboard** copies the raw source. The button reads **Copied** for a moment. If your browser does not allow the copy, it reads **Copy failed**.

### The raw source

Below the buttons is the message's full raw source, with all of its headers.

If the message is very large, the page shows only its start and has no **Copy to clipboard** button. It says "This message is too large to show in full. Download the original to see all of it." Click **Download original** to get the whole message.

## If the page cannot open the message

Both pages can show an error instead of the message:

- "Message not found", with "The link does not name a message." or "This mailbox is not available to you."
- "Could not load the message", with the reason.

## In the desktop and mobile apps

In the [desktop app](/guide/apps/desktop-app), **Print** and **View original** open in their own app window. In the [mobile app](/guide/apps/mobile-app), they open full screen over the app. See each app's page for what works there.
