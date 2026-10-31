import "server-only";
import { z } from "zod";

import { adapterForCalendar, assertWritable, type ResolvedCalendar } from "@/calendar/aggregate";
import {
  adapterForDrive,
  type DriveSurface,
  driveSurfaceFor,
  type ResolvedDrive,
} from "@/drive/aggregate";
import { looksTextual, TEXT_LIMIT } from "@/lib/file-utils";
import { htmlToText, truncate } from "@/lib/utils";
import type { MailAdapter } from "@/mail/adapter";
import { parseCalendarInvite } from "@/mail/attachment-data";
import { readRawMessage } from "@/mail/raw";
import type {
  CalendarEvent,
  EventDraft,
  EventPatch,
  WritableAttendeeResponse,
} from "@/types/calendar";
import type { DriveEntry } from "@/types/drive";
import type { Attachment, DraftPayload, Email, MailFolder } from "@/types/mail";

import type { Output } from "./output";

export const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const BODY_LIMIT = 20_000;

export interface MailHandle {
  mailboxId: string;
  email: string;
  adapter: MailAdapter;
}

export const attachmentValueOutput = z.object({
  id: z.string(),
  mailboxId: z.string(),
  messageId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export const mailValueOutput = z.object({
  id: z.string(),
  mailboxId: z.string(),
  mailbox: z.string(),
  threadId: z.string(),
  from: z.string(),
  fromName: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  subject: z.string(),
  snippet: z.string(),
  body: z.string(),
  date: z.string().optional(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  labels: z.array(z.string()),
  folder: z.string(),
  hasAttachments: z.boolean(),
  attachments: z.array(attachmentValueOutput),
});

export const threadValueOutput = z.object({
  id: z.string(),
  mailboxId: z.string(),
  subject: z.string(),
  count: z.number(),
  participants: z.array(z.string()),
  lastDate: z.string().optional(),
  messages: z.array(mailValueOutput),
});

export const blobOutput = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.instanceof(Buffer),
});

export const sentOutput = z.object({ id: z.string().nullable() });

export const draftedOutput = z.object({ id: z.string() });

export const eventValueOutput = z.object({
  id: z.string(),
  accountId: z.string(),
  calendarId: z.string(),
  calendar: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  status: z.string(),
  organizer: z.string(),
  attendees: z.array(z.object({ email: z.string(), name: z.string(), response: z.string() })),
  myResponse: z.string(),
  meetingUrl: z.string(),
  recurring: z.boolean(),
});

export const slotOutput = z.object({ start: z.string(), end: z.string() });

export const fileValueOutput = z.object({
  id: z.string(),
  driveId: z.string(),
  name: z.string(),
  kind: z.string(),
  mimeType: z.string(),
  size: z.number(),
  modifiedAt: z.string().optional(),
  parentId: z.string(),
  url: z.string(),
});

export const fileTextOutput = z.object({ text: z.string(), truncated: z.boolean() });

export type MailValue = Output<typeof mailValueOutput>;
export type AttachmentValue = Output<typeof attachmentValueOutput>;
export type EventValue = Output<typeof eventValueOutput>;
export type FileValue = Output<typeof fileValueOutput>;

function attachmentValue(
  handle: MailHandle,
  messageId: string,
  attachment: Attachment,
): AttachmentValue {
  return {
    id: attachment.id,
    mailboxId: handle.mailboxId,
    messageId,
    name: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

export function mailValue(
  handle: MailHandle,
  email: Partial<Email> & { id: string },
  attachments?: Attachment[],
): MailValue {
  const body = email.bodyText ?? (email.bodyHtml ? htmlToText(email.bodyHtml) : "");
  const listed = attachments ?? email.attachments ?? [];
  return {
    id: email.id,
    mailboxId: handle.mailboxId,
    mailbox: handle.email,
    threadId: email.threadId ?? "",
    from: email.from ?? "",
    fromName: email.fromName ?? "",
    to: email.to ?? [],
    cc: email.cc ?? [],
    subject: email.subject ?? "",
    snippet: email.snippet ?? "",
    body: truncate(body, BODY_LIMIT),
    date: email.date,
    isRead: email.isRead ?? false,
    isStarred: email.isStarred ?? false,
    labels: email.labels ?? [],
    folder: email.folder ?? "",
    hasAttachments: listed.length > 0,
    attachments: listed.map((attachment) => attachmentValue(handle, email.id, attachment)),
  };
}

export async function readMail(
  handle: MailHandle,
  id: string,
  summary?: Partial<Email>,
): Promise<MailValue> {
  const [full, attachments] = await Promise.all([
    handle.adapter.getMessage(id),
    handle.adapter.listAttachments(id).catch(() => []),
  ]);
  return mailValue(handle, { ...summary, ...full, id }, attachments);
}

export async function listMail(
  handle: MailHandle,
  folder: MailFolder,
  limit: number,
): Promise<MailValue[]> {
  const listed = await handle.adapter.listMessages(folder, undefined, limit);
  return (listed.emails ?? []).slice(0, limit).map((email) => mailValue(handle, email));
}

export async function searchMail(
  handle: MailHandle,
  query: string,
  limit: number,
): Promise<MailValue[]> {
  const listed = await handle.adapter.search(query);
  return (listed.emails ?? []).slice(0, limit).map((email) => mailValue(handle, email));
}

export async function readThread(
  handle: MailHandle,
  threadId: string,
): Promise<Output<typeof threadValueOutput>> {
  const emails = await handle.adapter.getThread(threadId);
  const messages = emails.map((email) => mailValue(handle, email));
  const last = messages.at(-1);
  return {
    id: threadId,
    mailboxId: handle.mailboxId,
    subject: messages[0]?.subject ?? "",
    count: messages.length,
    participants: [...new Set(messages.flatMap((m) => [m.from, ...m.to, ...m.cc]).filter(Boolean))],
    lastDate: last?.date,
    messages,
  };
}

export async function downloadAttachment(
  handle: MailHandle,
  messageId: string,
  attachmentId: string,
): Promise<Output<typeof blobOutput>> {
  const attachments = await handle.adapter.listAttachments(messageId);
  const meta = attachments.find((a) => a.id === attachmentId);
  if (!meta) throw new Error("That attachment is no longer on the message");
  if (meta.size > MAX_BLOB_BYTES) throw new Error("That attachment is larger than 10 MB");
  const downloaded = await handle.adapter.downloadAttachment(messageId, attachmentId);
  if (!downloaded) throw new Error("That attachment is no longer available");
  return {
    name: meta.filename,
    mimeType: downloaded.mimeType ?? meta.mimeType,
    data: downloaded.buffer,
  };
}

export async function rawMail(handle: MailHandle, id: string): Promise<Buffer> {
  const raw = await readRawMessage(handle.adapter, id);
  const data = Buffer.from(raw, "utf8");
  if (data.byteLength > MAX_BLOB_BYTES) throw new Error("That message is larger than 10 MB");
  return data;
}

export async function sendMail(
  handle: MailHandle,
  payload: DraftPayload,
): Promise<Output<typeof sentOutput>> {
  return handle.adapter.sendMessage(payload);
}

export async function createDraftMail(
  handle: MailHandle,
  payload: DraftPayload,
): Promise<Output<typeof draftedOutput>> {
  return handle.adapter.createDraft(payload);
}

export function eventValue(account: ResolvedCalendar, event: CalendarEvent): EventValue {
  return {
    id: event.id,
    accountId: account.accountId,
    calendarId: event.calendarId,
    calendar: event.calendarName ?? "",
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    status: event.status ?? "confirmed",
    organizer: event.organizer?.email ?? "",
    attendees: (event.attendees ?? []).map((a) => ({
      email: a.email,
      name: a.name ?? "",
      response: a.response ?? "needsAction",
    })),
    myResponse: event.myResponse ?? "",
    meetingUrl: event.meetingUrl ?? "",
    recurring: event.recurring ?? false,
  };
}

export async function listEventValues(
  account: ResolvedCalendar,
  args: { from: Date; to: Date; calendarId?: string; query?: string; limit: number },
): Promise<EventValue[]> {
  const adapter = await adapterForCalendar(account);
  const calendarIds = args.calendarId ? [args.calendarId] : account.visibleCalendarIds;
  const listed = await adapter.listEvents({
    calendarIds,
    timeMin: args.from.toISOString(),
    timeMax: args.to.toISOString(),
    query: args.query || undefined,
    max: args.limit,
  });
  return listed.events
    .filter((event) => account.visibleCalendarIds.includes(event.calendarId))
    .slice(0, args.limit)
    .map((event) => eventValue(account, event));
}

export async function getEventValue(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
): Promise<EventValue> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  return eventValue(account, await adapter.getEvent(calendarId, eventId));
}

export async function createEventValue(
  account: ResolvedCalendar,
  draft: EventDraft,
): Promise<EventValue> {
  if (draft.calendarId) assertWritable(account, draft.calendarId);
  const adapter = await adapterForCalendar(account);
  const created = await adapter.createEvent(draft);
  try {
    return eventValue(account, await adapter.getEvent(created.calendarId, created.id));
  } catch {
    return eventValue(account, {
      id: created.id,
      calendarId: created.calendarId,
      title: draft.title,
      description: draft.description,
      location: draft.location,
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay ?? false,
    });
  }
}

export async function updateEventValue(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<EventValue> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.updateEvent(calendarId, eventId, patch);
  return eventValue(account, await adapter.getEvent(calendarId, eventId));
}

export async function deleteEventOp(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.deleteEvent(calendarId, eventId);
}

export async function respondEventOp(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  response: WritableAttendeeResponse,
): Promise<void> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.respondToEvent(calendarId, eventId, response);
}

function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export async function freeSlots(
  account: ResolvedCalendar,
  args: {
    from: Date;
    to: Date;
    minutes: number;
    dayStart: string;
    dayEnd: string;
    timeZone: string;
  },
): Promise<Output<typeof slotOutput>[]> {
  const events = await listEventValues(account, { from: args.from, to: args.to, limit: 500 });
  const busy = events
    .filter((event) => event.status !== "cancelled" && event.myResponse !== "declined")
    .map((event) => ({
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    }))
    .toSorted((a, b) => a.start - b.start);
  const step = 15 * 60_000;
  const length = args.minutes * 60_000;
  const open = minutesOf(args.dayStart);
  const close = minutesOf(args.dayEnd);
  const slots: Output<typeof slotOutput>[] = [];
  let cursor = Math.ceil(args.from.getTime() / step) * step;
  while (cursor + length <= args.to.getTime() && slots.length < 20) {
    const startLocal = localMinutes(new Date(cursor), args.timeZone);
    const endLocal = startLocal + args.minutes;
    const clash = busy.find((b) => b.start < cursor + length && b.end > cursor);
    if (clash) {
      cursor = Math.ceil(clash.end / step) * step;
      continue;
    }
    if (startLocal >= open && endLocal <= close) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + length).toISOString(),
      });
      cursor += length;
      continue;
    }
    cursor += step;
  }
  return slots;
}

