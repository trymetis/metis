# Cast and case catalog

The people, companies, names and seeded cases of the e2e stack, and the recorded scenarios each one feeds. The docs and www screenshots come from this stack, so everything in it reads as a real account: no `harness`, `Harness`, `test`, `Acme`, `e2e` or `example` in anything a screen shows.
Paths are from `e2e/`. The names live in `lib/cast.ts`; the seed in `seed/mailbox/`, `seed/calendar-events.ts` and `seed/drive-files.ts`. See also `README.md` (the stack and its seed data) and `E2E_MISSES.md` (what e2e does not cover).

## Rules

- **The cast is frozen.** The owner's address is in every chat's system prompt and in the classifier prompt, so renaming the owner re-records every chat.
- **Every seeded case exercises a stated behavior and feeds the scenarios listed for its area.** A case without a new behavior is not added.
- **New cases are dated older than the existing ones**, so the first inbox page, its classify batches and the agent's recent-items lists stay unchanged.
  - `mailbox()` refuses any message dated on or after the six anchor messages (21 September 2026).
- **Outside companies are fictional brands on realistic domains.** No real brand appears.
- **Nothing in realistic mail is fetched.** Newsletter images are inline (`cid:`) and tracker pixels are stripped before render.
  - The one remote-content message, "This week at the shop", points every reference at `replay`'s `/pixel/*` on `localhost:8099`, where the privacy tests count hits; the tracker popover shows vendor names, never hosts.
- **Edge mail (`seed/edge/mail-cases.ts`) is dated before every realistic message and addressed to the owner.** Recordings run with `E2E_EDGE=1` and the screenshot stacks with `E2E_EDGE=0`, and both send the same classify batches for every realistic page.
  - Edge events stay in the seeded week: they exist to load the week view, and only edge stacks show them.
- **The test CA's key and `tls/generate.sh` are committed** with the certificates it signs, so a renamed host is one script run.

## Company and domain

- **Instance:** `demo.trymetis.email`, the Metis Cloud slug form `<slug>.trymetis.email`. The `demo` slug is reserved in the Metis Cloud console.
- **Company:** Fernhill Studio, a brand and design studio in Lisbon with a London desk, running a rebrand for Aozora Ceramics.
- **Timeline:** fixed dates from November 2024 to October 2026. The seeded week is 5 to 9 October 2026 (`DOCS_CLOCK` 2026-10-08T12:00:00Z). Edge mail is dated June 2024.

## People

| Role                             | Name and address                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Owner                            | `Ana Silva <ana@demo.trymetis.email>`                                                                                            |
| Member outside Ana's workspace   | `Cy Reyes <cy@demo.trymetis.email>`                                                                                              |
| Colleague, rebrand lead          | `Raj Mehta <raj@demo.trymetis.email>`                                                                                            |
| Studio teammates                 | `Tomás Ortega <tomas@demo.trymetis.email>`, `Priya Nair <priya@demo.trymetis.email>`, `Sam Okafor <sam@demo.trymetis.email>`     |
| Team mailing list                | `Fernhill Team <team@demo.trymetis.email>` (`List-Id`)                                                                           |
| Client contacts                  | `Lena Hoffmann <lena@kaltwasser-gmbh.de>`, `Kenji Watanabe <kenji@aozora-ceramics.jp>`, `Layla Haddad <layla@saffronandsage.ae>` |
| Venue contact (the late arrival) | `Mira Costa <mira@harbourhallvenues.com>`                                                                                        |

## Outside senders

