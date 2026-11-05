import "server-only";
import type { WorkspaceUserSession } from "@/auth/session";
import {
  accountNameIn,
  adapterForCalendar,
  isCalendarVisible,
  listCalendarsAcross,
  listEventsAcross,
  type ResolvedCalendar,
  resolvedCalendarName,
} from "@/calendar/aggregate";
import { workspaceCalendarAccounts } from "@/calendar/session";
import type { MailProvider } from "@/connections/types";
import { driveSurfaceFor, type ResolvedDrive } from "@/drive/aggregate";
import { DRIVE_PROVIDER_LABELS, driveName } from "@/drive/name";
import { workspaceDrives } from "@/drive/session";
import type { MailAdapter } from "@/mail/adapter";
import { adapterForMailbox, type ResolvedMailbox } from "@/mail/aggregate";
import { getCachedSubjects } from "@/mail/cache";
import { type CustomLabel, LABEL_OPTIONS, resolveLabelName } from "@/mail/label-meta";
import { listMailboxLabels } from "@/mail/labels";
import { mailSessionFor } from "@/mail/session";
import { MAIL_FOLDERS } from "@/types/mail";
import { listWorkspaceMembers } from "@/workspace";
import { aiEnabled } from "@/workspace/policy";

import {
  type AgentReference,
  packReferenceId,
  type ReferenceType,
  type ResolvedReference,
  unpackReferenceId,
} from "./references";

const SUGGEST_EVENT_WINDOW_BACK_DAYS = 30;
const SUGGEST_EVENT_WINDOW_FORWARD_DAYS = 120;
const MIN_REMOTE_QUERY = 3;
const MAX_HYDRATIONS = 24;

export interface ReferenceMailbox {
  mailboxId: string;
  email: string;
  provider: MailProvider;
  adapter: () => Promise<MailAdapter>;
}

export interface ReferenceScope {
  workspaceId: string;
  types: readonly ReferenceType[];
  mailboxes: ReferenceMailbox[];
  calendars: ResolvedCalendar[];
  drives: ResolvedDrive[];
}

function referenceMailbox(mailbox: ResolvedMailbox): ReferenceMailbox {
  return {
    mailboxId: mailbox.mailboxId,
    email: mailbox.mailboxEmail,
    provider: mailbox.provider,
    adapter: () => adapterForMailbox(mailbox),
  };
}

export interface ReferenceDetail extends ResolvedReference {
  toolArgs: Record<string, string>;
}

export interface ReferenceGroup {
  type: ReferenceType;
  items: ResolvedReference[];
}

export interface ReferenceResolution {
  resolved: ReferenceDetail[];
  unresolved: AgentReference[];
}

export async function workspaceReferenceScope(
  appUser: WorkspaceUserSession,
  types: readonly ReferenceType[],
): Promise<ReferenceScope> {
  const [mail, calendars, drives] = await Promise.all([
    mailSessionFor(appUser, "all"),
    workspaceCalendarAccounts(appUser.workspaceId),
    workspaceDrives(appUser.userId, appUser.workspaceId),
  ]);

  return {
    workspaceId: appUser.workspaceId,
    types,
    mailboxes: mail ? mail.mailboxes.filter(aiEnabled).map(referenceMailbox) : [],
    calendars: calendars.filter(aiEnabled),
    drives: drives.filter(aiEnabled),
  };
}

function wants(scope: ReferenceScope, type: ReferenceType): boolean {
  return scope.types.includes(type);
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}

function mailboxOf(scope: ReferenceScope, mailboxId: string) {
  return scope.mailboxes.find((m) => m.mailboxId === mailboxId) ?? null;
}

function calendarAccountOf(scope: ReferenceScope, accountId: string) {
  return scope.calendars.find((c) => c.accountId === accountId) ?? null;
}

async function customLabels(scope: ReferenceScope): Promise<CustomLabel[]> {
  const ids = scope.mailboxes.map((m) => m.mailboxId);
  if (ids.length === 0) return [];
  return listMailboxLabels(ids);
}

