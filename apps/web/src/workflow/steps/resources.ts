import { T } from "../values";
import { expr, ITEM, line, literal, literalString, p, shown, step } from "./define";
import type { CardContext, StepDef } from "./types";

function calendarLine(ctx: CardContext, accountId: string) {
  if (!accountId) return line("Pick a calendar", "warn");
  return line(ctx.calendarName(accountId) ?? "A calendar you can't see");
}

function driveLine(ctx: CardContext, driveId: string) {
  if (!driveId) return line("Pick a drive", "warn");
  return line(ctx.driveName(driveId) ?? "A drive you can't see");
}

const event = p.expr("Event", T.event, { default: ITEM, required: true });
const file = p.expr("File", T.file, { default: ITEM, required: true });

const calendarList = step({
  key: "calendar.list",
  label: "List events",
  category: "calendar",
  description: "Passes on the events between two times, one item each.",
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("Only in calendar", { bindable: false }),
    from: p.datetime("From", { required: true, default: expr("now") }),
    to: p.datetime("Until", { required: true, default: expr('now + duration("168h")') }),
    query: p.text("Matching"),
    limit: p.number("At most", { bindable: false, default: literal(50), min: 1, max: 250 }),
  },
  many: true,
  output: () => T.event,
  effect: "read",
  card: (node, ctx) => [
    calendarLine(ctx, literalString(node, "calendar")),
    shown(node, "query", "Matching"),
  ],
});

const calendarGet = step({
  key: "calendar.get",
  label: "Get an event",
  category: "calendar",
  description: "Loads one event.",
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("Calendar id", { required: true }),
    eventId: p.text("Event id", { required: true }),
  },
  output: () => T.event,
  effect: "read",
  card: (node, ctx) => [calendarLine(ctx, literalString(node, "calendar"))],
});

const eventFields = {
  title: p.text("Title"),
  description: p.longtext("Description"),
  location: p.text("Location"),
  start: p.datetime("Starts"),
  end: p.datetime("Ends"),
  allDay: p.boolean("All day", { default: literal(false) }),
  attendees: p.emails("Attendees", { target: true }),
};

const calendarCreate = step({
  key: "calendar.create",
  label: "Create an event",
  category: "calendar",
  description: "Adds an event to a calendar, inviting any attendees. A create is never repeated.",
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("In calendar", {
      bindable: false,
      help: "Leave empty for the primary calendar.",
    }),
    ...eventFields,
    title: p.text("Title", { required: true }),
    start: p.datetime("Starts", { required: true }),
    end: p.datetime("Ends", { required: true }),
  },
  output: () => T.event,
  effect: "dispatch",
  card: (node, ctx) => [
    calendarLine(ctx, literalString(node, "calendar")),
    shown(node, "title", ""),
  ],
});

const calendarUpdate = step({
  key: "calendar.update",
  label: "Update an event",
  category: "calendar",
  description: "Changes the fields you fill in and keeps the rest.",
  params: { event, ...eventFields, allDay: p.boolean("All day") },
  output: () => T.event,
  effect: "write",
  card: (node) => [shown(node, "title", "Title"), shown(node, "start", "Starts")],
});

const calendarDelete = step({
  key: "calendar.delete",
  label: "Delete an event",
  category: "calendar",
  description: "Deletes an event, cancelling it for its attendees.",
  params: { event },
  output: () => T.event,
  effect: "write",
  card: () => [line("Deletes the event")],
});

export const RESPONSES = [
  { value: "accepted", label: "Accept" },
  { value: "tentative", label: "Maybe" },
  { value: "declined", label: "Decline" },
] as const;

const calendarRespond = step({
  key: "calendar.respond",
  label: "Respond to an invitation",
  category: "calendar",
  description: "Accepts, declines or tentatively accepts an event, telling its organizer.",
  params: {
    event,
    response: p.select("Response", RESPONSES, { default: literal("accepted"), bindable: true }),
  },
  output: () => T.event,
  effect: "dispatch",
  card: (node) => [
    line(RESPONSES.find((r) => r.value === literalString(node, "response"))?.label ?? "Respond"),
  ],
});

