import type { WorkflowDirectory } from "@/server/schema";
import type { GraphResources } from "@/workflow/graph";

export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function directoryResources(
  directory: WorkflowDirectory,
  timezone?: string,
): GraphResources {
  return {
    mailbox: directory.mailboxes.map((m) => ({ id: m.id, label: m.email })),
    calendar: directory.calendars.map((c) => ({ id: c.id, label: c.email })),
    drive: directory.drives.map((d) => ({ id: d.id, label: d.name })),
    addressbook: directory.addressBooks.map((a) => ({ id: a.id, label: a.name })),
    timezone,
  };
}
