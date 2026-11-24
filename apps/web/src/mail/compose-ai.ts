import "server-only";
import { recordAiUsage } from "@/ai/usage";
import { htmlToText, truncate } from "@/lib/utils";
import { drafterAgent } from "@/mastra/agents/drafter";
import type { ApologyTone, ReplyStance, RewriteMode } from "@/server/schema";
import { getLlm } from "@/services/llm";

import type { MailSession } from "./session";

const REWRITE_GUIDANCE: Record<RewriteMode, string> = {
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

function paragraphsHtml(text: string): string {
  return text
    .trim()
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

export async function draftApology(
  mail: MailSession,
  input: { messageId: string; situation: string; tone: ApologyTone },
): Promise<string> {
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

  return paragraphsHtml(result.text);
}

export async function draftStanceReply(
  mail: MailSession,
  input: { messageId: string; stance: ReplyStance; draft?: string },
): Promise<string> {
  const adapter = mail.adapter;
  const body = await adapter.getMessage(input.messageId);
  const text = body.bodyText ?? (body.bodyHtml ? htmlToText(body.bodyHtml) : "");
  const emailContext = truncate(text, 2000);

  const stanceGuidance: Record<ReplyStance, string> = {
    decline:
      "Politely decline. Be clear that the answer is no without being harsh. Optionally leave the door open for the future.",
    accept: "Accept warmly and confirm. Restate any key details (time, scope) you're agreeing to.",
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

  return paragraphsHtml(result.text);
}

export async function rewriteText(
  mail: MailSession,
  input: { text: string; mode: RewriteMode },
): Promise<string> {
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
  return result.text.trim();
}
