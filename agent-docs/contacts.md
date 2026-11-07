# Contacts

The address book resource, per-book visibility, `ContactsAdapter` and its Google / Microsoft / Zoho / CardDAV providers, the Contacts section, saving contacts from mail and the saved-contact index. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [calendar.md](calendar.md) (the resource this one copies), [connections.md](connections.md), [workspaces.md](workspaces.md), [servers.md](servers.md), [ai-agents.md](ai-agents.md), [search.md](search.md).

## Code map

| Concern                                                 | Where                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                                                  | `src/db/schema.ts` → `addressBook`, `addressBookWorkspace` (`visible_book_ids`, `ai_enabled`)                                                                                               |
| Store                                                   | `src/connections/address-book-store.ts` · account name `src/connections/address-book-name.ts` → `addressBookName`, `ADDRESS_BOOK_PROVIDER_LABELS`                                           |
| Session and middleware                                  | `src/contacts/session.ts` → `AddressBookSession`, `workspaceAddressBookAccounts` · `src/server/middlewares/address-book-session.ts` → `addressBookSession`                                  |
| Adapter interface + factory                             | `src/contacts/adapter.ts` → `ContactsAdapter`, `getContactsAdapter` · shared field helpers `src/contacts/fields.ts`                                                                         |
| Visibility and cross-account reads                      | `src/contacts/aggregate.ts` → `isBookVisible`, `listBooksAcross`, `listContactsAcross`, `getContactIn`, `lookupAcross`                                                                      |
| Providers                                               | `src/contacts/providers/` → `google.ts`, `microsoft.ts`, `zoho.ts` (+ `zoho-map.ts`), `carddav.ts` (+ `vcard.ts`)                                                                           |
| Books a connection offers (before attach)               | `src/contacts/available.ts` → `listProviderBooks`                                                                                                                                           |
| Saved-contact index and lookup                          | `src/contacts/lookup.ts` → `savedContactIndex`, `lookupSavedContacts` · cache `src/contacts/list-cache.ts`                                                                                  |
| vCard writing (provider writes and the Download button) | `src/contacts/vcard-write.ts` → `buildVCard` · `src/components/contacts/download-vcard.ts` → `downloadVcard`                                                                                |
| URL refs                                                | `src/contacts/refs.ts` → `packBookRef`, `packContactRef` · paths `src/workspace/path.ts` → `contactsPath`, `CONTACTS_SEGMENT`                                                               |
| Procedures                                              | `src/server/routes/contacts.ts`, `address-books.ts`, `workspace-address-books.ts`                                                                                                           |
| UI                                                      | `src/app/w/[slug]/p/` → `contacts-shell.tsx`, `contacts-context.tsx`, `contact-card.tsx`, `contact-dialog.tsx`, `contacts-agent-panel.tsx` · settings `src/app/w/[slug]/settings/contacts/` |
| Saving from mail                                        | `src/components/address-book-picker-dialog.tsx` · `src/components/contacts/use-save-contact.tsx`, `person-menu.tsx`                                                                         |
| Compose and search suggestions                          | `src/people/index.ts` → `suggestPeople`, `savedPeople` (neutral: imports `contacts/` and `mail/`)                                                                                           |
| Agent, MCP and workflow bodies                          | `src/ops/contacts.ts` · typed workflow values `src/ops/values.ts` → `listContactValues` … `deleteContactValue`                                                                              |

## Rules

