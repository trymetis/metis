import "server-only";
import { pruneAuditEvents } from "@/audit/prune";
import { getInstanceConfig } from "@/config/runtime";
import { isOneOf } from "@/lib/guards";
import { pruneCachedBodies } from "@/mail/cache";
import { pruneAbandonedCimdClients } from "@/mcp/prune-cimd-clients";
import {
  createContactValue,
  createEventValue,
  deleteContactValue,
  deleteEventOp,
  deleteFileOp,
  downloadAttachment,
  ensureFolder,
  type EventValue,
  findFolderPath,
  freeSlots,
  getContactValue,
  getEventValue,
  getFileValue,
  importIcs,
  listContactValues,
  listEventValues,
  listFileValues,
  moveFileOp,
  primaryBookId,
  readFileBytes,
  readFileText,
  renameFileOp,
  resolveFolderPath,
  respondEventOp,
  searchFileValues,
  updateContactValue,
  updateEventValue,
  writeFileBytes,
} from "@/ops/values";
import { WRITABLE_ATTENDEE_RESPONSES } from "@/types/calendar";
import type { EventPatch } from "@/types/calendar";

import { pruneWorkflowData } from "../store";
import { emptyValue, T } from "../values";
import {
  BlockedError,
  boolOf,
  dateOf,
  emit,
  list,
  numberOf,
  type Params,
  record,
  type Runner,
  type StepCtx,
  str,
  text,
} from "./types";

function eventRef(params: Params) {
  const event = record(params.event);
  const accountId = str(event.accountId);
  const calendarId = str(event.calendarId);
  const id = str(event.id);
  if (!accountId || !calendarId || !id) throw new Error("This step needs an event");
  return { accountId, calendarId, id, value: event };
}

function fileRef(params: Params, name = "file") {
  const file = record(params[name]);
  const driveId = str(file.driveId);
  const id = str(file.id);
  if (!driveId || !id) throw new Error("This step needs a file");
  return { driveId, id, value: file };
}

function contactRef(params: Params) {
  const contact = record(params.contact);
  const addressBookId = str(contact.addressBookId);
  const bookId = str(contact.bookId);
  const id = str(contact.id);
  if (!addressBookId || !bookId || !id) throw new Error("This step needs a contact");
  return { addressBookId, bookId, id, value: contact };
}

function contactFields(params: Params) {
  return {
    name: text(params, "name") || undefined,
    email: text(params, "email") || undefined,
    phone: text(params, "phone") || undefined,
    organization: text(params, "organization") || undefined,
    title: text(params, "title") || undefined,
    notes: text(params, "notes") || undefined,
  };
}

function isoOf(params: Params, name: string): string | undefined {
  return dateOf(params, name)?.toISOString();
}

function previewEvent(params: Params, extra: Partial<EventValue> = {}) {
  return emit(
    {
      ...record(emptyValue(T.event)),
      accountId: text(params, "calendar"),
      title: text(params, "title"),
      start: isoOf(params, "start") ?? new Date().toISOString(),
      end: isoOf(params, "end") ?? new Date().toISOString(),
      ...extra,
    },
    "would change the calendar",
  );
}

const calendarList: Runner = {
  async run(ctx, params) {
    const account = await ctx.calendar(text(params, "calendar"));
    const events = await listEventValues(account, {
      from: dateOf(params, "from") ?? ctx.now,
      to: dateOf(params, "to") ?? new Date(ctx.now.getTime() + 7 * 86_400_000),
      calendarId: text(params, "calendarId") || undefined,
      query: text(params, "query") || undefined,
      limit: numberOf(params, "limit", 50),
    });
    return {
      kind: "emit",
      emits: events.map((event) => ({ result: event, key: `${event.calendarId}:${event.id}` })),
      detail: `${events.length} event(s)`,
    };
  },
};

const calendarGet: Runner = {
  async run(ctx, params) {
    const account = await ctx.calendar(text(params, "calendar"));
    return emit(await getEventValue(account, text(params, "calendarId"), text(params, "eventId")));
  },
};