function labelCandidates(custom: CustomLabel[]) {
  const seen = new Set<string>();
  const out: { key: string; name: string }[] = [];
  for (const { key, name } of [...LABEL_OPTIONS, ...custom]) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name });
  }
  return out;
}

function eventWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  const day = 86_400_000;
  return {
    timeMin: new Date(now - SUGGEST_EVENT_WINDOW_BACK_DAYS * day).toISOString(),
    timeMax: new Date(now + SUGGEST_EVENT_WINDOW_FORWARD_DAYS * day).toISOString(),
  };
}

function suggestMailboxes(
  scope: ReferenceScope,
  query: string,
  limit: number,
): ResolvedReference[] {
  return scope.mailboxes
    .filter((m) => matches(query, m.email))
    .slice(0, limit)
    .map((m) => ({
      type: "mailbox" as const,
      id: m.mailboxId,
      label: m.email,
      detail: m.provider,
    }));
}

async function suggestCalendars(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  if (scope.calendars.length === 0) return [];
  const { calendars } = await listCalendarsAcross(scope.calendars);
  return calendars
    .filter((c) => c.visible)
    .filter((c) => matches(query, c.name, c.accountEmail))
    .slice(0, limit)
    .map((c) => ({
      type: "calendar" as const,
      id: packReferenceId(c.accountId, c.id),
      label: c.name,
      detail: accountNameIn(scope.calendars, c.accountId, c.accountEmail),
    }));
}

function suggestDrives(scope: ReferenceScope, query: string, limit: number): ResolvedReference[] {
  return scope.drives
    .filter((d) => matches(query, driveName(d, scope.drives), d.email, d.driveSlug))
    .slice(0, limit)
    .map((d) => ({
      type: "drive" as const,
      id: d.driveId,
      label: driveName(d, scope.drives),
      detail: DRIVE_PROVIDER_LABELS[d.provider],
    }));
}

async function suggestMembers(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  const members = await listWorkspaceMembers(scope.workspaceId);
  return members
    .filter((m) => matches(query, m.name, m.email))
    .slice(0, limit)
    .map((m) => ({
      type: "member" as const,
      id: m.userId,
      label: m.name || m.email,
      detail: m.email,
    }));
}

async function suggestEmails(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  if (query.length < MIN_REMOTE_QUERY || scope.mailboxes.length === 0) {
    return [];
  }
  const perMailbox = Math.max(2, Math.ceil(limit / scope.mailboxes.length));
  const groups = await Promise.all(
    scope.mailboxes.map(async (mailbox) => {
      try {
        const adapter = await mailbox.adapter();
        const { emails } = await adapter.search(query);
        return emails.slice(0, perMailbox).map((email) => ({
          type: "email" as const,
          id: packReferenceId(mailbox.mailboxId, email.id),
          label: email.subject || "(no subject)",
          detail: `${email.fromName || email.from} · ${mailbox.email}`,
          date: email.date,
        }));
      } catch {
        return [];
      }
    }),
  );

  return groups
    .flat()
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(({ date: _date, ...item }) => item);
}

async function suggestEvents(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  if (query.length < MIN_REMOTE_QUERY || scope.calendars.length === 0) {
    return [];
  }
  const { events } = await listEventsAcross(scope.calendars, {
    ...eventWindow(),
    query,
    max: limit * 2,
  });

  return events
    .filter((e) => matches(query, e.title, e.location))
    .slice(0, limit)
    .flatMap((e) => {
      const accountId = e.accountId;
      if (!accountId) return [];
      return [
        {
          type: "event" as const,
          id: packReferenceId(accountId, e.calendarId, e.id),
          label: e.title || "(untitled event)",
          detail: `${e.start} · ${
            e.calendarName ?? accountNameIn(scope.calendars, e.accountId, e.accountEmail ?? "")
          }`.trim(),
        },
      ];
    });
}

