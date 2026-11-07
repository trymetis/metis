import type { Route } from "next";

import { route } from "@/lib/route";

export const ALL_MAILBOXES_SLUG = "all";
export const ALL_CALENDARS_SLUG = "all";
export const ALL_DRIVES_SLUG = "all";
export const ALL_ADDRESS_BOOKS_SLUG = "all";
export const ALL_BOOKS = "all";

export const MAIL_SEGMENT = "m";
export const CALENDAR_SEGMENT = "c";
export const DRIVE_SEGMENT = "d";
export const CONTACTS_SEGMENT = "p";

export const RESERVED_MAILBOX_SLUGS = new Set([ALL_MAILBOXES_SLUG]);
export const RESERVED_CALENDAR_SLUGS = new Set([ALL_CALENDARS_SLUG]);
export const RESERVED_DRIVE_SLUGS = new Set([ALL_DRIVES_SLUG]);
export const RESERVED_ADDRESS_BOOK_SLUGS = new Set([ALL_ADDRESS_BOOKS_SLUG]);

export type WorkspaceSection =
  | "mail"
  | "calendar"
  | "drive"
  | "contacts"
  | "assistant"
  | "workflow"
  | "settings"
  | "workspace";

export interface ParsedWorkspacePath {
  workspaceSlug: string | null;
  mailboxSlug: string | null;
  calendarSlug: string | null;
  driveSlug: string | null;
  drivePath: string[];
  addressBookSlug: string | null;
  bookRef: string | null;
  contactRef: string | null;
  section: WorkspaceSection | null;
  folder: string | null;
}

const EMPTY: ParsedWorkspacePath = {
  workspaceSlug: null,
  mailboxSlug: null,
  calendarSlug: null,
  driveSlug: null,
  drivePath: [],
  addressBookSlug: null,
  bookRef: null,
  contactRef: null,
  section: null,
  folder: null,
};

export function parseWorkspacePath(pathname: string): ParsedWorkspacePath {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "w" || !parts[1]) return EMPTY;

  const workspaceSlug = parts[1];
  const base = { ...EMPTY, workspaceSlug };
  const next = parts[2];

  if (!next) return { ...base, section: "workspace" };
  if (next === "assistant") return { ...base, section: "assistant" };
  if (next === "workflow") return { ...base, section: "workflow" };
  if (next === "settings") return { ...base, section: "settings" };

  if (next === MAIL_SEGMENT) {
    return {
      ...base,
      mailboxSlug: parts[3] ?? null,
      section: "mail",
      folder: parts[3] ? (parts[4] ?? "inbox") : null,
    };
  }

  if (next === CALENDAR_SEGMENT) {
    return { ...base, calendarSlug: parts[3] ?? null, section: "calendar" };
  }

  if (next === DRIVE_SEGMENT) {
    return {
      ...base,
      driveSlug: parts[3] ?? null,
      drivePath: parts.slice(4).map(decodeURIComponent),
      section: "drive",
    };
  }

  if (next === CONTACTS_SEGMENT) {
    return {
      ...base,
      addressBookSlug: parts[3] ?? null,
      bookRef: parts[3] ? decodeURIComponent(parts[4] ?? ALL_BOOKS) : null,
      contactRef: parts[5] ? decodeURIComponent(parts[5]) : null,
      section: "contacts",
    };
  }

  return { ...base, section: "workspace" };
}

export function workspacePath(workspaceSlug: string): Route {
  return route(`/w/${workspaceSlug}`);
}

export function mailPath(
  workspaceSlug: string,
  mailboxSlug: string,
  leaf = "inbox",
  search = "",
): Route {
  return route(`/w/${workspaceSlug}/${MAIL_SEGMENT}/${mailboxSlug}/${leaf}${search}`);
}

export function calendarPath(workspaceSlug: string, calendarSlug: string, search = ""): Route {
  return route(`/w/${workspaceSlug}/${CALENDAR_SEGMENT}/${calendarSlug}${search}`);
}

export function drivePath(
  workspaceSlug: string,
  driveSlug: string,
  folderIds: string[] = [],
): Route {
  const trail = folderIds.map(encodeURIComponent).join("/");
  return route(`/w/${workspaceSlug}/${DRIVE_SEGMENT}/${driveSlug}${trail ? `/${trail}` : ""}`);
}

