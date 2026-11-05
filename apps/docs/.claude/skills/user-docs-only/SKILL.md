---
name: user-docs-only
description: Enforce customer-facing scope and the plain style for any page written, edited, or reviewed under apps/docs/content, including the Metis Cloud tab. Use whenever generating, editing, or reviewing .md/.mdx pages in the Metis Suite docs site (apps/docs).
---

# user-docs-only

Every page under `apps/docs/content/` is public. It is read by customers who have no access to the code, the team or its plans. Nothing internal may reach a page.

## Never publish

- Code symbols, file paths, module, table, queue or service names, and internal driver names
- Anything from `E2E_MISSES.md`, or `TODO` / `FIXME` / `HACK` notes
- Planned, unbuilt, unreleased or undecided work
- Test fixtures and their cast (`demo.trymetis.email`, `Fernhill Studio`, recorded model data) in prose
- Employee names, ticket numbers, private repository links or chat channels
- How a security control works inside (key formats, encryption layout, network guards). Describe what the customer sees and can rely on.

Self-hosting pages may name the environment variables, settings and commands an operator sets or runs. They describe what each one does, not how the code reads it.

If a fact would need any of the above, describe the visible behavior instead, or leave it out and tell the user.

## Metis Cloud pages

The Metis Cloud tab (`content/cloud/`) is for customers of the hosted service: the console where they buy and manage instances, and what the owner of a Cloud instance sees inside it.

- **Only what the customer sees.** Never how the service runs behind the console, its suppliers beyond those the console names on screen, its costs, or timings the screen does not show.
- **Included AI credits appear as the console shows them**: a percentage used and a reset date, never an amount of money or tokens. The model list on the Billing tab changes, so a page points to it instead of copying it.
- **Prices appear once, on the plans page, exactly as the console shows them.** Every other page links there.
- **Cloud pages name no environment variables.** A value the console shows for the owner to type into the dashboard is quoted as shown.
- **An instance address is written as a concrete example**, such as `acme.metis-suite.app`.
- **Cloud pages say only what differs on Cloud.** For anything an instance does the same way everywhere, they link to the User Guide or the Self-Hosting Guide page instead of repeating it.
- **The Self-Hosting Guide mentions Metis Cloud only where Cloud changes a fact on that page**, such as a setting that exists only for Cloud instances, or how Cloud handles updates and backups. Never as an advert. The User Guide never mentions Metis Cloud.
- **Cloud pages have no screenshots yet.** Do not link images or add screenshot entries for them.

## Style

- **Write for the customer.** Address the reader as "you". Never write as if to a teammate.
- **Simple English.** Short sentences, common words, one idea per sentence.
- **No emojis.** None, anywhere, including headings and callouts.
- **No em dashes or en dashes** (the characters U+2014 and U+2013). Use a period, a comma, a colon or parentheses.
- **UI labels in bold**, exactly as on screen. Messages the app shows go in quotes.
- **No angle-bracket placeholders** such as a bracketed "name" or "email". Use a concrete example or plain words.
- **No inline colors or HTML styling.** The site theme is blue; callouts and cards inherit it.

## Stay inside Blume's real schema

- `.md` for prose; `.mdx` only when the page uses a built-in component or a `:::` callout (callouts are MDX-only and show as literal text in `.md`). Components need no imports.
- Frontmatter is limited to Blume's documented schema (`title`, `description`, `type`, `date`, `authors`, `slug`, `draft`, `lastModified`, and the `sidebar` / `seo` / `search` / `changelog` objects). Reference: `node_modules/blume/docs/reference/frontmatter.mdx`.
- Never write outside `apps/docs/content/` and `apps/docs/public/images/`; never reorder or rename pages without updating the folder's `meta.ts`.
- Run `bun run validate` before calling a page done.
