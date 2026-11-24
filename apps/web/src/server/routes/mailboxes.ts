import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { appActor, recordAuditEvent } from "@/audit";
import { deleteMailbox, getMailbox, listAccountMailboxes } from "@/connections";
import { db } from "@/db";
import { connection, mailbox, mailboxWorkspace } from "@/db/schema";
import { RATE_LIMITS } from "@/services/rate-limits";

import { appSession } from "../middlewares/app-session";
import { requireTotp } from "../require-totp";
import {
  deleteMailboxInputSchema,
  detachMailboxInputSchema,
  listUserMailboxesOutputSchema,
  setAllMailboxPolicyInputSchema,
  setMailboxPolicyInputSchema,
  successSchema,
} from "../schema";

function policyPatch(input: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean }) {
  const patch: Partial<{
    aiEnabled: boolean;
    phishingDetectionEnabled: boolean;
  }> = {};
  if (input.aiEnabled !== undefined) patch.aiEnabled = input.aiEnabled;
  if (input.phishingDetectionEnabled !== undefined) {
    patch.phishingDetectionEnabled = input.phishingDetectionEnabled;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function enabledByPatch(patch: {
  aiEnabled?: boolean;
  phishingDetectionEnabled?: boolean;
}): string | null {
  const on: string[] = [];
  if (patch.aiEnabled === true) on.push("AI");
  if (patch.phishingDetectionEnabled === true) on.push("phishing detection");
  return on.length > 0 ? on.join(" and ") : null;
}

export const mailboxesRouter = {
  list: appSession.output(listUserMailboxesOutputSchema).handler(async ({ context }) => ({
    mailboxes: await listAccountMailboxes(context.appUser.userId),
  })),

  detach: appSession
    .input(detachMailboxInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const [link] = await db
        .select({
          id: mailboxWorkspace.id,
          workspaceId: mailboxWorkspace.workspaceId,
          email: connection.email,
        })
        .from(mailboxWorkspace)
        .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
        .innerJoin(connection, eq(connection.id, mailbox.connectionId))
        .where(and(eq(mailboxWorkspace.id, input.linkId), eq(connection.userId, userId)))
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Mailbox not found" });
      }

      await db.delete(mailboxWorkspace).where(eq(mailboxWorkspace.id, link.id));
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "mailbox",
        workspaceId: link.workspaceId,
        targetUserId: userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setPolicy: appSession
    .input(setMailboxPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const patch = policyPatch(input);
      if (!patch) return { success: true as const };

      const turningOn = enabledByPatch(patch);
      if (turningOn) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          rule: RATE_LIMITS.mailboxPolicyOn,
          message: `Confirm it's you to turn ${turningOn} on`,
        });
      }

      const [link] = await db
        .select({ id: mailboxWorkspace.id })
        .from(mailboxWorkspace)
        .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
        .innerJoin(connection, eq(connection.id, mailbox.connectionId))
        .where(
          and(
            eq(mailboxWorkspace.id, input.linkId),
            eq(connection.userId, context.appUser.userId),
            isNull(connection.quarantinedAt),
          ),
        )
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Mailbox not found" });
      }

      await db.update(mailboxWorkspace).set(patch).where(eq(mailboxWorkspace.id, link.id));
      return { success: true as const };
    }),

  setPolicyEverywhere: appSession
    .input(setAllMailboxPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const patch = policyPatch(input);
      if (!patch) return { success: true as const };

      const turningOn = enabledByPatch(patch);
      if (turningOn) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          rule: RATE_LIMITS.mailboxPolicyOn,
          message: `Confirm it's you to turn ${turningOn} on everywhere`,
        });
      }

      const target = await getMailbox(input.mailboxId, context.appUser.userId);
      if (!target || target.quarantinedAt) {
        throw new ORPCError("NOT_FOUND", { message: "Mailbox not found" });
      }

      await db.update(mailboxWorkspace).set(patch).where(eq(mailboxWorkspace.mailboxId, target.id));
      return { success: true as const };
    }),

  delete: appSession
    .input(deleteMailboxInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const target = await getMailbox(input.mailboxId, userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Mailbox not found" });
      }

      let grantRevoked = false;
      try {
        grantRevoked = await deleteMailbox(target);
      } catch (err) {
        console.error("[mailboxes] revoke failed on delete", err);
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.deleted",
        resourceKind: "mailbox",
        targetLabel: target.email,
        detail: { provider: target.provider, grantRevoked },
      });

      return { success: true as const };
    }),
};