const calendarCreate: Runner = {
  expect(params) {
    return {
      accountId: text(params, "calendar"),
      calendarId: text(params, "calendarId"),
      title: text(params, "title"),
      start: isoOf(params, "start") ?? "",
      end: isoOf(params, "end") ?? "",
    };
  },
  async run(ctx, params) {
    const account = await ctx.calendar(text(params, "calendar"));
    const start = isoOf(params, "start");
    const end = isoOf(params, "end");
    if (!start || !end) throw new Error("An event needs a start and an end");
    const attendees = list(params, "attendees");
    const created = await createEventValue(account, {
      calendarId: text(params, "calendarId") || undefined,
      title: text(params, "title"),
      description: text(params, "description") || undefined,
      location: text(params, "location") || undefined,
      start,
      end,
      allDay: boolOf(params, "allDay", false),
      attendees: attendees.length > 0 ? attendees : undefined,
      timeZone: ctx.timezone,
    });
    return emit(created, `created ${created.title}`, {
      operation: "create-event",
      providerMessageId: created.id,
      resourceId: account.accountId,
    });
  },
  preview(_ctx, params) {
    return previewEvent(params);
  },
};

const calendarUpdate: Runner = {
  async run(ctx, params) {
    const ref = eventRef(params);
    const account = await ctx.calendar(ref.accountId);
    const patch: EventPatch = {};
    for (const field of ["title", "description", "location"] as const) {
      const value = text(params, field);
      if (value) patch[field] = value;
    }
    const start = isoOf(params, "start");
    const end = isoOf(params, "end");
    if (start) patch.start = start;
    if (end) patch.end = end;
    if (typeof params.allDay === "boolean") patch.allDay = params.allDay;
    const attendees = list(params, "attendees");
    if (attendees.length > 0) patch.attendees = attendees;
    return emit(await updateEventValue(account, ref.calendarId, ref.id, patch), "updated");
  },
  preview(_ctx, params) {
    return emit(eventRef(params).value, "would update the event");
  },
};

const calendarDelete: Runner = {
  async run(ctx, params) {
    const ref = eventRef(params);
    const account = await ctx.calendar(ref.accountId);
    await deleteEventOp(account, ref.calendarId, ref.id);
    return emit({ ...ref.value, status: "cancelled" }, "deleted");
  },
  preview(_ctx, params) {
    return emit(eventRef(params).value, "would delete the event");
  },
};

const calendarRespond: Runner = {
  expect(params) {
    const event = record(params.event);
    return {
      accountId: str(event.accountId),
      calendarId: str(event.calendarId),
      eventId: str(event.id),
      response: text(params, "response"),
    };
  },
  async run(ctx, params) {
    const ref = eventRef(params);
    const response = text(params, "response");
    if (!isOneOf(WRITABLE_ATTENDEE_RESPONSES, response)) {
      throw new Error("Respond with accepted, tentative or declined");
    }
    const account = await ctx.calendar(ref.accountId);
    await respondEventOp(account, ref.calendarId, ref.id, response);
    return emit({ ...ref.value, myResponse: response }, response, {
      operation: "respond",
      providerMessageId: ref.id,
      resourceId: account.accountId,
    });
  },
  preview(_ctx, params) {
    return emit(
      { ...eventRef(params).value, myResponse: text(params, "response") },
      "would respond",
    );
  },
};

const freeTime: Runner = {
  async run(ctx, params) {
    const account = await ctx.calendar(text(params, "calendar"));
    const slots = await freeSlots(account, {
      from: dateOf(params, "from") ?? ctx.now,
      to: dateOf(params, "to") ?? new Date(ctx.now.getTime() + 7 * 86_400_000),
      minutes: numberOf(params, "minutes", 30),
      dayStart: text(params, "dayStart") || "09:00",
      dayEnd: text(params, "dayEnd") || "17:00",
      timeZone: text(params, "timezone") || ctx.timezone,
    });
    return emit(
      { found: slots.length > 0, first: slots[0]?.start ?? new Date(0).toISOString(), slots },
      `${slots.length} slot(s)`,
    );
  },
};

