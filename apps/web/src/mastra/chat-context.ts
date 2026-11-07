import type { CalendarSession } from "@/calendar/session";
import type { AddressBookSession } from "@/contacts/session";
import type { DriveSession } from "@/drive/session";
import { BUILT_IN_LABELS } from "@/server/schema";

export function mailboxLabelDirectory(customLabels: { key: string; name: string }[]): string {
  return (
    "AVAILABLE LABELS (use exactly these keys for setLabel):\n" +
    `- Built-in: ${BUILT_IN_LABELS.join(", ")}\n` +
    (customLabels.length
      ? `- Custom: ${customLabels.map((l) => `${l.key} (${l.name})`).join(", ")}`
      : "- Custom: (none)")
  );
}

export function calendarAccountScope(session: CalendarSession): string {
  return session.isAggregate
    ? `Viewing every calendar account in this workspace (${session.accounts
        .map((a) => a.accountEmail)
        .join(", ")}).`
    : `Viewing the calendar for ${session.accounts[0]?.accountEmail}.`;
}

export function driveViewScope(session: DriveSession): string {
  return session.isAggregate
    ? `Viewing every drive in this workspace (${session.drives.map((d) => d.email).join(", ")}).`
    : `Viewing the drive for ${session.drives[0]?.email}.`;
}

export function contactsViewScope(session: AddressBookSession): string {
  return session.isAggregate
    ? `Viewing every address book in this workspace (${session.accounts
        .map((a) => a.accountEmail)
        .join(", ")}).`
    : `Viewing the address book for ${session.accounts[0]?.accountEmail}.`;
}
