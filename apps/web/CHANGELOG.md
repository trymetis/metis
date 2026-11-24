# Changelog

Notable changes to the Metis Suite server: the app, worker and preflight images, released together under `app-v<version>` tags. The server CLI, the mail gateways, the desktop app and the mobile app have their own changelogs in [`apps/cli/`](../cli/CHANGELOG.md), [`apps/gateway-resend/`](../gateway-resend/CHANGELOG.md), [`apps/gateway-ses/`](../gateway-ses/CHANGELOG.md), [`apps/gateway-cloudflare/`](../gateway-cloudflare/CHANGELOG.md), [`apps/desktop/`](../desktop/CHANGELOG.md) and [`apps/mobile/`](../mobile/CHANGELOG.md).

Each release's notes are in [`releases/`](../../releases/), listed under Releases below. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

### Upgrade notes

- Contains a database migration that moves each account's authenticator app into its own table and adds a table for passkeys. Two-factor setups made before the upgrade keep working.
- Passkeys belong to the server's address: after the server moves to a new address, passkeys stop working there, and users sign in with their authenticator app or a backup code and add a passkey again.
- Thread summaries use a new format, so each conversation's summary is built again the first time it is opened after the upgrade, which is one model call per conversation.
- The rate-limit counters for sign-in, sign-up, password resets and two-factor checks start from zero after the upgrade.

### Added

- Passkeys for two-factor authentication, on par with an authenticator app: set it up with either one, and add the other later under **Settings** → **Security**.
- You can choose which one Metis Suite asks for first, the authenticator app or a passkey, and pick another one, or a backup code, each time you sign in or confirm a change.
- An authenticator app or a passkey can be removed on its own, as long as you keep one way to confirm it's you. Adding or removing either shows in **Security activity**. Turning two-factor authentication off removes them all and asks for your password and a confirmation.
- Workflows: a list of your workflows with search, each one's trigger, last run, when it was updated and an on/off switch. **Approvals** and **Runs** are at the top, and each workflow opens on its own page with its own address.
- **New workflow** asks for a name and a template. The workflow is created turned off, and the template opens in the editor for you to finish and save.
- Each workflow has its own **Runs** page, under **More workflow actions** in the editor.
- A **Refresh** button in the mail list.
- Drag files from Drive, or contacts from the list, onto the open AI panel to attach them, as you already can with emails and events. Files and contacts you send stay visible in the conversation, as emails and events do.
- The Calendar, Drive and Contacts AI panels have **Clear chat**, like Mail AI.
- Each chat in the Workspace Assistant has a menu to **Rename**, **Pin** or **Delete** it, and pinned chats stay at the top.
- On a contact, click an email address to write to it or a phone number to call it, and copy either with the button beside it.
- The composer has a formatting bar above the text: bold, italic, underline, strikethrough, lists, quote, code, alignment, link, undo, redo and clear formatting.
- **Rewrite** in the composer edits the selected text with AI: rewrite it, shorten it, or make it more formal or friendlier.
- **Stance** in a reply writes the reply in the stance you pick, from the message and what you have typed so far, and replaces your text; the editor's undo brings it back.
- **Discard draft** in the composer deletes the draft at once, with **Undo** in the notice that follows.
- In Drive, a **Compact grid** view joins **List** and **Large grid**, picked from the view menu in the toolbar or with **d** then **c**.
- Files you preview show in Drive's **Recent** list next to folders, and clicking one opens its preview again.
- In the dashboard's **Themes**, select several instance themes and delete them at once. Select all never picks a built-in theme.

### Changed

