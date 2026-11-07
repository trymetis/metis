# Drive — files as the third connected resource

How drives are stored and linked, how file bytes move (provider-direct or through the relay), how routes reach a drive through one surface, and how root visibility is enforced.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [drive-providers.md](drive-providers.md), [drive-preview.md](drive-preview.md), [ai-agents.md](ai-agents.md), [connections.md](connections.md), [servers.md](servers.md), [search.md](search.md), [shortcuts.md](shortcuts.md).

## Code map

| Concern                                                       | Where                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter interface + factory                                   | `src/drive/adapter.ts` → `DriveAdapter`, `DriveChangeSignal`, `getDriveAdapter` · wire types `src/types/drive.ts` → `DriveDownloadTarget`                                                               |
| Providers                                                     | `src/drive/providers/google.ts` → `googleDrive` · `src/drive/providers/microsoft.ts` → `microsoftDrive` · S3, WebDAV, FTP, SFTP in [drive-providers.md](drive-providers.md)                             |
| Surfaces, composite ids, root walk                            | `src/drive/aggregate.ts` → `DriveSurface`, `ResolvedDrive`, `compositeDriveId`, `isRootVisible`, `DriveNotVisibleError`                                                                                 |
| Drive names                                                   | `src/drive/name.ts` → `driveName`, `DRIVE_PROVIDER_LABELS` (also the labels `provider-meta.tsx` shows)                                                                                                  |
| Session                                                       | `src/drive/session.ts` → `DriveSession` · middleware `src/server/middlewares/drive-session.ts`                                                                                                          |
| Slugs                                                         | `src/drive/slug.ts` → `uniqueDriveSlug`                                                                                                                                                                 |
| Stores and tables                                             | `src/connections/drive-store.ts` · `src/db/schema.ts` → `drive`, `driveWorkspace`, `drivePin`                                                                                                           |
| Procedures                                                    | `src/server/routes/drive.ts` (files, pins) · `src/server/routes/drives.ts` (account-level) · `src/server/routes/workspace-drives.ts` (links)                                                            |
| Pins and quotas                                               | `src/drive/pins.ts` → `listDrivePins`, `pinDriveFolder`, `unpinDriveFolder` · `src/drive/quota.ts` → `driveQuotas`                                                                                      |
| Download route                                                | `src/app/api/drive/download/route.ts` → `GET` · browser side (check, then follow) `src/components/drive-preview/use-drive-preview.ts` → `downloadDriveFile`, `driveDownloadUrl`                         |
| Relay endpoint (SigV4)                                        | `src/app/api/drive/relay/[...path]/route.ts` → `GET`, `PUT`                                                                                                                                             |
| Relay signing                                                 | `src/drive/relay-signature.ts` → `presignRelayUrl`, `verifyRelayRequest` · `src/drive/relay.ts` → `relayDownloadTarget`, `relayUploadSession`                                                           |
| Relay caps and streams                                        | `src/drive/relay.ts` → `relayMaxBytes`, `relayStream`, `acquireRelaySlot`, `DOWNLOAD_EXPIRY_SEC`, `UPLOAD_EXPIRY_SEC`                                                                                   |
| Browser upload                                                | `src/drive/upload-client.ts` → `uploadToDrive`                                                                                                                                                          |
| Provider error status                                         | `src/lib/errors/provider-error.ts` → `statusOf`, `failureStatus` · `src/lib/errors/sanitize-error.ts` → `sanitizeError`                                                                                 |
| Explorer UI                                                   | `src/app/w/[slug]/d/` · `src/components/drive/` (`drive-shell.tsx`, `use-drive-upload.ts`) · keys and the back/forward stack in [shortcuts.md](shortcuts.md)                                            |
| Pick a drive for a write                                      | `src/components/drive-picker-dialog.tsx` → `DrivePickerDialog`                                                                                                                                          |
| File icons                                                    | `scripts/update-drive-icons.ts` (`icons:drive`) → `public/drive-icons/{mocha,latte}/`, `src/drive/icons.ts` · `src/drive/icon.ts` → `driveFileIconName` · `src/components/drive-icon.tsx` → `DriveIcon` |
| Mail↔drive seam                                               | `src/app/w/[slug]/m/[mailbox]/[folder]/_components/email-detail.tsx` (save attachment) · `src/app/w/[slug]/m/[mailbox]/_components/compose-dialog.tsx` (attach from drive)                              |
| MIME guesses                                                  | `src/drive/mime.ts` → `mimeFromName`                                                                                                                                                                    |
| Workspace search over files                                   | `DriveSurface.searchAst` · `src/drive/search.ts` → `searchFiles` ([search.md](search.md))                                                                                                               |
| Opening a preview, an upload or a new folder after navigating | `src/drive/pending-open.ts` → `stashDrivePreview`, `stashDriveAction` (read by `DriveShell`, [search.md](search.md))                                                                                    |

