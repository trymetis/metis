---
title: Contacts AI
description: Open the Contacts AI panel to ask questions about your contacts and let the assistant change them, with your approval.
---

**Contacts AI** is a chat panel beside your contacts. You can ask it about the people in your address books, and ask it to add, change or delete contacts for you. This page covers how to open it from Contacts. For how chats, approvals and AI settings work in general, see [AI assistant](/guide/assistant).

## Open Contacts AI

Click the **Contacts AI** button (the robot icon) in the Contacts header. Click it again, or click **Close assistant**, to close the panel.

<img src="/images/contacts/contacts-ai-panel.webp" alt="The Contacts AI panel open beside a contact, with suggested questions" class="dark:hidden" />
<img src="/images/contacts/contacts-ai-panel-dark.webp" alt="The Contacts AI panel open beside a contact, with suggested questions" class="hidden dark:block" />

The panel's header tells you which address books the assistant works with. It shows the address book account's [name](/guide/contacts/browse-your-contacts#how-accounts-are-named), or "All address books". It matches what you picked in the **Switch address book** menu.

You see the **Contacts AI** button only when AI is set up on your Metis Suite instance and turned on for the workspace and for this address book. On **All address books**, at least one of the address books needs AI on. See [When Contacts AI is turned off](#when-contacts-ai-is-turned-off).

## Ask a question

A new chat says "Ask about your contacts" and offers suggestions such as "Who works at the same company as this contact?" and "Find everyone without a phone number". Click one, or type your own question in the box ("Ask about your contacts…") and press **Enter**.

### Point the assistant at a contact

The contact you have open is attached on its own, shown as a chip with a dashed outline.

- To keep it attached when you open another contact, point at its chip and click the pin icon (**Keep attached while you browse**).
- To attach another contact, drag its row from the list onto the panel. You can drag contacts only while the panel is open.
- You can also click **Attach a contact** (the paperclip) and pick from the contacts in the list. When there is no contact left to attach, for example when the list is empty or every contact is already attached, the button is turned off.
- To take a contact off, click the cross on its chip. **Clear** removes them all.
- Click a chip to open that contact.

If something goes wrong, the panel says "Contacts AI hit a problem" with a **Retry** button.

To start a new conversation, click **Clear chat** (the eraser icon) in the panel's header. It shows once you have sent a message. There is no confirmation, and the cleared chat cannot be brought back.

The chat is not saved. When you close the panel or leave the page, the next conversation starts fresh. Contacts AI shares a limit of 20 messages a minute with the Mail AI, Calendar AI and Drive AI panels. See [Limits and troubleshooting](/guide/assistant/limits-and-troubleshooting).

## What it can do

Contacts AI can list your address books and their groups, search your contacts and open one in full. It can also create a contact, change one or delete one.

Before it changes anything, it asks you to approve the change in a box above the message box. The approval says, for example, "Approve saving" and the person's name, "Approve changing" and what changes, or "Approve deleting" and the contact, with a warning that it cannot be undone. In the chat, the action's row says "Waiting for your approval". After you approve, it says "Approved, running...", then the result, such as "Saved Sam Lee". See [Approve or decline actions](/guide/assistant/approve-or-decline-actions).

## When Contacts AI is turned off

AI is off for each address book until someone turns it on. The person who connected the account can turn it on in the workspace's contacts settings. Metis Suite asks them to confirm it's them first, with a code from their authenticator app, a passkey or a backup code. See [Turn AI on or off for an address book](/guide/contacts/add-an-address-book#turn-ai-on-or-off-for-an-address-book).

An owner or admin of the workspace decides whether AI is allowed there at all.

While AI is off for the workspace or for this address book, the **Contacts AI** button does not show. Since the panel cannot open, you cannot drag contacts to attach them either.

Contacts AI reaches only the address books that have AI turned on in this workspace.