const freeTime = step({
  key: "calendar.freeTime",
  label: "Find free time",
  category: "calendar",
  description: "Finds the open slots of a given length in a calendar between two times.",
  params: {
    calendar: p.calendar("Calendar", { required: true }),
    from: p.datetime("From", { required: true, default: expr("now") }),
    to: p.datetime("Until", { required: true, default: expr('now + duration("168h")') }),
    minutes: p.number("Length (minutes)", {
      required: true,
      default: literal(30),
      min: 5,
      max: 1440,
    }),
    dayStart: p.text("Day starts", { bindable: false, default: literal("09:00") }),
    dayEnd: p.text("Day ends", { bindable: false, default: literal("17:00") }),
    timezone: p.timezone("Time zone", { default: literal("Etc/UTC") }),
  },
  output: () =>
    T.object({
      found: T.boolean,
      first: T.date,
      slots: T.list(T.object({ start: T.date, end: T.date })),
    }),
  effect: "read",
  card: (node, ctx) => [
    calendarLine(ctx, literalString(node, "calendar")),
    shown(node, "minutes", "Minutes:"),
  ],
});

const importIcs = step({
  key: "calendar.importIcs",
  label: "Add an invitation file",
  category: "calendar",
  description: "Creates the event in an .ics attachment or file in a calendar.",
  params: {
    source: p.expr("Invitation", T.json, {
      default: ITEM,
      required: true,
      help: "An attachment or a drive file holding an .ics invitation.",
    }),
    calendar: p.calendar("Calendar", { required: true }),
    calendarId: p.text("In calendar", { bindable: false }),
  },
  output: () => T.event,
  effect: "dispatch",
  card: (node, ctx) => [calendarLine(ctx, literalString(node, "calendar"))],
});

const driveList = step({
  key: "drive.list",
  label: "List a folder",
  category: "drive",
  description: "Passes on the files in a drive folder, one item each.",
  params: {
    drive: p.drive("Drive", { required: true }),
    folder: p.driveFolder("Folder", { help: "Leave empty for the top of the drive." }),
    limit: p.number("At most", { bindable: false, default: literal(100), min: 1, max: 500 }),
  },
  many: true,
  output: () => T.file,
  effect: "read",
  card: (node, ctx) => [
    driveLine(ctx, literalString(node, "drive")),
    shown(node, "folder", "Folder"),
  ],
});

const driveSearch = step({
  key: "drive.search",
  label: "Search files",
  category: "drive",
  description: "Passes on the files a search finds, one item each.",
  params: {
    drive: p.drive("Drive", { required: true }),
    query: p.text("Search", { required: true }),
    limit: p.number("At most", { bindable: false, default: literal(50), min: 1, max: 200 }),
  },
  many: true,
  output: () => T.file,
  effect: "read",
  card: (node, ctx) => [driveLine(ctx, literalString(node, "drive")), shown(node, "query", "For")],
});

const driveGet = step({
  key: "drive.get",
  label: "Get a file",
  category: "drive",
  description: "Loads one file's details.",
  params: {
    drive: p.drive("Drive", { required: true }),
    fileId: p.text("File id", { required: true }),
  },
  output: () => T.file,
  effect: "read",
  card: (node, ctx) => [driveLine(ctx, literalString(node, "drive"))],
});

const readText = step({
  key: "drive.readText",
  label: "Read a file",
  category: "drive",
  description: "Reads a text file's contents, for AI or conditions to use.",
  params: { file },
  output: () => T.object({ text: T.text, truncated: T.boolean }),
  effect: "read",
  card: () => [line("Reads the text")],
});