async function sourceText(ctx: StepCtx, source: Record<string, unknown>): Promise<string> {
  if (
    typeof source.messageId === "string" &&
    typeof source.mailboxId === "string" &&
    typeof source.id === "string"
  ) {
    const handle = await ctx.mailbox(source.mailboxId);
    return (await downloadAttachment(handle, source.messageId, source.id)).data.toString("utf8");
  }
  if (typeof source.driveId === "string" && typeof source.id === "string") {
    const drive = await ctx.drive(source.driveId);
    return (await readFileBytes(drive, source.id, ctx.signal)).data.toString("utf8");
  }
  throw new Error("Pass an attachment or a drive file holding the invitation");
}

const calendarImport: Runner = {
  expect(params) {
    return { accountId: text(params, "calendar"), calendarId: text(params, "calendarId") };
  },
  async run(ctx, params) {
    const ics = await sourceText(ctx, record(params.source));
    const account = await ctx.calendar(text(params, "calendar"));
    const created = await importIcs(account, text(params, "calendarId") || undefined, ics);
    return emit(created, `added ${created.title}`, {
      operation: "create-event",
      providerMessageId: created.id,
      resourceId: account.accountId,
    });
  },
  preview(_ctx, params) {
    return previewEvent(params, { title: "(from the invitation)" });
  },
};

const driveList: Runner = {
  async run(ctx, params) {
    const drive = await ctx.drive(text(params, "drive"));
    const folderId = await findFolderPath(drive, text(params, "folder"));
    const files = await listFileValues(drive, folderId, numberOf(params, "limit", 100));
    return {
      kind: "emit",
      emits: files.map((file) => ({ result: file, key: `${file.driveId}:${file.id}` })),
      detail: `${files.length} file(s)`,
    };
  },
};

const driveSearch: Runner = {
  async run(ctx, params) {
    const drive = await ctx.drive(text(params, "drive"));
    const files = await searchFileValues(
      drive,
      text(params, "query"),
      numberOf(params, "limit", 50),
    );
    return {
      kind: "emit",
      emits: files.map((file) => ({ result: file, key: `${file.driveId}:${file.id}` })),
      detail: `${files.length} file(s)`,
    };
  },
};

const driveGet: Runner = {
  async run(ctx, params) {
    const drive = await ctx.drive(text(params, "drive"));
    return emit(await getFileValue(drive, text(params, "fileId")));
  },
};

const readText: Runner = {
  async run(ctx, params) {
    const ref = fileRef(params);
    const drive = await ctx.drive(ref.driveId);
    return emit(await readFileText(drive, ref.id, ctx.signal));
  },
};

const download: Runner = {
  async run(ctx, params) {
    const ref = fileRef(params);
    const drive = await ctx.drive(ref.driveId);
    const bytes = await readFileBytes(drive, ref.id, ctx.signal);
    return emit(await ctx.putBlob(bytes.name, bytes.mimeType, bytes.data), `kept ${bytes.name}`);
  },
};

const write: Runner = {
  expect(params) {
    return {
      driveId: text(params, "drive"),
      folder: text(params, "folder"),
      name: text(params, "name"),
    };
  },
  async run(ctx, params) {
    const drive = await ctx.drive(text(params, "drive"));
    const parentId = await resolveFolderPath(drive, text(params, "folder"));
    const blob = record(params.contents);
    const fromBlob = typeof blob.id === "string" && blob.id ? await ctx.getBlob(blob.id) : null;
    const data = fromBlob?.data ?? Buffer.from(text(params, "content"), "utf8");
    const file = await writeFileBytes(drive, {
      parentId,
      name: text(params, "name"),
      mimeType: fromBlob?.mimeType ?? "text/plain",
      data,
      signal: ctx.signal,
    });
    return emit(file, `wrote ${file.name}`, {
      operation: "upload",
      providerMessageId: file.id,
      resourceId: drive.driveId,
    });
  },
  preview(_ctx, params) {
    return emit(
      { ...record(emptyValue(T.file)), driveId: text(params, "drive"), name: text(params, "name") },
      "would create the file",
    );
  },
};

