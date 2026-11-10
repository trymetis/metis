---
date: 2026-11-07
---

### Upgrade notes

- Contains a database migration that adds the address book tables and lets workflows reference an address book.
- To offer contacts from Google, Microsoft or Zoho, add the contacts scope to your OAuth app: `https://www.googleapis.com/auth/contacts` (and enable the People API) for Google, `Contacts.ReadWrite` for Microsoft, `ZohoContacts.contactapi.ALL` for Zoho. Accounts already connected ask for it when someone adds their address book.
- CardDAV servers are a new server list (Dashboard → System → CardDAV, `METIS_CARDDAV_SERVERS`). Like the other server lists, `bootstrap.sh` writes `METIS_CARDDAV_SERVERS` into `.env` when it is set in the shell you run it from; on an existing install, add it to `.env` yourself or use the dashboard.
- Contains a database migration that records when an MCP client's authorizations were last revoked and who saved each workflow revision.
- Workspace invites now work only for the account they were sent to, and the address in `METIS_OWNER_EMAIL` can no longer be invited or delete its own account. To hand over ownership, change `METIS_OWNER_EMAIL` first.

### Added

- Contacts: connect a Google, Outlook, Zoho or CardDAV address book to a workspace, choose which of its books the workspace sees, and browse, filter, create, edit and delete contacts in the new Contacts section (rail icon, `/p/`), with its own AI panel. Click anyone in an open email for a menu that opens or saves them as a contact, emails them, invites them or searches everything with them, or save a summary's Contact card to an address book; the Contact card's `.vcf` button is now **Download**. Compose suggestions and search list saved contacts first. Workspace search finds address books and their books (`type:addressbook`, `addressbook:`, `book:`) and contacts by phone, organization or job title, including contacts with no email, and a contact's card downloads it as a `.vcf`. The assistant and MCP clients read and write contacts behind the address book's AI switch: every assistant write waits for approval, and MCP contact writes stay off until turned on for the client. New workflow Contacts steps list, search, get, create, update and delete contacts as the workflow's creator. The `searchContacts` tool now searches saved contacts.

### Changed

- Workspace members moved to Settings → Members, which lists everyone; owners and admins invite and remove people, and the owner changes roles and transfers ownership. The separate Members page and member profiles are gone; a member chip in the assistant opens a member panel beside the chat.
- Dashboard: the Instance page's description names its **Mail cache** and **Proxies** sections too.
- Connecting a Google, Microsoft or Zoho account now ends on a confirmation page that names the Metis Suite account it goes into and the workspace to add it to; nothing is connected until you click **Connect**, and **Cancel** leaves the provider untouched. The workspace is filled in only when you started from inside the app.
- Sign-up invites are only ever delivered by email: when the email can't be sent, no invite is created and the link is no longer shown.
- Revoking an MCP client's authorizations now stops its access tokens on the next request instead of up to an hour later.
- Workflows: creating, editing, turning on or off and deleting a workflow is recorded in the workspace's Activity, noting when it runs as someone else or can add a Bcc. Run details and the Revisions sheet show who saved each revision, and the send toast lists any Bcc a workflow added to your message.
- Mail: email CSS is now parsed rather than pattern-matched, so escaped or commented-out image references are blocked or proxied like any other, and broken CSS a parser can't read is dropped.

### Fixed

- A mailbox, calendar, drive or address book added with a server login now shows up in the lists right away, without reloading the page.
- With AI turned off for a mailbox, opening an email no longer shows "Couldn't summarize this thread."; the summary and the smart replies are left out instead.

### Security

- The Zoho connect callback accepts only Zoho's own accounts servers, so the instance's Zoho client secret can no longer be sent to another host.
- A workspace member can no longer list the names of drive folders hidden from them.
- The assistant, workflow agents and MCP clients can no longer run phishing analysis on a mailbox whose phishing detection is turned off.
- A webhook body can no longer make a workflow load a mail message by id.
