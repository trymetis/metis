# Screenshots

How the docs site (`apps/docs`) and the marketing site (`apps/www`) capture screenshots from the e2e stack: the shared lists, their check, the screenshot stack overlay, page steps, terminal sessions and the Claude Code shots. Paths are relative to `packages/screenshots/` unless they name a workspace. See also [AGENTS.md](../AGENTS.md), [apps/docs/AGENTS.md](../apps/docs/AGENTS.md) (what the docs capture adds: both themes, invites, Observer, maintenance, the CLI stack), [www.md](www.md), [e2e.md](e2e.md).

## Code map

| Concern                                                                                   | Where                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Every screenshot entry, one file per area                                                 | `lists/pages/<area>.json`; terminal sessions in `lists/terminals/terminal.json` (docs) and `lists/terminals/claude-code.json` (www) |
| Entry schemas and every list rule, list reading, which site captures an entry             | `src/entries.ts` → `pageEntrySchema`, `wwwShotSchema`, `terminalEntrySchema`, `listsSchema`, `readLists`, `capturedBy`              |
| List check run by the package's `typecheck`                                               | `src/check.ts` (runs `readLists`)                                                                                                   |
| Chrome flags, context, launch, PNG to WebP                                                | `src/browser.ts` → `RENDER_FLAGS`, `contextOptions`, `launch`, `shoot`, `writeWebp`                                                 |
| Harness, oRPC calls, sign-in, workspace theme                                             | `src/app.ts` → `harness`, `rpc`, `signIn`, `asUser`, `selectTheme`                                                                  |
| Page steps and path placeholders                                                          | `src/steps.ts` → `stepSchema`, `resolve`, `runStep`                                                                                 |
| Element boxes                                                                             | `src/box.ts` → `pageRegion` (docs), `viewportRegion` (www)                                                                          |
| Terminal sessions: ttyd, steps, recording, redraw                                         | `src/terminal.ts` → `TerminalHost`, `ttyd`, `captureTerminal`                                                                       |
| Screenshot stack overlay (seed, cadence, stand-ins, the Claude Code service)              | `compose.yml`, layered over `e2e/compose.yml` by `bun run up:ss` in `e2e/`                                                          |
| Lint: `oxlint.config.mts` turns off `no-await-in-loop`, since every capture runs in order | `oxlint.config.mts`                                                                                                                 |
| Claude Code image                                                                         | `claude-code.Dockerfile`                                                                                                            |
| Docs capture                                                                              | `apps/docs/scripts/screenshots.ts` · the CLI stack host `apps/docs/scripts/terminal.ts` → `cliHost`                                 |
| www capture, Claude Code sign-in and prompt shots                                         | `apps/www/scripts/shots.ts` · crop boxes `apps/www/scripts/manifest.ts` → `apps/www/src/content/shots.json`                         |

## Rules

- **Every entry names its `target`: `all`, `docs` or `www`.** Docs captures `all` and `docs` entries, www captures `all` and `www` entries.
  - A page entry captured by www lists its www shots in `www`, one `{ name, focus?, steps? }` per shot, so one page can give several www pictures under www's own names.
  - A `docs` entry has no `www` field; an `all` or `www` page entry has at least one www shot.
  - `cli-host` sessions are `docs` entries and `claude-code` sessions are `www` entries.
- **Every list rule is a zod schema in `src/entries.ts`, so `readLists` enforces it in both capture scripts and `bun run typecheck` checks it after `tsc` through `src/check.ts`.**
  - The schemas reject unknown keys and steps, a missing or wrong `target`, a name two screenshots of one site share (`listsSchema`), and www shots on invite, Observer or maintenance entries, which only the docs capture supports.
  - `listsSchema` takes both folders as one object keyed by file name, so a zod error path names the list, the entry and the field (`pages["mail.json"][3].target`).
- **The Claude Code prompt shots run only when `MCP_SHOTS_MODEL` names a model.** Without it, www keeps their current images and still captures `mcp/consent`, which needs no model.
- **The Claude Code container gets only `LLM_UPSTREAM_KEY`**, which `apps/www/scripts/shots.ts` → `upstreamKey` reads from `e2e/.env`, and only for the prompt shots and `--smoke --model`.

## How it works

- **Screenshots come from the e2e stack without its edge-case seed**, so test calendars, mail and files never appear. `compose.yml` turns the edge-case seed off.
  - It seeds the runner cadence at its documented default of 60 seconds, because the fixture's 2-second test cadence would show on every runner screen, and starts the stand-ins without the cron ticks.
  - It adds the `claude-code` service (`metis-claude-code`), so `up:ss` builds and starts it and `bun run down` removes it with the rest of the stack.