const createFolder: Runner = {
  async run(ctx, params) {
    const drive = await ctx.drive(text(params, "drive"));
    const parentId = await resolveFolderPath(drive, text(params, "folder"));
    const folder = await ensureFolder(drive, parentId, text(params, "name"));
    return emit({ id: folder.id, driveId: drive.driveId, name: folder.name, url: folder.url });
  },
  preview(_ctx, params) {
    return emit(
      { id: "", driveId: text(params, "drive"), name: text(params, "name"), url: "" },
      "would create the folder",
    );
  },
};

const move: Runner = {
  async run(ctx, params) {
    const ref = fileRef(params);
    const drive = await ctx.drive(ref.driveId);
    const parentId = await resolveFolderPath(drive, text(params, "folder"));
    return emit(await moveFileOp(drive, ref.id, parentId), "moved");
  },
  preview(_ctx, params) {
    return emit(fileRef(params).value, "would move the file");
  },
};

const rename: Runner = {
  async run(ctx, params) {
    const ref = fileRef(params);
    const drive = await ctx.drive(ref.driveId);
    return emit(await renameFileOp(drive, ref.id, text(params, "name")), "renamed");
  },
  preview(_ctx, params) {
    return emit({ ...fileRef(params).value, name: text(params, "name") }, "would rename the file");
  },
};

const copy: Runner = {
  expect(params) {
    return {
      driveId: text(params, "drive"),
      folder: text(params, "folder"),
      name: text(params, "name") || str(record(params.file).name),
    };
  },
  async run(ctx, params) {
    const ref = fileRef(params);
    const source = await ctx.drive(ref.driveId);
    const bytes = await readFileBytes(source, ref.id, ctx.signal);
    const target = await ctx.drive(text(params, "drive"));
    const parentId = await resolveFolderPath(target, text(params, "folder"));
    const file = await writeFileBytes(target, {
      parentId,
      name: text(params, "name") || bytes.name,
      mimeType: bytes.mimeType,
      data: bytes.data,
      signal: ctx.signal,
    });
    return emit(file, `copied to ${file.name}`, {
      operation: "upload",
      providerMessageId: file.id,
      resourceId: target.driveId,
    });
  },
  preview(_ctx, params) {
    return emit(
      { ...fileRef(params).value, driveId: text(params, "drive") },
      "would copy the file",
    );
  },
};

const remove: Runner = {
  async run(ctx, params) {
    const ref = fileRef(params);
    const drive = await ctx.drive(ref.driveId);
    return emit(await deleteFileOp(drive, ref.id), "deleted");
  },
  preview(_ctx, params) {
    return emit(fileRef(params).value, "would delete the file");
  },
};

const contactsList: Runner = {
  async run(ctx, params) {
    const account = await ctx.addressBook(text(params, "addressbook"));
    const contacts = await listContactValues(account, {
      bookId: text(params, "book") || undefined,
      limit: numberOf(params, "limit", 100),
    });
    return {
      kind: "emit",
      emits: contacts.map((c) => ({ result: c, key: `${c.addressBookId}:${c.bookId}:${c.id}` })),
      detail: `${contacts.length} contact(s)`,
    };
  },
};

const contactsSearch: Runner = {
  async run(ctx, params) {
    const account = await ctx.addressBook(text(params, "addressbook"));
    const contacts = await listContactValues(account, {
      query: text(params, "query"),
      limit: numberOf(params, "limit", 50),
    });
    return {
      kind: "emit",
      emits: contacts.map((c) => ({ result: c, key: `${c.addressBookId}:${c.bookId}:${c.id}` })),
      detail: `${contacts.length} contact(s)`,
    };
  },
};

const contactsGet: Runner = {
  async run(ctx, params) {
    const account = await ctx.addressBook(text(params, "addressbook"));
    return emit(await getContactValue(account, text(params, "book"), text(params, "contactId")));
  },
};

