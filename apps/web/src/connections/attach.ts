import "server-only";
import {
  attachAddressBook,
  getAddressBook,
  getAddressBookLink,
  upsertAddressBook,
} from "./address-book-store";
import { attachCalendar, getCalendar, getCalendarLink, upsertCalendar } from "./calendar-store";
import type { Connection } from "./connection-store";
import { attachDrive, getDrive, getDriveLink, upsertDrive } from "./drive-store";
import { attachMailbox, getMailbox, getMailboxLink, upsertMailbox } from "./mailbox-store";
import type { ConnectionResource } from "./types";

export type AttachResult =
  | { linkId: string; slug: string }
  | { error: string; reason: "not_found" | "conflict" };

type AttachArgs = { userId: string; workspaceId: string };

export async function attachOwnedMailbox(
  args: AttachArgs & { mailboxId: string },
): Promise<AttachResult> {
  const target = await getMailbox(args.mailboxId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Mailbox not found", reason: "not_found" };
  }
  if (await getMailboxLink(target.id, args.workspaceId)) {
    return {
      error: "That mailbox is already in this workspace",
      reason: "conflict",
    };
  }
  return attachMailbox({
    mailboxId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function attachOwnedCalendar(
  args: AttachArgs & { calendarId: string },
): Promise<AttachResult> {
  const target = await getCalendar(args.calendarId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Calendar not found", reason: "not_found" };
  }
  if (await getCalendarLink(target.id, args.workspaceId)) {
    return {
      error: "That calendar is already in this workspace",
      reason: "conflict",
    };
  }
  return attachCalendar({
    calendarId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function attachOwnedDrive(
  args: AttachArgs & { driveId: string },
): Promise<AttachResult> {
  const target = await getDrive(args.driveId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Drive not found", reason: "not_found" };
  }
  if (await getDriveLink(target.id, args.workspaceId)) {
    return {
      error: "That drive is already in this workspace",
      reason: "conflict",
    };
  }
  return attachDrive({
    driveId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function attachOwnedAddressBook(
  args: AttachArgs & { addressBookId: string },
): Promise<AttachResult> {
  const target = await getAddressBook(args.addressBookId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Address book not found", reason: "not_found" };
  }
  if (await getAddressBookLink(target.id, args.workspaceId)) {
    return {
      error: "That address book is already in this workspace",
      reason: "conflict",
    };
  }
  return attachAddressBook({
    addressBookId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function addConnectionResource(args: {
  account: Connection;
  resource: ConnectionResource;
  workspaceId: string | null;
}): Promise<{ slug: string | null }> {
  const { account, resource, workspaceId } = args;
  switch (resource) {
    case "mailbox": {
      const box = await upsertMailbox(account);
      if (!workspaceId) return { slug: null };
      const link =
        (await getMailboxLink(box.id, workspaceId)) ??
        (await attachMailbox({ mailboxId: box.id, email: box.email, workspaceId }));
      return { slug: link.slug };
    }
    case "calendar": {
      const cal = await upsertCalendar(account);
      if (!workspaceId) return { slug: null };
      const link =
        (await getCalendarLink(cal.id, workspaceId)) ??
        (await attachCalendar({ calendarId: cal.id, email: cal.email, workspaceId }));
      return { slug: link.slug };
    }
    case "drive": {
      const disk = await upsertDrive(account);
      if (!workspaceId) return { slug: null };
      const link =
        (await getDriveLink(disk.id, workspaceId)) ??
        (await attachDrive({ driveId: disk.id, email: disk.email, workspaceId }));
      return { slug: link.slug };
    }
    case "addressbook": {
      const book = await upsertAddressBook(account);
      if (!workspaceId) return { slug: null };
      const link =
        (await getAddressBookLink(book.id, workspaceId)) ??
        (await attachAddressBook({ addressBookId: book.id, email: book.email, workspaceId }));
      return { slug: link.slug };
    }
    default:
      return resource satisfies never;
  }
}
