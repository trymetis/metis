# Changelog

Notable changes to the Metis Suite server: the app, worker and preflight images, released together under `app-v<version>` tags. The server CLI, the mail gateways, the desktop app and the mobile app have their own changelogs in [`apps/cli/`](../cli/CHANGELOG.md), [`apps/gateway-resend/`](../gateway-resend/CHANGELOG.md), [`apps/gateway-ses/`](../gateway-ses/CHANGELOG.md), [`apps/gateway-cloudflare/`](../gateway-cloudflare/CHANGELOG.md), [`apps/desktop/`](../desktop/CHANGELOG.md) and [`apps/mobile/`](../mobile/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

- **Sign out everywhere** with **Also sign out this device** signs this browser out at once, instead of leaving it signed in for up to two minutes.
- Passkeys work for two-factor authentication on par with an authenticator app: set it up with either one, and add the other later under **Settings** → **Security**.
- You can choose which one Metis Suite asks for first, the authenticator app or a passkey, and pick another one, or a backup code, each time you sign in or confirm a change.
- An authenticator app or a passkey can be removed on its own, as long as you keep one way to confirm it's you. Adding or removing either shows in **Security activity**. Turning two-factor authentication off removes them all and asks for your password and a confirmation.
- Confirmation boxes ask you to **Confirm it's you** and take your authenticator app, a passkey or a backup code, instead of asking only for an authenticator code.
- The composer is a large window that fills most of the screen, for new messages, drafts, replies and forwards alike, and slides up as a sheet on phones. A long message scrolls inside it and keeps the line you are typing in view. A click outside no longer closes it: use the close button or Escape.
- Drafts save shortly after you pause typing, and a reply you never touched is not saved as a draft. Edit draft opens the whole saved draft, with its Bcc, attachments and, for a reply, its place in the conversation, as far as the mail provider stores them.
- The reply box under a message opens the composer with the reply ready, so a reply is written in one editor.
- HTML messages use the full width of the reading pane, and a message wider than the pane shrinks to fit instead of cutting off its right side.
- The **m** then **r** shortcut replies to the open message, the same as **Write a reply…**, instead of opening a blank message. It does nothing on a draft.
- In **All inboxes**, a reply or forward starts on the mailbox the message arrived in, instead of your first mailbox.
- In **All inboxes**, **Edit draft** starts on the draft's own mailbox and keeps saving to the same draft, and the draft is removed once you send it.
- **From** can't be changed once a draft has been saved, so saves never go to a mailbox that doesn't hold the draft.
- On Gmail, a draft opened with **Edit draft** saves again and is removed once you send it, instead of failing to save.
- On Zoho Mail, saving or sending a draft no longer leaves copies of it in **Trash**.
- Mail shortcuts do nothing while the composer is open, so a key pressed while writing can no longer move to another message, archive it or delete it.
- **Undo** after sending brings back the whole message: Cc, Bcc, attachments, the mailbox it was sent from and, for a reply, its place in the conversation.
- Replies sent from Outlook mailboxes land in the conversation they answer instead of going out as new messages, and a reply saved as a draft is stored in Outlook as a reply.
- In Calendar, the sidebar button that adds an event is **New event**, shaped like **Compose** in Mail.
- An event's details show its title on one row with **Edit event**, **More actions** and **Close**. **Delete event** is in the **More actions** menu.
- A calendar without a color from its provider picks from the same colors as mailboxes, so its color may change once.
- In Contacts, the list fills the page as a table (name, email, phone, organization, address book) until you open a contact, and **Close contact** returns to it. **New contact** is the button beside the filter.
- On a contact, click an email address to write to it or a phone number to call it, and copy either with the button beside it. **Edit contact** sits at the top, with **Invite to event**, **Download** and **Delete contact** under **More actions**.
- Contacts and email senders show two initials on a color picked from their address, so the same person has the same color everywhere.

## Releases

- [0.4.1](../../releases/app-v0.4.1.md) - 2026-11-17
- [0.4.0](../../releases/app-v0.4.0.md) - 2026-11-13
- [0.3.1](../../releases/app-v0.3.1.md) - 2026-11-08
- [0.3.0](../../releases/app-v0.3.0.md) - 2026-11-07
- [0.2.2](../../releases/app-v0.2.2.md) - 2026-11-05
- [0.2.1](../../releases/app-v0.2.1.md) - 2026-10-30
- [0.2.0](../../releases/app-v0.2.0.md) - 2026-10-28
- [0.1.2](../../releases/app-v0.1.2.md) - 2026-10-27
- [0.1.1](../../releases/app-v0.1.1.md) - 2026-10-26
- [0.1.0](../../releases/app-v0.1.0.md) - 2026-10-24