## Rules

### The resource

- **A drive is a peer of a mailbox and a calendar.** Anything that handles one resource kind (menus, gates, counts, policy, copy) handles all four ([contacts.md](contacts.md)).
- **Google Drive and OneDrive hang off the same `connection` row as the account's mail and calendar**, through its existing OAuth flow and redirect URI ([connections.md](connections.md)).
  - Scopes are Google `…/auth/drive` and Microsoft `Files.ReadWrite` (not `.All`); Zoho has no drive.
- **`drive`, `drive_workspace` and `drive_pin` mirror the mailbox and calendar tables**, and `drive-store.ts` mirrors their stores, quarantine filter included ([workspaces.md](workspaces.md)).
- **A drive reaches the drive chat, the workspace agent and MCP only while its link's `ai_enabled` is on** (default off), set through `drives.setPolicy` / `setPolicyEverywhere` like mailboxes and calendars.
- **Pins are personal and belong to the drive.**
  - `drive_pin` is keyed user × drive × folder with a foreign key to `drive.id`, so pins follow the drive into every workspace that links it.
  - They are deleted only with the drive or the user.
  - `drive.pins` returns only pins for drives in the current session.

### Direct transfers

- **Google Drive, OneDrive and S3 `direct` entries move every file byte between the browser and the provider.** Downloads are a `302` to the provider's own link; uploads are a browser PUT straight to the provider.
- **A Google download depends on the viewer's Google browser session**, because `webContentLink` / `exportLinks` are usable only there.
  - `authuser=<account email>` picks the right account in a multi-account browser.
  - `exportLinks` avoid the API's 10 MB `files.export` cap.
- **Browser uploads to the provider carry no `Authorization` header** (Google's documented resumable flow omits it). Google takes chunks in multiples of 256 KiB and Graph in multiples of 320 KiB; S3 takes one presigned PUT.
- **The server opens a Google resumable session with `Origin: <config.auth.url origin>`** (`createUploadSession`), because Google adds CORS headers to the session URI only when the opening request names an origin.
  - So a browser upload from any other origin than `BETTER_AUTH_URL`'s (a preview deployment's URL, for example) is blocked by CORS.
- **A failed browser PUT surfaces as a readable error naming the file** (`src/drive/upload-client.ts` → `put`), because the bytes never reach the server and its logs cannot show the failure; `useDriveUpload` clears the progress readout whether `beginUpload` or the PUT fails.
- **OneDrive folder listings sort by `name` and put folders first within each page** (`listFolder` → `foldersFirst`). Graph's `$orderby` takes only single-value properties and `folder` is a facet, so a folder of more than 200 items can show a folder on a later page after files.
- **Google `files.list` sends `orderBy` only without a `fullText` term.** Google refuses sorting on full-text queries with a 403, so text search (`search`, and `searchAst` when `q` has `fullText contains`) returns Google's relevance order.
- **A provider refusal keeps the provider's 4xx; anything between Metis and the provider is 502.**
  - `failureStatus` passes a 4xx through (a missing file is 404, read through `statusOf`, the status `sanitizeError` words its message from).
  - It maps a provider 401 or 407, any 5xx and any error without a status to 502, because those are not the viewer's fault.

### The relay

- **WebDAV, FTP, SFTP and S3 `relay` entries stream through the server: the relay.**
  - A browser cannot send the `Authorization` header WebDAV needs (a `302` cannot carry it) and cannot speak FTP or SSH.
  - An S3 entry opts in when its endpoint is unreachable from browsers, needs `allowInsecureTls`, cannot take a CORS rule, or should not be exposed.
- **The relay speaks S3's SigV4 presigned-URL protocol, so relay drives look exactly like S3 `direct` to everything above the adapter.** Their `getDownloadTarget` returns `redirect` to a presigned GET and `createUploadSession` returns `presigned-put`, both signed for the adapter's `RelayScope` (`{ userId, driveId }`).
- **Google Drive and OneDrive throw `relayUnsupported` from `readStream` and `writeStream`; S3 refuses both on a `direct` entry.**
- **The relay endpoint authorizes by signature alone.**
  - Session, workspace, visibility (`assertVisible`) and policy checks run when the URL is signed.
  - `/api/drive/relay/*` is outside `proxy` and verifies `X-Amz-*` with `verifyRelayRequest`.
  - A URL stays valid until it expires (`DOWNLOAD_EXPIRY_SEC`, `UPLOAD_EXPIRY_SEC`).