export async function importIcs(
  account: ResolvedCalendar,
  calendarId: string | undefined,
  ics: string,
): Promise<EventValue> {
  const [invite] = parseCalendarInvite(ics);
  if (!invite || typeof invite !== "object" || Array.isArray(invite)) {
    throw new Error("That file holds no calendar event");
  }
  const text = (key: string) => {
    const value = invite[key];
    return typeof value === "string" ? value : undefined;
  };
  const start = text("start");
  const end = text("end") ?? start;
  if (!start || !end) throw new Error("That invitation has no start time");
  const attendees = Array.isArray(invite.attendees)
    ? invite.attendees.flatMap((a) => {
        if (typeof a !== "string") return [];
        const match = /<([^>]+)>/.exec(a);
        return [match?.[1] ?? a];
      })
    : [];
  return createEventValue(account, {
    calendarId,
    title: text("summary") ?? "(no title)",
    description: text("description"),
    location: text("location"),
    start,
    end,
    allDay: invite.allDay === true,
    attendees: attendees.length > 0 ? attendees : undefined,
    timeZone: text("timeZone"),
  });
}

export function fileValue(driveId: string, entry: DriveEntry): FileValue {
  return {
    id: entry.id,
    driveId,
    name: entry.name,
    kind: entry.kind,
    mimeType: entry.mimeType ?? "",
    size: entry.size ?? 0,
    modifiedAt: entry.modifiedAt ?? undefined,
    parentId: entry.parentId ?? "",
    url: entry.webUrl ?? "",
  };
}

