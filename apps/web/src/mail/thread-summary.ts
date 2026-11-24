import type { Spec } from "@json-render/core";
import type { ModelMessage } from "ai";
import { decodeHTMLStrict } from "entities";

import { recordAiUsage } from "@/ai/usage";
import { keysOf } from "@/lib/guards";
import { summarizerAgent } from "@/mastra/agents/summarizer";
import type { SummaryPreviewThread } from "@/server/schema";
import { decideOne, decisionEnabled, decisionUsageProvider } from "@/services/decision";
import { getLlm, structuredOutput } from "@/services/llm";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";
import type { ThreadSummary } from "@/types/thread-summary";

import { getThreadSummaries, getThreadSummary, saveThreadSummary } from "./cache";
import { type MailScope, policyForMailbox, scopeMessage } from "./session";
import { linksInText } from "./structured-data";
import {
  buildSummarySpec,
  cardsFromOutput,
  outputFromCards,
  type SummaryCard,
  summaryCardSchema,
  type SummaryOutput,
  summaryOutputSchemaFor,
} from "./summary-catalog";
import { type Conversation, type ConvMsg, loadConversation } from "./summary-conversation";
import {
  buildPrompt,
  CARD_DEFINITIONS,
  type DetailCardType,
  systemFull,
  systemRefine,
} from "./summary-prompt";

export interface SummaryResponse extends ThreadSummary {
  cached: boolean;
}

const SUMMARY_FORMAT = "cards-v4";
const REBUILD_AFTER = 5;
const MAX_MESSAGES = 25;
const MAX_OUTPUT_TOKENS = 8000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const GATE_WORTH_MIN = 0.2;
const GATE_CARD_MIN = 0.3;
const GATE_TEXT_MAX = 8000;

function retryDue(summary: ThreadSummary): boolean {
  return (
    summary.failedAt !== undefined && Date.now() - Date.parse(summary.failedAt) >= FAILURE_RETRY_MS
  );
}

function trackSummaryUsage(
  session: MailScope,
  result: { totalUsage?: unknown; steps?: unknown[]; finishReason?: unknown },
) {
  recordAiUsage({
    userId: session.userId,
    workspaceId: session.workspaceId,
    feature: "thread-summary",
    model: getLlm().summary.modelId,
    usage: result.totalUsage,
    steps: result.steps?.length,
    finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
  });
}

type AllowedLinks = Map<string, string>;

const MAX_ENTITY_PASSES = 3;