- **Signing is the AWS SDK's own `S3RequestPresigner`, used both to sign and to re-sign for verification** (`relay-signature.ts`).
  - The access key id is the user id; its secret is derived from `METIS_DRIVE_RELAY_SECRET` and the user id.
  - URLs are path-style `/api/drive/relay/<driveId>/<key>`; a PUT's key is the file name and its folder is the signed `parent` query parameter.
- **The canonical request is rebuilt from `BETTER_AUTH_URL` and the decoded path re-escaped, never the incoming `Host`**, so a reverse proxy that rewrites the host or the escaping does not break verification.
- **The relay caps are database-backed and read per transfer** (`relayMaxBytes()`, `getInstanceConfig().relay.relayConcurrency`, [configuration.md](configuration.md)). Shrinking the concurrency below the slots in use only stops new transfers.
- **The relay size cap cannot be bypassed.**
  - A known size over the maximum makes the download target `unavailable` at signing.
  - At transfer it is refused up front from the stream's size or `Content-Length`, and counted again while streaming (`relayStream`), so a missing or lying header does not help.
- **The relay concurrency cap is per user per process** (`acquireRelaySlot`, an in-memory counter); every slot is released on finish, error or client abort.
  - Signing a download only checks that a slot is free, so the explorer's pre-check can toast instead of navigating to a 429.
