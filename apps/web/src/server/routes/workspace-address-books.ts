import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor, recordAuditEvent } from "@/audit";
import {
  attachOwnedAddressBook,
  detachAddressBook,
  getWorkspaceAddressBookByLinkId,
  listUnattachedAddressBooks,
  listWorkspaceAddressBooks,
  setAddressBookVisibility,
} from "@/connections";
import { listProviderBooks } from "@/contacts/available";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  attachAddressBookInputSchema,
  attachAddressBookOutputSchema,
  listAttachableAddressBooksOutputSchema,
  listProviderBooksOutputSchema,
  listWorkspaceAddressBooksOutputSchema,
  setAddressBookVisibilityInputSchema,
  setAddressBookVisibilityOutputSchema,
  successSchema,
  workspaceAddressBookLinkInputSchema,
  workspaceScopeSchema,
} from "../schema";

export const workspaceAddressBooksRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceAddressBooksOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listWorkspaceAddressBooks(appUser.workspaceId);

      return {
        addressBooks: rows.map((c) => ({
          addressBookId: c.id,
          linkId: c.linkId,
          provider: c.provider,
          email: c.email,
          server: c.server,
          slug: c.slug,
          image: c.image,
          ownedByMe: c.userId === appUser.userId,
          visibleBookIds: c.visibleBookIds,
          aiEnabled: c.aiEnabled,
          policy: c.policy,
        })),
        viewerRole: appUser.workspaceRole,
      };
    }),

  attachable: workspaceSession(workspaceScopeSchema)
    .output(listAttachableAddressBooksOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listUnattachedAddressBooks(appUser.userId, appUser.workspaceId);

      return {
        addressBooks: rows.map((c) => ({
          addressBookId: c.id,
          provider: c.provider,
          email: c.email,
          server: c.server,
          image: c.image,
        })),
      };
    }),

  available: workspaceSession(workspaceAddressBookLinkInputSchema)
    .output(listProviderBooksOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceAddressBookByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      try {
        return { books: await listProviderBooks(link) };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  attach: workspaceSession(attachAddressBookInputSchema)
    .output(attachAddressBookOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const linked = await attachOwnedAddressBook({
        userId: appUser.userId,
        workspaceId: appUser.workspaceId,
        addressBookId: input.addressBookId,
      });
      if ("error" in linked) {
        throw new ORPCError(linked.reason === "conflict" ? "CONFLICT" : "NOT_FOUND", {
          message: linked.error,
        });
      }
      return linked;
    }),

  detach: workspaceSession(workspaceAddressBookLinkInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceAddressBookByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can remove someone else's address book",
        });
      }

      await detachAddressBook({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
      });
      await recordAuditEvent(appActor(appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "addressbook",
        workspaceId: appUser.workspaceId,
        targetUserId: link.userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setVisibility: workspaceSession(setAddressBookVisibilityInputSchema)
    .output(setAddressBookVisibilityOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceAddressBookByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Address book not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can change what someone else's account shows",
        });
      }

      await setAddressBookVisibility({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
        visibleBookIds: input.visibleBookIds,
      });

      return {
        linkId: link.linkId,
        visibleBookIds: input.visibleBookIds,
      };
    }),
};
