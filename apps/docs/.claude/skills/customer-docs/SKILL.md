---
name: customer-docs
description: Who reads each part of the Metis Suite docs (apps/docs/content), which technical terms each page can carry, what gets documented at all, what never reaches a page, the style, and how to brief the docs-feature-finder, docs-writer and docs-verifier. Use before briefing those agents, and whenever writing, editing or reviewing a page under apps/docs/content.
---

# customer-docs

Every page under `apps/docs/content/` is public. It is read by people who have no access to the code, the team or its plans. Paths below are relative to `apps/docs/content/`.

## Audience levels

Every page has one audience level. It decides which technical terms and which behavior the page can carry.

**The test for every level: a reader gets every effect they can run into, and never the mechanism behind it.**

- **An effect is anything the reader meets:** a screen, a label, a message, a limit, a wait, a default, what is kept and for how long, what is lost and when.
- **The mechanism is how the effect is produced:** how a limit is counted, what a cache holds and how it is laid out, the order of checks, what the server does to produce the effect. It stays out even in plain words.
- **A word belongs on a page when its reader sees it on screen or types it.**

### User Guide, plain

- **Pages:** every page under `guide/` that the two lists below do not name.
- **Reader:** a person who uses mail, calendar, drive, contacts and the assistant. Not technical.
- **Terms:** only the words the screen shows.
- **Behavior:** every effect the reader runs into, never the mechanism.
- **Every limit the reader can hit gets its value** (or its default when an administrator can change it), **the exact message or error, what to do, and when to try again.**
- **Delays the reader notices get their usual length**, such as how long new mail takes to show.
- **What is kept, deleted or cleared gets how long and by what**, such as trash, run history or signing out.
- **Data left on the device:** what kind of data stays (for example names and lists, never message contents) and what clears it. Never an item-by-item list of it or how it is refreshed.
- **Settings the reader cannot change:** give the default value and say the instance owner or an administrator can change it. Never name the setting or variable.

### User Guide, setup

- **Pages:** `guide/01-get-started/03-connect-your-first-mailbox.mdx`, `guide/08-workspaces/04-connect-an-account.mdx`, `guide/08-workspaces/07-fix-an-account.md`, `guide/04-drive/10-add-a-drive.md`, `guide/04-drive/11-drive-types.md`, `guide/05-contacts/05-add-an-address-book.md`, `guide/05-contacts/07-address-book-types.md`, `guide/11-reference/02-supported-providers.md`.
- **Reader:** the same person, connecting their own account.
- **Terms:** what they type or pick in a form or on their provider's site: protocol names (IMAP, CalDAV, CardDAV, WebDAV, SFTP, S3), server address, port, username, app password, bucket.
- **Behavior:** as for plain pages.

### User Guide, power user

- **Pages:** everything under `guide/07-workflows/`, `guide/06-assistant/07-connect-an-ai-client.mdx`, `guide/06-assistant/08-manage-mcp-clients.mdx`, `guide/06-assistant/09-what-an-mcp-client-can-do.md`, `guide/11-reference/04-search-syntax.md`, `guide/12-search/02-narrow-a-search.mdx`.
- **Reader:** a user who builds workflows, writes search queries or connects an AI app.
- **Terms:** the syntax, URLs, expressions, tokens and fields they write, paste or read in the app.
- **Behavior:** what their workflow, query or AI app does, its limits, and what it is refused. Never how the server runs it.

### Self-Hosting Guide

- **Pages:** everything under `self-hosting/`.
- **Reader:** an operator who installs and runs a server, at home in a terminal.
- **Terms:** Docker, DNS, TLS, reverse proxies, S3, SMTP, environment variables, config keys, `metis` commands, and terminal output and error text word for word.
- **Behavior:** what the operator sets, runs, sees and has to plan for (memory, disk, ports, upgrades, backups).
- **Never:** code module, file, table or function names, internal log tags, or how a security control works inside.

### Metis Cloud

- **Pages:** everything under `cloud/`.
- **Reader:** a customer of the hosted service. Not an operator.
- **Terms and behavior:** only what the console shows. The rules are in "Metis Cloud pages" below.

**A page added, moved or renamed under the two User Guide lists above updates its list in the same change.**

## What gets documented

