# Keyboard shortcuts

The chord system shared by mail, calendar and drive, the app-wide keys, and the keys inside the search dialog. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [ui.md](ui.md), [search.md](search.md), [drive.md](drive.md).

## Code map

| Concern                  | Where                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The chord primitive      | `src/hooks/use-chord.ts` → `useChord`, `isTypingTarget`                                                                                          |
| Mail bindings (`m`)      | `src/hooks/use-keyboard-shortcuts.ts` → `useKeyboardShortcuts`, `MAIL_UNCHORDED`                                                                 |
| Calendar bindings (`c`)  | `src/app/w/[slug]/c/[calendar]/_components/use-calendar-shortcuts.ts` → `useCalendarShortcuts`                                                   |
| Drive bindings (`d`)     | `src/app/w/[slug]/d/[drive]/[[...path]]/_components/use-drive-shortcuts.ts` → `useDriveShortcuts`, `DRIVE_UNCHORDED`                             |
| Workflow bindings (`w`)  | `src/app/w/[slug]/workflow/[id]/_components/workflow-editor.tsx` → `WORKFLOW_CHORD_PREFIX`, `WORKFLOW_UNCHORDED`                                 |
| Drive back/forward stack | `src/drive/navigation.tsx` → `DriveNavigationProvider` · mounted in `src/app/w/[slug]/d/layout.tsx`                                              |
| Hint and help            | `src/components/chord-hint.tsx` → `ChordHint` · `src/components/shortcuts-help.tsx` → `ShortcutsHelp`                                            |
| Workspace switch         | `src/hooks/use-workspaces.ts` → `useWorkspaceHotkeys` · mounted by `src/components/workspace-rail-switcher.tsx`                                  |
| Workspace search (Mod+K) | `src/components/search/workspace-search.tsx` → `WorkspaceSearch` · keys inside the dialog `src/components/search/search-input.tsx` → `SearchKey` |

## Rules

- **`useChord` is the only chord primitive.**
- **Each surface has one chord, and its prefix is the surface's letter** (`m` mail, `c` calendar, `d` drive).
- **The only bare keys are `j` / `n` and `k` / `p`.** They are next / previous on mail and calendar, forward / back on drive; everything else is prefix + key.
  - The workflow canvas is the exception: Delete and Backspace remove the selected steps or connections, as in any node editor.
- **The workflow editor keeps an editor's Ctrl/⌘ keys**: S saves even while typing; Z, Shift+Z (or Y), C, V and D undo, redo, copy, paste and duplicate steps, except while typing, where the field keeps its own.
- **The chord listener runs in the capture phase and `stopImmediatePropagation`s what it consumes**, because the bare keys live in a separate bubble-phase listener. That ordering stops the `n` of drive's `d n` (new folder) from also reaching bare `n` (forward).
- **An armed prefix followed by an unbound key is swallowed**, so a typo after the prefix fires nothing.
- **The same `bindings` object feeds the handler, `ChordHint` and `ShortcutsHelp`**, so hint, help and handler cannot drift; the bare keys reach the help from each surface's `*_UNCHORDED` list.
- **Shortcuts are skipped while typing** (`isTypingTarget`).
- **Mail shortcuts are also skipped while the composer is open**, wherever focus rests ([mail.md](mail.md)).

## How it works

- **`useChord({ prefix, bindings })`** arms on the prefix for `CHORD_WINDOW_MS`, runs `bindings[key]` on the next key, and toggles help on `?`.
- **Drive's bare keys walk a visited-path stack.** `DriveNavigationProvider` records every pathname change under the drive tree; it is provided from `d/layout.tsx`, above `[drive]`, so it survives switching drives.
- **`Alt/Option + 1…9` switches to the nth workspace app-wide**, matched on `e.code` (`Digit1`…`Digit9`) so it works on any keyboard layout.
- **`Ctrl/⌘ + K` opens workspace search app-wide** except while typing in a field, so an editor keeps its own shortcut.
- **Inside the search dialog:**
  - ↑/↓ move between results;
  - Enter runs a result's first action;
  - Tab or → (or the ⋯ button) opens its action list, and Tab first accepts a suggestion;
  - Mod+Enter opens the actions too;
  - Esc goes back from an action list, or closes the dialog.

## Deliberate limits

- **Chords are per surface.** The only app-wide keys are the workspace switch and search.