- **Every early refusal of a relay PUT answers `Connection: close`** (`refuse`, `closing`): a response sent before the request body is read leaves the keep-alive connection unusable, and a reverse proxy that reuses it turns the next request into a 502.
- **A failed relay upload leaves nothing behind** ([drive-providers.md](drive-providers.md) has each provider's cleanup).
- **Relay drives need a long-lived process**, because the slot counter lives in memory and transfers stream through it.

### Surfaces and visibility

- **The optional `DriveAdapter.changes` says only whether a folder changed since a token**, for workflow feeds ([workflow-graph.md](workflow-graph.md)): Google changes from a start page token and Graph's drive delta, each filtered to the folder's direct children; S3, WebDAV, FTP and SFTP leave it out.
- **Routes touch `DriveSurface`, never `DriveAdapter`, except the relay route.**
  - `DriveSession` carries a ready-built `surface`, as `MailSession` carries an adapter, so the `drive.*` procedures have no `isAggregate` branch.
  - The relay route holds a signature, not a session, so it builds the adapter from the drive id and calls `readStream` / `writeStream` directly.
  - `workspaceDrives.roots` builds the adapter too, because it lists every top-level folder unfiltered for the visibility picker; it carries the same owner, admin or drive-owner check as `workspaceDrives.setVisibility`, so a member never sees the names of hidden roots.
- **Composite ids `<driveId>:<providerFileId>` are produced only by the aggregate surface**, and a cross-drive `move` is refused.
- **`visible_root_ids` is an app-level restriction, never provider isolation**: the token still reads the whole drive, so describe it as a product guarantee only. Empty means no restriction.
- **Every read except a root listing, and every write, checks the entry's top-level ancestor.**
  - Root listings filter cheaply.
  - **Path-addressed providers answer the top ancestor from the id, with no request** (`DriveAdapter.topAncestor`, `topOfPath` in `src/drive/path-ids.ts`): S3 takes the first segment after the connection's prefix, WebDAV, FTP and SFTP the first segment of the root-relative path. A `HeadObject` per search result would be billed and throttled.
  - Google and Graph walk `parentId` to the top instead (`topAncestor` in `aggregate.ts`, memoized per scope, capped at `MAX_DEPTH`), reading `adapter.getEntry(...).parentId`; `visibleOnly` starts each search result's walk from the `parentId` it already carries, so the result itself is never fetched again.
  - S3's walk would stop at the connection's prefix (`p/`) rather than the top-level folder (`p/a/`), because a root child's `parentId` is the prefix; deriving the top from the key is what makes restrictions work on a prefixed bucket.
- **A file hidden by a root restriction is a 404 reading "We couldn't find that."**, on download and on every `drive.*` procedure, so the answer does not reveal that the file exists.
  - `assertVisible` throws `DriveNotVisibleError`, a `NotVisibleError` whose `clientMessage` is that text; `/api/drive/download` and `base` ([orpc.md](orpc.md)) both answer with it.
  - Agent tools word it through `sanitizeError`, which returns a `NotVisibleError`'s `clientMessage` before anything else, so the agent reads "We couldn't find that." too, never a retry hint.
- **A search result whose visibility check fails is dropped and the failure is reported as a `driveErrors` entry**, never swallowed (`visibleOnly`), so a throttled or failing provider shows up as a partial search, not a short one.
  - A 404 during the walk means the entry vanished after the search returned it, so it is dropped with no error.
  - The drive page shows a notice naming the drives that failed, the search dialog lists them, and the agent and MCP drive searches (one drive, all drives, a member's drives) return them as `errors`.
  - Workflows read drives through a strict surface (`src/ops/values.ts` → `surfaceOf`, `driveSurfaceFor(drive, { strictVisibility: true })`) that throws the provider's own error instead, so the step fails and is retried with its real reason rather than emitting a partial list.

### UI

- **A drive is shown by its name, never its account email** (`src/drive/name.ts` → `driveName`): a server drive by its server's name, Google Drive and OneDrive as "Google Drive · <email>". A server drive's email is the Metis user's own address, the same on every server drive.
  - Server names are unique only per provider, so two server drives sharing a name both add their provider label; the same server connected twice keeps one name, since its bucket or remote user lives only in the sealed credentials.
  - The `/d/all` roots, the breadcrumb (so the Drive AI `folderPath`), the page title and the `/d/all` pin rows use it too; the switcher and settings lists keep the account identity with the provider and server line.

- **The delete dialog promises a trash only for Google Drive and OneDrive** (`drive-shell.tsx` → `hasTrash`); for the other drives it says the delete is permanent.
- **The Drive AI panel mounts only after the drive list has loaded** (`drive-shell.tsx`), because each turn's `folderPath` starts with the root crumb: the drive's name, or "All drives" on `/d/all`. Before the list arrives the crumb is the placeholder "Drive".
- **Wherever drives are listed side by side, each shows its drive name**, because one account often has several drives: the drive pickers (`drive-picker-dialog.tsx`), the `@` picker (`src/ai/reference-directory.ts`, whose labels reach the model in the reference legend), search hits and `drive:` suggestions, and the workflow resource pickers and step cards (the workflow directory's `name`).
- **"Link a file from Drive" is offered only for drives with provider share links** (`SHARE_LINK_PROVIDERS`: Google Drive and OneDrive). Self-hosted drives return `webUrl: null`, so compose hides the button when no such drive is linked and the picker lists only those drives.
- **File type icons are generated, never hand-written.** `icons:drive` keeps a curated allowlist from `catppuccin/vscode-icons` and throws if an allowlisted icon vanished upstream; attribution is in the repository-root `NOTICE`.

## How it works

- **Download.** `GET /api/drive/download?w&d&id` resolves the session, rate-limits per user, and asks `surface.getDownloadTarget`:
  - `redirect` → `302` to the provider link (Google, Graph `@microsoft.graph.downloadUrl`, S3 presigned GET, relay presigned GET);
  - `unavailable` → 409 with a reason and the provider's `webUrl` (a folder, a Google file with no download or export link, or a relay file over the cap or with no free slot).
- **Check before transfer.** The explorer first fetches the download route with `redirect: "manual"`; the route never opens a transfer, so an error surfaces as a toast before the browser navigates.
- **Relay download.** The relay route's `GET` verifies the signature, rate-limits, takes a slot, builds the adapter from the drive id (`getDriveById`, `resolveConnectionAuth`, so a quarantined drive gets nothing) and pipes `adapter.readStream` back with an RFC 5987 `Content-Disposition`.
- **Upload.** `drive.beginUpload` returns the adapter's upload session unchanged: resumable for Google and Graph, a presigned PUT for S3 and relay drives. The relay route's `PUT` verifies the signature and streams the body into `adapter.writeStream`.
- **Aggregate drive.** `/d/all` lists one synthetic folder per drive (id `<driveId>:`); below it everything is inside exactly one adapter. The root of `/d/all` has no folder to write into, so writes go through `DrivePickerDialog` first.
- **Explorer paths.** `/w/[slug]/d/[drive]/[[...path]]` segments are the ancestor folder id trail, so breadcrumbs survive a cold deep link.
- **Icon theming.** `<DriveIcon>` sets two CSS custom properties and `.dark .drive-icon` swaps them, so theming costs no JavaScript and the unused flavor is never fetched.
- **Mail↔drive.** Save-attachment-to-drive downloads through the existing mail procedure and then PUTs browser-direct (`uploadToDrive`); attach-from-drive inserts the provider link.

## Deliberate limits

- **The `@` picker sees only drives with AI on**, so a drive whose same-named drive of another type has AI off shows there without the type it carries everywhere else.
- **No attach-as-copy and no oversize-attachment-to-link.** Both need the browser to read provider bytes cross-origin, which only S3 reliably allows.
