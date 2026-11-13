---
title: Drive transfers
description: How file transfers work for each kind of drive, and how to limit the ones that pass through your server.
---

When someone downloads or uploads a file in a drive, the bytes take one of two paths.

- **Direct:** the file goes straight between the browser and the provider. Your server does not carry it. Google Drive, OneDrive and S3 servers set to `direct` work this way. An S3 bucket needs a CORS rule for this. See [CORS rule for direct transfers](/self-hosting/configure/server-lists#cors-rule-for-direct-transfers).
- **Relayed:** the file passes through your server. WebDAV, FTP, FTPS and SFTP drives always work this way, because a browser cannot talk to those servers itself. An S3 server set to `relay` works this way too.

Relayed transfers need the secret `METIS_DRIVE_RELAY_SECRET`, of at least 32 characters, as soon as you list a relayed server. You can generate one with `openssl rand -base64 32`. `metis setup` generates it. Relayed transfers need an always-on server, not a serverless host.

## Storage on your server

On a server the `metis` CLI runs, you can keep files on the server itself. This command runs S3-compatible object storage (RustFS) next to the app:

```bash
sudo metis add objstore
```

It adds an entry named **Server storage** to the S3 server list, and creates a bucket named `drive` on it. People then connect a drive under **Server storage** with the bucket `drive`. Files pass through the app (relayed transfers), so the browser never talks to the storage directly. For the user side, see [Add a drive](/guide/drive/add-a-drive).

The files are kept in the `metis-objstore` Docker volume. To keep them in a folder of the server instead, pass its full path:

```bash
sudo metis add objstore --data-dir /srv/metis-files
```

### Direct transfers through your domain

With a domain, browsers can transfer files with the storage directly, without passing through the app:

```bash
sudo metis add objstore --direct
```

The storage is then served on `storage.` followed by your domain, such as `storage.mail.example.com`, through Caddy. The CLI also sets the storage's CORS rule for the app's address. The CLI creates no DNS record for `storage.mail.example.com`: point it at the server yourself. `--direct` needs a domain first. Without one, it is refused with "`--direct` serves files from storage. plus the domain; run `metis domain HOST` first". See [Domain and HTTPS](/self-hosting/install/domain-and-https).

To go back to relayed transfers, run `sudo metis add objstore` again without `--direct`.

Running `metis add objstore` again uses only the flags you give it. Leave out `--data-dir`, and the storage moves back to the volume. Leave out `--direct`, and it moves back to relayed transfers. Nothing copies the files between a folder and the volume.

`sudo metis status` shows the storage as "relay transfers" or "direct transfers through storage.mail.example.com", followed by ", data in /srv/metis-files" when you chose a folder.

### Remove the storage

```bash
sudo metis remove objstore
```

It warns "Drives connected through Server storage are quarantined when the app restarts." and asks "Go ahead?". It then removes the **Server storage** entry. The files stay in the volume or the folder.

- With `--purge`, it also deletes the `metis-objstore` volume and the files in it.
- A folder from `--data-dir` is never deleted. With `--purge`, the command says "The data in /srv/metis-files is kept; delete the folder yourself once you no longer need it".

## Limit relayed transfers

Open **Dashboard**, **System**, **Instance**. The **Drive relay** card has two limits:

| Field                               | Default | What it limits                                                  |
| ----------------------------------- | ------- | --------------------------------------------------------------- |
| **Max transfer size (MB)**          | 256     | The size of each relayed file.                                  |
| **Transfers per user, per process** | 3       | How many relayed transfers one person can run at the same time. |

Change a value, click **Save changes** and enter your authenticator code.

Relayed S3 uploads go to the bucket in parts. Each S3 entry sets the size of those parts in its **Part size** field. See [S3](/self-hosting/configure/server-lists#s3). Each running upload holds about one part in memory. A larger part size, or a higher **Transfers per user, per process**, raises your server's memory use.

<img src="/images/self-hosting/dashboard-instance.webp" alt="The Instance page with the Sign-up, Legal consent and Drive relay cards" class="dark:hidden" />
<img src="/images/self-hosting/dashboard-instance-dark.webp" alt="The Instance page with the Sign-up, Legal consent and Drive relay cards" class="hidden dark:block" />

To set the starting values before the first start, use `METIS_DRIVE_RELAY_MAX_MB` and `METIS_DRIVE_RELAY_CONCURRENCY`.

## Limit connections to a server

FTP and SFTP entries have a **Pool size**: the total number of connections Metis Suite opens to that server, shared by all users. The default is 2 for FTP and 3 for SFTP. Keep it under the server's connection limit per IP address. See [Server lists](/self-hosting/configure/server-lists).
