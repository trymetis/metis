# Mail rendering and privacy

How a message body reaches the screen: the sandboxed frame, its per-message CSP, blocked remote content, tracker stripping, link cleaning and the optional image proxy.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [mail.md](mail.md), [mail-ai.md](mail-ai.md), [desktop.md](desktop.md), [mobile.md](mobile.md), [configuration.md](configuration.md).

## Code map

| Concern                                                   | Where                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sanitizer profile (frame)                                 | `src/lib/sanitize-html.ts` → `sanitizeEmailHtml(raw, visit)`                                                                                                                                                                                                   |
| Render pipeline (trackers, links, image modes, dark mode) | `src/mail/render/pipeline.ts` → `renderEmailHtml`, `cleanUrl`, `isAdaptive`                                                                                                                                                                                    |
| Frame document and CSP                                    | `src/mail/render/frame.ts` → `buildFrameDocument`, `frameContentSecurityPolicy`, `proxiedImageUrl`                                                                                                                                                             |
| Tracker matching and pixel heuristics                     | `src/mail/render/detect.ts` → `compileTrackers`, `matchVendor`, `isHiddenOrTiny`, `clickTracker`                                                                                                                                                               |
| Link unwrapping and parameter cleaning                    | `src/mail/render/links.ts` → `compileLinkRules`, `cleanLink`                                                                                                                                                                                                   |
| CSS `url()` / `image-set()`, `srcset`, dark-mode pinning  | `src/mail/render/urls.ts` → `mapCssUrls`, `parseSrcset`, `pinColorScheme`                                                                                                                                                                                      |
| Blocked-image placeholders                                | `src/mail/render/placeholder.ts` → `placeholderImage`, `declaredSize`, `BLOCKED_SRC_ATTR`                                                                                                                                                                      |
| Regex prefilter for the rule sets                         | `src/mail/render/literal-hint.ts` → `requiredLiteral`                                                                                                                                                                                                          |
| Generated rules                                           | `src/mail/render/trackers.ts` (MailTrackerBlocker) · `clearurls.ts` + `clearurls.LICENSE` (ClearURLs) · generator `scripts/update-privacy-rules.ts` (`privacy:rules`)                                                                                          |
| The frame                                                 | `src/components/email-frame.tsx` → `EmailFrame`                                                                                                                                                                                                                |
| Client state (rules, allow list, load once)               | `src/store/mail-privacy-store.ts` → `useMailPrivacyStore`, `remoteAllowQuery`, `isSenderAllowed` · `src/hooks/use-mail-privacy.ts` → `useMailPrivacy`, `useRenderedEmail` · rule compile `src/mail/render/rules.ts` → `compilePrivacyRules`, shared with print |
| Instance proxy flag                                       | `src/components/mail-privacy-context.tsx` → `MailImageProxyProvider`, mounted by `src/app/w/[slug]/m/[mailbox]/layout.tsx`                                                                                                                                     |
| Message view                                              | `src/app/w/[slug]/m/[mailbox]/[folder]/_components/message-content.tsx` → `MessageContent` · `tracker-badge.tsx` → `TrackerBadge` · `email-detail.tsx` → `ThreadMessageCard`                                                                                   |
| Print                                                     | `src/mail/pages/print.ts` → `printableMessage` · `print-page.tsx` → `printPage`, `PrintHeader` · route `src/app/w/[slug]/m/[mailbox]/print/route.ts`                                                                                                           |
| View original                                             | `src/mail/pages/original.ts` → `summarizeOriginal`, `authenticationResults`, `originalDownload` · `original-page.tsx` → `originalPage` · route `src/app/w/[slug]/m/[mailbox]/original/route.ts`                                                                |
| Standalone pages (shared)                                 | `src/mail/pages/render.ts` → `renderPage`, `renderMarkup`, `pagePolicy` · `page-document.tsx` → `PageDocument`, `errorPage` · `source.ts` → `readPageSource` · `styles.ts` → `PAGE_STYLE`                                                                      |
| Preferences and allow list                                | `user_prefs.mail_remote_content`, `user_prefs.mail_clean_links` · table `mailRemoteAllow` · `src/server/routes/user.ts` → `getPreferences`, `updatePreferences`, `listRemoteAllow`, `allowRemote`, `revokeRemote`                                              |
| Settings page                                             | `src/app/settings/privacy/`                                                                                                                                                                                                                                    |
| Image proxy                                               | `src/app/api/mail/image/route.ts` · `src/mail/render/image-type.ts` → `sniffImageType` · `src/lib/ssrf.ts` → `safeRequest` · switch `getInstanceConfig().imageProxy` (instance config, seeded from `METIS_MAIL_IMAGE_PROXY`, off by default)                   |
| Limits and defaults (sizes, timeouts, redirects, caps)    | the constants at the top of each file above · `src/config/schema.ts` → `imageProxySectionSchema`                                                                                                                                                               |

