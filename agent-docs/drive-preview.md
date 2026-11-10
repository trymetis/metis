# Drive file preview

The browser-only side pane that renders drive files: where it can work, how each kind is rendered without executing bytes, the size caps, and the OPFS byte cache.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [drive.md](drive.md), [drive-providers.md](drive-providers.md), [ai-agents.md](ai-agents.md), [shortcuts.md](shortcuts.md).

## Code map

| Concern                     | Where                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pane and renderers          | `src/components/drive-preview/drive-preview.tsx` → `DrivePreview` · `drive-preview-{image,media,markdown,table,zip,pdf,text}.tsx` (`media` serves video and audio) · `drive-preview-loading.tsx` → `DrivePreviewLoading` |
| Fetch, cap, cache, download | `src/components/drive-preview/use-drive-preview.ts` → `useDrivePreview`                                                                                                                                                  |
| Workers                     | `src/components/drive-preview/drive-csv-worker.ts` (papaparse, used by the table renderer) · `drive-pdf-worker.ts` (pdf.js, used by the PDF renderer)                                                                    |
| Kind detection and caps     | `src/drive/preview.ts` → `previewKind`, `PREVIEW_CAPS`                                                                                                                                                                   |
| Byte cache                  | `src/drive/preview-cache.ts` → `readCachedPreview`, `openPreviewCacheWriter`, `previewCacheKey`, `clearPreviewCache`                                                                                                     |
| Markdown sanitizer          | `src/lib/sanitize-html.ts` → `sanitizeHtml`                                                                                                                                                                              |
| Chips that open a file      | `src/components/agent/references/reference-provider.tsx` → `AgentReferenceProvider` · `src/components/assistant/assistant-chat.tsx`                                                                                      |

## Rules

- **Preview reads through the Download route.** It `fetch`es the same `/api/drive/download` URL the Download action uses, with default (`same-origin`) credentials, and follows its redirect ([drive.md](drive.md)).
- **The extension picks the renderer** (`previewKind`), and the bytes must confirm it: a media `error` event, the UTF-8 / NUL check (`decodeUtf8`), or the parser. The response `Content-Type` is ignored.
- **Bytes are only rendered by elements that cannot execute them.**
  - `<img>`, `<video>`, `<audio>` and text nodes.
  - A virtualized TanStack table, parsed by papaparse in a worker.
  - A zip entry list read from the central directory with `fflate`.
  - pdf.js drawing to `<canvas>` from bytes, in its own bundled worker.
- **Markdown is the one HTML output and always goes through `sanitizeHtml`**, the strict DOMPurify configuration: HTML profile only; no `style`, embeds, forms or `target`; links limited to `http(s)` and `mailto`.
- **A `blob:` URL is never navigated to, opened, framed or embedded**, because it inherits the app origin.
- **Size caps are checked against `entry.size` before the fetch**, with a counting read when the size is unknown (`PREVIEW_CAPS`).
- **pdf.js loads only in the browser**, through `next/dynamic` with `ssr: false`.
- **Cached bytes are fresh only while `modifiedAt` and `size` both match; an entry with `modifiedAt === null` is not cached.**
- **Every web sign-out path calls `clearPreviewCache`**; the desktop and mobile shells clear all site storage on their own sign-out ([desktop.md](desktop.md), [mobile.md](mobile.md)).

## How it works

- **Opening a file** (double-click, Enter, the drive `p` chord, the drive agent, or a `<@file:…>` chip in the workspace assistant's transcript) opens the shared side pane.
- **Pane Download** saves the same blob through `<a download>` with no second transfer.
- **Chips.** A chip is clickable only where its page passes `onOpen` to `AgentReferenceProvider` ([ai-agents.md](ai-agents.md)). The assistant resolves the chip's `driveId|fileId` to the workspace's drive slug and a fresh `drive.get` entry before opening the pane, so the same caps and cache freshness apply.
- **Grid thumbnails** (`src/components/drive/use-drive-thumbnail.ts` → `useDriveThumbnail`) read through the same Download route: an image up to 10 MB with a known `modifiedAt` is fetched once its tile nears the viewport, at most three at a time, shrunk to a 256px WebP and cached under its own key (`previewCacheKey` over the drive id and `thumbnail` plus the file id).
  - A drive whose download the browser cannot read (Google Drive) shows icons; its first failed fetch stops further tries for the session.
  - Thumbnail fetches count toward the `drive-download` rate limit.
- **Cache.** OPFS, LRU within `BUDGET_BYTES`, keyed by a hash of drive id + provider file id (`previewCacheKey`), so `/d/<slug>` and `/d/all` share an entry.

## Deliberate limits

- **Preview works only where the browser may read the bytes cross-origin**: relay drives, OneDrive, and S3 buckets whose CORS allows `GET` ([drive-providers.md](drive-providers.md)).
  - Google Drive, and any read the browser refuses (a bare `TypeError`, indistinguishable from a network error), fall back to Download + "Open in …".
