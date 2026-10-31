# Calendars

The calendar resource, per-workspace visibility, `CalendarAdapter` and its Google / Microsoft / Zoho / CalDAV providers, timezone handling and what create/edit supports. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [ai-agents.md](ai-agents.md), [servers.md](servers.md), [search.md](search.md), [shortcuts.md](shortcuts.md).

## Code map

| Concern                                                             | Where                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session                                                             | `src/calendar/session.ts` → `CalendarSession` · middleware `src/server/middlewares/calendar-session.ts`                                                                                                                                                                                  |
| Adapter interface + factory                                         | `src/calendar/adapter.ts` → `CalendarAdapter`, `CalendarChangeSignal`, `getCalendarAdapter`                                                                                                                                                                                              |
| Visibility and cross-account reads                                  | `src/calendar/aggregate.ts` → `isCalendarVisible`, `listEventsAcross`, `searchEventsAcross`                                                                                                                                                                                              |
| Providers                                                           | `src/calendar/providers/`, one file per provider exporting `<provider>Calendar`                                                                                                                                                                                                          |
| Calendars a connection offers (before attach)                       | `src/calendar/available.ts` → `listProviderCalendars`                                                                                                                                                                                                                                    |
| Layout math (vendored big-calendar)                                 | `src/calendar/layout.ts` → `viewRange`, `viewerTimeZone`                                                                                                                                                                                                                                 |
| Year view day counts                                                | `src/calendar/day-counts.ts` → `countEventDays` · procedure `calendarEvents.days` · `src/app/w/[slug]/c/[calendar]/_components/views/year-view.tsx` → `YearView`                                                                                                                         |
| Slugs                                                               | `src/calendar/slug.ts` → `uniqueCalendarSlug` · `src/workspace/path.ts` → `ALL_CALENDARS_SLUG`                                                                                                                                                                                           |
| Procedures                                                          | `src/server/routes/calendar-events.ts`, `calendars.ts`, `workspace-calendars.ts`                                                                                                                                                                                                         |
| UI                                                                  | `src/app/w/[slug]/c/page.tsx` (landing) · `src/app/w/[slug]/c/[calendar]/_components/` → `calendar-shell-client.tsx` (`CalendarShellClient`), `calendar-context.tsx` (view, range, sidebar toggles in localStorage), `event-dialog.tsx`, `event-popover.tsx`, `calendar-agent-panel.tsx` |
| Workspace search over events                                        | `src/calendar/search.ts` → `searchEvents` ([search.md](search.md))                                                                                                                                                                                                                       |
| Opening an event, a new event or a calendar filter after navigating | `src/calendar/pending-open.ts` → `stashCalendarHandoff` (read by `CalendarProvider`, [search.md](search.md))                                                                                                                                                                             |

## Rules

- **A calendar resource is an account; individual calendars are its folders.**
  - No provider offers per-calendar consent: Google's scopes are account-wide, Graph's `Calendars.ReadWrite` grants all, Zoho likewise.
  - So `calendar` is one row per connection ([connections.md](connections.md)), and Personal / Work / Holidays are enumerated live, never stored.
- **Calendar visibility is an app-level restriction, never isolation.** `calendar_workspace.visible_calendar_ids` (`null` = all, including calendars added later) is a product guarantee: the token can still read everything.
- **Every read and write of an attached calendar goes through `src/calendar/aggregate.ts`**, so a hidden calendar is invisible to the UI, the agents and MCP alike. The one direct adapter call is `listProviderCalendars`, which lists a connection's calendars for the attach and visibility pickers.
  - `assertWritable` and `resolveCalendarAccount` throw `NotVisibleError` for a hidden calendar or an unknown account, which oRPC answers with `NOT_FOUND` ([orpc.md](orpc.md)).
- **Every provider fills `meetingUrl` with the join link and `conference` with what else it knows** (solution name, meeting ID, passcode, dial-in numbers and PINs), through `src/calendar/conference.ts` → `compactConference`, so an event without a meeting carries no `conference` key.
  - Google reads `conferenceData` (video entry point for the link, phone entry points for dial-in); Microsoft reads `onlineMeeting` and `onlineMeetingProvider`, with the Teams conference ID as each number's PIN.
  - Zoho reads `conference_data.meetingdata`, falling back to `app_data.meetingdata.meetinglink`; CalDAV reads RFC 7986 `CONFERENCE` properties, then the known-host heuristic in `meetingUrlFrom`.
  - `conferenceName` names a solution from the join link's host when the provider does not.
- **A Zoho write re-reads the event first and sends its latest `etag`**, because Zoho refuses an edit or delete without one; so the last write wins, as with the other providers (`latestWritable` in `zoho.ts`).
  - Zoho's update replaces the whole event, so an edit resends every writable field read back (`zohoWritableSchema`) with the change on top, including `dateandtime`, which Zoho requires on every edit.
- **Zoho occurrences are listed one by one and edited one by one.** Each window fetches the series listing (full details) and the `byinstance=true` listing (one entry per occurrence, minimal details) and merges them (`expandInstances`).
  - Only an entry whose series carries an `rrule` gets an occurrence id; a `recurrenceid` on an entry is not proof it repeats, and an occurrence id on a one-off event makes its read ask for `?recurrenceid=` and fail.
  - An occurrence's id packs the series `uid` and its recurrence id (`encodeEventId`); the recurrence id is read from the entry, else built from the occurrence's start in GMT, which matches only an occurrence that was never moved.
  - Its read passes `recurrenceid`, and its edit and delete send `recurrenceid` with `recurrence_edittype: "only"`, so only that occurrence changes.