async function suggestLabels(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  const custom = await customLabels(scope);
  return labelCandidates(custom)
    .filter((l) => matches(query, l.name, l.key))
    .slice(0, limit)
    .map((l) => ({
      type: "label" as const,
      id: l.key,
      label: l.name,
      detail: l.key,
    }));
}

function suggestFolders(query: string, limit: number): ResolvedReference[] {
  return MAIL_FOLDERS.filter((f) => matches(query, f))
    .slice(0, limit)
    .map((f) => ({
      type: "folder" as const,
      id: f,
      label: f.charAt(0).toUpperCase() + f.slice(1),
    }));
}

async function suggestFiles(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ResolvedReference[]> {
  if (scope.drives.length === 0 || !query) return [];

  const groups = await Promise.all(
    scope.drives.map((drive) =>
      driveSurfaceFor(drive)
        .search(query)
        .then((listing) => listing.entries)
        .catch(() => []),
    ),
  );

  return groups
    .flat()
    .filter((entry) => entry.kind === "file")
    .slice(0, limit)
    .map((entry) => {
      const drive = scope.drives.find((d) => d.driveId === entry.driveId);
      return {
        type: "file" as const,
        id: packReferenceId(entry.driveId, entry.id),
        label: entry.name,
        detail: drive ? driveName(drive, scope.drives) : entry.driveSlug,
      };
    });
}

export async function suggestReferences(
  scope: ReferenceScope,
  query: string,
  limit: number,
): Promise<ReferenceGroup[]> {
  const trimmed = query.trim();

  const tasks = scope.types.map(async (type): Promise<ReferenceGroup> => {
    switch (type) {
      case "mailbox":
        return { type, items: suggestMailboxes(scope, trimmed, limit) };
      case "calendar":
        return { type, items: await suggestCalendars(scope, trimmed, limit) };
      case "drive":
        return { type, items: suggestDrives(scope, trimmed, limit) };
      case "member":
        return { type, items: await suggestMembers(scope, trimmed, limit) };
      case "email":
        return { type, items: await suggestEmails(scope, trimmed, limit) };
      case "event":
        return { type, items: await suggestEvents(scope, trimmed, limit) };
      case "label":
        return { type, items: await suggestLabels(scope, trimmed, limit) };
      case "folder":
        return { type, items: suggestFolders(trimmed, limit) };
      case "file":
        return { type, items: await suggestFiles(scope, trimmed, limit) };
    }
  });

  const groups = await Promise.all(tasks);
  return groups.filter((g) => g.items.length > 0);
}

function resolveMailbox(scope: ReferenceScope, ref: AgentReference): ReferenceDetail | null {
  const mailbox = mailboxOf(scope, ref.id);
  if (!mailbox) return null;
  return {
    ...ref,
    label: mailbox.email,
    detail: mailbox.provider,
    toolArgs: { mailboxId: mailbox.mailboxId },
  };
}

function resolveDrive(scope: ReferenceScope, ref: AgentReference): ReferenceDetail | null {
  const drive = scope.drives.find((d) => d.driveId === ref.id);
  if (!drive) return null;
  return {
    ...ref,
    label: driveName(drive, scope.drives),
    detail: DRIVE_PROVIDER_LABELS[drive.provider],
    toolArgs: { driveId: drive.driveId },
  };
}

function resolveMember(
  ref: AgentReference,
  members: Awaited<ReturnType<typeof listWorkspaceMembers>>,
): ReferenceDetail | null {
  const member = members.find((m) => m.userId === ref.id);
  if (!member) return null;
  return {
    ...ref,
    label: member.name || member.email,
    detail: member.email,
    toolArgs: { memberId: member.userId, email: member.email },
  };
}

function resolveFolder(ref: AgentReference): ReferenceDetail | null {
  if (!(MAIL_FOLDERS as readonly string[]).includes(ref.id)) return null;
  return {
    ...ref,
    label: ref.id.charAt(0).toUpperCase() + ref.id.slice(1),
    toolArgs: { folder: ref.id },
  };
}

function resolveLabel(
  ref: AgentReference,
  keys: Set<string>,
  custom: CustomLabel[],
): ReferenceDetail | null {
  if (!keys.has(ref.id)) return null;
  return {
    ...ref,
    label: resolveLabelName(ref.id, custom),
    detail: ref.id,
    toolArgs: { label: ref.id },
  };
}

interface EmailRefEntry {
  detail: ReferenceDetail;
  mailbox: ReferenceMailbox;
  messageId: string;
}

interface EventRefEntry {
  detail: ReferenceDetail;
  account: ResolvedCalendar;
  calendarId: string;
  eventId: string;
}

interface CalendarRefEntry {
  detail: ReferenceDetail;
  calendarId: string;
}

function resolveEmailRef(scope: ReferenceScope, ref: AgentReference): EmailRefEntry | null {
  const parts = unpackReferenceId(ref.id, 2);
  if (!parts) return null;
  const [mailboxId, messageId] = parts;
  const mailbox = mailboxOf(scope, mailboxId);
  if (!mailbox) return null;
  return {
    mailbox,
    messageId,
    detail: {
      ...ref,
      label: "Email",
      detail: mailbox.email,
      toolArgs: { mailboxId, id: messageId },
    },
  };
}

function resolveEventRef(scope: ReferenceScope, ref: AgentReference): EventRefEntry | null {
  const parts = unpackReferenceId(ref.id, 3);
  if (!parts) return null;
  const [accountId, calendarId, eventId] = parts;
  const account = calendarAccountOf(scope, accountId);
  if (!account || !isCalendarVisible(account, calendarId)) return null;
  return {
    account,
    calendarId,
    eventId,
    detail: {
      ...ref,
      label: "Event",
      detail: resolvedCalendarName(account, scope.calendars),
      toolArgs: { calendarAccountId: accountId, calendarId, eventId },
    },
  };
}

function resolveCalendarRef(scope: ReferenceScope, ref: AgentReference): CalendarRefEntry | null {
  const parts = unpackReferenceId(ref.id, 2);
  if (!parts) return null;
  const [accountId, calendarId] = parts;
  const account = calendarAccountOf(scope, accountId);
  if (!account || !isCalendarVisible(account, calendarId)) return null;
  return {
    calendarId,
    detail: {
      ...ref,
      label: calendarId,
      detail: resolvedCalendarName(account, scope.calendars),
      toolArgs: { calendarAccountId: accountId, calendarId },
    },
  };
}

async function hydrateEmails(entries: EmailRefEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const cached = await getCachedSubjects(
    entries.map((e) => ({
      mailboxId: e.mailbox.mailboxId,
      providerMessageId: e.messageId,
    })),
  );

  const misses: typeof entries = [];
  for (const entry of entries) {
    const hit = cached.get(`${entry.mailbox.mailboxId}:${entry.messageId}`);
    if (hit) {
      entry.detail.label = hit.subject || "(no subject)";
      entry.detail.detail = `${hit.sender} · ${entry.mailbox.email}`;
    } else {
      misses.push(entry);
    }
  }

  await Promise.all(
    misses.slice(0, MAX_HYDRATIONS).map(async (entry) => {
      try {
        const adapter = await entry.mailbox.adapter();
        const message = await adapter.getMessage(entry.messageId);
        entry.detail.label = message.subject || "(no subject)";
        entry.detail.detail = `${message.fromName || message.from || ""} · ${
          entry.mailbox.email
        }`.replace(/^ · /, "");
      } catch {
        entry.detail.label = "Email";
      }
    }),
  );
}

async function hydrateCalendars(scope: ReferenceScope, entries: CalendarRefEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { calendars } = await listCalendarsAcross(scope.calendars);
  for (const entry of entries) {
    const found = calendars.find((c) => c.id === entry.calendarId && c.visible);
    if (found) entry.detail.label = found.name;
  }
}

async function hydrateEvents(scope: ReferenceScope, entries: EventRefEntry[]): Promise<void> {
  await Promise.all(
    entries.slice(0, MAX_HYDRATIONS).map(async (entry) => {
      try {
        const adapter = await adapterForCalendar(entry.account);
        const event = await adapter.getEvent(entry.calendarId, entry.eventId);
        entry.detail.label = event.title || "(untitled event)";
        entry.detail.detail = `${event.start} · ${
          event.calendarName ?? resolvedCalendarName(entry.account, scope.calendars)
        }`;
      } catch {
        entry.detail.label = "Event";
      }
    }),
  );
}

export async function resolveReferences(
  scope: ReferenceScope,
  refs: readonly AgentReference[],
  opts: { hydrate: boolean },
): Promise<ReferenceResolution> {
  const resolved: ReferenceDetail[] = [];
  const unresolved: AgentReference[] = [];

  const emails: EmailRefEntry[] = [];
  const events: EventRefEntry[] = [];
  const calendars: CalendarRefEntry[] = [];
  const files: AgentReference[] = [];

  const needsLabels = refs.some((r) => r.type === "label");
  const needsMembers = refs.some((r) => r.type === "member");

  const [custom, members] = await Promise.all([
    needsLabels && wants(scope, "label") ? customLabels(scope) : [],
    needsMembers && wants(scope, "member") ? listWorkspaceMembers(scope.workspaceId) : [],
  ]);
  const labelKeys = new Set<string>([
    ...LABEL_OPTIONS.map((l) => l.key),
    ...custom.map((l) => l.key),
  ]);

  for (const ref of refs) {
    if (!wants(scope, ref.type)) {
      unresolved.push(ref);
      continue;
    }

    switch (ref.type) {
      case "mailbox": {
        const detail = resolveMailbox(scope, ref);
        if (detail) resolved.push(detail);
        else unresolved.push(ref);
        break;
      }
      case "drive": {
        const detail = resolveDrive(scope, ref);
        if (detail) resolved.push(detail);
        else unresolved.push(ref);
        break;
      }
      case "member": {
        const detail = resolveMember(ref, members);
        if (detail) resolved.push(detail);
        else unresolved.push(ref);
        break;
      }
      case "folder": {
        const detail = resolveFolder(ref);
        if (detail) resolved.push(detail);
        else unresolved.push(ref);
        break;
      }
      case "label": {
        const detail = resolveLabel(ref, labelKeys, custom);
        if (detail) resolved.push(detail);
        else unresolved.push(ref);
        break;
      }
      case "email": {
        const entry = resolveEmailRef(scope, ref);
        if (!entry) {
          unresolved.push(ref);
          break;
        }
        resolved.push(entry.detail);
        emails.push(entry);
        break;
      }
      case "event": {
        const entry = resolveEventRef(scope, ref);
        if (!entry) {
          unresolved.push(ref);
          break;
        }
        resolved.push(entry.detail);
        events.push(entry);
        break;
      }
      case "calendar": {
        const entry = resolveCalendarRef(scope, ref);
        if (!entry) {
          unresolved.push(ref);
          break;
        }
        resolved.push(entry.detail);
        calendars.push(entry);
        break;
      }
      case "file": {
        files.push(ref);
        break;
      }
    }
  }

  if (files.length > 0) {
    await Promise.all(
      files.map(async (ref) => {
        const parts = unpackReferenceId(ref.id, 2);
        const drive = parts ? scope.drives.find((d) => d.driveId === parts[0]) : undefined;
        if (!parts || !drive) {
          unresolved.push(ref);
          return;
        }
        const [driveId, fileId] = parts;
        try {
          const entry = await driveSurfaceFor(drive).getEntry(fileId);
          resolved.push({
            type: "file",
            id: ref.id,
            label: entry.name,
            detail: entry.driveSlug,
            toolArgs: { driveId, fileId },
          });
        } catch {
          unresolved.push(ref);
        }
      }),
    );
  }

  if (opts.hydrate) {
    await Promise.all([
      hydrateEmails(emails),
      hydrateEvents(scope, events),
      hydrateCalendars(scope, calendars),
    ]);
  }

  return { resolved, unresolved };
}
