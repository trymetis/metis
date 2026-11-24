---
title: Browse your contacts
description: Open Contacts, switch between address books, filter the list and open a contact's card.
---

This page shows you how to open your contacts, move between address books, find a person and read their details.

<img src="/images/contacts/all-contacts.webp" alt="The Contacts section showing All contacts as a table with the Name, Email, Phone, Organization and Address book columns" class="dark:hidden" />
<img src="/images/contacts/all-contacts-dark.webp" alt="The Contacts section showing All contacts as a table with the Name, Email, Phone, Organization and Address book columns" class="hidden dark:block" />

## Open Contacts

Click the **Contacts** icon in the left rail. It sits between **Drive** and **Workspace AI**. You can also open workspace search and run the command **Go to contacts**.

If your workspace has address books, you see **All contacts**: the contacts from every address book in the workspace in one list, sorted by name.

The top of the page shows the title: **All contacts**, or the name of the address book you picked. When your instance has AI turned on, the **Contacts AI** button (a robot icon) sits at the right end of the title bar. See [Contacts AI](/guide/contacts/contacts-ai).

Below the title, you find, from top to bottom:

1. The **Switch address book** button and the **Show** menu. When no contact is open, they sit side by side. When a contact is open, they are stacked.
2. The filter box, with the **New contact** button (a person with a plus) right beside it. See [Create, edit and delete contacts](/guide/contacts/create-edit-and-delete).
3. The list of contacts.

If the workspace has no address book yet, you see "No address book in this workspace" and a **Go to contacts settings** button. To add one, see [Add an address book](/guide/contacts/add-an-address-book). If the card says "No address book providers are set up yet. The instance owner adds them in the dashboard.", nobody on your instance can connect an address book yet. Ask your instance owner to add a provider.

A workspace that has only address books, and no mailbox, calendar or drive, opens on Contacts. When you switch to another workspace from Contacts, you land on that workspace's Contacts.

Contacts has no keyboard shortcuts.

## Switch between address book accounts

The **Switch address book** button at the top of the list column shows which account you are looking at. It says **All address books** with the number of accounts, such as "2 accounts", or it shows one account's provider and email address.

<img src="/images/contacts/switcher.webp" alt="The Switch address book menu open, listing All address books, each account and Add address book" class="dark:hidden" />
<img src="/images/contacts/switcher-dark.webp" alt="The Switch address book menu open, listing All address books, each account and Add address book" class="hidden dark:block" />

1. Click that button to open the **Switch address book** menu.
2. Choose **All address books** ("Every address book in this workspace") to see every contact together. This choice appears when the workspace has more than one account.
3. Or choose one account to see only its contacts. Each account shows how many of its address books are shown, such as "2 shown", or "No address books shown".

**Add address book** at the bottom of the menu opens the workspace's contacts settings. If the workspace has no address book, the menu says "No address books in this workspace yet."

## Choose what the list shows

Use the **Show** menu to pick which contacts the list shows. It is the button next to the **Switch address book** button, and it names what the list shows now, such as **All contacts**.

<img src="/images/contacts/show-menu.webp" alt="The Show menu open, listing All contacts, the address books and the groups" class="dark:hidden" />
<img src="/images/contacts/show-menu-dark.webp" alt="The Show menu open, listing All contacts, the address books and the groups" class="hidden dark:block" />

1. Click the **Show** menu (it shows your current choice, such as **All contacts**).
2. Choose one of these:
   - **All contacts**, to see every contact in view.
   - An address book, to see only that address book. The title at the top of the page changes to the address book's name. The address books are listed under the heading **Books**. When the workspace has more than one account, each account has its own heading instead: the account's email address.
   - A group, under **Groups**, to see only its members. Groups come from Google contact groups and Zoho categories. While you look at one address book, **Groups** lists only that address book's groups. See [Address book types](/guide/contacts/address-book-types).

**Show** appears only when at least one address book is showing in the workspace.

### When no address books are showing

If no address book is showing, a message appears next to the **Switch address book** button (under it when a contact is open, or on a phone) instead of **Show**:

- "None of your address books are showing in this workspace yet." means you added an account to this workspace, but none of its address books are switched on. Click **Choose which address books to show** to fix it. See [Show and hide address books](/guide/contacts/show-and-hide-address-books).
- "No address books are showing in this workspace yet." means no address book is switched on for this workspace. The **Contacts settings** link opens the workspace's contacts settings.

### On a phone

On a phone, the list fills the screen, with the **Switch address book** button and **Show** stacked at the top. Contacts has no **Open sidebar** button.

## Read the list

When no contact is open, the list fills the page as a table. The heading row shows **Name**, **Email**, **Phone** and **Organization**. In **All contacts**, a fifth column, **Address book**, shows which address book each contact is in. Each row shows the contact's picture and name, their main email address, their first phone number and their organization.

When you open a contact, the list becomes a narrow column on the left, and the contact you opened is highlighted. Each row then shows the picture, the name and one more line: the email address, or else the first phone number, or else the organization. In **All contacts**, that line also ends with the name of the address book, such as "Contacts". On a phone, the list always looks like this, with no column headings.

