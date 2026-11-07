import { and, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";

import { forgetBookLists } from "@/contacts/list-cache";
import { uniqueAddressBookSlug } from "@/contacts/slug";
import { db } from "@/db";
import {
  addressBook,
  addressBookWorkspace,
  connection,
  workspace,
  workspaceMember,
} from "@/db/schema";
import { allOf } from "@/lib/sql";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";
import { resolveAddressBookPolicy } from "@/workspace/policy";

import {
  CONNECTION_COLUMNS,
  type Connection,
  getConnection,
  revokeConnectionIfUnused,
} from "./connection-store";
import {
  type AddressBookProvider,
  type ConnectionProvider,
  hasProvider,
  isAddressBookProvider,
} from "./types";

export interface AddressBook extends Omit<Connection, "provider"> {
  id: string;
  provider: AddressBookProvider;
  credentials: string | null;
}

export interface WorkspaceAddressBookRow extends AddressBook {
  linkId: string;
  workspaceId: string;
  slug: string;
  visibleBookIds: string[];
  aiEnabled: boolean;
  policy: { ai: boolean };
}

export interface AddressBookWorkspace {
  linkId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  slug: string;
  aiEnabled: boolean;
  policy: { ai: boolean };
}

const ADDRESS_BOOK_COLUMNS = {
  ...CONNECTION_COLUMNS,
  id: addressBook.id,
  credentials: connection.credentials,
};

const WORKSPACE_ADDRESS_BOOK_COLUMNS = {
  ...ADDRESS_BOOK_COLUMNS,
  linkId: addressBookWorkspace.id,
  workspaceId: addressBookWorkspace.workspaceId,
  slug: addressBookWorkspace.slug,
  visibleBookIds: addressBookWorkspace.visibleBookIds,
  aiEnabled: addressBookWorkspace.aiEnabled,
  aiPolicy: workspace.aiPolicy,
  phishingDetectionPolicy: workspace.phishingDetectionPolicy,
};

type WorkspaceAddressBookQueryRow = Omit<WorkspaceAddressBookRow, "policy" | "provider"> & {
  provider: ConnectionProvider;
  aiPolicy: WorkspaceAiPolicy;
  phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
};

function asAddressBook<T extends { id: string; provider: ConnectionProvider }>(
  row: T,
): T & { provider: AddressBookProvider } {
  if (!hasProvider(row, isAddressBookProvider)) {
    throw new Error(`address book ${row.id} is backed by a ${row.provider} grant`);
  }
  return row;
}

function withPolicy(row: WorkspaceAddressBookQueryRow): WorkspaceAddressBookRow {
  const { aiPolicy, phishingDetectionPolicy, ...rest } = asAddressBook(row);
  return {
    ...rest,
    policy: resolveAddressBookPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  };
}

function visibilityWhere(workspaceId: string): SQL {
  return allOf(eq(addressBookWorkspace.workspaceId, workspaceId), isNull(connection.quarantinedAt));
}

function addressBookQuery() {
  return db
    .select(ADDRESS_BOOK_COLUMNS)
    .from(addressBook)
    .innerJoin(connection, eq(connection.id, addressBook.connectionId));
}

function workspaceAddressBookQuery() {
  return db
    .select(WORKSPACE_ADDRESS_BOOK_COLUMNS)
    .from(addressBookWorkspace)
    .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
    .innerJoin(connection, eq(connection.id, addressBook.connectionId))
    .innerJoin(workspace, eq(workspace.id, addressBookWorkspace.workspaceId));
}

export async function listWorkspaceAddressBooks(
  workspaceId: string,
): Promise<WorkspaceAddressBookRow[]> {
  const rows = await workspaceAddressBookQuery()
    .where(visibilityWhere(workspaceId))
    .orderBy(desc(addressBookWorkspace.createdAt));
  return rows.map(withPolicy);
}

export async function getWorkspaceAddressBookBySlug(
  slug: string,
  workspaceId: string,
): Promise<WorkspaceAddressBookRow | null> {
  const [row] = await workspaceAddressBookQuery()
    .where(and(eq(addressBookWorkspace.slug, slug), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getWorkspaceAddressBookByLinkId(
  linkId: string,
  workspaceId: string,
): Promise<WorkspaceAddressBookRow | null> {
  const [row] = await workspaceAddressBookQuery()
    .where(and(eq(addressBookWorkspace.id, linkId), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getAddressBook(
  addressBookId: string,
  userId: string,
): Promise<AddressBook | null> {
  const [row] = await addressBookQuery()
    .where(and(eq(addressBook.id, addressBookId), eq(connection.userId, userId)))
    .limit(1);
  return row ? asAddressBook(row) : null;
}

export async function listUserAddressBooks(userId: string): Promise<AddressBook[]> {
  const rows = await addressBookQuery()
    .where(eq(connection.userId, userId))
    .orderBy(desc(addressBook.createdAt));
  return rows.map(asAddressBook);
}

export async function listUnattachedAddressBooks(
  userId: string,
  workspaceId: string,
): Promise<AddressBook[]> {
  const attachedHere = db
    .select({ id: addressBookWorkspace.addressBookId })
    .from(addressBookWorkspace)
    .where(eq(addressBookWorkspace.workspaceId, workspaceId));

  const rows = await addressBookQuery()
    .where(
      and(
        eq(connection.userId, userId),
        isNull(connection.quarantinedAt),
        notInArray(addressBook.id, attachedHere),
      ),
    )
    .orderBy(desc(addressBook.createdAt));
  return rows.map(asAddressBook);
}

export async function getAddressBookLink(
  addressBookId: string,
  workspaceId: string,
): Promise<{ linkId: string; slug: string } | null> {
  const [row] = await db
    .select({ linkId: addressBookWorkspace.id, slug: addressBookWorkspace.slug })
    .from(addressBookWorkspace)
    .where(
      and(
        eq(addressBookWorkspace.addressBookId, addressBookId),
        eq(addressBookWorkspace.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listAddressBookWorkspaces(
  addressBookId: string,
  userId: string,
): Promise<AddressBookWorkspace[]> {
  const rows = await db
    .select({
      linkId: addressBookWorkspace.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      slug: addressBookWorkspace.slug,
      aiEnabled: addressBookWorkspace.aiEnabled,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(addressBookWorkspace)
    .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
    .innerJoin(connection, eq(connection.id, addressBook.connectionId))
    .innerJoin(workspace, eq(workspace.id, addressBookWorkspace.workspaceId))
    .innerJoin(
      workspaceMember,
      and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)),
    )
    .where(
      and(eq(addressBookWorkspace.addressBookId, addressBookId), isNull(connection.quarantinedAt)),
    )
    .orderBy(workspace.name);

  return rows.map(({ aiPolicy, phishingDetectionPolicy, ...rest }) => ({
    ...rest,
    policy: resolveAddressBookPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  }));
}

export async function upsertAddressBook(target: Connection): Promise<AddressBook> {
  if (!isAddressBookProvider(target.provider)) {
    throw new Error(`${target.provider} accounts cannot be used as an address book`);
  }
  const [existing] = await db
    .select({ id: addressBook.id })
    .from(addressBook)
    .where(eq(addressBook.connectionId, target.connectionId))
    .limit(1);

  if (!existing) {
    const now = new Date();
    await db.insert(addressBook).values({
      id: crypto.randomUUID(),
      connectionId: target.connectionId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await addressBookQuery()
    .where(eq(addressBook.connectionId, target.connectionId))
    .limit(1);
  if (!row) throw new Error("Failed to persist address book");
  return asAddressBook(row);
}

export async function attachAddressBook(args: {
  addressBookId: string;
  email: string;
  workspaceId: string;
}): Promise<{ linkId: string; slug: string }> {
  const { addressBookId, email, workspaceId } = args;
  const linkId = crypto.randomUUID();
  const slug = await uniqueAddressBookSlug(workspaceId, email);
  await db.insert(addressBookWorkspace).values({
    id: linkId,
    addressBookId,
    workspaceId,
    slug,
    visibleBookIds: [],
    createdAt: new Date(),
  });
  await forgetBookLists(workspaceId);
  return { linkId, slug };
}

export async function detachAddressBook(args: {
  linkId: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .delete(addressBookWorkspace)
    .where(
      and(
        eq(addressBookWorkspace.id, args.linkId),
        eq(addressBookWorkspace.workspaceId, args.workspaceId),
      ),
    );
  await forgetBookLists(args.workspaceId);
}

export async function setAddressBookVisibility(args: {
  linkId: string;
  workspaceId: string;
  visibleBookIds: string[];
}): Promise<void> {
  await db
    .update(addressBookWorkspace)
    .set({ visibleBookIds: args.visibleBookIds })
    .where(
      and(
        eq(addressBookWorkspace.id, args.linkId),
        eq(addressBookWorkspace.workspaceId, args.workspaceId),
      ),
    );
  await forgetBookLists(args.workspaceId);
}

export async function deleteAddressBook(target: AddressBook): Promise<boolean> {
  await db.delete(addressBook).where(eq(addressBook.id, target.id));
  const owner = await getConnection(target.connectionId, target.userId);
  if (!owner) return false;
  return revokeConnectionIfUnused(owner);
}