function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < MAX_ENTITY_PASSES; pass++) {
    const next = decodeHTMLStrict(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function linkKey(raw: string): string | null {
  const cleaned = decodeEntities(raw.trim())
    .replace(/^[<("'[]+/, "")
    .replace(/[.,;:!?)\]}>"']+$/, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function allowedLinks(msgs: ConvMsg[], prev: SummaryCard[] = []): AllowedLinks {
  const allowed: AllowedLinks = new Map();
  for (const link of [...msgs.flatMap((m) => m.links), ...linksInText(JSON.stringify(prev))]) {
    const key = linkKey(link);
    if (key && !allowed.has(key)) allowed.set(key, link);
  }
  return allowed;
}

function matchLink(value: string, allowed: AllowedLinks): string | null {
  for (const candidate of [value, ...linksInText(decodeEntities(value))]) {
    const key = linkKey(candidate);
    const own = key ? allowed.get(key) : undefined;
    if (own) return own;
  }
  return null;
}

function isUrlKey(key: string): boolean {
  return key === "url" || key.endsWith("Url");
}

function restrictValue(value: unknown, allowed: AllowedLinks): unknown {
  if (Array.isArray(value)) return value.map((v) => restrictValue(v, allowed));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isUrlKey(key) && typeof inner === "string") {
      next[key] = matchLink(inner, allowed);
    } else {
      next[key] = restrictValue(inner, allowed);
    }
  }
  return next;
}

function restrictLinks(cards: SummaryCard[], allowed: AllowedLinks): SummaryCard[] {
  return cards.flatMap((card) => {
    const restricted = summaryCardSchema.safeParse(restrictValue(card, allowed));
    return restricted.success ? [restricted.data] : [];
  });
}

type CardTypes = DetailCardType[] | null;

type GateVerdict = { skip: true } | { skip: false; types: CardTypes };

const UNGATED: GateVerdict = { skip: false, types: null };

const GATE_WORTH_INSTRUCTIONS = `Does this conversation contain anything a reader would want summarized: ${Object.values(CARD_DEFINITIONS).join("; ")}; or a request or a decision?`;

function cardQuestion(type: DetailCardType) {
  return {
    type: "boolean" as const,
    instructions: `Does this conversation contain ${CARD_DEFINITIONS[type]}?`,
  };
}

function probabilityOf(
  answers: Record<string, { probability: number } | undefined>,
  id: string,
): number {
  const answer = answers[id];
  if (!answer) throw new Error(`the decision has no ${id} answer`);
  return answer.probability;
}

async function gateSummary(session: MailScope, msgs: ConvMsg[]): Promise<GateVerdict> {
  if (!decisionEnabled("summaryGate")) return UNGATED;
  const cardTypes = keysOf(CARD_DEFINITIONS);
  try {
    const outcome = await decideOne({
      state: {
        messages: msgs.map((m) => ({
          subject: m.subject ?? "",
          from: m.from ?? "",
          text: m.text.slice(0, GATE_TEXT_MAX),
        })),
      },
      questions: {
        worth: { type: "boolean", instructions: GATE_WORTH_INSTRUCTIONS },
        ...Object.fromEntries(cardTypes.map((type) => [`card:${type}`, cardQuestion(type)])),
      },
    });
    if (outcome.refused) return UNGATED;
    recordAiUsage({
      userId: session.userId,
      workspaceId: session.workspaceId,
      feature: "summary-gate",
      provider: decisionUsageProvider(),
      model: outcome.modelId,
      usage: outcome.usage,
    });
    const answers = outcome.answers as Record<string, { probability: number } | undefined>;
    if (probabilityOf(answers, "worth") < GATE_WORTH_MIN) {
      return { skip: true };
    }
    const types = cardTypes.filter(
      (type) => probabilityOf(answers, `card:${type}`) >= GATE_CARD_MIN,
    );
    return { skip: false, types: types.length > 0 ? types : null };
  } catch (err) {
    console.error("[mail/summary] gate failed:", err);
    return UNGATED;
  }
}

async function generateCards(
  session: MailScope,
  messages: ModelMessage[],
  instructions: string,
  allowed: AllowedLinks,
  types: CardTypes,
): Promise<ThreadSummary> {
  const result = await summarizerAgent.generate(messages, {
    instructions,
    structuredOutput: structuredOutput(summaryOutputSchemaFor(types)),
    modelSettings: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  });
  trackSummaryUsage(session, result);
  const output: SummaryOutput = result.object;
  return { cards: restrictLinks(cardsFromOutput(output), allowed) };
}

function fullBuild(
  session: MailScope,
  conversation: Conversation,
  recent: ConvMsg[],
  types: CardTypes,
): Promise<ThreadSummary> {
  return generateCards(
    session,
    buildPrompt(
      conversation,
      recent,
      `Build the summary card for this conversation (${conversation.messages.length} message(s)):`,
    ),
    systemFull(types),
    allowedLinks(recent),
    types,
  );
}

function refine(
  session: MailScope,
  conversation: Conversation,
  prev: ThreadSummary,
  newMsgs: ConvMsg[],
  types: CardTypes,
): Promise<ThreadSummary> {
  return generateCards(
    session,
    buildPrompt(
      conversation,
      newMsgs,
      `Current card:\n${JSON.stringify(outputFromCards(prev.cards))}\n\nNew message(s):`,
    ),
    systemRefine(types),
    allowedLinks(newMsgs, prev.cards),
    types,
  );
}

function summaryModelKey(): string {
  return `${getLlm().summary.modelId}#${SUMMARY_FORMAT}`;
}

export async function buildThreadSummary(
  session: MailScope,
  messageId: string,
  threadId?: string,
  beforeModel?: () => Promise<void>,
): Promise<SummaryResponse> {
  const scopedThread = scopeMessage(session, threadId ?? messageId);
  const model = summaryModelKey();

  const conversation = await loadConversation(session, messageId, threadId);
  const msgs = conversation.messages;
  const lastMsg = msgs.at(-1);
  if (!lastMsg) {
    return { cards: [], cached: false };
  }

  const currentCount = msgs.length;
  const currentLastId = lastMsg.key;
  const existing = await getThreadSummary(scopedThread);

  const current =
    existing?.model === model && !(existing.summary.skipped && !decisionEnabled("summaryGate"))
      ? existing
      : null;
  let summary: ThreadSummary;
  let incrementCount = 0;

  if (
    current &&
    current.lastMessageId === currentLastId &&
    current.messageCount === currentCount &&
    !retryDue(current.summary)
  ) {
    return {
      ...current.summary,
      cached: true,
    };
  }

  await beforeModel?.();

  try {
    const lastIdx = current ? msgs.findIndex((m) => m.key === current.lastMessageId) : -1;
    if (
      current &&
      !current.summary.failedAt &&
      lastIdx !== -1 &&
      currentCount > current.messageCount &&
      current.incrementCount < REBUILD_AFTER
    ) {
      const newMsgs = msgs.slice(lastIdx + 1);
      const verdict = await gateSummary(session, newMsgs);
      if (verdict.skip) {
        summary = current.summary;
        incrementCount = current.incrementCount;
      } else {
        summary = await refine(session, conversation, current.summary, newMsgs, verdict.types);
        incrementCount = current.incrementCount + 1;
      }
    } else {
      const recent = msgs.slice(-MAX_MESSAGES);
      const verdict = await gateSummary(session, recent);
      summary = verdict.skip
        ? { cards: [], skipped: true }
        : await fullBuild(session, conversation, recent, verdict.types);
    }
  } catch (err) {
    console.error("[mail/summary] generation failed:", err);
    summary = {
      cards: current?.summary.cards ?? [],
      failedAt: new Date().toISOString(),
    };
  }

  await saveThreadSummary({
    scopedThread,
    summary,
    messageCount: currentCount,
    lastMessageId: currentLastId,
    incrementCount,
    model,
  });

  return { ...summary, cached: false };
}

export async function summarizeThread(
  session: MailScope,
  messageId: string,
  threadId?: string,
): Promise<{ cards: SummaryCard[]; spec: Spec | null }> {
  const { cards } = await buildThreadSummary(session, messageId, threadId, () =>
    enforceRateLimit(session.userId, RATE_LIMITS.threadSummary),
  );
  return {
    cards,
    spec: cards.length > 0 ? buildSummarySpec(cards) : null,
  };
}

export async function cachedSummaryCards(
  session: MailScope,
  threads: readonly SummaryPreviewThread[],
): Promise<Record<string, SummaryCard>> {
  const scoped = threads.flatMap((t) => {
    try {
      const thread = scopeMessage(session, t.threadId);
      if (!policyForMailbox(session, thread.mailboxId).ai) return [];
      return [{ threadId: t.threadId, thread, latestAt: Date.parse(t.latestDate) }];
    } catch {
      return [];
    }
  });
  const rows = await getThreadSummaries(scoped.map((s) => s.thread));
  const byKey = new Map(rows.map((r) => [`${r.mailboxId}\u0000${r.threadKey}`, r]));
  const model = summaryModelKey();
  const cards: Record<string, SummaryCard> = {};
  for (const { threadId, thread, latestAt } of scoped) {
    const row = byKey.get(`${thread.mailboxId}\u0000${thread.messageId}`);
    if (!row || row.model !== model || !(latestAt <= row.updatedAt.getTime())) continue;
    const { summary } = row;
    if (summary.skipped || summary.failedAt) continue;
    const card = summary.cards[0];
    if (card) cards[threadId] = card;
  }
  return cards;
}