export function driveRootPath(workspaceSlug: string): Route {
  return route(`/w/${workspaceSlug}/${DRIVE_SEGMENT}`);
}

export function contactsRootPath(workspaceSlug: string): Route {
  return route(`/w/${workspaceSlug}/${CONTACTS_SEGMENT}`);
}

export function contactsPath(
  workspaceSlug: string,
  addressBookSlug: string,
  bookRef: string = ALL_BOOKS,
  contactRef?: string,
): Route {
  const base = `/w/${workspaceSlug}/${CONTACTS_SEGMENT}/${addressBookSlug}/${encodeURIComponent(bookRef)}`;
  return route(contactRef ? `${base}/${encodeURIComponent(contactRef)}` : base);
}

export function mailRootPath(workspaceSlug: string): Route {
  return route(`/w/${workspaceSlug}/${MAIL_SEGMENT}`);
}

export function calendarRootPath(workspaceSlug: string): Route {
  return route(`/w/${workspaceSlug}/${CALENDAR_SEGMENT}`);
}

export function assistantPath(workspaceSlug: string, threadId?: string): Route {
  return route(
    threadId ? `/w/${workspaceSlug}/assistant/${threadId}` : `/w/${workspaceSlug}/assistant`,
  );
}

export function workflowPath(workspaceSlug: string, rest = ""): Route {
  return route(rest ? `/w/${workspaceSlug}/workflow/${rest}` : `/w/${workspaceSlug}/workflow`);
}

export function workflowRunPath(workspaceSlug: string, runId: string): Route {
  return workflowPath(workspaceSlug, `history/${encodeURIComponent(runId)}`);
}

export function workflowEditPath(workspaceSlug: string, workflowId: string): Route {
  return route(`/w/${workspaceSlug}/workflow?id=${encodeURIComponent(workflowId)}`);
}

export function workspaceSettingsPath(
  workspaceSlug: string,
  page = "mailboxes",
  search = "",
): Route {
  return route(`/w/${workspaceSlug}/settings/${page}${search}`);
}

export function workspaceRootPath(): Route {
  return "/w";
}

export function switchWorkspacePath(pathname: string, target: { slug: string }): Route {
  const parsed = parseWorkspacePath(pathname);
  const parts = pathname.split("/").filter(Boolean);
  if (parsed.section === "assistant") return assistantPath(target.slug);
  if (parsed.section === "workflow") {
    return workflowPath(target.slug, parts.slice(3).join("/"));
  }
  if (parsed.section === "settings") {
    return workspaceSettingsPath(target.slug, parts[3] ?? "mailboxes");
  }
  if (parsed.section === "calendar") return calendarRootPath(target.slug);
  if (parsed.section === "drive") return driveRootPath(target.slug);
  if (parsed.section === "contacts") return contactsRootPath(target.slug);
  if (parsed.section === "mail") return mailRootPath(target.slug);
  return workspacePath(target.slug);
}

export function onboardingPath(workspaceSlug: string): Route {
  return workspaceSettingsPath(workspaceSlug, "mailboxes", "?onboarding=1");
}

export function mailboxScope(pathname: string): {
  workspaceSlug: string;
  mailboxSlug: string;
} | null {
  const parsed = parseWorkspacePath(pathname);
  if (!parsed.workspaceSlug || !parsed.mailboxSlug) return null;
  return {
    workspaceSlug: parsed.workspaceSlug,
    mailboxSlug: parsed.mailboxSlug,
  };
}

export function calendarScope(pathname: string): {
  workspaceSlug: string;
  calendarSlug: string;
} | null {
  const parsed = parseWorkspacePath(pathname);
  if (!parsed.workspaceSlug || !parsed.calendarSlug) return null;
  return {
    workspaceSlug: parsed.workspaceSlug,
    calendarSlug: parsed.calendarSlug,
  };
}

export function addressBookScope(pathname: string): {
  workspaceSlug: string;
  addressBookSlug: string;
} | null {
  const parsed = parseWorkspacePath(pathname);
  if (!parsed.workspaceSlug || !parsed.addressBookSlug) return null;
  return {
    workspaceSlug: parsed.workspaceSlug,
    addressBookSlug: parsed.addressBookSlug,
  };
}