## Rules

### The frame

- **Every HTML body renders in `EmailFrame`, a `srcdoc` iframe; mail HTML never enters the app's DOM.**
  - The single message, each expanded thread message, the compose quote preview and the print page all build their document with `buildFrameDocument`.
  - Plain-text bodies render in-page as React text.
- **The iframe is the isolation boundary, the CSP the network boundary, DOMPurify the content filter; none is trusted alone.** A sanitizer miss must end as a CSP-blocked request.
- **`sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, never `allow-scripts`, `allow-forms` or `allow-top-navigation`.**
  - Same-origin exists only so the parent can measure the frame, read its CSP violations, forward keys and handle clicks; with scripts it would be an escape.
- **The CSP lives in a `<meta>` inside each document**, because a page-wide policy cannot differ per message and would block the app's own avatars.
  - Only `img-src` changes with the mode (`frameContentSecurityPolicy`); scripts, web fonts, stylesheets, media, frames and forms are refused in every mode.
- **The print page is the email document itself, served top-level, never a frame inside an app page.** Browsers do not split a tall iframe across printed pages, so a framed message is cut at the first page.
  - `GET …/print?id=` renders the raw message on the server with the same pipeline, pinned to light; the query carries the viewer's own choices (`images=shown`, `links=keep`, `tz`).
  - Its only script is a per-request nonce (`printNonce`, in the `<meta>` policy and the `script-src` header) that calls `print()` on `load`; email scripts and inline handlers stay blocked.
  - It stays same-origin with no `sandbox`, because proxied images need the session cookie, and `sandbox` with both `allow-scripts` and `allow-same-origin` isolates nothing.
- **Print and View original are links that open a new tab, never `window.open`**, so pop-up blockers never stop them and both shells keep them in-app.
  - Both pages are TSX components rendered to HTML on the server (`renderPage`), so React escapes every value; the sanitized email body is the only markup injected, by `buildFrameDocument`. Route handlers get only React's streaming renderer: `renderToString` and `renderToStaticMarkup` throw there.
  - The toolbar links turn off `Link` prefetch; a prefetch of a route handler would fetch the raw message from the provider on every open message.
  - View original (`GET …/original?id=`) is our own page around the escaped raw source: a summary with SPF, DKIM and DMARC from the topmost `Authentication-Results` header, **Download original** (`&download=1`, `message/rfc822`) and **Copy to clipboard**. Above `SHOWN_LIMIT` it shows the start and offers only the download.
  - The summary names the server that reported the results; a sender can forge that header when the receiving server adds none.
- **`meta` and `base` from the email must never survive the sanitizer.** A `meta refresh` navigates the frame (CSP does not cover navigation), and an email `base` would override ours.
- **Our `<base href="https://email.invalid/" target="_blank">` makes relative URLs resolve to a reserved, unresolvable host**, never to the instance with the viewer's cookies.

### Remote content

- **"Load" means images only.** Remote fonts, stylesheets, media and frames never load; web fonts fall back to the email's own stack.
  - Remote `@font-face` sources become `none`, `@import` is stripped, `<link>` is forbidden, and a `url(` left unclosed is cut so it cannot swallow the rest of the CSS into a request.
- **A blocked message requests nothing remote.** The pipeline swaps images for placeholders and CSS images for `none`; the CSP is the backstop.
- **Remote images are blocked by default for every user.** They load per message ("Load images" or a click on a placeholder), per sender address, per sender domain and its subdomains, or always (`mail_remote_content = "load"`).
- **Trust only ever unlocks images**, because a From header is spoofable.
- **Preferences and the allow list are per user.** Trusting a sender changes nothing another member sees.
- **The image proxy hides the device, not the open.** The sender still learns that and when the message was opened; the banner and settings copy say so.
- **The image proxy fetches through `safeRequest`** (as does the one-click unsubscribe, [mail.md](mail.md)).
  - It resolves once, rejects any answer in an RFC 6890 special-use range or an IPv4-mapped IPv6 address, connects to the validated address through a pinned undici `Agent`, and re-checks every redirect hop.

### Trackers and links

- **Known trackers are removed in every mode and from reply and forward quotes.**
  - A quote keeps legitimate remote image URLs (the recipient's client decides), never proxy URLs, and drops `<style>` so the quoted message cannot restyle the reply.
- **Wrapped links are unwrapped only when the destination is readable from the URL; the server never follows a tracking redirect.** Links that stay wrapped keep their `href` and get `data-tracked`; the sender's own `data-tracked` attributes are discarded.
- **Links are cleaned at sanitize time**, so middle-click, copy link and both shells see the cleaned URL. `mail_clean_links` turns it off; summary-card URLs go through the same `cleanUrl`.
- **The rules files are generated, never hand-edited.**
  - MailTrackerBlocker is pinned to a commit and ClearURLs is verified against its published sha256 in `update-privacy-rules.ts`, which throws below a vendor/provider floor so an upstream format change fails the run.
  - `mail-privacy-store.ts` loads the generated modules with a dynamic `import()`, so only mail pages pull them.

## How it works

- **Pipeline.** `renderEmailHtml` runs `sanitizeEmailHtml` with a per-element visitor (DOMPurify `afterSanitizeAttributes`, plus an `uponSanitizeAttribute` hook that drops every `on*`).
  - The visitor classifies every image reference: `img src/srcset`, `<picture><source>`, `background`, SVG `image`/`feImage`/`use`, any attribute containing `url(`, and `<style>` text.
  - `data:`/`cid:`/`blob:` are kept; relative URLs, same-origin URLs and trackers are dropped; the rest become a placeholder or `none` in `block`, stay as they are in `load`, and point at `/api/mail/image?u=<base64url>` in `proxy`.
  - The output depends on the mode and the theme, so `useRenderedEmail` re-runs it when either changes. It returns the HTML, the tracker hits, the remote image count and `adaptive`.
- **Counting.** The banner counts what the browser would fetch: one image per `srcset`, one per `<picture>`, one per distinct CSS URL. CSP violations seen in the frame after its `load` event are added on top, since they mean the pipeline missed something; the total is best effort.
- **Placeholders.** A blocked `<img>` gets an inline SVG `data:` image sized from its declared width and height (`declaredSize`), with an "image off" icon when it is large enough, and keeps the original URL in `data-metis-src`.
  - `EmailFrame` turns a click on one into "load images" for that message.
  - A `<picture>` whose sources were blocked marks itself the same way, so its fallback `<img>` gets the placeholder.
- **Trackers.** A URL matching a MailTrackerBlocker vendor pattern is removed (an `<img>` entirely; a `url()` becomes `none`). An `<img>` that is tiny or hidden, or sits on an open-like path without a declared size (`detect.ts`), counts as an unknown tracker unless it matches MailTrackerBlocker's spacer exceptions.
- **Links.** `cleanLink` unwraps ClearURLs redirections, Outlook Safe Links and Proofpoint v2, then applies each matching ClearURLs provider's rules (`links.ts`); providers that block a whole link are skipped, since a link cannot be cancelled.
  - A final URL that still matches a vendor rule or a generic click pattern (`clickTracker`) gets `data-tracked`.
  - Every link gets `target="_blank"` and `rel="noopener noreferrer"`; `#fragment` links stay in-frame and `EmailFrame` scrolls to the anchor.
- **Rule prefilter.** Each ClearURLs `urlPattern` and vendor pattern carries a `requiredLiteral` hint, the longest literal run every match must contain; a rule runs its regex only when the lower-cased URL contains it.
- **Frame document.** `<meta charset>`, the CSP, `<meta name="referrer" content="no-referrer">`, `x-dns-prefetch-control: off`, our `<base>`, a base stylesheet, then the email with its own `<style>` intact.
- **Dark mode follows the app theme, not the OS.** Inside a frame Chrome evaluates `prefers-color-scheme` against the browser's preference and ignores the iframe's `color-scheme`.
  - The pipeline pins every `(prefers-color-scheme: dark|light)` in the email's `<style>` to an always-true or always-false query for the app theme (`pinColorScheme`).
  - `isAdaptive` is true when the email declares dark support or sets no colors; such a document follows the app theme on a transparent background in the app's muted text color, like plain-text bodies.
  - Any other email stays light: its own white page inside the frame in the dark theme, a transparent background in the light theme.
  - The iframe element's `color-scheme` always equals the document's, so Chrome never paints its opaque mismatch backdrop.
  - Print renders the email again pinned to light, because the print page is always light.
- **`EmailFrame`.** It sets the built document as `srcdoc`; `MessageContent` keys it by message id.
  - Height follows a `ResizeObserver` from the frame's own window (plus image `load`/`error` and `document.fonts.ready`), so late images resize it.
  - `keydown` in the frame is re-dispatched on the app `window`, skipping editable targets, so `useChord` and `j`/`k` keep working after a click inside a message.
  - Hovering a link shows a status chip with its destination or "Tracked by …, destination unknown".
  - In development every CSP violation's directive and host is logged as `[email-frame]`.
- **Decision.** `useMailPrivacy().imagesFor(sender, messageId)` applies the blocking rule above; threads decide per message, since senders differ. Toggling rebuilds the frame document; nothing is refetched from the provider.
- **Shells.** Links open through `allow-popups-to-escape-sandbox`, and both shells send them to the system browser ([desktop.md](desktop.md), [mobile.md](mobile.md)).
  - Print and View original are same-origin links, so `decide()` keeps them in the shell's own window.
- **Image proxy.** `GET /api/mail/image?u=` sits behind the `/api/*` session and 2FA gate in `src/proxy.ts` and rate-limits per user.
  - It fetches with no cookies, no Referer and a generic user agent, follows a bounded number of redirects and buffers up to the stored `imageProxy.maxMb`, both read per request, so the dashboard switch is live.
  - It answers only PNG, JPEG, GIF, WebP or AVIF identified from the first bytes, with `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`; SVG and the upstream `Content-Type` are never trusted.

## Deliberate limits

- **Domain lists miss trackers served from a sender's own subdomain** (`trail.brand.com`); the pixel heuristics and the default block cover what the list misses.
- **No prefetch on arrival.** Fetching every image at delivery would hide the open time but cost bandwidth on every message and a workflow per mailbox.
- **Proofpoint v3 links are marked as wrapped, not decoded**: its decoder is a rate-limited API or GPL code.
- **`cid:` inline images are kept but do not resolve**, because attachments carry no content id.
- **Chrome sends the instance's origin as `Referer` for images loaded from CSS** (`style` attributes, `<style>`, `content`, `image-set`) in load mode without the proxy, whatever any referrer policy says ([Chromium issue 40898994](https://issues.chromium.org/issues/40898994), closed as Won't Fix).
  - Only the origin leaks, never the path; `<img>`, `srcset`, `background` and SVG images send none, blocked mode requests nothing, and the proxy keeps those requests on the instance.
- **Only `<style>` media queries are pinned to the app theme.** `light-dark()` follows `color-scheme` and is not rewritten.
- **Placeholder sizes are a guess when the email declares none**, so such images shift the layout when they load.
