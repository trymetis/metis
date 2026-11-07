---
title: Supported providers
description: The mail, calendar, drive and contacts providers you can connect to Metis Suite, how you connect each one, and how they differ.
---

Metis Suite works with the providers below. You see only the ones your instance owner has set up, so your list may be shorter. For how to connect an account, see [Connect an account](/guide/workspaces/connect-an-account).

## At a glance

| Provider                | Mail      | Calendar         | Drive        | Contacts         | How you connect                                                                   |
| ----------------------- | --------- | ---------------- | ------------ | ---------------- | --------------------------------------------------------------------------------- |
| Google                  | Gmail     | Google Calendar  | Google Drive | Google Contacts  | Sign in at Google                                                                 |
| Microsoft               | Outlook   | Outlook Calendar | OneDrive     | Outlook Contacts | Sign in at Microsoft                                                              |
| Zoho                    | Zoho Mail | Zoho Calendar    | No           | Zoho Contacts    | Sign in at Zoho                                                                   |
| IMAP mail server        | Yes       | No               | No           | No               | Email address, username and password, with an optional separate login for sending |
| Cloudflare Email        | Yes       | No               | No           | No               | Email address and a mailbox token from your server operator                       |
| Resend                  | Yes       | No               | No           | No               | Email address and a mailbox token from your server operator                       |
| CalDAV calendar server  | No        | Yes              | No           | No               | Email address, username and password                                              |
| CardDAV contacts server | No        | No               | No           | Yes              | Email address, username and password                                              |
| S3 storage              | No        | No               | Yes          | No               | Email address, bucket and an optional folder prefix                               |
| WebDAV                  | No        | No               | Yes          | No               | Email address, username, password and an optional folder                          |
| FTP                     | No        | No               | Yes          | No               | Email address, username, password and an optional folder                          |
| SFTP                    | No        | No               | Yes          | No               | Email address, username, password and an optional folder                          |

Some things to know:

- **One sign-in covers several uses.** A Google or Microsoft account can give you mail, calendar, drive and contacts, and a Zoho account mail, calendar and contacts. They all share one connection. See [Manage your connected accounts](/guide/workspaces/manage-connected-accounts).
- **Servers are chosen by your instance owner.** For IMAP, CalDAV, CardDAV, S3, WebDAV, FTP and SFTP, you pick a server from a list and bring only your own login. You cannot type in a server address. The instance owner also decides how each server is secured, for example whether an FTP server uses encryption.
- **An optional folder limits the connection.** For S3, WebDAV, FTP and SFTP, filling in a folder limits this connection to that one folder.

## Mail

| Feature                             | Gmail                          | Outlook                          | Zoho Mail                          | IMAP, Cloudflare Email, Resend |
| ----------------------------------- | ------------------------------ | -------------------------------- | ---------------------------------- | ------------------------------ |
| When Trash is emptied               | After 30 days (Gmail's policy) | After 30 days (Outlook's policy) | After 30 days (Zoho Mail's policy) | Your mail server decides       |
| Gmail categories turned into labels | Yes                            | No                               | No                                 | No                             |

- **Trash.** When you open a message in Trash, a banner tells you when messages there are deleted for good, as in the table above.
- **Gmail categories.** Messages in Gmail's Promotions, Updates, Social and Forums categories get the Metis Suite labels Promotional, Updates, Social and Newsletter.
- **Search on IMAP mailboxes** is a plain text match across Inbox, Archive and Sent, with no ranking.
- **Drafts on Zoho Mail.** Each time a draft is saved, Zoho replaces it with a new draft.
- **Linking a drive file** into a message works with Google Drive and OneDrive files only.

## Calendar

- **Google Calendar** sends updates to every guest when you create, change or delete an event, or answer an invitation.
- **CalDAV** calendars do not send invitations. Your answer to an invitation changes only your own copy of the event.
- **Repeating events on Google and Microsoft.** When you change one event in a repeating series, the change applies to that one occurrence.
- **Read-only calendars**, such as holiday calendars, show a **Read-only** badge. You cannot save new events to them.

## Drive

| Feature                      | Google Drive                                     | OneDrive                         | S3 storage                           | WebDAV                                                     | FTP                                                        | SFTP                                                       |
| ---------------------------- | ------------------------------------------------ | -------------------------------- | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Deleting a file              | Moves it to the provider's trash                 | Moves it to the provider's trash | Deletes it for good                  | Deletes it for good                                        | Deletes it for good                                        | Deletes it for good                                        |
| **Open at provider**         | Yes                                              | Yes                              | No                                   | No                                                         | No                                                         | No                                                         |
| Storage used, in the sidebar | Yes                                              | Yes                              | No                                   | When the server reports it                                 | No                                                         | No                                                         |
| Preview inside Metis Suite   | No, use **Download** or **Open in Google Drive** | Yes                              | Depends on how the storage is set up | Yes                                                        | Yes                                                        | Yes                                                        |
| Search                       | The provider's own search                        | The provider's own search        | Matches file names                   | Looks through folders, so very deep files may not be found | Looks through folders, so very deep files may not be found | Looks through folders, so very deep files may not be found |

- **Storage unavailable.** Drives that cannot report their storage show "Storage unavailable" in the sidebar.
- **Google Drive downloads** use your browser's own Google sign-in, so your browser must be signed in to that Google account.
- **File size limits.** Some drives send files through your Metis Suite server, which has a size limit set by your instance owner. Larger files show "Files over N MB cannot be transferred for this drive", with the real limit in place of N.
- **Zoho** has no drive.

## Contacts

| Feature                 | Google Contacts                      | Outlook Contacts                                        | Zoho Contacts                                | CardDAV contacts server           |
| ----------------------- | ------------------------------------ | ------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| Address books you see   | One, "Contacts"                      | "Contacts", plus each contact folder and its subfolders | One, "Contacts"                              | Each address book on the server   |
| Groups                  | Contact groups, which you can change | None                                                    | Categories, which you can see but not change | None                              |
| Photos                  | Yes                                  | No                                                      | Yes                                          | No                                |
| Read-only address books | Never                                | Never                                                   | Never                                        | When your login can only read one |

- **Every address book starts hidden.** A new address book account shows no address books in a workspace until someone switches them on. See [Show and hide address books](/guide/contacts/show-and-hide-address-books).
- **No import or whole-book export.** Metis Suite does not import address book files or export a whole address book. You can download one contact as a `.vcf` file from its card. It also does not show Google's "Other contacts" list.
- For more, see [Address book types](/guide/contacts/address-book-types).
