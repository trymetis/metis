import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { WorkspaceUserSession } from "@/auth/session";
import { addressBookSessionFor } from "@/contacts/session";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import type { AddressBookScope } from "../schema";
import { workspaceSession } from "./workspace-session";

const resolveAddressBook = os
  .$context<{ appUser: WorkspaceUserSession }>()
  .middleware(async ({ context, next }, input: { addressBookSlug: string }) => {
    await enforceRateLimit(context.appUser.userId, RATE_LIMITS.addressBookSession);
    const addressBook = await addressBookSessionFor(context.appUser, input.addressBookSlug);
    if (!addressBook) {
      throw new ORPCError("NOT_FOUND", { message: "Unknown address book" });
    }
    return next({ context: { addressBook } });
  });

export function addressBookSession<T extends ZodType<AddressBookScope>>(schema: T) {
  return workspaceSession(schema).use(resolveAddressBook, (input: AddressBookScope) => ({
    addressBookSlug: input.addressBookSlug,
  }));
}