| Sender                                                                                                                    | Used for                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Kestrel Supply Co. <news@kestrelsupply.com>`                                                                             | weekly newsletter, offers, trackers, every unsubscribe kind |
| `Konkan Bank <alerts@konkanbank.in>`                                                                                      | debit and credit alerts in INR, statements, a Hindi alert   |
| `Brightloom <orders@brightloom.com>`, `Swiftpost <tracking@swiftpost.com>`                                                | orders, and shipments in every state                        |
| `Codeyard <noreply@codeyard.dev>`                                                                                         | verification codes, sign-in alerts, builds and reviews      |
| `Northbeam Air <bookings@northbeamair.com>`, `Hotel Alfama <reservas@hotelalfama.pt>`, `Tavola <reservations@tavola.app>` | reservations and promotions                                 |
| `Ledgerline <billing@ledgerline.io>`, `Voltaro Energy <billing@voltaro.co.uk>`                                            | bills, payments, trials, renewals and login codes           |
| `Paperstack <share@paperstack.app>`                                                                                       | shared documents, sign-in links, monthly digests            |
| `Linkroom <no-reply@linkroom.app>`                                                                                        | meeting links, renewals, product news                       |

## Operator and stack names

| Thing                     | Name                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMAP and SMTP server      | `Fernhill Mail`                                                                                                                                                                                                                                                  |
| CalDAV server             | `Fernhill Calendar`                                                                                                                                                                                                                                              |
| S3, direct transfers      | `Studio Assets`                                                                                                                                                                                                                                                  |
| S3, relay transfers       | `Client Archive`                                                                                                                                                                                                                                                 |
| WebDAV                    | `Shared Files`                                                                                                                                                                                                                                                   |
| FTPS, explicit            | `Print Vendor`                                                                                                                                                                                                                                                   |
| FTP                       | `Legacy FTP`                                                                                                                                                                                                                                                     |
| FTPS, implicit            | `Print Vendor Backup`                                                                                                                                                                                                                                            |
| SFTP                      | `Build Server`                                                                                                                                                                                                                                                   |
| Cloudflare gateway        | `Fernhill Inbound`, domain `inbound.demo.trymetis.email`                                                                                                                                                                                                         |
| Resend gateway            | `Fernhill Updates`, domain `updates.demo.trymetis.email`                                                                                                                                                                                                         |
| System mail domain        | `notify.demo.trymetis.email`                                                                                                                                                                                                                                     |
| Mail Postfix drops        | `discard.demo.trymetis.email`, `kestrelsupply.com`                                                                                                                                                                                                               |
| `METIS_SOURCE_URL`        | `https://github.com/trymetis/metis`                                                                                                                                                                                                                              |
| Seeded MCP clients        | `Claude Desktop`, `Cursor`, `Codex`, `VS Code` (their presets); `Lumen`, `Hearth`, `Paperweight`, `Tandem`, `Mail triage`, `Label sync`, `Scheduling assistant`, `Studio wiki`, `Weekly report` (generic client), from `CLIENT_PROFILES` in `lib/mcp-clients.ts` |
| Model APIs                | `https://openrouter.ai/api/v1` and `https://api.typesafe.ai/v1`, answered by `replay` under those names                                                                                                                                                          |
| Outside MCP client (CIMD) | `Quillmate <name>`, hosts `mcp.quillmate.app` and `mcp-private.quillmate.app`                                                                                                                                                                                    |
| Message-IDs               | `<{base36 of the message's catalog key}@{sender's domain}>`                                                                                                                                                                                                      |
| Meeting links             | `https://linkroom.app/r/{room}`                                                                                                                                                                                                                                  |
| Approval chat folder      | `Final artwork`, inside `Team` on the WebDAV drive                                                                                                                                                                                                               |
| Calendars                 | `Work`, `Personal`; `Edge cases` and `Bulk` with `E2E_EDGE=1` only                                                                                                                                                                                               |
| Logins                    | `ana` on every server, S3 bucket `ana-files`, CalDAV stress user `bo`                                                                                                                                                                                            |
| Labels, pins, workflows   | `Clients`, `Rebrand` and the workflow names in `apps/web/scripts/e2e/generate/`                                                                                                                                                                                  |
| Edge mail and events      | `edge.test`, `links.edge.test`, `evil.invalid`, `tracker.invalid`                                                                                                                                                                                                |

The `*.localhost` service hosts (`imap.localhost`, `caldav.localhost`, `gateway.localhost`, `resend-gateway.localhost`, …) resolve to loopback on the host, where the suites outside Docker reach them.

## Mail cases

300 realistic messages, built by `mailbox()`. The summary card each case produces is in brackets.

| Folder  | Count | What it holds                                                                    |
| ------- | ----- | -------------------------------------------------------------------------------- |
| Inbox   | 132   | the newest 100 are page 1, the rest page 2; 21 unread                            |
| Archive | 89    | older threads, filed receipts, statements, past trips, team notes                |
| Sent    | 39    | Ana's replies and new mail, so threads span folders                              |
| Drafts  | 6     | unsent replies in English, German and Arabic, a forward with an XLSX, a new mail |
| Spam    | 12    | lures and unwanted bulk mail                                                     |
| Trash   | 22    | deleted newsletters, offers, promotions and old codes                            |
| Starred | 10    | flagged messages across Inbox and Archive                                        |

