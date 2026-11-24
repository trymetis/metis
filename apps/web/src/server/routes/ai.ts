import "server-only";
import { ORPCError } from "@orpc/server";

import { recordAiUsage } from "@/ai/usage";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { htmlToText, truncate } from "@/lib/utils";
import { cacheAnalysis, getCachedAnalysis } from "@/mail/cache";
import { type MailSession, policyForMailbox, scopeMessage } from "@/mail/session";
import { generateSmartReplies } from "@/mail/smart-replies";
import { cachedTldrs, summarizeThread } from "@/mail/thread-summary";
import { drafterAgent } from "@/mastra/agents/drafter";
import { getLlm } from "@/services/llm";
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
  REWRITE_MODES,
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

const REWRITE_GUIDANCE: Record<(typeof REWRITE_MODES)[number], string> = {
  rewrite: "Rewrite it to read more clearly, keeping its meaning, facts and length about the same.",
  shorten: "Make it shorter: keep every fact, request and date, and drop filler.",
  formal: "Make it more formal and professional, keeping its meaning and facts.",
  friendly: "Make it warmer and friendlier, keeping its meaning and facts.",
};

function recordDraftUsage(
  mail: MailSession,
  result: { totalUsage?: unknown; steps?: unknown[]; finishReason?: unknown },
) {
  recordAiUsage({
    userId: mail.userId,
    workspaceId: mail.workspaceId,
    feature: "draft-reply",
    model: getLlm().smartReply.modelId,
    usage: result.totalUsage,
    steps: result.steps?.length,
    finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
  });
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

      const adapter = mail.adapter;
      const body = await adapter.getMessage(input.messageId);
      const text = body.bodyText ?? (body.bodyHtml ? htmlToText(body.bodyHtml) : "");
      const emailContext = truncate(text, 2000);

      const toneGuidance =
        input.tone === "brief"
          ? "Keep it brief and professional — 2-3 sentences. No groveling."
          : input.tone === "formal"
            ? "Use a formal register. Acknowledge the issue and propose a concrete next step."
            : "Warm and personal but not effusive. Acknowledge the issue, take responsibility, propose a next step.";

      const result = await drafterAgent.generate(
        `Original email from ${body.fromName ?? body.from ?? "sender"}:
Subject: ${body.subject ?? "(no subject)"}

${emailContext}

User is apologizing for: ${input.situation}
Tone: ${toneGuidance}

Write the apology body.`,
        {
          instructions: `You draft an apology reply for an email. Rules:
- Acknowledge the specific issue named by the user — don't be vague.
- Take responsibility without over-explaining.
- Propose a concrete next step (reschedule, fix, follow-up).
- Match the requested tone exactly.
- Plain prose, 2-4 sentences. No greeting, no signature, no placeholders like [Name].
- Never use phrases like "sorry for any inconvenience" — be specific.`,
        },
      );

      recordDraftUsage(mail, result);

      const lines = result.text
        .trim()
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const bodyHtml = lines.map((p) => `<p>${p}</p>`).join("");
      return { bodyHtml };
    }),

  draftStance: mailSession(draftStanceInputSchema)
    .output(draftReplyOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.messageId);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.draftStance);

      const adapter = mail.adapter;
      const body = await adapter.getMessage(input.messageId);
      const text = body.bodyText ?? (body.bodyHtml ? htmlToText(body.bodyHtml) : "");
      const emailContext = truncate(text, 2000);

      const stanceGuidance: Record<
        "decline" | "accept" | "negotiate" | "buy_time" | "clarify" | "defer",
        string
      > = {
        decline:
          "Politely decline. Be clear that the answer is no without being harsh. Optionally leave the door open for the future.",
        accept:
          "Accept warmly and confirm. Restate any key details (time, scope) you're agreeing to.",
        negotiate:
          "Push back on the terms and propose an alternative. Be specific about what you'd accept or what needs to change.",
        buy_time:
          "Ask for more time before deciding. Give a concrete timeframe (e.g. 'I'll reply by Friday'). Explain briefly why.",
        clarify:
          "Ask the single most important clarifying question that unblocks the decision. Don't ask many questions — pick one.",
        defer:
          "Politely indicate this should be handled by someone else, suggest who, and offer to make the intro if appropriate.",
      };

      const result = await drafterAgent.generate(
        `Original email from ${body.fromName ?? body.from ?? "sender"}:
Subject: ${body.subject ?? "(no subject)"}

${emailContext}

Stance: ${input.stance}
${stanceGuidance[input.stance]}
${
  input.draft?.trim()
    ? `
The user has started writing this reply. Keep their points and wording where they fit, and complete it in the stance:
${input.draft.trim()}
`
    : ""
}
Write the reply body.`,
        {
          instructions: `You draft a reply in a specific stance the user has chosen. Rules:
- Match the requested stance exactly — don't hedge into a different one.
- Plain prose, 2-4 sentences. No greeting, no signature, no placeholders like [Name].
- Natural, professional tone matching the sender's register.
- Be specific to the email's content, not generic.`,
        },
      );

      recordDraftUsage(mail, result);

      const lines = result.text
        .trim()
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const bodyHtml = lines.map((p) => `<p>${p}</p>`).join("");
      return { bodyHtml };
    }),

  threadSummary: mailSession(threadSummaryInputSchema)
    .output(threadSummaryOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireAi(mail, input.messageId);

      try {
        const { spec } = await summarizeThread(mail, input.messageId, input.threadId);
        return { spec };
      } catch (err) {
        if (err instanceof RateLimitedError) throw err;
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  summaryPreviews: mailSession(summaryPreviewsInputSchema)
    .output(summaryPreviewsOutputSchema)
    .handler(async ({ input, context }) => ({
      tldrs: await cachedTldrs(context.mail, input.threads),
    })),

  rewriteText: mailSession(rewriteTextInputSchema)
    .output(rewriteTextOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      requireMailboxAi(mail);
      await rateLimitOrThrow(mail.userId, RATE_LIMITS.rewriteText);

      const result = await drafterAgent.generate(
        `${REWRITE_GUIDANCE[input.mode]}\n\nText:\n${input.text}`,
        {
          instructions: `You edit a passage the user selected in an email they are writing. Rules:
- Return only the edited passage, with no preface, quotes or explanation.
- Keep the user's language, names, numbers, dates and links exactly.
- Keep line breaks between paragraphs; no greeting or signature unless the passage has one.`,
        },
      );

      recordDraftUsage(mail, result);
      return { text: result.text.trim() };
    }),
};