- **A page entry opens `path`, runs its steps and captures.** Steps use Playwright selectors: `click`, `dblclick`, `rightClick`, `fill`, `type`, `press`, `hover`, `drag`, `waitFor`, `waitForHidden`, `wait`, `scroll`, `goto`, `follow`, `clearReadLater`.
  - `type` clicks its selector and types `text` key by key, for editors such as the search box that `fill` cannot drive.
  - `{ "drag": <from>, "to": <to> }` presses the mouse on one element and releases it on another in small moves, which is how a workflow step's output handle is wired to the next step; the palette adds steps unconnected.
  - `{ "waitForHidden": <selector> }` waits until a spinner or other transient element is gone, so a capture never shows a loading state.
  - `{ "follow": <selector> }` opens a link's address in the same tab, for links that open a new tab (**Print**, **View original**), since each entry captures one page.
  - `{ "clearReadLater": true }` removes every Read later save of the seeded mailbox: the recorded seed saves the shipment message under the id it has when the edge-case seed runs, and that id does not exist on this stack, so it would show as an unreadable row.
  - Path placeholders: `{workspace}`, `{mailbox}`, `{calendar}`, `{drive:<kind>}`.
- **Captures run on the real clock**, because files, saved chats, workflow runs and AI usage carry the time the stack was seeded or recorded; `"seededWeek": true` (the calendar views) freezes the browser clock at the seeded week (`DOCS_CLOCK`, default `2026-10-08T12:00:00Z`), since the calendar opens on today.
- **Chrome launches with `RENDER_FLAGS`**, so text is greyscale, unhinted and placed on whole pixels, and colors and rasterizing do not depend on the host. Playwright captures a PNG at device scale factor 2, which sharp converts to WebP at quality 80.
- **An `element` box is cut just under its last item** when a tall empty area follows it, so sidebars and panes do not come out as empty strips; a list of selectors joins their boxes, so a menu can be shot with the button that opened it.
- **www captures each www shot in light, on the Amber workspace theme, at 1440 by 900.** It runs the entry's steps, then the shot's own, and saves the whole viewport; the crop box goes to the manifest.
  - `focus` picks the box: absent, the entry's `element` or `clip`; a selector or list of selectors; a fixed box; `null` for the whole picture.
- **A terminal entry runs one real session in ttyd and redraws it.** `captureTerminal` asks the entry's host to start `ttyd --once`, opens it in Playwright, sets the grid to `cols` by `rows` (default 100 by 30) and runs the steps.
  - Steps: `type` (waits for the shell prompt, types the line, waits until the terminal shows it, then presses Enter), `answer` (waits for the screen to settle, then types a line), `press`, `waitFor` (text on the screen, `ignoreCase`, `timeout` in ms, default ten minutes), `waitForPrompt`, `settle` (until the screen is quiet that many ms), `hidden` (a shell line run in the host, never shown) and `wait`.
  - At the end it reads the whole session from ttyd's xterm buffer as text with its colors (scrolled-off lines included, empty lines at both ends dropped, runs of empty lines kept as one) and writes it into `@wterm/dom` on a local page once per theme asked for, so a command with side effects never runs twice.
  - The picture is as tall as the session: the replay page is one window whose terminal has exactly as many rows as the session has lines, so nothing is cut off and no empty rows are drawn. `rows` only sizes the live grid.
  - A step that fails saves the live screen to the temp folder and names the file in the error.
- **The Claude Code shots run in `metis-claude-code`**, on the host network so Claude Code reaches the app on `localhost:3000` and the browser reaches its sign-in callback.
  - Before the prompt shots, www registers a Claude Code MCP client on `/settings/mcp`, runs Claude Code's `/mcp` sign-in in a live terminal and approves it in the browser (`mcp/consent` is that approval page), then hides the `Studio` workspace from the client for `mcp/refuses-access`.
  - Claude Code runs with its `light` theme, and `CLAUDE_MODEL` (from `MCP_SHOTS_MODEL`) becomes every model `.bashrc` sets for it through OpenRouter.
  - `bun run shots --smoke` (`--smoke=<line>`, `--smoke-wait=<text>`, `--smoke-press=<key>`, `--model`) runs a throwaway session and writes it to the temp folder.

## Deliberate limits

- **www ignores an entry's `viewport` and `fullPage`**: every www picture is a 1440 by 900 frame cropped through the manifest.
- **The check cannot verify `{drive:<kind>}` placeholders**: the drive kinds come from the running seed's account (`/account`), so a wrong kind fails only during a capture.
- **Claude Code shots show the model's answer of the day**: prompts are fixed, replies are not recorded.
