import "server-only";
import { z } from "zod";

import { sanitizeError } from "@/lib/errors/sanitize-error";
import { cacheAnalysis, getCachedAnalysis } from "@/mail/cache";
import { policyForMailbox } from "@/mail/session";
import { analysisResultSchema } from "@/server/schema";
import { getPhishingDetection, phishingDetectionEnabled } from "@/services/phishing-detection";

import type { Output } from "./output";
import type { AgentMailbox } from "./scope";

export const analyzePhishingOutput = z.union([
  analysisResultSchema.extend({ id: z.string(), risk_score: z.number(), cached: z.boolean() }),
  z.object({ id: z.string(), error: z.string() }),
]);

export async function analyzePhishing(args: {
  mailbox: AgentMailbox;
  userId: string;
  id: string;
  headers?: Headers;
}): Promise<Output<typeof analyzePhishingOutput>> {
  const { mailbox, userId, id, headers } = args;
  if (!phishingDetectionEnabled()) {
    return { id, error: "Phishing detection is disabled" };
  }
  try {
    const scoped = mailbox.scope(id);
    if (!policyForMailbox(mailbox, scoped.mailboxId).phishingDetection) {
      return { id, error: "Phishing detection is turned off for this mailbox" };
    }
    const cached = await getCachedAnalysis(scoped);
    if (cached) {
      return {
        id,
        classification: cached.classification,
        risk_score: cached.risk_score,
        confidence: cached.confidence,
        action: cached.action,
        reasons: cached.reasons,
        cached: true,
      };
    }

    const rawB64 = await mailbox.adapter.getRaw(id);
    if (!rawB64) return { id, error: "No content to analyze" };

    const analysis = await getPhishingDetection().analyze({
      userId,
      rawMimeBase64: rawB64,
      headers,
    });
    await cacheAnalysis(scoped, analysis);
    return {
      id,
      classification: analysis.classification,
      risk_score: analysis.risk_score,
      confidence: analysis.confidence,
      action: analysis.action,
      reasons: analysis.reasons,
      cached: false,
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { id, error: sanitizeError(err) };
  }
}
