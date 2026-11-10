---
date: 2026-10-28
---

### Added

- The app tells you when a new version is out: a notification once per version, "Check for updates…" in the tray and File menus, and an Updates row in Settings → About with a Download button. Turn it off with "Check for updates" in General; the check asks downloads.trymetis.email, never your server.
- Back and Forward in the View menu (Alt+Left / Alt+Right, Cmd+[ / Cmd+] on macOS), on the mouse's back and forward buttons, and by swiping on a macOS trackpad.
- When opening the server takes too long, the loading screen offers Try again, Use a different server and Settings.
- A "Download failed" notification when a download stops partway.
- The setup screen accepts an address without `https://`, such as `mail.example.com`.

### Changed

- Linux builds ship as `.deb` and `.rpm`; the AppImage is gone.
- Runs on Electron 45.
- The macOS menu bar icon is a monochrome template that follows the menu bar's colour.

### Removed

- The Spelling settings. Misspellings are still underlined.
