---
title: Usage limits
description: How Metis Suite tells you that you did something too often, how long to wait, and the limits for mail, calendar, drive and contacts.
---

Metis Suite limits how often you can do some things in a short time. When you reach a limit, the action does not happen. In most places, a message tells you how long to wait. A few features wait and try again on their own; their pages say so. Usually nothing is lost. A message that fails to send is the exception: see [Compose and send](/guide/mail/compose-and-send#undo-a-send). Wait, then do it again.

These limits are the same on every Metis Suite server. Your administrator cannot change them.

## What the message says

The message says what there was too much of, then when you can try again. For example:

- "Too many requests. Try again in 42 seconds."
- "Too many searches. Try again in 1 minute."
- "Too many attempts. Try again in 4 minutes."
- "Too many connection attempts. Try again in 1 hour."

The time in the message is the time left before you can try again. It is often shorter than the limit's full period. Wait for the time shown, then try again.

## Mail, calendar, drive and contacts

You can make up to 300 requests a minute in mail. Calendar, drive and contacts each have their own limit of 300 a minute. Normal use stays well below this. You may reach it only when you open, move or search many items very quickly.

- The mail limit covers all your mailboxes together. The same goes for your calendars, your drives and your address books.
- Each limit is yours alone. Other members of your workspace have their own.
- Reaching the mail limit does not stop you in calendar, drive or contacts.

When you reach one of these limits, what you were doing fails with "Too many requests. Try again in 20 seconds.", or with the time left. The message shows where that action usually shows its errors, for example in a short message at the bottom of the screen. You wait at most 1 minute.

## Limits for single features

Some features have their own limits. Each page below gives the limit, the message and how long you may have to wait:

- [Sign in](/guide/account/sign-in#if-you-try-too-many-times), [Change or reset your password](/guide/account/change-or-reset-your-password) and [Two-factor authentication](/guide/account/two-factor-authentication#if-something-goes-wrong)
- [Confirm it's you](/guide/workspaces/about-workspaces#confirm-its-you) and [Delete your account](/guide/account/delete-your-account)
- [How invites work](/guide/account/invite-people#rules-for-every-invite)
- [Compose and send](/guide/mail/compose-and-send#undo-a-send), [Schedule a send](/guide/mail/schedule-a-send) and [Unsubscribe from mailing lists](/guide/mail/unsubscribe#limits)
- [AI help in mail](/guide/mail/ai-help#if-you-use-ai-help-very-often) and [Phishing warnings](/guide/mail/phishing-warnings)
- [Privacy and safety when reading](/guide/mail/privacy-and-safety#remote-images-are-blocked) and [Print and view the original](/guide/mail/print-and-view-original#if-the-page-cannot-open-the-message)
- [Upload files](/guide/drive/upload-files#when-an-upload-fails), [Download and open at the provider](/guide/drive/download-and-open#if-a-download-fails) and [Preview files](/guide/drive/preview-files)
- [Search: who sees what, and limits](/guide/search/limits)
- [Assistant limits and troubleshooting](/guide/assistant/limits-and-troubleshooting#a-reply-fails)
- [Export your data](/guide/account/export-your-data#if-the-download-does-not-work), [Privacy settings](/guide/account/privacy-settings#limit-on-changes) and [Sign-in alerts](/guide/account/sign-in-alerts#turn-sign-in-alerts-off-or-on)
- [Desktop app](/guide/apps/desktop-app) and [Mobile app](/guide/apps/mobile-app)
- [Connect an account](/guide/workspaces/connect-an-account#if-the-connection-fails)
- [Workflow limits](/guide/workflows/limits) and [Manage MCP clients](/guide/assistant/manage-mcp-clients#common-messages)

Some of these limits also apply when the assistant or an AI app you connect works for you, such as scanning for mailing lists, unsubscribing, scheduling a send, summaries and invites. It gets the same message, with the time to wait.

## Messages that are not these limits

Some messages look like these limits but come from somewhere else. They do not say how long to wait.

| Message                                                         | Where it comes from                                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A message that says "too many requests just now"                | Your mail, calendar, drive or contacts provider, also when the assistant or a connected AI app works with it for you. Wait a moment and try again. |
| "The assistant is busy right now. Wait a moment and try again." | The AI service your server uses. See [Limits and troubleshooting](/guide/assistant/limits-and-troubleshooting#a-reply-fails).                      |
| "Too many transfers are running. Wait for one to finish"        | You have too many drive transfers running at once. See [Upload files](/guide/drive/upload-files#when-an-upload-fails).                             |
| "That run is already queued"                                    | A workflow's own **Rate limit** setting. See [Manage workflows](/guide/workflows/manage-workflows#change-the-workflow-settings).                   |
