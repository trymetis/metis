---
title: Browse your files
description: Open a drive, switch between drives, use list and grid views, move through folders, and select and open items.
---

This page shows you how to find your way around a drive: the drive switcher, the two views, folders and breadcrumbs, and the sidebar.

## Open a drive

Open the Drive section of your workspace. Metis opens the first drive in the workspace.

If the workspace has no drive yet, you see **No drive in this workspace** and a **Go to drive settings** button. See [Add a drive](/guide/drive/add-a-drive) to connect one.

<img src="/images/drive/explorer-list.webp" alt="A drive open in list view, with the sidebar on the left and the files on the right" class="dark:hidden" />
<img src="/images/drive/explorer-list-dark.webp" alt="A drive open in list view, with the sidebar on the left and the files on the right" class="hidden dark:block" />

## How drives are named

Metis shows each drive by a name, so you can tell your drives apart:

- **Google Drive and OneDrive:** the type, then the email address of the account. For example, "Google Drive · you@example.com".
- **Storage servers** (S3 storage, WebDAV, FTP, FTPS and SFTP): the name your administrator gave the server, for example "Acme files". No email address is shown.
- **Two servers with the same name in one workspace:** each drive adds its type, for example "Acme files · S3 storage" and "Acme files · WebDAV". An FTPS server shows its type as "FTP".
- **The same server added twice:** both drives show the same name.

You see this name in these places:

- the first breadcrumb above the files;
- the browser tab title, after "Drive";
- the folders at the top level of [All drives](/guide/drive/all-drives);
- the dialogs where you pick a drive and a folder, such as **Save to Drive** on an attachment;
- workspace search, the **@** list in Workspace AI, and the drive fields and cards of workflow steps.

The drive switcher, the **Switch drive** menu, the **Add a drive** dialog and the drive lists in settings show the account's email address instead.

## Switch to another drive

The switcher at the top of the sidebar shows the drive you are in: its type and the email address of its account. Click it to open the **Switch drive** menu. The menu holds:

- **All drives**, with "Every drive in this workspace". It shows only when the workspace has more than one drive. See [All drives](/guide/drive/all-drives).
- One row for each drive. The row says "All folders shown", or how many folders this workspace can see when the drive has a [folder restriction](/guide/drive/folder-restrictions).
- **Add drive**, which opens the workspace's drive settings.

<img src="/images/drive/switcher.webp" alt="The Switch drive menu listing All drives, each drive, and Add drive" class="dark:hidden" />
<img src="/images/drive/switcher-dark.webp" alt="The Switch drive menu listing All drives, each drive, and Add drive" class="hidden dark:block" />

## Choose list or grid view

The toolbar has a button that switches between two views:

- **List** shows one row per item, with its name, size and the date it last changed. Folders show no size.
- **Grid** shows the items as icons that share the width of each row. Each item has a large icon, or a small picture of the image for image files, with its name under it. A long name is cut after two lines. It shows in full when the item is selected. You can also point at an item to see its full name. Grid view does not show sizes or dates.

In both views, folders come first, then files. This is the same for every type of drive, and in **All drives**.

In grid view, an image file shows a small picture of itself instead of an icon when the file is 10 MB or smaller and the drive reports when it last changed. The pictures load as you scroll near them. Your browser has to read the file straight from the drive, as it does for a [file preview](/guide/drive/preview-files#which-drives-support-preview). When it cannot, the icon stays. This is why images on Google Drive always show an icon. Metis keeps these pictures in your browser and clears them when you sign out, like [file previews](/guide/drive/preview-files#safety-and-storage).

Click **Switch to grid** or **Switch to list** to change the view. Metis remembers your choice in this browser, for every drive.

<img src="/images/drive/explorer-grid.webp" alt="The same drive in grid view, with a large icon and the name of each folder and file" class="dark:hidden" />
<img src="/images/drive/explorer-grid-dark.webp" alt="The same drive in grid view, with a large icon and the name of each folder and file" class="hidden dark:block" />

## Move through folders

- **Open a folder:** double-click it, or select it and press <kbd>Enter</kbd>.
- **Go back up:** use the breadcrumbs above the files. The first one is the [drive's name](#how-drives-are-named). Click any breadcrumb to jump back to that folder.
- **Return later:** each folder has its own web address. You can reload the page or bookmark it, and the same folder opens.

You can also go back and forward through the folders you visited with the keyboard. See [Keyboard shortcuts](/guide/drive/keyboard-shortcuts).

## Select and open items

- **Select:** click an item once.
- **Open:** double-click it, or press <kbd>Enter</kbd> when it is selected. A folder opens. A file opens in the [preview pane](/guide/drive/preview-files).
- **On a touch screen:** one tap opens the item.
- **Move the selection:** press the arrow keys to select the next item from the one that has focus. In list view, use <kbd>↑</kbd> and <kbd>↓</kbd>. In grid view, all four arrow keys work.
- **Clear the selection:** press <kbd>Esc</kbd>.
- **See the actions:** right-click an item. In list view, you can also click the **...** button on the item. In grid view, the **...** button shows only on touch screens. Both open the same menu, with actions such as **Download**, **Rename** and **Delete**.

## Long folders

A folder with many items shows a first batch. Click **Load more** at the bottom to see the next batch. If the next batch cannot be loaded, you see "Could not load more files". Try again in a moment.

If a folder has nothing in it, you see "This folder is empty". If the drive cannot be read, Metis shows the reason and a **Try again** button.

## The sidebar

Below the switcher, the sidebar can show three more things:

- **Pinned:** folders you pinned. See [Pinned and recent folders](/guide/drive/pinned-and-recent-folders).
- **Recent:** folders you opened lately in this drive.
- Storage: at the bottom, how much space the drive uses, such as "2.1 GB of 15 GB" with a bar, or "2.1 GB used". Some drive types do not report this, and the line says "Storage unavailable". See [Drive types](/guide/drive/drive-types).

On a phone, the sidebar is hidden. Tap **Open sidebar** to show it.
