---
title: Search
description: Find a file by name in one drive or in every drive at once, and how search behaves on each drive type.
---

The search box in the toolbar finds files and folders by name across the whole drive, not just the folder you are in.

## Search a drive

1. Click **Search this drive** in the toolbar, or press <kbd>d</kbd> then <kbd>s</kbd>.
2. Type part of the name. Results appear a moment after you stop typing.
3. Double-click a result to open it. Opening a folder from the results clears the search.

To go back to the folder you were in, clear the search box.

<img src="/images/drive/search.webp" alt='Search results for "welcome" in a drive' class="dark:hidden" />
<img src="/images/drive/search-dark.webp" alt='Search results for "welcome" in a drive' class="hidden dark:block" />

If nothing matches, you see "Nothing matched that search". When there are many results, click **Load more** at the bottom to see the rest.

In [All drives](/guide/drive/all-drives), the same box searches every drive in the workspace at once.

## What search can find

- Search never shows folders or files that a [folder restriction](/guide/drive/folder-restrictions) hides from this workspace.
- How far search looks depends on the drive type:

| Drive type                 | How search works                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Google Drive               | Uses Google Drive's own search.                                                                                |
| OneDrive                   | Uses OneDrive's own search.                                                                                    |
| S3 storage                 | Matches part of the file name.                                                                                 |
| WebDAV, FTP, FTPS and SFTP | Looks through the folders one by one, up to a limit. A file buried very deep in many folders may not be found. |

If search does not find a file on a WebDAV, FTP, FTPS or SFTP drive, browse to it through its folders instead.

## Search with filters

To search files by kind, size, date or folder, use workspace search. Click **Search** on the left rail, or press **Ctrl** + **K** (**⌘** + **K** on a Mac). If you open it from a drive, it starts with a filter for that drive.

For example:

| You type                                | Finds                                                            |
| --------------------------------------- | ---------------------------------------------------------------- |
| `type:file kind:pdf contract`           | PDF files with "contract" in the name                            |
| `type:file report size:>10mb`           | Files with "report" in the name that are larger than 10 MB       |
| `type:file budget after:30d`            | Files with "budget" in the name that changed in the last 30 days |
| `type:file drive-folder:Invoices march` | Files with "march" in the name, in a folder called Invoices      |

On every drive except Google Drive, include at least one word from the name. From a result, you can preview, download, rename, move or delete a file without leaving search. See [Search your workspace](/guide/search/search-your-workspace) and, for every filter, [Search syntax](/guide/reference/search-syntax).
