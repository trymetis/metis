import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { appActor, recordAuditEvent } from "@/audit";
import { deleteAddressBook, getAddressBook, listAccountAddressBooks } from "@/connections";
import { listProviderBooks } from "@/contacts/available";
import { db } from "@/db";
import { addressBook, addressBookWorkspace, connection } from "@/db/schema";

import { appSession } from "../middlewares/app-session";
import { requireTotp } from "../require-totp";
import {
  addressBookIdInputSchema,
  detachAddressBookInputSchema,
  listProviderBooksOutputSchema,
  listUserAddressBooksOutputSchema,
  setAllAddressBookPolicyInputSchema,
  setAddressBookPolicyInputSchema,
  successSchema,
} from "../schema";

export const addressBooksRouter = {
  list: appSession.output(listUserAddressBooksOutputSchema).handler(async ({ context }) => ({
    addressBooks: await listAccountAddressBooks(context.appUser.userId),
  })),

  available: appSession
    .input(addressBookIdInputSchema)
    .output(listProviderBooksOutputSchema)
    .handler(async ({ input, context }) => {
      const target = await getAddressBook(input.addressBookId, context.appUser.userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      try {
        return { books: await listProviderBooks(target) };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  detach: appSession
    .input(detachAddressBookInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const [link] = await db
        .select({
          id: addressBookWorkspace.id,
          workspaceId: addressBookWorkspace.workspaceId,
          email: connection.email,
        })
        .from(addressBookWorkspace)
        .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
        .innerJoin(connection, eq(connection.id, addressBook.connectionId))
        .where(and(eq(addressBookWorkspace.id, input.linkId), eq(connection.userId, userId)))
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      await db.delete(addressBookWorkspace).where(eq(addressBookWorkspace.id, link.id));
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "addressbook",
        workspaceId: link.workspaceId,
        targetUserId: userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setPolicy: appSession
    .input(setAddressBookPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "address-book-ai-on",
          message: "Enter your authenticator code to turn AI on",
        });
      }

      const [link] = await db
        .select({ id: addressBookWorkspace.id })
        .from(addressBookWorkspace)
        .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
        .innerJoin(connection, eq(connection.id, addressBook.connectionId))
        .where(
          and(
            eq(addressBookWorkspace.id, input.linkId),
            eq(connection.userId, context.appUser.userId),
            isNull(connection.quarantinedAt),
          ),
        )
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      await db
        .update(addressBookWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(addressBookWorkspace.id, link.id));
      return { success: true as const };
    }),

  setPolicyEverywhere: appSession
    .input(setAllAddressBookPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "address-book-ai-on",
          message: "Enter your authenticator code to turn AI on everywhere",
        });
      }

      const target = await getAddressBook(input.addressBookId, context.appUser.userId);
      if (!target || target.quarantinedAt) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      await db
        .update(addressBookWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(addressBookWorkspace.addressBookId, target.id));
      return { success: true as const };
    }),

  delete: appSession
    .input(addressBookIdInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const target = await getAddressBook(input.addressBookId, userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      let grantRevoked = false;
      try {
        grantRevoked = await deleteAddressBook(target);
      } catch (err) {
        console.error("[address-books] revoke failed on delete", err);
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.deleted",
        resourceKind: "addressbook",
        targetLabel: target.email,
        detail: { provider: target.provider, grantRevoked },
      });

      return { success: true as const };
    }),
};
