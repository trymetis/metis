import "server-only";
import { eq } from "drizzle-orm";

import {
  listWorkspaceAddressBooks,
  listWorkspaceCalendars,
  listWorkspaceDrives,
  listWorkspaceMailboxes,
} from "@/connections";
import { db } from "@/db";
import { userPrefs } from "@/db/schema";
import { orderByIds } from "@/lib/utils";

import { listMyWorkspaces } from "./index";

export type GateDestination = "mail" | "assistant" | "workflow";

export interface GateWorkspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  logo: string | null;
  mailboxes: number;
  calendars: number;
  drives: number;
  addressBooks: number;
  usable: boolean;
  inboxMailboxSlug: string | null;
}

export interface WorkspaceGateData {
  showChooser: boolean;
  currentName: string | null;
  currentSlug: string | null;
  workspaces: GateWorkspace[];
}

export async function getWorkspaceGateData(
  userId: string,
  activeWorkspaceId: string | null,
  destination: GateDestination,
): Promise<WorkspaceGateData> {
  const [mine, [prefsRow]] = await Promise.all([
    listMyWorkspaces(userId),
    db
      .select({ workspaceOrder: userPrefs.workspaceOrder })
      .from(userPrefs)
      .where(eq(userPrefs.userId, userId))
      .limit(1),
  ]);
  const ordered = orderByIds(mine, prefsRow?.workspaceOrder ?? []);
  const workspaces = await Promise.all(
    ordered.map(async (w) => {
      const [mailboxes, calendars, drives, addressBooks] = await Promise.all([
        listWorkspaceMailboxes(w.id),
        destination === "assistant" ? listWorkspaceCalendars(w.id) : [],
        destination === "assistant" ? listWorkspaceDrives(w.id) : [],
        destination === "assistant" ? listWorkspaceAddressBooks(w.id) : [],
      ]);
      const usable =
        destination === "assistant"
          ? mailboxes.length + calendars.length + drives.length + addressBooks.length > 0
          : mailboxes.length > 0;
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
        logo: w.logo ?? null,
        mailboxes: mailboxes.length,
        calendars: calendars.length,
        drives: drives.length,
        addressBooks: addressBooks.length,
        usable,
        inboxMailboxSlug: mailboxes[0]?.slug ?? null,
      };
    }),
  );

  const current = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const hasElsewhere = workspaces.some((w) => w.id !== activeWorkspaceId && w.usable);

  return {
    showChooser: !current?.usable && hasElsewhere,
    currentName: current?.name ?? null,
    currentSlug: current?.slug ?? null,
    workspaces: workspaces.filter((w) => w.id !== activeWorkspaceId),
  };
}
