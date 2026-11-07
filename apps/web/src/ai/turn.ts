import { z } from "zod";

import type { DriveEntryRow } from "@/server/schema";
import type { CalendarEvent } from "@/types/calendar";
import type { Email } from "@/types/mail";

export const TURN_PART_TYPE = "data-turn";

export const AGENT_DROP_ID = "agent-panel-drop";

export interface AgentEmail {
  id: string;
  from: string;
  fromEmail?: string;
  to?: string[];
  subject: string;
  date: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  mailboxEmail?: string;
}

export interface AgentEvent {
  id: string;
  calendarId: string;
  accountId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  calendarName?: string;
}

interface TurnEnvelopeBase {
  sentAt: string;
  timeZone: string;
}

export interface MailTurnEnvelope extends TurnEnvelopeBase {
  kind: "mail";
  folder?: string;
  emails: AgentEmail[];
}

export interface CalendarTurnEnvelope extends TurnEnvelopeBase {
  kind: "calendar";
  view?: string;
  visibleRange?: { start: string; end: string };
  events: AgentEvent[];
}

export interface AgentFile {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  driveSlug?: string;
}

export interface DriveTurnEnvelope extends TurnEnvelopeBase {
  kind: "drive";
  folderId?: string;
  folderPath?: string[];
  files: AgentFile[];
}

export interface AgentContact {
  addressBookId: string;
  bookId: string;
  contactId: string;
  name: string;
  email?: string;
  bookName?: string;
}

export interface ContactsTurnEnvelope extends TurnEnvelopeBase {
  kind: "contacts";
  contacts: AgentContact[];
}

export interface WorkspaceTurnEnvelope extends TurnEnvelopeBase {
  kind: "workspace";
}

export type TurnEnvelope =
  | MailTurnEnvelope
  | CalendarTurnEnvelope
  | DriveTurnEnvelope
  | ContactsTurnEnvelope
  | WorkspaceTurnEnvelope;

const agentEmailSchema = z.object({
  id: z.string(),
  from: z.string(),
  fromEmail: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string(),
  date: z.string(),
  snippet: z.string(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  folder: z.string(),
  mailboxEmail: z.string().optional(),
});

const agentEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  accountId: z.string().optional(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  location: z.string().optional(),
  calendarName: z.string().optional(),
});

const agentFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["file", "folder"]),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  modifiedAt: z.string().optional(),
  driveSlug: z.string().optional(),
});

export const turnEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mail"),
    sentAt: z.string(),
    timeZone: z.string(),
    folder: z.string().optional(),
    emails: z.array(agentEmailSchema).max(20),
  }),
  z.object({
    kind: z.literal("calendar"),
    sentAt: z.string(),
    timeZone: z.string(),
    view: z.string().optional(),
    visibleRange: z.object({ start: z.string(), end: z.string() }).optional(),
    events: z.array(agentEventSchema).max(20),
  }),
  z.object({
    kind: z.literal("drive"),
    sentAt: z.string(),
    timeZone: z.string(),
    folderId: z.string().optional(),
    folderPath: z.array(z.string()).max(32).optional(),
    files: z.array(agentFileSchema).max(20),
  }),
  z.object({
    kind: z.literal("contacts"),
    sentAt: z.string(),
    timeZone: z.string(),
    contacts: z
      .array(
        z.object({
          addressBookId: z.string(),
          bookId: z.string(),
          contactId: z.string(),
          name: z.string(),
          email: z.string().optional(),
          bookName: z.string().optional(),
        }),
      )
      .max(20),
  }),
  z.object({
    kind: z.literal("workspace"),
    sentAt: z.string(),
    timeZone: z.string(),
  }),
]);

export function workspaceTurn(): WorkspaceTurnEnvelope {
  return {
    kind: "workspace",
    sentAt: new Date().toISOString(),
    timeZone: viewerTimeZone(),
  };
}

export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function toAgentEmail(email: Email): AgentEmail {
  return {
    id: email.id,
    from: email.fromName || email.from,
    fromEmail: email.from,
    to: email.to,
    subject: email.subject,
    date: email.date,
    snippet: email.snippet,
    isRead: email.isRead,
    isStarred: email.isStarred,
    folder: email.folder,
    mailboxEmail: email.mailboxEmail,
  };
}

export function toAgentFile(entry: DriveEntryRow): AgentFile {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    mimeType: entry.mimeType ?? undefined,
    size: entry.size ?? undefined,
    modifiedAt: entry.modifiedAt ?? undefined,
    driveSlug: entry.driveSlug,
  };
}

export function toAgentEvent(event: CalendarEvent): AgentEvent {
  return {
    id: event.id,
    calendarId: event.calendarId,
    accountId: event.accountId,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    location: event.location,
    calendarName: event.calendarName,
  };
}
