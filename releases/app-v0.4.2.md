---
date: 2026-11-25
cli: 0.1.1
---

### Upgrade notes

- Contains a database migration that moves each account's authenticator app into its own table and adds a table for passkeys. Two-factor setups made before the upgrade keep working.
- Passkeys belong to the server's address: after the server moves to a new address, passkeys stop working there, and users sign in with their authenticator app or a backup code and add a passkey again.
- Thread summaries use a new format, so each conversation's summary is built again the first time it is opened after the upgrade, which is one model call per conversation.
- The rate-limit counters for sign-in, sign-up, password resets and two-factor checks start from zero after the upgrade.
- On IMAP mailboxes, a message in a character set other than UTF-8 that was opened before the upgrade keeps the garbled text stored when it was first opened, and so do its summary and phishing check. **Print** and **View original** show it correctly. Its stored copy is replaced once it goes unopened for the mail cache period (`METIS_MAIL_CACHE_DAYS`, 30 days by default).

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
- `METIS_RATELIMIT_OVERRIDES` changes any built-in rate limit: a JSON object, set in the environment or the config file, whose entries replace only the limit or window they name. A misspelled limit name stops the server at start instead of being ignored.

### Changed

- The assistant's `@` picker allows 240 lookups a minute instead of 120. Past that, `@` is typed as plain text and the picker stays closed until the wait passes.
- Past the address suggestion limit, **To**, **Cc** and **Bcc** show no suggestions, so you type the full address. The suggestions come back on their own once the wait passes.
- Searching subscriptions reads your latest 100 Inbox emails, like the **Subscriptions** page.
- The mail list shows each message on two lines: sender and subject, then labels, a paperclip for attachments, a preview (the conversation's compact summary card once it has one) and the date. The Gmail, Outlook or Zoho tag shows only in All inboxes.
- The mail list checks for new mail every 5 minutes instead of every minute, besides when you come back to the tab.
- A conversation's summary is one card: a TL;DR, or a card for the one thing the conversation is about, such as a package, a code or a meeting. It starts as a compact card above the message; **Show summary** opens the full card and **Hide summary** goes back to the compact card. Rows in the message list show the compact card. Metis Suite remembers whether you keep it open. Notifications that no card fits get none.
- Summary card actions sit next to what they act on: copy and track beside the tracking number, Join beside the meeting link, Directions beside the address, and whole-card actions such as Pay or Save contact in the card's header.
- **Reply** is in the message toolbar, which uses icons with tooltips for Back, Previous, Next, Reply, Reply all, Forward, Edit draft, Star, Read later, Unsubscribe, Mute, Archive, Restore, Delete, Draft apology, Print and View original; Label and Snooze are menus with text. Smart replies and reply-with-stance chips appear right after the message instead of in a panel that covered it, and the stance chips and **Draft apology** show only where AI is on.
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
- **Subscriptions** always shows mail that just arrived. A scan only checks senders with new mail, so **Rescan**, searching subscriptions or asking the assistant again uses up the scan limit only when there is new mail to check, and the limit counts per mailbox.
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

- Search suggestions, and the **In a resource** menu in search, say how long to wait when you have asked for too many suggestions, instead of showing nothing.
- A summary that could not be made says so, and that it tries again when you open the conversation after an hour or when a new message arrives, instead of "No summary for this email".
- **Details** on a run in the workflow editor's **Runs** tab asks before leaving a workflow with unsaved changes, like **Back** and the app rail.
- A summary or phishing check that hits its limit shows how long to wait and tries again on its own once that time has passed.
- Recent searches are cleared when you sign out, like Drive's **Recent** list, so the next person on a shared browser doesn't see them.
- A file in Drive's **Recent** list that was deleted or moved drops off the list when its preview can't find it.
- If the draft can't be deleted after you send a message, a notice says it's still in **Drafts**.
- **New contact** waits for your address books before **Save** turns on, and never starts on an address book you cannot add to.
- Saving two themes with the same name at the same moment shows "A theme with that name already exists" instead of failing.
- Opening an emailed sign-in link, or an AI app's access page, too many times shows a page that says how long to wait, instead of raw text. Sign-in and AI app answers over a limit also carry a standard `Retry-After` header.
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
- On IMAP mailboxes, messages written in a character set other than UTF-8, such as GB2312, Big5, Shift_JIS, ISO-2022-JP, EUC-KR, Windows-1251 or ISO-8859-1, show their text instead of garbled characters (thanks @Code-suphub).
- **Print** and **View original** show a message written in another character set correctly on every kind of mailbox, and **Download original** saves the message exactly as it arrived.
- On IMAP mailboxes, plain-text messages sent with flowed line wrapping show as whole paragraphs instead of lines broken mid-sentence.

### Security

- Setting up an authenticator app, showing its QR code for another device (**Add another device**) and regenerating backup codes ask for your account password in a dialog. An authenticator code or a passkey cannot confirm them.
- **Add another device** shows the QR code in a window that forgets it once closed, instead of leaving it on the page.