export function surfaceOf(drive: ResolvedDrive): DriveSurface {
  return driveSurfaceFor(drive);
}

export async function listFileValues(
  drive: ResolvedDrive,
  folderId: string | null,
  limit: number,
): Promise<FileValue[]> {
  const surface = surfaceOf(drive);
  const values: FileValue[] = [];
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's cursor
    const listing = await surface.listFolder(folderId, cursor);
    values.push(...listing.entries.map((entry) => fileValue(drive.driveId, entry)));
    cursor = listing.cursor ?? undefined;
  } while (cursor && values.length < limit);
  return values.slice(0, limit);
}

export async function searchFileValues(
  drive: ResolvedDrive,
  query: string,
  limit: number,
): Promise<FileValue[]> {
  const listing = await surfaceOf(drive).search(query);
  return listing.entries.slice(0, limit).map((entry) => fileValue(drive.driveId, entry));
}

export async function getFileValue(drive: ResolvedDrive, fileId: string): Promise<FileValue> {
  return fileValue(drive.driveId, await surfaceOf(drive).getEntry(fileId));
}

async function streamBytes(body: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total <= limit) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a stream yields its chunks one read at a time
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (total > limit) throw new Error("That file is larger than 10 MB");
  return Buffer.concat(chunks);
}

export async function readFileBytes(
  drive: ResolvedDrive,
  fileId: string,
  signal?: AbortSignal,
): Promise<Output<typeof blobOutput>> {
  const entry = await surfaceOf(drive).getEntry(fileId);
  if (entry.kind === "folder") throw new Error("That is a folder, not a file");
  if ((entry.size ?? 0) > MAX_BLOB_BYTES) throw new Error("That file is larger than 10 MB");
  const adapter = await adapterForDrive(drive);
  const stream = await adapter.readStream(fileId, signal ?? AbortSignal.timeout(60_000));
  try {
    const data = await streamBytes(stream.body, MAX_BLOB_BYTES);
    return {
      name: entry.name,
      mimeType: entry.mimeType ?? stream.mimeType ?? "application/octet-stream",
      data,
    };
  } finally {
    stream.release();
  }
}

