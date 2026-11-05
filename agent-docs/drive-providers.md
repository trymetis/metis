# Drive providers — S3, WebDAV, FTP/FTPS and SFTP

The four credential drive adapters: what the operator configures versus what the user supplies, their id schemes, connection pooling, root confinement, and probe / connect-time verification. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [drive.md](drive.md), [servers.md](servers.md), [configuration.md](configuration.md).

## Code map

| Concern                 | Where                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Search listing cache    | `src/drive/search-cache.ts` → `cachedSearchListing`, `cachedFolderListing`, `afterSearchChange`                               |
| S3 adapter              | `src/drive/providers/s3/index.ts` → `s3Drive`, `SEARCH_MAX_PAGES`, `SEARCH_PAGE_RESULTS`                                      |
| S3 clients              | `src/drive/providers/s3/client.ts` → `s3Client`, `createS3Client`, `s3ErrorStatus`                                            |
| WebDAV adapter          | `src/drive/providers/webdav/index.ts` → `webdavDrive`                                                                         |
| FTP adapter and pool    | `src/drive/providers/ftp/index.ts` → `ftpDrive` · `src/drive/providers/ftp/pool.ts` → `acquireFtp`, `retireFtpServers`        |
| SFTP adapter and client | `src/drive/providers/sftp/index.ts` → `sftpDrive` · `src/drive/providers/sftp/client.ts` → `acquireSftp`, `retireSftpServers` |
| Shared FTP/SFTP pool    | `src/drive/connection-pool.ts` → `createConnectionPools`, `IDLE_MS`                                                           |
| Walk-search bounds      | `SEARCH_MAX_FOLDERS`, `SEARCH_MAX_DEPTH`, `SEARCH_MAX_RESULTS` in each of the WebDAV, FTP and SFTP adapters                   |
| Connection drivers      | `src/connections/drivers/{s3,webdav,ftp,sftp}.ts`                                                                             |
| Probes                  | `src/connections/verify-servers.ts` → `serverChecks`                                                                          |
| Bundler externals       | `next.config.ts` → `serverExternalPackages`                                                                                   |

## Rules

