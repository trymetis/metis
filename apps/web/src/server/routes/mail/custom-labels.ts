import "server-only";
import { ORPCError } from "@orpc/server";

import {
  createCustomLabel,
  deleteCustomLabel,
  listCustomLabels,
  updateCustomLabel,
} from "@/mail/custom-labels";
import { mailboxIds } from "@/mail/session";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  createCustomLabelInputSchema,
  customLabelSchema,
  deleteCustomLabelInputSchema,
  deleteCustomLabelOutputSchema,
  listCustomLabelsOutputSchema,
  mailboxScopeSchema,
  updateCustomLabelInputSchema,
} from "@/server/schema";

export const customLabelsRouter = {
  list: mailSession(mailboxScopeSchema)
    .output(listCustomLabelsOutputSchema)
    .handler(async ({ context }) => ({
      labels: await listCustomLabels(mailboxIds(context.mail)),
    })),

  create: mailSession(createCustomLabelInputSchema)
    .output(customLabelSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const created = await createCustomLabel({
        userId: mail.userId,
        mailboxIds: mailboxIds(mail),
        name: input.name,
        color: input.color,
      });
      if ("error" in created) {
        throw new ORPCError(created.reason === "conflict" ? "CONFLICT" : "BAD_REQUEST", {
          message: created.error,
        });
      }
      return created;
    }),

  update: mailSession(updateCustomLabelInputSchema)
    .output(customLabelSchema)
    .handler(async ({ input, context }) => {
      const updated = await updateCustomLabel({
        mailboxIds: mailboxIds(context.mail),
        id: input.id,
        name: input.name,
        color: input.color,
      });
      if ("error" in updated) {
        throw new ORPCError("NOT_FOUND", { message: updated.error });
      }
      return updated;
    }),

  delete: mailSession(deleteCustomLabelInputSchema)
    .output(deleteCustomLabelOutputSchema)
    .handler(async ({ input, context }) => {
      const deleted = await deleteCustomLabel({
        mailboxIds: mailboxIds(context.mail),
        id: input.id,
      });
      if ("error" in deleted) {
        throw new ORPCError("NOT_FOUND", { message: deleted.error });
      }
      return { success: true as const };
    }),
};
