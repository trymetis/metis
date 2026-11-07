---
title: Address book types
description: How Google Contacts, Outlook Contacts, Zoho Contacts and contacts servers differ in Metis Suite.
---

Metis Suite works with four kinds of address book account. Most things work the same way on all of them. This page lists what differs.

## At a glance

| Account type         | How you connect                      | Address books you see                                                                   | Groups                                       | Photos |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| **Google Contacts**  | Sign in with Google                  | One, named "Contacts"                                                                   | Contact groups, which you can change         | Yes    |
| **Outlook Contacts** | Sign in with Microsoft               | "Contacts", plus each contact folder and the folders inside them                        | None                                         | No     |
| **Zoho Contacts**    | Sign in with Zoho                    | One, named "Contacts"                                                                   | Categories, which you can see but not change | Yes    |
| Contacts server      | Email address, username and password | One for each address book on the server. The first one you can write to is the main one | None                                         | No     |

A contacts server is also called a CardDAV server. Your administrator sets it up and gives it a name, which is what you pick when you connect.

## Notes by topic

- **Connecting.** Your administrator decides which providers and servers you can pick. For a contacts server, you bring only your own login. See [Add an address book](/guide/contacts/add-an-address-book).
- **Groups.** Google contact groups and Zoho categories show under **Groups** in the sidebar. Click one to see only its contacts. On Google, the **Groups** checkboxes in the contact dialog change which groups a contact belongs to. On Zoho, saving a contact never changes its categories. Outlook and contacts servers have no groups.
- **Photos.** Google and Zoho contacts show the photo from your provider. Other contacts show their first letter. You cannot add or change a photo in Metis Suite.
- **Read-only address books.** An address book is marked **Read-only** when the contacts server reports that your login can only read it. You can see its contacts, but you cannot add, edit or delete them. Google, Outlook and Zoho address books are never read-only.
- **Which address books show.** Every account starts with no address books shown in a workspace. You switch them on yourself. See [Show and hide address books](/guide/contacts/show-and-hide-address-books).

## What Metis Suite does not do

- It does not import address book files, and it does not export a whole address book. To save one person as a `.vcf` file, use **Download** on the contact's card in Contacts, or on a mail summary card. See [Browse your contacts](/guide/contacts/browse-your-contacts#open-a-contact).
- It does not show Google's "Other contacts" list.
- Very large address books may not show every contact.
