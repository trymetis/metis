import type { Auth } from "@/auth/server";
import { getAppUser, isWorkspaceUser, type WorkspaceUserSession } from "@/auth/session";
import {
  type ConnectionAuth,
  getWorkspaceAddressBookBySlug,
  listWorkspaceAddressBooks,
  resolveConnectionAuth,
  type WorkspaceAddressBookRow,
} from "@/connections";
import type { WorkspaceRole } from "@/types/workspace";
import { ALL_ADDRESS_BOOKS_SLUG } from "@/workspace/path";

import type { ResolvedAddressBook } from "./aggregate";

export interface AddressBookSession {
  userId: string;
  user: Auth["$Infer"]["Session"]["user"];
  addressBookSlug: string;
  isAggregate: boolean;
  accounts: ResolvedAddressBook[];
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
}

function lazyResolved(found: WorkspaceAddressBookRow): ResolvedAddressBook {
  let pending: Promise<ConnectionAuth> | null = null;
  return {
    accountId: found.id,
    linkId: found.linkId,
    accountSlug: found.slug,
    accountEmail: found.email,
    provider: found.provider,
    server: found.server,
    visibleBookIds: found.visibleBookIds,
    policy: found.policy,
    auth: () => {
      pending ??= resolveConnectionAuth(found).then((resolved) => {
        if (!resolved) {
          pending = null;
          throw new Error(`Could not authenticate ${found.email}`);
        }
        return resolved;
      });
      return pending;
    },
  };
}

export async function workspaceAddressBookAccounts(
  workspaceId: string,
): Promise<ResolvedAddressBook[]> {
  const rows = await listWorkspaceAddressBooks(workspaceId);
  return rows.map(lazyResolved);
}

export async function addressBookSessionFor(
  appUser: WorkspaceUserSession,
  addressBookSlug: string,
): Promise<AddressBookSession | null> {
  const base = {
    userId: appUser.userId,
    user: appUser.user,
    workspaceId: appUser.workspaceId,
    workspaceSlug: appUser.workspaceSlug,
    workspaceRole: appUser.workspaceRole,
  };

  if (addressBookSlug === ALL_ADDRESS_BOOKS_SLUG) {
    const accounts = await workspaceAddressBookAccounts(appUser.workspaceId);
    if (accounts.length === 0) return null;
    return { ...base, addressBookSlug: ALL_ADDRESS_BOOKS_SLUG, isAggregate: true, accounts };
  }

  const found = await getWorkspaceAddressBookBySlug(addressBookSlug, appUser.workspaceId);
  if (!found) return null;
  return {
    ...base,
    addressBookSlug: found.slug,
    isAggregate: false,
    accounts: [lazyResolved(found)],
  };
}

export async function getAddressBookSession(
  headers: Headers,
  workspaceSlug: string,
  addressBookSlug: string,
): Promise<AddressBookSession | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  return addressBookSessionFor(appUser, addressBookSlug);
}

export async function firstAddressBookSlug(workspaceId: string): Promise<string | null> {
  const all = await listWorkspaceAddressBooks(workspaceId);
  return all[0]?.slug ?? null;
}