const contactsCreate: Runner = {
  expect(params) {
    return {
      addressBookId: text(params, "addressbook"),
      bookId: text(params, "book"),
      name: text(params, "name"),
      email: text(params, "email"),
    };
  },
  async run(ctx, params) {
    const account = await ctx.addressBook(text(params, "addressbook"));
    const fields = contactFields(params);
    if (!fields.name && !fields.email && !fields.organization) {
      throw new Error("A contact needs a name, an email or an organization");
    }
    const bookId = text(params, "book") || (await primaryBookId(account));
    const created = await createContactValue(account, bookId, fields);
    return emit(created, `saved ${created.name || created.email}`, {
      operation: "create-contact",
      providerMessageId: created.id,
      resourceId: account.accountId,
    });
  },
  preview(_ctx, params) {
    return emit(
      {
        ...record(emptyValue(T.contact)),
        addressBookId: text(params, "addressbook"),
        name: text(params, "name"),
        email: text(params, "email"),
      },
      "would save the contact",
    );
  },
};

const contactsUpdate: Runner = {
  async run(ctx, params) {
    const ref = contactRef(params);
    const account = await ctx.addressBook(ref.addressBookId);
    return emit(
      await updateContactValue(account, ref.bookId, ref.id, contactFields(params)),
      "updated",
    );
  },
  preview(_ctx, params) {
    return emit(contactRef(params).value, "would update the contact");
  },
};

const contactsDelete: Runner = {
  async run(ctx, params) {
    const ref = contactRef(params);
    const account = await ctx.addressBook(ref.addressBookId);
    await deleteContactValue(account, ref.bookId, ref.id);
    return emit(ref.value, "deleted");
  },
  preview(_ctx, params) {
    return emit(contactRef(params).value, "would delete the contact");
  },
};

function maintenance(task: (ctx: StepCtx) => Promise<number>, what: string): Runner {
  return {
    async run(ctx) {
      if (ctx.definition.kind !== "system") {
        throw new BlockedError("Maintenance steps only run in system workflows");
      }
      const pruned = await task(ctx);
      return emit({ pruned }, `${pruned} ${what} pruned`);
    },
    preview() {
      return emit({ pruned: 0 }, "not run in a test run");
    },
  };
}

export const RESOURCE_RUNNERS = {
  "calendar.list": calendarList,
  "calendar.get": calendarGet,
  "calendar.create": calendarCreate,
  "calendar.update": calendarUpdate,
  "calendar.delete": calendarDelete,
  "calendar.respond": calendarRespond,
  "calendar.freeTime": freeTime,
  "calendar.importIcs": calendarImport,
  "drive.list": driveList,
  "drive.search": driveSearch,
  "drive.get": driveGet,
  "drive.readText": readText,
  "drive.download": download,
  "drive.write": write,
  "drive.createFolder": createFolder,
  "drive.move": move,
  "drive.rename": rename,
  "drive.copy": copy,
  "drive.delete": remove,
  "contacts.list": contactsList,
  "contacts.search": contactsSearch,
  "contacts.get": contactsGet,
  "contacts.create": contactsCreate,
  "contacts.update": contactsUpdate,
  "contacts.delete": contactsDelete,
  "system.cimdPrune": maintenance((ctx) => pruneAbandonedCimdClients(ctx.now), "client(s)"),
  "system.auditPrune": maintenance((ctx) => pruneAuditEvents(ctx.now), "audit event(s)"),
  "system.mailCachePrune": maintenance(
    (ctx) => pruneCachedBodies(ctx.now, getInstanceConfig().mailCache.retentionDays),
    "message bod(ies)",
  ),
  "system.workflowPrune": maintenance(async (ctx) => {
    const runner = getInstanceConfig().workflowRunner;
    const pruned = await pruneWorkflowData({
      now: ctx.now,
      stepDataDays: runner.stepDataDays,
      historyDays: runner.historyDays,
    });
    return pruned.cleared + pruned.deletedRuns + pruned.deletedEvents;
  }, "workflow record(s)"),
} as const satisfies Record<string, Runner>;