- **A change reaches the docs when it changes an effect a reader of that tab meets**, including a new or changed limit, wait, message, default or retention.
- **A change only to how things work underneath (a refactor, a faster query) gets no page and no sentence.**
- **When it is unclear whether a change is visible to readers, ask the user before briefing the agents.**
- **Each fact has one page.** Other pages link to it.

## Never publish

- Code symbols, file paths, module, table, queue or service names, and internal driver names
- Anything from `E2E_MISSES.md`, or `TODO` / `FIXME` / `HACK` notes
- Planned, unbuilt, unreleased or undecided work
- Test fixtures and their cast (`demo.trymetis.email`, `Fernhill Studio`, recorded model data) in prose
- Employee names, ticket numbers, private repository links or chat channels
- How a security control works inside (key formats, encryption layout, network guards). Describe what the reader sees and can rely on.

If a fact would need any of the above, describe the visible behavior instead, or leave it out and say so.

## Metis Cloud pages

The Metis Cloud tab (`cloud/`) is for customers of the hosted service: the console where they buy and manage instances, and what the owner of a Cloud instance sees inside it.

- **Only what the customer sees.** Never how the service runs behind the console, its suppliers beyond those the console names on screen, its costs, or timings the screen does not show.
- **Included AI credits appear as the console shows them**: a percentage used and a reset date, never an amount of money or tokens. The model list on the Billing tab changes, so a page points to it instead of copying it.
- **Prices appear once, on the plans page, exactly as the console shows them.** Every other page links there.
- **Cloud pages name no environment variables.** A value the console shows for the owner to type into the dashboard is quoted as shown.
- **An instance address is written as a concrete example**, such as `acme.metis-suite.app`.
- **Cloud pages say only what differs on Cloud.** For anything an instance does the same way everywhere, they link to the User Guide or the Self-Hosting Guide page instead of repeating it.
- **The Self-Hosting Guide mentions Metis Cloud only where Cloud changes a fact on that page**, such as a setting that exists only for Cloud instances, or how Cloud handles updates and backups. Never as an advert. The User Guide never mentions Metis Cloud.
- **Cloud pages have no screenshots yet.** Do not link images or add screenshot entries for them.

## Style

- **Write for the page's reader.** Address them as "you". Never write as if to a teammate.
- **Simple English.** Short sentences, common words, one idea per sentence.
- **Call a thing by its product name**, such as the Neutral theme. Never replace a name with a description of it.
- **No emojis.** None, anywhere, including headings and callouts.
- **No em dashes or en dashes** (the characters U+2014 and U+2013). Use a period, a comma, a colon or parentheses.
- **UI labels in bold**, exactly as on screen. Messages the app shows go in quotes.
- **No angle-bracket placeholders** such as a bracketed "name" or "email". Use a concrete example or plain words.
- **No inline colors or HTML styling.** Callouts and cards inherit the site theme.

## Stay inside Blume's real schema

- `.md` for prose; `.mdx` only when the page uses a built-in component or a `:::` callout (callouts are MDX-only and show as literal text in `.md`). Components need no imports.
- Frontmatter is limited to Blume's documented schema (`title`, `description`, `type`, `date`, `authors`, `slug`, `draft`, `lastModified`, and the `sidebar` / `seo` / `search` / `changelog` objects). Reference: `node_modules/blume/docs/reference/frontmatter.mdx`.
- Never write outside `apps/docs/content/` and `apps/docs/public/images/`; never reorder or rename pages without updating the folder's `meta.ts`.
- Run `bun run validate` before calling a page done.

## Briefing the docs agents

For the session that calls `docs-feature-finder`, `docs-writer` and `docs-verifier`. The agents read this skill themselves, so a brief carries only what is specific to the change.

- **Decide first whether the change gets docs at all** ("What gets documented" above), and which tabs and audience levels it touches.
- **The feature finder gets the change and the area**: the commit range or "the uncommitted changes", the paths that changed, the tabs and levels. Never your own list of facts, code symbols or proposed wording; it reads the code itself.
- **The writer gets the finder's report unchanged** (inline or as a file path) and the target pages. Never sentences to write, line numbers, punctuation fixes or rules from this skill.
- **The verifier gets the pages that changed.** Never a list of claims to check.
- **Verifier findings go to the writer unchanged**, then the verifier runs again on the same pages.
- **A Metis Cloud topic also names the sources for the console** in each agent's prompt.
- **A rule the agents keep missing is fixed in this skill or in their definitions**, never repeated in a prompt.