| Family                 | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Threads and recipients | the 10-message Aozora thread over weeks, renamed mid-way, spanning Inbox and Sent; Cc and multiple To; a forward chain (`Fwd: Fwd:`); Bcc in Sent; the Fernhill Team mailing list; an out-of-office auto-reply (`Auto-Submitted: auto-replied`); German `AW:` and Arabic `رد:` replies                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Card types             | codes, several per service [Otp, latest only]; sign-in and confirm links [ActionLink]; new-device and password-changed alerts [SecurityAlert]; invite, update and cancellation, with ICS [Meeting: new, updated, cancelled]; receipts [Order]; shipped, out for delivery, delivered, delayed [Shipment]; debits and a refund [Transaction]; invoices, bills and payments received [Bill]; trial ending and renewals [Subscription]; flight, schedule change, hotel, restaurant, a cancelled table [Reservation]; shared documents [SharedDocument]; coupons and sales [Offer]; newsletters and digests [Digest]; failed builds, review requests, merges [DevNotification]; introductions with contact details [Contact]; plain conversations [Summary] |
| Formats                | plain text only; HTML only; multipart with inline images; long HTML newsletters; quoted replies and signatures; schema.org `ParcelDelivery` markup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Marketing and privacy  | known-vendor tracker pixels (Klaviyo, Customer.io, Mailgun, SendGrid, Postmark); `utm_` links; one-click (`List-Unsubscribe-Post`), `mailto`-only, link-only and footer-only unsubscribes; an unsubscribe confirmation; the privacy-vector newsletter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Attachments            | PDF briefs, quotes, invoices and statements, PNG logos, JPG photos, DOCX offer, XLSX budgets, ICS invites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Languages and scripts  | Portuguese, German, Japanese, Arabic (right to left), Hindi (Devanagari); INR, EUR, JPY, AED, BRL, GBP and USD amounts; local date formats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Spam                   | credential phishing, a fake invoice with a PDF, lookalike domains, delivery and domain-renewal scams, bulk offers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| States                 | unread and read on every page; starred; answered; read later and one muted thread (from the recorder's world step)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Calendar cases

| Family         | Cases                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurrence     | the daily standup; the weekly 1:1 with one moved occurrence (`RECURRENCE-ID`) and one skipped (`EXDATE`); the monthly review (`BYDAY=1MO`)  |
| Shape          | all-day, multi-day (the offsite, Lisbon Design Week, the Tokyo trip), back-to-back, overlapping, a three-hour workshop                      |
| Time zones     | events created in `Europe/Lisbon`, `Europe/Berlin`, `Asia/Kolkata`, `America/New_York` and `Asia/Tokyo`                                     |
| People         | organized by Ana; organized by others with Ana invited; attendees accepted, declined, tentative and not answered                            |
| Status         | tentative; cancelled; private; with a location; with a Linkroom link                                                                        |
| Linked to mail | accepted invites have their events; the rebrand review (8 October 2026, 15:00 UTC) and the Tokyo packaging call stay invites until answered |

## Drive cases

| Path                                  | Holds                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `welcome.txt`                         | the drive's welcome note                                                                          |
| `Clients/Aozora Ceramics/Rebrand/`    | the brief (Markdown), moodboard (3-page PDF), logo options (PNG), wordmark (SVG), logo pack (zip) |
| `Clients/Aozora Ceramics/`            | the signed proposal (PDF)                                                                         |
| `Clients/Kaltwasser GmbH/`            | the offer (DOCX), pitch deck (PPTX, no preview), kickoff notes                                    |
| `Clients/Saffron & Sage/`             | a photo (JPG), the mark with an Arabic file name (SVG), a print proof (`.indd`, no preview)       |
| `Finance/2025/`                       | budget (XLSX), invoices (CSV), expenses (TSV)                                                     |
| `Team/`                               | meeting notes (Markdown), brand tokens (JSON), a voice memo (WAV), a Japanese-named PNG           |
| `Team/website/`, `Team/Offsite 2026/` | a `Dockerfile`, a site backup (`.tar.gz`, no preview), an offsite photo                           |

Every drive gets the same tree; S3 also holds the edge files under `edge/` with `E2E_EDGE=1`. The FTP drive's workspace sees only `Clients/`.

## MCP shots

The prompts in `apps/www/scripts/mcp-shots.ts` tell the rebrand story: Raj's "Rebrand kickoff", the "Rebrand review" invite, the hidden `Studio` workspace and the week of 5 October 2026.

## Recorded scenarios

| Scenario                                                              | Reads                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `mail:decision`, `mail:llm`                                           | inbox page 1 classify batches and summaries; `mail:decision` also classifies page 2; the owner in the classifier prompt |
| `mail:sent`, `mail:drafts`, `mail:archive`, `mail:spam`, `mail:trash` | each folder's first page: classify batches and summaries                                                                |
| `mail:gated`                                                          | the two edge messages the summary-gate test opens by search                                                             |
| `smart-replies`                                                       | inbox messages                                                                                                          |
| `chat:mailbox`, `chat:workspace:*`                                    | the owner in the system prompt; mail, calendar and drive content                                                        |
| `chat:calendar`                                                       | the owner; calendar events                                                                                              |
| `chat:drive:*`                                                        | the owner; drive files                                                                                                  |
| `workflows`, `mcp:*`, `late-arrival`                                  | inbox messages and the late arrival                                                                                     |