- The mail list shows each message on two lines: sender and subject, then labels, a paperclip for attachments, a preview (the conversation's TL;DR once it has one) and the date. The Gmail, Outlook or Zoho tag shows only in All inboxes.
- The mail list checks for new mail every 5 minutes instead of every minute, besides when you come back to the tab.
- A message's summary starts collapsed to one line: the TL;DR and a chip for each card. Click it to open the cards; Metis Suite remembers whether you keep them open. A conversation gets at most one TL;DR, and notifications get none.
- Summary card actions sit next to what they act on: copy and track beside the tracking number, Join beside the meeting link, Directions beside the address, and whole-card actions such as Pay or Save contact in the card's header.
- **Reply** is in the message toolbar, which uses icons for Back, Previous, Next, Reply, Reply all, Forward, Star, Archive, Delete and Print. Smart replies and reply-with-stance chips appear right after the message instead of in a panel that covered it, and the stance chips and **Draft apology** show only where AI is on.
- Blocked remote images show as a small chip next to the trackers chip; it opens the explanation with **Load images** and **Always from**.
- **Subscriptions** is a table you can sort by sender, number of emails or last received.
- The composer is a large window that fills most of the screen, for new messages, drafts, replies and forwards alike, and slides up as a sheet on phones. A long message scrolls inside it and keeps the line you are typing in view. A click outside no longer closes it: use the close button or Escape.
- Drafts save shortly after you pause typing, and a reply you never touched is not saved as a draft. **Edit draft** opens the whole saved draft, with its Bcc, attachments and, for a reply, its place in the conversation, as far as the mail provider stores them.
- **Reply** opens the composer with the reply ready, so a reply is written in one editor.
- **From** can't be changed once a draft has been saved, so saves never go to a mailbox that doesn't hold the draft.
- Confirmation boxes ask you to **Confirm it's you** and take your authenticator app, a passkey or a backup code, instead of asking only for an authenticator code.
- Every "too many requests" message, including sign-in, the two-factor lockout, the AI assistants, MCP clients, View original and webhook answers, says how long to wait before trying again. Webhook and MCP answers over a limit also carry a `Retry-After` header and a `retryAfterSec` field.
- Opening a message again no longer checks again whether you can unsubscribe from it. If that check is rate-limited, **Unsubscribe** shows greyed out with the wait.
- Reopening a message no longer counts toward the thread summary, phishing check and smart reply limits; only new AI work does. Smart replies and AI labels that hit their limit try again on their own after the wait.
- A subscriptions scan is reused for 5 minutes, so **Rescan**, searching subscriptions or asking the assistant again doesn't use up the scan limit, which now counts per mailbox.
- Uploads to WebDAV, FTP, FTPS, SFTP and relayed S3 drives allow 600 files a minute instead of 60.
- You can send up to 100 workspace or account invites an hour instead of 10, and an MCP client can make 120 calls a minute instead of 60.
- **Runs** (previously **Activity**) filters by status and by one or more workflows, and loads older runs 50 at a time, with no limit on how far back.
- A run's page shows its graph beside the step details. A strip under the title shows the trigger, start, duration and attempt; **More about this run** shows the scheduled time, merged missed runs, who started it, who it runs as and which revision ran, by whom and when. Any error sits in a red banner with **Retry failed steps**.
- In the workflow editor, a step's settings start with **Duplicate**, **Delete** and a menu with **Copy reference**, without the category and type tags. Steps that send or create something show a small dot on their card.
- **Add step** searches as you type and shows the 10 best matches by name and description.
- **Try on recent mail** opens as a **Preview** tab under the canvas, next to **Runs** and **Test run**, instead of a panel over the canvas.
- An action waiting for your approval shows as a card above the message box, with **Approve** and **Decline** inside it. Press Ctrl/⌘ Enter to approve or Esc to decline; Enter alone no longer approves. With text in the message box, the send button reads **Decline with reason**.
- The AI panels in Mail, Calendar, Drive and Contacts show what they work on in one line, such as the mailbox address or **All inboxes**. The button that opens them is in the same place and looks the same in every section, and in Mail it is named **Mail AI**.
- Where AI is off for a mailbox, calendar, drive or address book, or for the workspace, its AI button and panel no longer appear, instead of a panel saying the assistant is turned off.
- In the Workspace Assistant, search, collapse and **New chat** (a pencil) share one row above the chats, and the search shows even before your first chat.
- Search boxes in Mail, Drive, Contacts and the MCP tool lists share one look, with a button to clear the search.
- In Calendar, the sidebar button that adds an event is **New event**, shaped like **Compose** in Mail.
- An event's details show its title on one row with **Edit event**, **More actions** and **Close**. **Delete event** is in the **More actions** menu.
- A calendar without a color from its provider picks from the same colors as mailboxes, so its color may change once.
- In Contacts, the list fills the page as a table (name, email, phone, organization, address book) until you open a contact, and **Close contact** returns to it. **New contact** is the button beside the filter.
- A contact shows **Edit contact** at the top, with **Invite to event**, **Download** and **Delete contact** under **More actions**.
- Contacts, email senders, workspace members, the member preview and your account button in the left rail show two initials on a color picked from the address, so the same person has the same color everywhere.
- Drive's grid icons and thumbnails grow with their cell instead of staying one small size.
- A file preview's header is one row: the name (size and date when you point at it), the PDF page and zoom controls, and Download, Open and Close as icons. In a narrow preview, zoom and Open are in the **…** menu.
- Drive's **Pinned** and **Recent** lists show each folder's or file's own icon, and **Recent** also lists folders you reach from their address or the breadcrumb.
- **Deploy checks** is in the dashboard's System menu, with the number of warnings beside it, highlighted until you acknowledge them and shown on **System** while that list is closed, instead of a box above the menu.
- The dashboard's **Accounts** and **Users** show "2FA setup required" on an account without two-factor authentication, instead of a 2FA column and a red badge.
- **Exports** in the dashboard lists each export on two lines (date, release and size, then the file and where it went), and opens to show its checksum, migration, addresses and recipients, each with a copy button.
- **Themes** in the dashboard is a table of the built-in and instance themes with their colors, type and how many workspaces use each, and **Edit** and **Delete** buttons on instance themes. **Start from** in the theme builder shows each theme's colors.
- **Reset to environment** is in each configuration section's **…** menu, and says why when it isn't available.
- Explanations of dashboard sections open from an ⓘ next to the section's title.
- The maintenance page says how long maintenance has lasted and reloads by itself when the app is back, instead of "Try again in a few minutes."
- When an MCP client you already connected asks for access again, the approval page shows its tools in a table by area (Mail, Calendar, Drive, Contacts, Workflows, Workspace, Account, Instance, System) with **Read** and **Write** columns and sensitive tools marked, instead of one long list.
- **Email me a magic link** on the sign-in page reads **Email me a sign-in link**.
- The audit log, **Security activity** and a workspace's **Activity** put names in quotes, such as passkeys, MCP clients, workflows, workspaces and removed resources, so they no longer run into the sentence.
- MCP clients show the app they were added for only when it is a known one, and a client without one shows the MCP logo instead of a robot.
- Explanations in **Settings** open from an ⓘ next to the section's title, and the ⓘ hints on **Privacy** open on click as well as on hover.
- Compose **From**, the signatures preview, **Try on recent mail** and the workflow mailbox, calendar, drive and address book pickers show each account with its provider and server under it, as Settings does, so the same address connected twice can be told apart.
- With nothing typed, the search dialog highlights nothing and shows how to search, with examples and every search key, so Enter no longer opens a new message.

### Fixed

- **Sign out everywhere** with **Also sign out this device** signs this browser out at once, instead of leaving it signed in for up to two minutes.
- HTML messages use the full width of the reading pane, and a message wider than the pane shrinks to fit instead of cutting off its right side.
- The **m** then **r** shortcut replies to the open message, the same as **Reply** in the toolbar, instead of opening a blank message. It does nothing on a draft.
- Mail shortcuts do nothing while the composer is open, so a key pressed while writing can no longer move to another message, archive it or delete it.
- In **All inboxes**, a reply or forward starts on the mailbox the message arrived in, instead of your first mailbox.
- In **All inboxes**, **Edit draft** starts on the draft's own mailbox and keeps saving to the same draft, and the draft is removed once you send it.
- On Gmail, a draft opened with **Edit draft** saves again and is removed once you send it, instead of failing to save.
- On Zoho Mail, saving or sending a draft no longer leaves copies of it in **Trash**.
- **Undo** after sending brings back the whole message: Cc, Bcc, attachments, the mailbox it was sent from and, for a reply, its place in the conversation. The quoted or forwarded message comes back folded away instead of as part of your text.
- Replies sent from Outlook mailboxes land in the conversation they answer instead of going out as new messages, and a reply saved as a draft is stored in Outlook as a reply.
- After Mail AI changes your mail, such as deleting, starring or labeling messages, the message list updates right away instead of at the next refresh.
- Thread summaries, **Reply with stance**, **Unsubscribe** and reordering workspaces show the error when they fail instead of failing silently, and a reorder that can't be saved goes back to the old order.
- Each drive download counts once toward the download limit instead of twice.
- **Draft apology**'s text box stops at 500 characters instead of failing when you go past them.
- The selected colour in the label colour picker shows a check mark instead of a ring that was hard to see on light colours.
- Leaving a workflow with unsaved changes through the left rail asks first, like the editor's back arrow.
- A run's back arrow returns to the Runs page you opened it from.
- In search, **Resume** and **Cancel** on a run are offered on the same runs as the run page (**Resume** now also on partial runs, **Cancel** on waiting runs) and show what actually happened, including when the run cannot be resumed. **Open the builder** is now **Open in the editor**.
- In Calendar, with the AI panel open, the card of an event you drag follows the pointer from the start, as it does in Mail, Drive and Contacts.
- Signing out in the browser clears Drive's **Recent** lists, so the next person who signs in on a shared browser no longer sees your recent folders and files.
- Confirm-it's-you boxes say **Confirming…** while they work, instead of **Saving…** when nothing is being saved.

### Security

- **Add another device** asks you to confirm it's you, with your authenticator app, a passkey or a backup code, instead of your password, and shows the QR code in a window that forgets it once closed, instead of leaving it on the page.

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
