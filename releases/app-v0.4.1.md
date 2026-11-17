---
date: 2026-11-17
cli: 0.1.0
---

### Upgrade notes

- Contains a database migration that adds a table for themes, moves each workspace's color choice onto it and adds the built-in themes; preflight keeps the built-in themes up to date on every deploy.
- Graphite is the default theme: workspaces that never picked a color switch from Amber to Graphite, new workspaces start on it, and a workspace whose theme is deleted falls back to it. Workspaces that picked Amber keep it.
- The **Change theme** tool (`setWorkspaceTheme`) for the assistant and MCP clients takes a `themeId` from the new **List themes** tool instead of a color name.
- The account data export is version 2: each workspace's `themeBrand` is replaced by `theme`, the name of the theme the workspace uses.

### Added

- Themes: workspace owners and admins can build a custom theme from an accent color and a background tint, adjust any color by hand, and see both light and dark mode with a warning when text gets hard to read. Workspace Settings → General → Appearance lists the built-in themes, the instance's themes and the workspace's own.
- Dashboard → Themes: the owner and instance admins build themes every workspace can pick, with the same builder, and see how many workspaces use each one.
- A new built-in theme, Graphite: plain grays, with a black accent in light mode and a true black background in dark mode.
- The assistant and MCP clients can list a workspace's themes and create a custom theme from an accent color, with approval.

### Changed

- The app uses Inter and JetBrains Mono instead of DM Sans, DM Mono and the serif title font, so names and subjects in Cyrillic, Greek and Vietnamese render in the app's own font. Emails sent by the instance use Inter too.
- The mail entry in the left rail is called **Mail** and uses an envelope icon, so it no longer looks like the Inbox folder, and it drops the dot that looked like an unread badge but never reflected new mail.
- Workspace colors show only on a workspace's own pages. The dashboard, account settings, sign-in, the MCP consent page and their dialogs and menus use the neutral theme, and a workspace page opens in its own color instead of flashing amber first.