export async function readFileText(
  drive: ResolvedDrive,
  fileId: string,
  signal?: AbortSignal,
): Promise<Output<typeof fileTextOutput>> {
  const entry = await surfaceOf(drive).getEntry(fileId);
  if (!looksTextual(entry.name, entry.mimeType)) {
    throw new Error("That file is not plain text");
  }
  const { data } = await readFileBytes(drive, fileId, signal);
  const text = data.toString("utf8");
  return { text: truncate(text, TEXT_LIMIT), truncated: text.length > TEXT_LIMIT };
}

export async function writeFileBytes(
  drive: ResolvedDrive,
  args: {
    parentId: string | null;
    name: string;
    mimeType: string;
    data: Buffer;
    signal?: AbortSignal;
  },
): Promise<FileValue> {
  const surface = surfaceOf(drive);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(args.data));
      controller.close();
    },
  });
  const entry = await surface.writeStream(
    args.parentId,
    { name: args.name, size: args.data.byteLength, mime: args.mimeType },
    body,
    args.signal ?? AbortSignal.timeout(120_000),
  );
  return fileValue(drive.driveId, entry);
}

export async function ensureFolder(
  drive: ResolvedDrive,
  parentId: string | null,
  name: string,
): Promise<FileValue> {
  const existing = (await listFileValues(drive, parentId, 500)).find(
    (entry) => entry.kind === "folder" && entry.name === name,
  );
  if (existing) return existing;
  return fileValue(drive.driveId, await surfaceOf(drive).createFolder(parentId, name));
}

export async function resolveFolderPath(
  drive: ResolvedDrive,
  path: string,
): Promise<string | null> {
  const parts = path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  let parent: string | null = null;
  for (const part of parts) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each folder is looked up inside the previous one
    const folder = await ensureFolder(drive, parent, part);
    parent = folder.id;
  }
  return parent;
}

export async function findFolderPath(drive: ResolvedDrive, path: string): Promise<string | null> {
  const parts = path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  let parent: string | null = null;
  for (const part of parts) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each folder is looked up inside the previous one
    const entries = await listFileValues(drive, parent, 500);
    const folder = entries.find((entry) => entry.kind === "folder" && entry.name === part);
    if (!folder) throw new Error(`There is no folder "${path}" in that drive`);
    parent = folder.id;
  }
  return parent;
}

export async function moveFileOp(
  drive: ResolvedDrive,
  fileId: string,
  parentId: string | null,
): Promise<FileValue> {
  const surface = surfaceOf(drive);
  await surface.move(fileId, parentId);
  return fileValue(drive.driveId, await surface.getEntry(fileId));
}

export async function renameFileOp(
  drive: ResolvedDrive,
  fileId: string,
  name: string,
): Promise<FileValue> {
  const surface = surfaceOf(drive);
  await surface.rename(fileId, name);
  return fileValue(drive.driveId, await surface.getEntry(fileId));
}

export async function deleteFileOp(drive: ResolvedDrive, fileId: string): Promise<FileValue> {
  const surface = surfaceOf(drive);
  const entry = await surface.getEntry(fileId);
  await surface.delete(fileId);
  return fileValue(drive.driveId, entry);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function textToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}
