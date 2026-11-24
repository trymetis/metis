import "server-only";
import { ORPCError } from "@orpc/server";

import { sanitizeError } from "@/lib/errors/sanitize-error";
import { cacheAnalysis, getCachedAnalysis } from "@/mail/cache";
import { draftApology, draftStanceReply, rewriteText } from "@/mail/compose-ai";
import { type MailSession, policyForMailbox, scopeMessage } from "@/mail/session";
import { generateSmartReplies } from "@/mail/smart-replies";
import { cachedSummaryCards, summarizeThread } from "@/mail/thread-summary";
import { getPhishingDetection, phishingDetectionEnabled } from "@/services/phishing-detection";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS, type RateLimitRule } from "@/services/rate-limits";
import type { AnalysisResult } from "@/types/analysis";

import { mailSession } from "../middlewares/mail-session";
import {
  analysisResultSchema,
  analyzePhishingInputSchema,
  draftApologyInputSchema,
  draftReplyOutputSchema,
  draftStanceInputSchema,
  rewriteTextInputSchema,
  rewriteTextOutputSchema,
  smartRepliesInputSchema,
  smartRepliesOutputSchema,
  summaryPreviewsInputSchema,
  summaryPreviewsOutputSchema,
  threadSummaryInputSchema,
  threadSummaryOutputSchema,
} from "../schema";

async function rateLimitOrThrow(userId: string, rule: RateLimitRule) {
  const rl = await rateLimit(userId, rule);
  if (!rl.ok) {
    throw new RateLimitedError(rl);
  }
}

function requireAi(mail: MailSession, messageId: string) {
  const scoped = scopeMessage(mail, messageId);
  if (!policyForMailbox(mail, scoped.mailboxId).ai) {
    throw new ORPCError("FORBIDDEN", {
      message: "AI is turned off for this mailbox",
    });
  }
  return scoped;
}

function requireMailboxAi(mail: MailSession) {
  if (!mail.mailboxes.every((m) => policyForMailbox(mail, m.mailboxId).ai)) {
    throw new ORPCError("FORBIDDEN", {
      message: "AI is turned off for this mailbox",
    });
  }
}

function forViewer(analysis: AnalysisResult) {
  return {
    classification: analysis.classification,
    action: analysis.action,
    confidence: analysis.confidence,
    reasons: analysis.reasons,
  };
}

export const aiRouter = {
  analyzePhishing: mailSession(analyzePhishingInputSchema)
    .output(analysisResultSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      if (!phishingDetectionEnabled()) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "Phishing detection is disabled",
        });
      }
      try {
        const scoped = scopeMessage(mail, input.id);
        if (!policyForMailbox(mail, scoped.mailboxId).phishingDetection) {
          throw new ORPCError("FORBIDDEN", {
            message: "Phishing detection is turned off for this mailbox",
          });
        }
        const cached = await getCachedAnalysis(scoped);
        if (cached) {
          return forViewer(cached);
        }
        await rateLimitOrThrow(mail.userId, RATE_LIMITS.phishingAnalyze);

        const adapter = mail.adapter;
        const rawB64 = await adapter.getRaw(input.id);

        if (!rawB64) {
          throw new ORPCError("BAD_REQUEST", {
            message: "No content to analyze",
          });
        }

        const analysis = await getPhishingDetection().analyze({
          userId: mail.userId,
          rawMimeBase64: rawB64,
          headers: context.headers,
        });

        await cacheAnalysis(scoped, analysis);

        return forViewer(analysis);
      } catch (err) {
        if (err instanceof ORPCError || err instanceof RateLimitedError) throw err;
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  smartReplies: mailSession(smartRepliesInputSchema)
    .output(smartRepliesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.id);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.smartReplies);

      try {
        return { replies: await generateSmartReplies(mail, input) };
      } catch (err) {
        return {
          replies: [],
          error: sanitizeError(err),
        };
      }
    }),

  draftApology: mailSession(draftApologyInputSchema)
    .output(draftReplyOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.messageId);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.draftApology);

      return { bodyHtml: await draftApology(mail, input) };
    }),

  draftStance: mailSession(draftStanceInputSchema)
    .output(draftReplyOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.messageId);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.draftStance);

      return { bodyHtml: await draftStanceReply(mail, input) };
    }),

  threadSummary: mailSession(threadSummaryInputSchema)
    .output(threadSummaryOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.messageId);

      try {
        const { spec, failed } = await summarizeThread(mail, input.messageId, input.threadId);
        return { spec, failed };
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  summaryPreviews: mailSession(summaryPreviewsInputSchema)
    .output(summaryPreviewsOutputSchema)
    .handler(async ({ input, context }) => ({
      cards: await cachedSummaryCards(context.mail, input.threads),
    })),

  rewriteText: mailSession(rewriteTextInputSchema)
    .output(rewriteTextOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireMailboxAi(mail);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.rewriteText);

      return { text: await rewriteText(mail, input) };
    }),
};
