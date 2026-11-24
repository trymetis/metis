---
title: Drive AI
description: Open the Drive AI panel to ask questions about your files and let the assistant organize them, with your approval.
---

**Drive AI** is a chat panel beside your files. You can ask it about the files in a drive, and ask it to make changes for you. This page covers how to open it from Drive. For how chats, approvals and AI settings work in general, see [Assistant](/guide/assistant).

## Open Drive AI

Click the **Drive AI** button (the robot icon) at the right end of the toolbar, or press <kbd>d</kbd> then <kbd>a</kbd>. Do the same again to close it.

The panel's header shows the drive's [name](/guide/drive/browse-your-files#how-drives-are-named), or "All drives" when you open it from [All drives](/guide/drive/all-drives).

<img src="/images/drive/drive-ai.webp" alt="The Drive AI panel open beside the files, with suggested questions" class="dark:hidden" />
<img src="/images/drive/drive-ai-dark.webp" alt="The Drive AI panel open beside the files, with suggested questions" class="hidden dark:block" />

You see the **Drive AI** button only when AI is set up on your Metis Suite instance and turned on for the workspace and for this drive. On **All drives**, at least one of the drives needs AI on. See [When Drive AI is turned off](#when-drive-ai-is-turned-off).

## Ask a question

A new chat says "Ask about these files" and offers suggestions such as "What's in this folder?" and "Find the latest invoice". Click one, or type your own question in the box ("Ask about these files…") and press <kbd>Enter</kbd>.

To point the assistant at a specific file or folder, you can:

- Drag it from the file list or grid onto the panel. You can drag files only while the panel is open.
- Click **Attach a file** (the paperclip) at the bottom of the message box. It lists up to 50 files and folders from the folder you have open, and leaves out the ones already attached. When there is nothing left to attach, for example when the folder is empty, the button is turned off.

During a search, you drag and pick from the search results. See [Attach items](/guide/assistant/use-the-side-panels#attach-items).

To start a new conversation, click **Clear chat** (the eraser icon) in the panel's header. It shows once you have sent a message. There is no confirmation, and the cleared chat cannot be brought back.

If something goes wrong, the panel says "Drive AI hit a problem" with a **Retry** button.

Drive AI shares a limit of 20 messages a minute with the Mail AI, Calendar AI and Contacts AI panels. See [Limits and troubleshooting](/guide/assistant/limits-and-troubleshooting).

## What it can do

Drive AI can list and search your files and read text files. It can also create folders, rename, move and delete items. Before it changes anything, it asks you to approve the change.

The file list has no move action, so ask Drive AI when you want a file in another folder. It can move files within one drive. It cannot move a file from one drive to another.

## When Drive AI is turned off

AI is off for each drive until someone turns it on. The person who connected the drive can turn it on in the workspace's drive settings. Metis Suite asks them to confirm it's them first, with a code from their authenticator app, a passkey or a backup code. See [Workspaces](/guide/workspaces).

An owner or admin of the workspace decides whether AI is allowed there at all.

While AI is off for the workspace or for this drive, the **Drive AI** button does not show and <kbd>d</kbd> then <kbd>a</kbd> does nothing. The shortcut is also missing from the **Keyboard shortcuts** help. Since the panel cannot open, you cannot drag files to attach them either.