const download = step({
  key: "drive.download",
  label: "Download a file",
  category: "drive",
  description: "Keeps a file's contents for this run, to attach to mail or save elsewhere.",
  params: { file },
  output: () => T.blob,
  effect: "read",
  card: () => [line("Keeps the contents for this run")],
});

const write = step({
  key: "drive.write",
  label: "Create a file",
  category: "drive",
  description:
    "Writes text, or kept file contents, to a new file in a folder. A write is never repeated.",
  params: {
    drive: p.drive("Drive", { required: true }),
    folder: p.driveFolder("Folder", { target: true }),
    name: p.text("File name", { required: true }),
    content: p.longtext("Text"),
    contents: p.expr("Or file contents", T.blob),
  },
  output: () => T.file,
  effect: "dispatch",
  card: (node, ctx) => [driveLine(ctx, literalString(node, "drive")), shown(node, "name", "Name")],
});

const createFolder = step({
  key: "drive.createFolder",
  label: "Create a folder",
  category: "drive",
  description: "Creates a folder, or reuses one with the same name.",
  params: {
    drive: p.drive("Drive", { required: true }),
    folder: p.driveFolder("Inside"),
    name: p.text("Name", { required: true }),
  },
  output: () => T.folder,
  effect: "write",
  card: (node, ctx) => [driveLine(ctx, literalString(node, "drive")), shown(node, "name", "Name")],
});

const move = step({
  key: "drive.move",
  label: "Move a file",
  category: "drive",
  description: "Moves a file to another folder of the same drive.",
  params: { file, folder: p.driveFolder("To folder", { target: true }) },
  output: () => T.file,
  effect: "write",
  card: (node) => [shown(node, "folder", "To")],
});

const rename = step({
  key: "drive.rename",
  label: "Rename a file",
  category: "drive",
  description: "Gives a file a new name.",
  params: { file, name: p.text("New name", { required: true }) },
  output: () => T.file,
  effect: "write",
  card: (node) => [shown(node, "name", "To")],
});

const copy = step({
  key: "drive.copy",
  label: "Copy a file",
  category: "drive",
  description: "Copies a file into a folder, of this drive or another. A copy is never repeated.",
  params: {
    file,
    drive: p.drive("To drive", { required: true }),
    folder: p.driveFolder("To folder", { target: true }),
    name: p.text("Name", { help: "Leave empty to keep the name." }),
  },
  output: () => T.file,
  effect: "dispatch",
  card: (node, ctx) => [
    driveLine(ctx, literalString(node, "drive")),
    shown(node, "folder", "Into"),
  ],
});

const remove = step({
  key: "drive.delete",
  label: "Delete a file",
  category: "drive",
  description: "Deletes a file or folder.",
  params: { file },
  output: () => T.file,
  effect: "write",
  card: () => [line("Deletes it")],
});

function maintenance<const K extends string>(
  key: K,
  label: string,
  description: string,
): StepDef & { key: K } {
  return step({
    key,
    label,
    category: "system",
    description,
    scope: "system",
    params: {},
    output: () => T.object({ pruned: T.integer }),
    effect: "write",
    card: () => [line(description)],
  });
}

export const RESOURCE_STEPS = [
  calendarList,
  calendarGet,
  calendarCreate,
  calendarUpdate,
  calendarDelete,
  calendarRespond,
  freeTime,
  importIcs,
  driveList,
  driveSearch,
  driveGet,
  readText,
  download,
  write,
  createFolder,
  move,
  rename,
  copy,
  remove,
  maintenance("system.cimdPrune", "Prune MCP clients", "Removes abandoned MCP clients."),
  maintenance("system.auditPrune", "Prune audit events", "Removes audit events past retention."),
  maintenance(
    "system.mailCachePrune",
    "Prune cached message bodies",
    "Clears stored message bodies not opened within the mail cache period.",
  ),
  maintenance(
    "system.workflowPrune",
    "Prune workflow data",
    "Clears old step data and deletes old run history.",
  ),
] as const satisfies readonly StepDef[];