The picture is the contact's photo when your provider has one. Otherwise it is a colored circle with up to two initials, such as "AL" for Ana Lopes. A one-word name or an email address gets one letter, and a contact with neither a name nor an email address gets "?". An email address keeps the same color in Contacts and as a sender in Mail.

A contact with no name shows its email address instead, or "Unnamed".

## Filter the list

Type in the box above the list (it says "Filter by name, email or phone"). The list keeps only the contacts that match every word you type. The filter looks at the name, nickname, organization, job title, email addresses and phone numbers. To show every contact again, click the X in the box (**Clear search**).

<img src="/images/contacts/filter.webp" alt="The contact list filtered by an organization name" class="dark:hidden" />
<img src="/images/contacts/filter-dark.webp" alt="The contact list filtered by an organization name" class="hidden dark:block" />

If nothing matches, you see "No contact matches that filter." An empty address book shows "No contacts here yet."

To find a contact from anywhere in the workspace, you can also use [workspace search](/guide/search/search-your-workspace). When you open search while you look at one address book account, the search box already holds `addressbook:` and the account's short name, so you search only there. From **All contacts**, the box starts empty.

## Open a contact

Click a contact in the list. The list moves into a narrow column on the left, and the contact's card fills the rest of the page.

<img src="/images/contacts/contact-card.webp" alt="A contact's card with the Edit contact and More actions buttons, their details and recent mail, beside the narrow contact list" class="dark:hidden" />
<img src="/images/contacts/contact-card-dark.webp" alt="A contact's card with the Edit contact and More actions buttons, their details and recent mail, beside the narrow contact list" class="hidden dark:block" />

The card shows:

- **The picture and the name.** When the contact has no name, you see their email address, or "Unnamed".
- **A badge** next to the name, with **Member** and their role, such as "Member · admin", when one of their email addresses belongs to a member of this workspace.
- **Their details**, each only when it has a value:
  - **Email**. The main address says **Email (primary)**. A label such as "work" shows in parentheses, for example "ana@example.com (work)".
  - **Phone**, with its label in parentheses, for example "+351 912 345 678 (cell)".
  - **Address**, with its label in parentheses when it has one, such as **Address (home)**.
  - **Nickname**, **Organization**, **Department**, **Job title**, **Birthday**, **Website** and **Notes**.
  - **Address book**, which shows the address book and the account the contact belongs to.
- **Recent mail with them** and **Upcoming events with them**, up to 5 of each. They show only when the contact has an email address. Click an item to open that message or event. When there is nothing to show, you see "No mail found." or "No upcoming events."

To close the card on a computer, click **Close contact** (the X at the top right of the card). The card closes and the list fills the page again.

On a phone, the card fills the screen and the list is hidden. To go back to the list, tap the back arrow (**Back to contacts**).

If a contact cannot be opened, a red line under the title shows the error, or "Could not open that contact".

### Write to, call or copy

The email addresses and phone numbers on the card are links.

- **Click an email address** to write to it. Metis Suite takes you to Mail and opens a new message to that address. When you point at the address, you see "Write to" and the address, for example "Write to ana@example.com".
- **Click a phone number** to call it. Your device opens its calling app, if it has one. What happens depends on your device and browser. When you point at the number, you see "Call" and the number, for example "Call +351 912 345 678".
- **Copy an address or a number** with the copy button beside it. The button shows when you point at the row. On a touch screen, it is always there. After a copy, its icon turns into a check mark for about a second and a half. If copying does not work, you see "Could not copy".

The other details are plain text.

### Card actions

The top right of the card has these buttons:

- **Edit contact** (the pencil) opens the **Edit contact** dialog. See [Create, edit and delete contacts](/guide/contacts/create-edit-and-delete).
- **More actions** (the three dots) opens a menu with:
  - **Invite to event**: opens Calendar, showing all calendars, with a new event that has the contact's main email address as a guest. It is turned off when the contact has no email address.
  - **Download**: saves the contact as a `.vcf` file. The file is named after the contact's name, or its organization or email address when it has no name. Letters in any language are kept, and only characters a file name cannot hold are left out. If nothing usable is left, the file is `contact.vcf`. The file holds the contact's name, nickname, email addresses, phone numbers, addresses, organization, department, job title, birthday, websites and notes, with labels such as "work" kept. You can import it into another app.
  - **Delete contact**: deletes the contact. See [Create, edit and delete contacts](/guide/contacts/create-edit-and-delete#delete-a-contact).
- **Close contact** (the X) closes the card. It is not there on a phone.

**Edit contact** and **Delete contact** are turned off for a contact in a read-only address book.

### How accounts are named

Metis Suite names each address book account so you can tell them apart. Google, Outlook and Zoho accounts show the type, then the email address, for example "Google Contacts · you@example.com". A contacts server shows the name your administrator gave it, for example "Company contacts".

## If an account does not load

When an account cannot be reached, a red line under the header names the account and the error. The contacts from your other accounts still show.

## Who can see and change contacts

Every member of the workspace sees the contacts in every address book the workspace shows, whatever their role. Every member can also create, edit and delete those contacts, including contacts in address books that someone else connected.
