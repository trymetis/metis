import "server-only";
import { listAddressBookWorkspaces, listUserAddressBooks } from "./address-book-store";
import { listCalendarWorkspaces, listUserCalendars } from "./calendar-store";
import { listDriveWorkspaces, listUserDrives } from "./drive-store";
import { listMailboxWorkspaces, listUserMailboxes } from "./mailbox-store";

export async function listAccountMailboxes(userId: string) {
  const mine = await listUserMailboxes(userId);
  return Promise.all(
    mine.map(async (m) => ({
      mailboxId: m.id,
      provider: m.provider,
      email: m.email,
      server: m.server,
      image: m.image,
      workspaces: (await listMailboxWorkspaces(m.id, userId)).map((w) => ({
        linkId: w.linkId,
        name: w.workspaceName,
        workspaceSlug: w.workspaceSlug,
        mailboxSlug: w.slug,
        aiEnabled: w.aiEnabled,
        phishingDetectionEnabled: w.phishingDetectionEnabled,
        policy: w.policy,
      })),
    })),
  );
}

export async function listAccountCalendars(userId: string) {
  const mine = await listUserCalendars(userId);
  return Promise.all(
    mine.map(async (c) => ({
      calendarId: c.id,
      provider: c.provider,
      email: c.email,
      server: c.server,
      image: c.image,
      workspaces: (await listCalendarWorkspaces(c.id, userId)).map((w) => ({
        linkId: w.linkId,
        name: w.workspaceName,
        workspaceSlug: w.workspaceSlug,
        calendarSlug: w.slug,
        aiEnabled: w.aiEnabled,
        policy: w.policy,
      })),
    })),
  );
}

export async function listAccountDrives(userId: string) {
  const mine = await listUserDrives(userId);
  return Promise.all(
    mine.map(async (d) => ({
      driveId: d.id,
      provider: d.provider,
      email: d.email,
      server: d.server,
      image: d.image,
      workspaces: (await listDriveWorkspaces(d.id, userId)).map((w) => ({
        linkId: w.linkId,
        name: w.workspaceName,
        workspaceSlug: w.workspaceSlug,
        driveSlug: w.slug,
        aiEnabled: w.aiEnabled,
        policy: w.policy,
      })),
    })),
  );
}

export async function listAccountAddressBooks(userId: string) {
  const mine = await listUserAddressBooks(userId);
  return Promise.all(
    mine.map(async (b) => ({
      addressBookId: b.id,
      provider: b.provider,
      email: b.email,
      server: b.server,
      image: b.image,
      workspaces: (await listAddressBookWorkspaces(b.id, userId)).map((w) => ({
        linkId: w.linkId,
        name: w.workspaceName,
        workspaceSlug: w.workspaceSlug,
        addressBookSlug: w.slug,
        aiEnabled: w.aiEnabled,
        policy: w.policy,
      })),
    })),
  );
}