- **An address book resource is an account; its books are folders.** Like a calendar, `address_book` is one row per connection and the books (CardDAV collections, Graph contact folders, the one Google or Zoho list) are enumerated live, never stored.
- **Book visibility is an app-level restriction, never isolation.** `address_book_workspace.visible_book_ids` lists the books a workspace sees; an empty list shows nothing, and a book added later stays hidden until someone turns it on.
- **Every read and write of an attached address book goes through `src/contacts/aggregate.ts`**, so a hidden book is invisible to the UI, the agents, MCP and workflows alike. `assertBookVisible` and `resolveAddressBookAccount` throw `NotVisibleError`, which oRPC answers with `NOT_FOUND`.
- **An address book is shown by its name, never its email alone** (`addressBookName`): a CardDAV account by its server's name, the others as the provider label and the email.
- **A contact without an email is allowed.** Email and Invite to event are disabled on its card; it is in the saved-contact index with an empty email, so search finds it, and the email lookups and compose suggestions skip it.
- **Groups are sidebar filters for Google (contact groups) and Zoho (categories) only.** Microsoft and CardDAV return no groups; the dialog's group picker appears only when the book has groups, and only Google writes it back.
- **Google writes run one at a time per account** (`serialized` in `src/contacts/fields.ts`), as the People API asks; an update re-reads the person for its `etag` first.
- **A CardDAV write sends the object's current ETag** (tsdav's `If-Match`), read just before the write, and keeps every vCard property it does not manage (`mergeVCard`), such as `PHOTO` and `UID`.
- **Only structured vCard values escape `;`.** `N`, `ADR` and `ORG` escape it per part; plain text values do not, because ical.js leaves `\;` in a text value as written.
- **Zoho Contacts keeps its own region probe** against `contacts.zoho.<dc>/api/v1/accounts/self/categories`, because a contacts-only grant has no mail or calendar scope for the other probes.
- **Route ids are packed refs, never stored.** `/w/[slug]/p/[addressbook]/[book]/[contact]` carries `packBookRef` and `packContactRef` (the reference-id packing in `src/ai/references.ts`), since book and contact ids can be URLs.
- **`mail/` and `contacts/` never import each other.** Compose suggestions and search go through `src/people/`, which lists saved contacts first, then workspace members (search only), then people from mail history.

## How it works

- **Landing.** `/w/[slug]/p` redirects to `/p/all/all` when the workspace has any address book, else shows the attach card.
- **The `all` view lists one row per contact per visible book**, merged across accounts and sorted by display name, each row carrying its book's name; a book row in the sidebar narrows the list to that book, a group row to that group.
- **The saved-contact index.** `savedContactIndex` lists every visible contact once per email (once with an empty email when it has none), with its book name, phones, organization and title, and caches it with the book lists (`address-book-lists:<workspace>`); any contact write and any visibility change forget both.
  - `contacts.lookup` answers the email view's person menus and the summary Contact card; `src/people` uses the same index.
- **Saving from mail.** Every person in an open email (the sender's avatar and name, each To and Cc name) opens a person menu (`src/components/contacts/person-menu.tsx` → `PersonMenu`): Open contact when the lookup finds them, else Add to contacts, plus Email, Invite to an event, Search everything with and Copy email. Add opens the address-book picker and creates the contact in the picked book, and the toast's Edit opens the contact with `?edit=1`; a saved sender gets a book badge on the avatar.
  - The thread-summary Contact card's Save contact does the same with the card's fields; its `.vcf` button is Download. The card schema is unchanged.
- **Download writes one `.vcf` through `buildVCard`**, the writer CardDAV saves with, on a contact's card and on the summary Contact card.
- **Agents.** The workspace agent and MCP reach `aiEnabled` address books through `WorkspaceCtx.addressBooks`; the Contacts section's own agent (`contactsAgent`, `/api/ai/contacts-chat`) runs on `ContactsCtx`, the page's accounts with AI on. Writes take approval ([ai-agents.md](ai-agents.md)).
- **Only CardDAV books can be read-only.** Google, Microsoft and Zoho list only the user's own books; `carddav.ts` → `isReadOnly` asks each book for `current-user-privilege-set`, because tsdav's `fetchAddressBooks` drops it.
  - A read-only book shows **Read-only**, is left out of every create picker and of `primaryBookId`, and its contacts' Edit and Delete are disabled; the first writable book is primary.
- **Workflows.** `contacts.list`, `contacts.search`, `contacts.get`, `contacts.create` (dispatch, reconciled by `createdContact`), `contacts.update` and `contacts.delete` take an `addressbook` param; there are no contact triggers ([workflow-graph.md](workflow-graph.md)).

## Deliberate limits

- **No `.vcf` import or bulk export, no photo upload, no Google "Other contacts", no LDAP or JMAP.** One contact downloads as a `.vcf` from its card.
- **No contact triggers in workflows**: no provider offers a cheap change feed for every book.
- **Zoho's category membership is read-only here**: the documented create and update calls take no categories, so a save leaves a Zoho contact's categories as they were.
