import "server-only";
import { ORPCError } from "@orpc/server";

import { mailboxIds } from "@/mail/session";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  cancelScheduledSendInputSchema,
  cancelScheduledSendOutputSchema,
  createScheduledSendInputSchema,
  createScheduledSendOutputSchema,
  inspectUnconfirmedSendInputSchema,
  inspectUnconfirmedSendOutputSchema,
  listScheduledSendOutputSchema,
  mailboxScopeSchema,
  resolveUnconfirmedSendInputSchema,
  resolveUnconfirmedSendOutputSchema,
  retryScheduledSendInputSchema,
  retryScheduledSendOutputSchema,
} from "@/server/schema";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";
import {
  cancelScheduledSend,
  inspectUnconfirmedSend,
  listScheduledMail,
  resolveScheduledSend,
  retryScheduledSend,
  scheduleOutgoing,
} from "@/workflow/builtins";

import { resolveSender } from "./sender";

export const scheduledSendRouter = {
  create: mailSession(createScheduledSendInputSchema)
    .output(createScheduledSendOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const from = await resolveSender(mail, input.fromMailboxSlug);
      const scheduled = await scheduleOutgoing({
        mail,
        from,
        payload: input.payload,
        scheduledFor: input.scheduledFor,
      });
      if ("error" in scheduled) {
        throw new ORPCError("BAD_REQUEST", { message: scheduled.error });
      }
      return scheduled;
    }),

  list: mailSession(mailboxScopeSchema)
    .output(listScheduledSendOutputSchema)
    .handler(async ({ context }) => {
      const { mail } = context;
      return {
        scheduled: await listScheduledMail(mailboxIds(mail), mail.userId),
      };
    }),

  cancel: mailSession(cancelScheduledSendInputSchema)
    .output(cancelScheduledSendOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const result = await cancelScheduledSend(input.id, mailboxIds(mail));
      if (!result.cancelled) {
        throw new ORPCError("CONFLICT", {
          message: result.reason ?? "That message could not be called back",
        });
      }
      return { success: true as const };
    }),

  retry: mailSession(retryScheduledSendInputSchema)
    .output(retryScheduledSendOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const result = await retryScheduledSend(input.id, mailboxIds(mail));
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "That scheduled message is gone",
        });
      }
      if (result.state === "refused") {
        throw new ORPCError("CONFLICT", { message: result.message });
      }
      return { message: result.message };
    }),

  unconfirmed: mailSession(inspectUnconfirmedSendInputSchema)
    .output(inspectUnconfirmedSendOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      await limitResolve(mail.userId);
      const view = await inspectUnconfirmedSend(input.id, mailboxIds(mail));
      if (!view) {
        throw new ORPCError("NOT_FOUND", {
          message: "That scheduled message is gone",
        });
      }
      return view;
    }),

  resolve: mailSession(resolveUnconfirmedSendInputSchema)
    .output(resolveUnconfirmedSendOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      await limitResolve(mail.userId);
      const result = await resolveScheduledSend({
        workflowId: input.id,
        mailboxIds: mailboxIds(mail),
        stepRunId: input.stepRunId,
        userId: mail.userId,
        decision: input.decision,
      });
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "That unconfirmed send is gone",
        });
      }
      if (result.state === "refused") {
        throw new ORPCError("CONFLICT", { message: result.message });
      }
      console.log(
        `[workflow/scheduled-send] ${input.id} unconfirmed send resolved as ${input.decision.outcome}`,
      );
      return { message: result.message };
    }),
};

async function limitResolve(userId: string): Promise<void> {
  const rl = await rateLimit(userId, RATE_LIMITS.resolveSend);
  if (!rl.ok) {
    throw new RateLimitedError(rl);
  }
}
