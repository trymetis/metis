---
name: user-docs-only
description: Enforce customer-facing scope and the plain style for any page written, edited, or reviewed under apps/docs/content. Use whenever generating, editing, or reviewing .md/.mdx pages in the Metis Suite docs site (apps/docs).
---

# user-docs-only

Every page under `apps/docs/content/` is public. It is read by customers who have no access to the code, the team or its plans. Nothing internal may reach a page.

## Never publish

- Code symbols, file paths, module, table, queue or service names, and internal driver names
- Anything from `E2E_MISSES.md`, or `TODO` / `FIXME` / `HACK` notes
- Planned, unbuilt or unreleased work, including Metis Cloud
- Test fixtures and their cast (`demo.trymetis.email`, `Fernhill Studio`, recorded model data) in prose
- Employee names, ticket numbers, private repository links or chat channels
- How a security control works inside (key formats, encryption layout, network guards). Describe what the customer sees and can rely on.

Self-hosting pages may name the environment variables, settings and commands an operator sets or runs. They describe what each one does, not how the code reads it.

If a fact would need any of the above, describe the visible behavior instead, or leave it out and tell the user.

## Style

- **Write for the customer.** Address the reader as "you". Never write as if to a teammate.
- **Simple English.** Short sentences, common words, one idea per sentence.
- **No emojis.** None, anywhere, including headings and callouts.
- **No em dashes or en dashes** (the characters U+2014 and U+2013). Use a period, a comma, a colon or parentheses.
- **UI labels in bold**, exactly as on screen. Messages the app shows go in quotes.
- **No inline colors or HTML styling.** The site theme is blue; callouts and cards inherit it.

## Stay inside Blume's real schema

- `.md` for prose; `.mdx` only when the page uses a built-in component or a `:::` callout (callouts are MDX-only and show as literal text in `.md`). Components need no imports.
- Frontmatter is limited to Blume's documented schema (`title`, `description`, `type`, `date`, `authors`, `slug`, `draft`, `lastModified`, and the `sidebar` / `seo` / `search` / `changelog` objects). Reference: `node_modules/blume/docs/reference/frontmatter.mdx`.
- Never write outside `apps/docs/content/` and `apps/docs/public/images/`; never reorder or rename pages without updating the folder's `meta.ts`.
- Run `bun run validate` before calling a page done.
