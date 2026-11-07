import "server-only";
import { isOneOf } from "@/lib/guards";
import {
  findFolderPath,
  getEventValue,
  listContactValues,
  listEventValues,
  listFileValues,
} from "@/ops/values";
import { WRITABLE_ATTENDEE_RESPONSES } from "@/types/calendar";

import {
  authorizeAddressBook,
  authorizeCalendar,
  authorizeDrive,
  type BackgroundPrincipal,
} from "./authorization";
import type { StepReceipt } from "./runtime";

export interface DispatchCandidate {
  id: string;
  title: string;
  subtitle: string;
  at: string | null;
}

export interface FoundDispatch extends DispatchCandidate {
  value: unknown;
  receipt: StepReceipt & { providerMessageId: string };
  detail: string;
}

export interface ReconcileContext {
  principal: BackgroundPrincipal;
  expected: Record<string, unknown>;
  window: { from: Date; to: Date };
}

export interface Reconciler {
  find(ctx: ReconcileContext): Promise<FoundDispatch[]>;
}

const MINUTE = 60_000;

function field(expected: Record<string, unknown>, name: string): string {
  const value = expected[name];
  return typeof value === "string" ? value : "";
}

async function calendarOf(ctx: ReconcileContext) {
  const access = await authorizeCalendar({
    principal: ctx.principal,
    accountId: field(ctx.expected, "accountId"),
  });
  if (!access.ok) throw new Error(access.reason);
  return access.value;
}

const createdEvent: Reconciler = {
  async find(ctx) {
    const title = field(ctx.expected, "title");
    const start = Date.parse(field(ctx.expected, "start"));
    const end = Date.parse(field(ctx.expected, "end"));
    if (!title || Number.isNaN(start) || Number.isNaN(end)) {
      throw new Error("The title and time of this event were not recorded");
    }
    const account = await calendarOf(ctx);
    const events = await listEventValues(account, {
      from: new Date(start - MINUTE),
      to: new Date(end + MINUTE),
      calendarId: field(ctx.expected, "calendarId") || undefined,
      limit: 100,
    });
    return events
      .filter(
        (event) =>
          event.title === title &&
          Math.abs(Date.parse(event.start) - start) < MINUTE &&
          event.status !== "cancelled",
      )
      .map((event) => ({
        id: event.id,
        title: event.title,
        subtitle: event.calendar || account.accountEmail,
        at: event.start,
        value: event,
        receipt: {
          operation: "create-event",
          providerMessageId: event.id,
          resourceId: account.accountId,
        },
        detail: `confirmed in the calendar as ${event.title}`,
      }));
  },
};

const respondedEvent: Reconciler = {
  async find(ctx) {
    const response = field(ctx.expected, "response");
    const eventId = field(ctx.expected, "eventId");
    if (!eventId || !isOneOf(WRITABLE_ATTENDEE_RESPONSES, response)) {
      throw new Error("The event and response of this step were not recorded");
    }
    const account = await calendarOf(ctx);
    const event = await getEventValue(account, field(ctx.expected, "calendarId"), eventId);
    if (event.myResponse !== response) return [];
    return [
      {
        id: event.id,
        title: event.title,
        subtitle: `Your response is ${response}`,
        at: event.start,
        value: event,
        receipt: {
          operation: "respond",
          providerMessageId: event.id,
          resourceId: account.accountId,
        },
        detail: `confirmed as ${response}`,
      },
    ];
  },
};

const uploadedFile: Reconciler = {
  async find(ctx) {
    const name = field(ctx.expected, "name");
    if (!name) throw new Error("The name of this file was not recorded");
    const access = await authorizeDrive({
      principal: ctx.principal,
      driveId: field(ctx.expected, "driveId"),
    });
    if (!access.ok) throw new Error(access.reason);
    const drive = access.value;
    const folder = field(ctx.expected, "folder");
    const parentId = await findFolderPath(drive, folder);
    const files = await listFileValues(drive, parentId, 500);
    return files
      .filter((file) => {
        if (file.kind === "folder" || file.name !== name) return false;
        const modified = file.modifiedAt ? Date.parse(file.modifiedAt) : Number.NaN;
        return (
          Number.isNaN(modified) ||
          (modified >= ctx.window.from.getTime() && modified <= ctx.window.to.getTime())
        );
      })
      .map((file) => ({
        id: file.id,
        title: file.name,
        subtitle: `${folder || "Top of the drive"} · ${file.size} bytes`,
        at: file.modifiedAt ?? null,
        value: file,
        receipt: { operation: "upload", providerMessageId: file.id, resourceId: drive.driveId },
        detail: `confirmed in the drive as ${file.name}`,
      }));
  },
};

const createdContact: Reconciler = {
  async find(ctx) {
    const name = field(ctx.expected, "name");
    const email = field(ctx.expected, "email").toLowerCase();
    if (!name && !email) throw new Error("The name and email of this contact were not recorded");
    const access = await authorizeAddressBook({
      principal: ctx.principal,
      addressBookId: field(ctx.expected, "addressBookId"),
    });
    if (!access.ok) throw new Error(access.reason);
    const account = access.value;
    const bookId = field(ctx.expected, "bookId") || undefined;
    const found = await listContactValues(account, { bookId, query: email || name, limit: 50 });
    return found
      .filter(
        (contact) =>
          (!name || contact.name === name) &&
          (!email || contact.emails.some((e) => e.toLowerCase() === email)),
      )
      .map((contact) => ({
        id: contact.id,
        title: contact.name || contact.email,
        subtitle: contact.email || account.accountEmail,
        at: null,
        value: contact,
        receipt: {
          operation: "create-contact",
          providerMessageId: contact.id,
          resourceId: account.accountId,
        },
        detail: `confirmed in the address book as ${contact.name || contact.email}`,
      }));
  },
};

export const RECONCILERS: Record<string, Reconciler> = {
  "calendar.create": createdEvent,
  "calendar.respond": respondedEvent,
  "drive.write": uploadedFile,
  "drive.copy": uploadedFile,
  "mail.saveAttachment": uploadedFile,
  "mail.saveEml": uploadedFile,
  "contacts.create": createdContact,
};
