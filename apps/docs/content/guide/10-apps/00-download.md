---
title: Download the apps
description: Download the Metis Suite app for macOS, Windows, Linux or Android, pick the right file, install it and check your download.
---

The Metis Suite apps work with any Metis Suite server. You download them from this page and install them yourself. The first time you open an app, it asks for your server address. Then you sign in through your browser. The sign-in steps are in [Desktop app](/guide/apps/desktop-app) and [Mobile app](/guide/apps/mobile-app).

Every link on this page gives you the newest version.

## Desktop app for macOS

| Your Mac                        | Download                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Apple silicon (an Apple M chip) | [metis-suite-aarch64-apple-darwin.dmg](https://downloads.trymetis.email/desktop/latest/metis-suite-aarch64-apple-darwin.dmg) |
| Intel                           | [metis-suite-x86_64-apple-darwin.dmg](https://downloads.trymetis.email/desktop/latest/metis-suite-x86_64-apple-darwin.dmg)   |

To see which Mac you have, open the Apple menu and choose **About This Mac**:

- If it shows **Chip** with an Apple chip, such as Apple M2, download the Apple silicon file.
- If it shows **Processor** with an Intel name, download the Intel file.

To install the app:

1. Open the `.dmg` file you downloaded.
2. Drag **Metis Suite** into the **Applications** folder.
3. Open **Metis Suite** from your **Applications** folder.

## Desktop app for Windows

| Your PC                | Download                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| x64 (most Windows PCs) | [metis-suite-x86_64-pc-windows-msvc.exe](https://downloads.trymetis.email/desktop/latest/metis-suite-x86_64-pc-windows-msvc.exe)   |
| Arm                    | [metis-suite-aarch64-pc-windows-msvc.exe](https://downloads.trymetis.email/desktop/latest/metis-suite-aarch64-pc-windows-msvc.exe) |

To see which PC you have, open **Settings**, then **System**, then **About**, and look at **System type**:

- "x64-based processor" means x64.
- "ARM-based processor" means Arm.

To install the app:

1. Open the `.exe` file you downloaded. It is the installer.
2. Follow the installer until it finishes.
3. Open **Metis Suite** from the Start menu.

## Desktop app for Linux

The Linux app comes in two package types. A package is a file that your system's software tools install for you.

- **`.deb`** is for Debian, Ubuntu and systems based on them, such as Linux Mint.
- **`.rpm`** is for Fedora, RHEL, openSUSE and systems based on them.

| Your system            | Processor | Download                                                                                                                               |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Debian, Ubuntu         | x64       | [metis-suite-x86_64-unknown-linux-gnu.deb](https://downloads.trymetis.email/desktop/latest/metis-suite-x86_64-unknown-linux-gnu.deb)   |
| Debian, Ubuntu         | Arm64     | [metis-suite-aarch64-unknown-linux-gnu.deb](https://downloads.trymetis.email/desktop/latest/metis-suite-aarch64-unknown-linux-gnu.deb) |
| Fedora, RHEL, openSUSE | x64       | [metis-suite-x86_64-unknown-linux-gnu.rpm](https://downloads.trymetis.email/desktop/latest/metis-suite-x86_64-unknown-linux-gnu.rpm)   |
| Fedora, RHEL, openSUSE | Arm64     | [metis-suite-aarch64-unknown-linux-gnu.rpm](https://downloads.trymetis.email/desktop/latest/metis-suite-aarch64-unknown-linux-gnu.rpm) |

To see which processor you have, run this in a terminal:

```sh
uname -m
```

If it prints `x86_64`, download the x64 file. If it prints `aarch64`, download the Arm64 file.

To install the app, open a terminal in the folder with the file you downloaded. Run the command for your system, with the name of your file:

```sh
# Debian, Ubuntu
sudo apt install ./metis-suite-x86_64-unknown-linux-gnu.deb

# Fedora, RHEL
sudo dnf install ./metis-suite-x86_64-unknown-linux-gnu.rpm

# openSUSE
sudo zypper install ./metis-suite-x86_64-unknown-linux-gnu.rpm
```

Then open **Metis Suite** from your applications menu.

## Android app

| Your phone        | Download                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Any Android phone | [metis-suite-universal-linux-android.apk](https://downloads.trymetis.email/mobile/latest/metis-suite-universal-linux-android.apk) |

One file works on every Android phone. It is an APK, the file type Android installs apps from.

To install the app:

1. On your phone, open this page and tap the download link.
2. When the download finishes, open the file.
3. Your phone asks you to allow installs from that source, for example your browser or your files app. Allow it.
4. Tap **Install**.
5. Open **Metis Suite**.

## iPhone and iPad

The Metis Suite app is not available for iPhone or iPad. On those devices, use Metis Suite in your browser.

## Check your download

You can check that a file arrived complete and unchanged. Every file has a checksum, a short code computed from its contents. The desktop apps and the Android app each have their own list of checksums:

- Desktop apps: [SHA256SUMS](https://downloads.trymetis.email/desktop/latest/SHA256SUMS)
- Android app: [SHA256SUMS](https://downloads.trymetis.email/mobile/latest/SHA256SUMS)

1. Download the `SHA256SUMS` for your app into the same folder as your app file.
2. Open a terminal in that folder.
3. Run this command:

   ```sh
   sha256sum -c --ignore-missing SHA256SUMS
   ```

4. Read the result. Your file name followed by `OK` means the file is good. `FAILED` means the file is damaged or incomplete. Delete it and download it again.

If your computer has no `sha256sum` command, compute the checksum another way and compare it with the line for your file in `SHA256SUMS`:

- **macOS:** run `shasum -a 256` followed by the file name.
- **Windows:** in PowerShell, run `Get-FileHash` followed by the file name. Windows shows the code in capital letters. That does not matter when you compare.

To check the Android app, download it on a computer and check it there.

## Update the apps

The desktop app and the Android app tell you when a newer version is out. The [desktop app](/guide/apps/desktop-app#update-the-app) shows a notification, and the [Android app](/guide/apps/mobile-app#update-the-app) shows an alert. In the app, open **App settings**, then **About**. Next to **Updates**, click or tap **Download**. Your browser downloads the right file for your computer or phone. If the desktop app cannot tell which file you need, it opens this page instead.

The apps never install anything themselves. You install the new file over the old version, the same way you installed it the first time. You can also download the newest file from this page.

- **macOS:** when you drag the app into **Applications**, your Mac asks about the app that is already there. Choose **Replace**.
- **Windows:** run the new installer.
- **Linux:** run the same install command with the new file.
- **Android:** install the new APK. Your phone keeps the app's data.

To see which version you have, open **App settings** in the app and look under **About**.
