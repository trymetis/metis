---
title: Logo and theme
description: Give a workspace its own logo and theme, and create custom themes for it.
---

The **Appearance** section of a workspace's **General** settings page sets the workspace's logo and theme. A theme is the set of colors the workspace's pages use. Both apply to everyone in the workspace.

<img src="/images/workspaces/appearance.webp" alt="The Appearance section with the logo and the theme choices" class="dark:hidden" />
<img src="/images/workspaces/appearance-dark.webp" alt="The Appearance section with the logo and the theme choices" class="hidden dark:block" />

Owners and admins can change them. Members see the section with the note "Only owners and admins can change them."

## Add a logo

The logo replaces the workspace's initials in the left rail.

1. Under **Workspace logo**, click **Upload** (or **Replace** if there is one already).
2. Pick an image file of 5 MB or less.

Metis Suite resizes the image to 72 by 72 pixels. To go back to initials, click **Remove**.

If the upload fails, you see one of these messages:

- "Pick an image file": the file is not an image.
- "Image must be 5 MB or smaller": pick a smaller file.
- "Could not process that image": try another image.

## Choose a theme

The themes are under the **Theme** heading, as cards. Each card shows a small preview of the theme and its name. The preview uses the mode you are in, light or dark. The theme the workspace uses has a check mark.

Click a card to use that theme. The change applies at once, for everyone in the workspace. There is no confirmation.

The cards come in up to three groups. A group with no themes in it is not shown.

| Group                  | What it holds                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Built in**           | Seven themes that come with Metis Suite: **Amber**, **Blue**, **Violet**, **Emerald**, **Rose**, **Slate** and **Graphite**. **Graphite** uses plain grays, with a black accent in light mode and a black background in dark mode. |
| **From your instance** | Themes that the people who run your Metis Suite server made for every workspace. See [Themes from your instance](#themes-from-your-instance).                                                                                      |
| **Custom**             | Themes made for this workspace. See [Create a custom theme](#create-a-custom-theme).                                                                                                                                               |

A new workspace starts on **Graphite**.

Members see the cards greyed out, and cannot click them.

### Where the theme shows

The theme shows only on this workspace's own pages: mail, calendar, drive, contacts, **Workspace AI**, workflows and the workspace's settings. Dialogs and menus you open there use it too. It colors buttons and highlights, and can tint backgrounds, panels and borders.

A theme has colors for both light and dark mode. Light or dark mode is a separate choice, and it is yours alone. Switch it with **Dark mode** or **Light mode** in the account menu at the bottom of the left rail.

Every other page uses the neutral theme: shades of gray, with no workspace color. These include:

- the sign-in, password reset, two-factor authentication and invite pages
- your account settings
- the dashboard
- the page where you [approve an AI client](/guide/assistant/connect-an-ai-client)
- the maintenance page

## Create a custom theme

Owners and admins can make themes of their own for the workspace. Custom themes belong to this workspace. Other workspaces never see them.

1. Under **Theme**, click **Create theme**.
2. The **Create a theme** dialog opens: "Everyone in this workspace sees the theme it uses." It starts with the colors of the theme the workspace uses now.
3. Type a **Name**, and set the colors. See [Set the colors](#set-the-colors).
4. Click **Create and use**.

The theme is saved under **Custom**, and the workspace switches to it at once, for everyone.

A workspace can keep up to 50 custom themes. A name can be up to 40 characters. Two custom themes in the same workspace cannot have the same name, and upper and lower case count as the same.

If saving fails, the dialog shows why:

- "A theme with that name already exists": pick another name.
- "You can keep up to 50 themes": delete a custom theme you no longer need first.

## Edit a custom theme

1. On the theme's card under **Custom**, click the pencil button.
2. The dialog is titled "Edit" and the theme's name, for example "Edit Teal".
3. Change the name or the colors.
4. Click **Save theme**.

If the workspace uses the theme, everyone sees the new colors.

## Delete a custom theme

1. On the theme's card under **Custom**, click the trash button.
2. A dialog asks, for example, "Delete Teal?"
   - If the workspace uses the theme, it says "This workspace uses it now, so it switches to Graphite."
   - If not, it says "It is removed from this workspace's custom themes."
3. Click **Delete**, or **Cancel** to keep the theme.

## Set the colors

The dialog for creating or editing a theme has these parts. The same dialog is used for [themes from your instance](#themes-from-your-instance).

<img src="/images/workspaces/theme-builder.webp" alt="The Create a theme dialog with the name Teal, the accent color #0d9488, a strong background tint, and light and dark previews" class="dark:hidden" />
<img src="/images/workspaces/theme-builder-dark.webp" alt="The Create a theme dialog with the name Teal, the accent color #0d9488, a strong background tint, and light and dark previews" class="hidden dark:block" />

- **Name**: the theme's name, for example "Teal".
- **Start from**: a list that starts on "Pick a theme to copy". Pick a theme to copy its colors.
- **Accent color**: click the color box to pick the main color. Its hex value, such as #0d9488, shows beside it.
- **Background tint**: how much of the accent color tints the backgrounds. Pick **None**, **Light** or **Strong**.

Under these, a note says that changing the accent or the tint generates both sets of colors again, the one for light mode and the one for dark mode. This replaces any color you set by hand.

Two previews, **Light mode** and **Dark mode**, show the theme as you change it.

If some text would be hard to read, a warning says "Some text may be hard to read". It lists each case with its contrast, for example "Dark mode: Faint text on the page has a contrast of 3.9:1 (aim for 4.5:1)". This is only a warning. You can still save the theme.

**Save theme** (or **Create and use**) stays disabled until the theme has a name.

### Set each color by hand

Click **Advanced: set each color** to set every color yourself.

1. Pick **Light** or **Dark** to choose which mode you are editing.
2. Type a color in any field. Each field has a small swatch of its color.

The fields are **Page background**, **Panels**, **Cards and inputs**, **Hover**, **Pressed**, **Selected**, **Borders**, **Soft borders**, **Text**, **Secondary text**, **Muted text**, **Faint text**, **Accent**, **Accent text**, **Accent text on a tint**, **Logo mark**, **Accent tint** and **Accent glow**.

A color can be written in one of these forms:

- `#1a2b3c`
- `#1a2b3c80`, where the last two characters set how see-through the color is
- `rgba(26, 43, 60, 0.5)`, where the last number goes from 0 (fully see-through) to 1 (solid)

If a value is not a color, you see "Use a color like #1a2b3c or rgba(26, 43, 60, 0.5)." and you cannot save until you fix it.

## Themes from your instance

The people who run your Metis Suite server can add themes for every workspace on it. They appear under **From your instance**. You pick one like a built-in theme.

You cannot edit or delete these themes from your workspace. When the people who run the server edit one, every workspace that uses it changes too. When they delete one, the workspaces that used it switch to **Graphite**.