- **Search on S3, WebDAV, FTP and SFTP reuses its listings for 30 seconds through the cache driver** (`src/drive/search-cache.ts` → `cachedSearchListing`, `cachedFolderListing`, `afterSearchChange`), because the search box and the `@` picker re-run per keystroke pause and listing is the expensive request (R2's Class A on S3).
  - S3 caches the flat bucket pages its search scans (compact key, size and modified date per object, plus the next cursor), keyed by prefix and cursor in one hash per server and bucket; WebDAV, FTP and SFTP cache each folder their walk lists, keyed by login, root and folder in one hash per server.
  - Any write through the drive (upload, upload session, create folder, rename, move, delete) drops that whole hash, so overlapping prefixes, roots and logins stay in step, on every process when the cache driver is Redis or Upstash.
  - The hash gets its lifetime from its first stored listing (`hsetExpiring`), so nothing is older than 30 seconds; browsing (`listFolder` from the drive page) is never cached.

### S3

- **The operator holds the S3 keys; the user supplies only bucket + optional prefix.** Stored credentials are `{provider:"s3", server, bucket, prefix}`, a reference with no secret ([servers.md](servers.md)).
- **The key pair lives only in config and the module's clients.** `s3Client(serverId)` builds an `S3Client` on first use, caches it per entry, and rebuilds it when the entry's hash changes, so a running transfer keeps its old client.
- **Every S3 operation is an AWS SDK command**, and `s3ErrorStatus` maps SDK errors to `ProviderError` with the HTTP status.
- **`checksums` defaults to `required` because many S3-compatible servers reject SDK checksums.** It sets the SDK's `requestChecksumCalculation` / `responseChecksumValidation` (`s3/client.ts`); `supported` adds CRC checksums on AWS S3 and R2.
- **`allowInsecureTls` swaps in a `NodeHttpHandler` whose agent skips certificate verification.**
- **Listing cursors are `StartAfter` keys**, because continuation tokens are not portable across server processes (RustFS embeds a per-process id); a key cursor is deterministic and restart-safe on every S3-compatible server.
  - A page's cursor is its last key, or, when the page ends on a folder `P`, `P` + U+10FFFF (`PAST_PREFIX`) so the next page skips everything under it, compared in UTF-8 byte order as S3 sorts.
- **S3 search keeps listing until it has a page worth showing.** S3 has no name search, so `search` filters flat listings.
  - It stops at `SEARCH_PAGE_RESULTS` matches, the end of the bucket, or `SEARCH_MAX_PAGES` listings.
  - The cursor it returns resumes the scan, so a large bucket whose first listing holds no match still returns matches.
- **S3 search finds folders from the keys it scans.** A folder exists only as the prefix of its keys, so `search` matches every path segment of each key (`folderPrefixes`) as well as its file name.
  - Keys sort lexicographically, so all keys under a prefix are contiguous.
  - A folder is emitted only at the first key under it (the key before it, or the resume cursor, does not start with that prefix), which keeps one entry per folder across pages.
- **A direct-mode download is presigned with `ResponseContentDisposition: attachment`** (`contentDisposition`, shared with the relay), so a text file downloads instead of replacing the app; preview `fetch`es the same URL and ignores the header.
- **Every `fileId` and `parentId` must start with the configured prefix and contain no `..`** (`resolveKey`), so no id leaves the user's prefix.
- **Relay uploads buffer at most one part per transfer.** `writeStream` uses `@aws-sdk/lib-storage`'s `Upload` with one part in flight; anything up to one part is a single `PutObject`.
- **The part size is the entry's `partSize`, a size string kept as typed and parsed at upload by `parseSize` (`src/lib/size.ts`, binary units, so `MB` is 1024²).**
  - On a `relay` entry only, the entry's `superRefine` requires a unit and 5 MB to 5 GB, S3's limits for every part but the last; a `direct` entry's value is never used, so it is never checked; with S3's 10,000-part cap, 5 MB parts still cover 50 GB, far above the relay's file cap.
  - Each running relay upload holds about one part in memory, so the part size times `relayConcurrency` bounds one user's upload memory.
- **The CORS preflight runs at connect time** (`corsPreflight` in `s3Verify`), because the bucket is unknown until a user names it; a `relay` entry skips it, since it needs no CORS.

### WebDAV

- **The entry carries only name + url + `allowInsecureTls`; the user supplies login, password and an optional root folder**, stored as `{provider:"webdav", server, user, pass, root}`.
- **Ids are paths relative to that root** (`docs/`, `docs/a.txt`; folders end in `/`), so a root child's `parentId` is `null` and the root-visibility walk works unchanged. FTP and SFTP use the same id scheme.
- **Every id stays inside the root.** `checkId` rejects `..`, `.`, empty segments, backslashes and NUL, and every URL is built from the root.
- **`PROPFIND` goes through tsdav; GET, PUT, MKCOL, MOVE (`Overwrite: F`) and DELETE are plain `fetch` with Basic auth**, because tsdav's `createObject` sends `If-None-Match: *` and tsdav has no download, MOVE or COPY.
- **`allowInsecureTls` passes an insecure undici dispatcher to every request.**
- **Move and rename are a native MOVE.**

### FTP / FTPS

- **`secure` is `explicit` (AUTH TLS, the default), `implicit` or `none`; `none` sends the login in cleartext.** SNI is sent when the host is a hostname; `allowInsecureTls` turns off certificate verification.
- **Every id and name containing CR, LF, NUL or a backslash is refused**, because a newline in an FTP argument is a second command. Paths are the login's `pwd` joined with the root.
- **A relayed download holds its lease until the stream is read to the end and the server's `226` arrives.**
- **A TLS answer on a plain port, or the reverse, is reported as a misconfigured server, apart from unreachable ones** (`serverChecks`).

### SFTP

- **Password login only; the operator pins the host key.** Every entry requires `hostKeySha256`, and the `hostVerifier` in `sftp/client.ts` refuses any other key, naming the one presented (`HostKeyMismatchError`).
- **`ssh2` and `ssh2-sftp-client` stay in `serverExternalPackages`**: ssh2 tries optional native modules (`sshcrypto.node`, `cpu-features`) inside `try` and falls back to JavaScript, which the bundler must not chase.
- **A lease runs one operation at a time**, because parallel requests over one connection are unreliable and trip `MaxListenersExceededWarning`; `entriesIn` checks symlinks sequentially.
- **A connection is marked closed on any error, end or close**, through handlers passed to the constructor, so release drops it; a download released before its stream ended is discarded.
- **Every operation resolves `realPath` and refuses anything outside the root's own real path** (`resolvesInside`, `assertInside`), because the server enforces nothing about the root. Listings hide symlinks that resolve outside it, and a crafted id that walks through such a link is refused too.
- **Whether an entry is a symlink comes from its parent's listing**, because `exists()` / `stat()` follow links. Deleting a symlinked folder unlinks the link, and the recursive `rmdir` never reaches into its target.
- **Server paths drop a trailing `/`**, which a server would otherwise resolve through a link.

### FTP and SFTP pools

- **The pool is per server entry**, because servers cap connections per client IP (pure-ftpd `-C`, vsftpd `max_per_ip`) and every Metis user arrives from the same IP; `poolSize` bounds the entry's total open connections.
- **An idle connection is reused only by the same login** (host, port, TLS mode, user, password).
- **A lease runs one command at a time, and a connection with a transfer in flight is never reused.** `release()` returns a healthy connection; `discard()` closes it, which is what an error, an abort or a half-finished transfer does.
- **A changed entry retires its pool** (`retireFtpServers`, `retireSftpServers`): idle connections close at once, leased ones when they are released.

### WebDAV, FTP and SFTP

- **A failed upload deletes what it wrote, unless a file of that name existed before.**
- **Delete is permanent** ([drive.md](drive.md) has the dialog copy).

## How it works

- **Probes (`serverChecks`).** Each proves the entry without a user's login:
  - S3: the operator's key pair is valid (`ListBuckets`, `s3ProbeCredentials`).
  - WebDAV: the URL answers as a DAV server.
  - FTP (`probeFtp`): the server greets and completes the configured TLS mode.
  - SFTP (`probeSftp`): the SSH handshake completes with the pinned host key.
- **Connect-time verify** (`s3Verify`, `webdavVerify`, `ftpVerify`, `sftpVerify`) authenticates with the user's login. WebDAV also requires the root to be a folder.
- **S3 transfers.** Direct mode presigns GET and PUT with `@aws-sdk/s3-request-presigner`; relay mode streams GET bodies and uploads through `Upload`; a failed or aborted relay upload aborts its multipart upload.
  - A relay transfer sends no extra `HeadObject`, because every S3 request is billed: `readStream` takes name, size and type from the `GetObject` response, and `writeStream` builds its entry from the upload, counting the bytes as they stream (`modifiedAt` is the app's clock).
  - Signing a relay download keeps its one `HeadObject` (`getDownloadTarget`), which the relay cap needs before the URL exists.
- **WebDAV quota** reads RFC 4331 properties and returns null when the server has none.
- **Pool pressure.** When an entry's pool is full and another login needs a connection, an idle connection is closed to make room; otherwise the request waits FIFO. Idle connections close after `IDLE_MS`.
- **FTP metadata.** FTP has no stat for folders, so `getEntry` lists the parent; `modifiedAt` is null when the server lacks MLSD.

## Deliberate limits

- **S3 folders are synthesized** from `ListObjectsV2` with `Delimiter=/`; create folder writes a zero-byte `…/` key.
- **S3 rename and move copy every key beneath a prefix, then remove them with batched `DeleteObjects`** (1,000 keys per request, the S3 maximum).
- **S3 `quota()` returns null**, because no cheap total exists.
- **WebDAV, FTP and SFTP search is a breadth-first walk** bounded by the walk-search constants in the code map.