- **Zoho event uids keep their `@` unencoded in a path** (`encodeUid`), the form every Zoho example uses; a rejected Zoho call logs its method, path and query without `eventdata` under `[zoho-calendar]`.
- **Answering an invitation on one occurrence answers only that occurrence on every provider that answers.** CalDAV writes PARTSTAT on the occurrence's override, cloning one from the master (`cloneOccurrence`) when none exists, as an edit does.
- **Answering fails with "You are not an attendee on this event" when the account is not on the guest list** (Google, CalDAV), instead of saving nothing.
- **The popover shows the Going? row only when you can answer** (`canRespond` in `event-popover.tsx`): never for the event's organizer (organizer email against `accountEmail`) and never for a Zoho calendar.
- **A failed delete from the popover shows its error in a toast** (`run` in `event-popover.tsx`).
- **Zoho event times come from `dateandtime.start`/`end`** (`20261024T093000+0530`, with `dateandtime.timezone`); the top-level `start`/`end` carry no offset and are only a fallback.
- **The event popover renders an event whose start or end does not parse without its date line** instead of throwing, so one provider bug cannot break the calendar page.
- **Procedures take `{ accountId?, calendarId, eventId }` as separate fields**, with no composite ids, because no table is keyed by an event id.
- **Everything renders in the viewer's timezone.** All-day events are parsed date-only so they cannot slide a day across zones, and writes send the viewer's IANA zone (`viewerTimeZone`).
- **The calendar shell is client-only** (`CalendarShellClient`, `next/dynamic` with `ssr: false`): every label comes from `new Date()` and the local zone, so a server render in the server's zone cannot hydrate in the viewer's.
- **Sidebar toggles are session-local (localStorage)**, separate from `visible_calendar_ids`, so hiding a calendar for yourself cannot remove it from a teammate's view.
- **A view's range ends at the start of the day after its last day** (`viewRange` → `dayAfter`), so a week is seven days.
  - `calendar-context.tsx` feeds the range to the event fetch and `calendar-agent-panel.tsx` to the calendar agent's turn envelope.
  - Changing it changes recorded agent requests, which then need re-recording ([e2e.md](e2e.md)).
- **A listing without `max` reads every event in its window.** Google follows `nextPageToken` (2,500 per page) and Graph follows `@odata.nextLink` (`$top` 1,000), each up to `LIST_PAGES` pages per calendar; `max` caps each calendar's list.
  - The agent, MCP and workflow `listEvents` op sends `DEFAULT_EVENT_MAX` when the caller names no `max` (`src/ops/calendar.ts`), so a tool answer stays bounded and recorded requests do not change.
- **Year view's dots come from `calendarEvents.days`, never from the view's events.** It lists with `fields: "times"` (Google `fields`, Graph `$select`; Zoho and CalDAV list in full) and counts days in the viewer's zone on the server (`countEventDays`).
  - The view's own event fetch stays capped at `YEAR_EVENT_MAX` per calendar (`calendar-context.tsx`), since in Year view it serves only the agent panel's attach list and the error banner.
- **The New/Edit event dialog initializes only when it opens or its target changes**, and picks the default calendar in a separate effect, so a calendar-list refresh while it is open cannot wipe what the user typed (`event-dialog.tsx`).
- **Deleting an event asks first**: the popover's Delete opens a confirmation (`event-popover.tsx`), because a provider delete cannot be undone here.
- **`src/calendar/providers/zoho.ts` keeps its own DC probe** against `calendar.zoho.<dc>/api/v1/calendars`, because a calendar-only grant has no mail scope for the mail probe.

## How it works

- **Landing.** `/w/[slug]/c` redirects to the `all` calendar slug (`ALL_CALENDARS_SLUG`) when the workspace has any calendar, else shows the attach card.
- **`CalendarAdapter` mirrors `MailAdapter` without pagination: the time window is the cursor.**
  - `CalendarSession` mirrors `MailSession`.
  - Cross-account reads merge-sort by start time and report per-account failures in `calendarErrors`.
- **The optional `changes` says only whether a calendar changed since a token**, for workflow feeds ([workflow-graph.md](workflow-graph.md)): Google sync tokens per calendar, a Graph calendar-view delta per calendar over the feed's window, and the CalDAV sync token or ctag; Zoho leaves it out.
- **CalDAV.** tsdav handles discovery and the `calendar-query` REPORT; ical.js parses and builds VEVENTs.
  - Recurrence asks for `<C:expand>` and expands locally (`expandMaster`) when the server ignores it (Radicale-class), capped at `MAX_EMITTED_OCCURRENCES`.

## Deliberate limits

- **Create/edit is Event-only**: every provider keeps tasks behind a separate API and scope, and appointment schedules have no API.
- **CalDAV `respondToEvent` writes PARTSTAT on your own copy only**, without iTIP scheduling (RFC 6638).
- **Zoho Calendar guests reply in Zoho Calendar or from the invitation email.** Zoho documents no reply endpoint, and its event update is organizer-only (a guest's PUT returns 403), so `respondToEvent` in `zoho.ts` refuses with a `BadRequestError` that says so and the popover hides Going? for Zoho.
