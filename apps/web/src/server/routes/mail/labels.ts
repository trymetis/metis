import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mailLabel } from "@/db/schema";
import { compositeId } from "@/mail/aggregate";
import { classifyMessages } from "@/mail/classify";
import { labelTargets, listLabelledEmails, setLabelOnMessages, setUserLabel } from "@/mail/labels";
import { mailboxIds, scopeMessage } from "@/mail/session";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  classifyInputSchema,
  classifyOutputSchema,
  clearOnMessageInputSchema,
  clearOnMessageOutputSchema,
  getMapOutputSchema,
  listLabelledInputSchema,
  listMessagesOutputSchema,
  mailboxScopeSchema,
  restoreLabelsInputSchema,
  restoreLabelsOutputSchema,
  setOnMessageInputSchema,
  setOnMessageOutputSchema,
  setOnMessagesInputSchema,
  setOnMessagesOutputSchema,
} from "@/server/schema";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

export const labelsRouter = {
  listEmails: mailSession(listLabelledInputSchema)
    .output(listMessagesOutputSchema)
    .handler(async ({ input, context }) =>
      listLabelledEmails(context.mail, input.label, input.pageToken),
    ),

  getMap: mailSession(mailboxScopeSchema)
    .output(getMapOutputSchema)
    .handler(async ({ context }) => {
      const { mail } = context;

      const rows = await db
        .select({
          messageId: mailLabel.messageId,
          mailboxId: mailLabel.mailboxId,
          label: mailLabel.label,
          confidence: mailLabel.confidence,
        })
        .from(mailLabel)
        .where(inArray(mailLabel.mailboxId, mailboxIds(mail)));

      const labels: Record<string, { label: string; confidence: number }> = {};
      for (const row of rows) {
        const key = mail.isAggregate ? compositeId(row.mailboxId, row.messageId) : row.messageId;
        labels[key] = {
          label: row.label,
          confidence: row.confidence,
        };
      }

      return { labels };
    }),

  classify: mailSession(classifyInputSchema)
    .output(classifyOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const rl = await rateLimit(mail.userId, RATE_LIMITS.mailClassify);
      if (!rl.ok) {
        throw new RateLimitedError(rl);
      }

      return { labels: await classifyMessages(mail, input.items) };
    }),

  setOnMessage: mailSession(setOnMessageInputSchema)
    .output(setOnMessageOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const target = scopeMessage(mail, input.id);

      await setUserLabel({
        userId: mail.userId,
        mailboxId: target.mailboxId,
        messageId: target.messageId,
        label: input.label,
      });

      return {
        success: true as const,
        messageId: input.id,
        label: input.label,
      };
    }),

  clearOnMessage: mailSession(clearOnMessageInputSchema)
    .output(clearOnMessageOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const target = scopeMessage(mail, input.id);
      await db
        .delete(mailLabel)
        .where(
          and(eq(mailLabel.mailboxId, target.mailboxId), eq(mailLabel.messageId, target.messageId)),
        );

      return { success: true as const };
    }),

  setOnMessages: mailSession(setOnMessagesInputSchema)
    .output(setOnMessagesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const previous = await setLabelOnMessages({
        userId: mail.userId,
        targets: labelTargets(mail, input.ids),
        label: input.label,
      });

      return { success: true as const, previous };
    }),

  restoreLabels: mailSession(restoreLabelsInputSchema)
    .output(restoreLabelsOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const now = new Date();
      await Promise.all(
        input.entries.map(async (entry) => {
          const target = scopeMessage(mail, entry.id);
          if (entry.label === null) {
            await db
              .delete(mailLabel)
              .where(
                and(
                  eq(mailLabel.mailboxId, target.mailboxId),
                  eq(mailLabel.messageId, target.messageId),
                ),
              );
          } else {
            await setUserLabel({
              userId: mail.userId,
              mailboxId: target.mailboxId,
              messageId: target.messageId,
              label: entry.label,
              at: now,
            });
          }
        }),
      );

      return { success: true as const };
    }),
};
