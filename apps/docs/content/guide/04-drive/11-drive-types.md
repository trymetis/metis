---
title: Drive types
description: How Google Drive, OneDrive, S3 storage, WebDAV, FTP, FTPS and SFTP drives differ in Metis.
---

Metis works with six kinds of drive. Most things work the same way on all of them. This page lists what differs.

## At a glance

| Drive type   | How you connect                                          | Delete                       | Preview               | Search                              | Storage use in the sidebar       | Open at provider |
| ------------ | -------------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------- | -------------------------------- | ---------------- |
| Google Drive | Sign in with Google                                      | Moves to the account's trash | No (download instead) | Google Drive's own search           | Shown                            | Yes              |
| OneDrive     | Sign in with Microsoft                                   | Moves to the account's trash | Yes                   | OneDrive's own search               | Shown                            | Yes              |
| S3 storage   | Email address, bucket and an optional folder prefix      | Permanent                    | Depends on the setup  | Matches part of the name            | "Storage unavailable"            | No               |
| WebDAV       | Email address, username, password and an optional folder | Permanent                    | Yes                   | Looks through folders up to a limit | Shown when the server reports it | No               |
| FTP and FTPS | Email address, username, password and an optional folder | Permanent                    | Yes                   | Looks through folders up to a limit | "Storage unavailable"            | No               |
| SFTP         | Email address, username, password and an optional folder | Permanent                    | Yes                   | Looks through folders up to a limit | "Storage unavailable"            | No               |

Zoho accounts have no drive.

## Notes by topic

- **Connecting.** Your administrator decides which drive types and servers you can pick. For S3, WebDAV, FTP, FTPS and SFTP, your administrator sets up the server and you bring only your own login. See [Add a drive](/guide/drive/add-a-drive).
- **Delete.** On Google Drive and OneDrive you can restore a deleted item from the account's trash. On the other types a delete cannot be undone. See [Create, rename and delete](/guide/drive/create-rename-and-delete).
- **Preview.** Google Drive files show **Download** and **Open in Google Drive** instead of a preview. On S3 storage, preview depends on the setup. See [Preview files](/guide/drive/preview-files).
- **Search.** On WebDAV, FTP, FTPS and SFTP drives, a file buried very deep in many folders may not be found. On S3, WebDAV, FTP, FTPS and SFTP drives, search can be up to 30 seconds behind changes, for example a file added outside Metis. See [Search](/guide/drive/search).
- **Upload progress.** On Google Drive and OneDrive, the upload bar fills as the file is sent. On S3, WebDAV, FTP, FTPS and SFTP drives, it fills only when the file is done.
- **Transfers through your Metis server.** WebDAV, FTP, FTPS and SFTP drives, and some S3 drives, send files through your Metis server, which has a size limit for them. Your administrator sets that limit. You can also run only a few of these transfers at a time. When you hit a limit, you see "Files over N MB cannot be transferred for this drive" or "Too many transfers are running. Wait for one to finish".
- **Google Drive downloads** use your browser's own Google sign-in. Your browser must be signed in to the same Google account as the drive. Google Docs, Sheets, Slides and Drawings download as .docx, .xlsx, .pptx and .png files. See [Download and open at the provider](/guide/drive/download-and-open).
