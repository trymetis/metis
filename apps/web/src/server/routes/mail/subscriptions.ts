import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { mailUnsubscribe } from "@/db/schema";
import { scopeMessage } from "@/mail/session";
import { scanSubscriptions, unsubscribeSenders } from "@/mail/subscriptions";
import {
  extractEmailAddress,
  parseUnsubscribeHeader,
  unsubscribeMethods,
} from "@/mail/unsubscribe";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  bulkUnsubscribeInputSchema,
  bulkUnsubscribeOutputSchema,
  listSubscriptionsInputSchema,
  listSubscriptionsOutputSchema,
  unsubscribeInfoInputSchema,
  unsubscribeInfoOutputSchema,
  unsubscribeStatusSchema,
} from "@/server/schema";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

export const subscriptionsRouter = {
  infoForMessage: mailSession(unsubscribeInfoInputSchema)
    .output(unsubscribeInfoOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const rl = await rateLimit(mail.userId, RATE_LIMITS.mailUnsubscribeInfo);
      if (!rl.ok) {
        throw new RateLimitedError(rl);
      }

      const adapter = mail.adapter;
      const info = await adapter.getUnsubscribeInfo(input.id).catch(() => null);
      const methods = info ? unsubscribeMethods(parseUnsubscribeHeader(info)) : [];
      if (methods.length === 0) return { methods: [] };

      const senderEmail = extractEmailAddress(input.senderEmail) ?? input.senderEmail.toLowerCase();
      const [row] = await db
        .select({ status: mailUnsubscribe.status })
        .from(mailUnsubscribe)
        .where(
          and(
            eq(mailUnsubscribe.mailboxId, scopeMessage(mail, input.id).mailboxId),
            eq(mailUnsubscribe.senderEmail, senderEmail),
          ),
        )
        .limit(1);
      const parsedStatus = row ? unsubscribeStatusSchema.safeParse(row.status) : null;
      return {
        methods,
        unsubscribedStatus: parsedStatus?.success ? parsedStatus.data : undefined,
      };
    }),

  list: mailSession(listSubscriptionsInputSchema)
    .output(listSubscriptionsOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await scanSubscriptions(context.mail, input.scanLimit);
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  unsubscribe: mailSession(bulkUnsubscribeInputSchema)
    .output(bulkUnsubscribeOutputSchema)
    .handler(async ({ input, context }) => ({
      results: await unsubscribeSenders(context.mail, input.items),
    })),
};
