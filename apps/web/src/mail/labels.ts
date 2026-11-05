import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";

import { recordAiUsage } from "@/ai/usage";
import { db } from "@/db";
import { mailboxLabel, mailLabel } from "@/db/schema";
import { BUILT_IN_LABELS, type ClassifyItemInput } from "@/server/schema";
import {
  decideOne,
  decisionClassifierBatch,
  decisionUsageProvider,
  getDecision,
  neutralCriteria,
  topChoice,
} from "@/services/decision";
import type { Email, MessagesResponse } from "@/types/mail";
import { labelsApplied } from "@/workflow/hooks";

import { compositeId } from "./aggregate";
import { markUnsure, unsureMessages } from "./classify-unsure";
import { type CustomLabel, LABEL_DESCRIPTIONS, resolveLabelName } from "./label-meta";
import { type ListingScope, readListedEmail } from "./listed";
import { type MailScope, type MailSession, scopeMessage } from "./session";

const LABEL_PAGE_SIZE = 50;

function sentAt(email: Email): number {
  return Date.parse(email.date) || 0;
}

export async function listLabelledEmails(
  mail: ListingScope,
  label: string,
  pageToken?: string,
): Promise<MessagesResponse> {
  const offset = pageToken && /^\d+$/.test(pageToken) ? Number(pageToken) : 0;
  const rows = await db
    .select({ mailboxId: mailLabel.mailboxId, messageId: mailLabel.messageId })
    .from(mailLabel)
    .where(
      and(
        inArray(
          mailLabel.mailboxId,
          mail.mailboxes.map((m) => m.mailboxId),
        ),
        eq(mailLabel.label, label),
      ),
    )
    .orderBy(desc(mailLabel.classifiedAt), desc(mailLabel.id))
    .limit(LABEL_PAGE_SIZE + 1)
    .offset(offset);
  const page = rows.slice(0, LABEL_PAGE_SIZE);
  const listed = await Promise.all(
    page.map((row) =>
      readListedEmail(
        mail,
        mail.isAggregate ? compositeId(row.mailboxId, row.messageId) : row.messageId,
      ),
    ),
  );
  return {
    emails: listed
      .filter(({ readable }) => readable)
      .map(({ email }) => email)
      .toSorted((a, b) => sentAt(b) - sentAt(a)),
    nextPageToken: rows.length > LABEL_PAGE_SIZE ? String(offset + LABEL_PAGE_SIZE) : undefined,
  };
}

const GMAIL_CATEGORY_LABELS: Record<string, string> = {
  CATEGORY_PROMOTIONS: "promotional",
  CATEGORY_UPDATES: "updates",
  CATEGORY_SOCIAL: "social",
  CATEGORY_FORUMS: "newsletter",
};

export async function seedProviderLabels(params: {
  mailboxId: string;
  emails: { id: string; labels?: string[] }[];
}): Promise<void> {
  const now = new Date();
  const rows = params.emails.flatMap((email) => {
    const label = (email.labels ?? []).map((l) => GMAIL_CATEGORY_LABELS[l]).find(Boolean);
    if (!label) return [];
    return [
      {
        id: crypto.randomUUID(),
        mailboxId: params.mailboxId,
        messageId: email.id,
        label,
        confidence: 100,
        source: "provider" as const,
        classifiedAt: now,
      },
    ];
  });
  if (rows.length === 0) return;
  await db
    .insert(mailLabel)
    .values(rows)
    .onConflictDoNothing({
      target: [mailLabel.mailboxId, mailLabel.messageId],
    });
}

export async function messageLabels(
  mailboxId: string,
  messageIds: string[],
): Promise<Map<string, string>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db
    .select({ messageId: mailLabel.messageId, label: mailLabel.label })
    .from(mailLabel)
    .where(and(eq(mailLabel.mailboxId, mailboxId), inArray(mailLabel.messageId, messageIds)));
  return new Map(rows.map((row) => [row.messageId, row.label]));
}

export async function mailboxLabelKeys(mailboxIds: string[]): Promise<Set<string>> {
  if (mailboxIds.length === 0) return new Set(BUILT_IN_LABELS);
  const custom = await db
    .select({ key: mailboxLabel.key })
    .from(mailboxLabel)
    .where(inArray(mailboxLabel.mailboxId, mailboxIds));
  return new Set<string>([...BUILT_IN_LABELS, ...custom.map((l) => l.key)]);
}

export async function listMailboxLabels(mailboxIds: string[]): Promise<CustomLabel[]> {
  if (mailboxIds.length === 0) return [];
  const rows = await db
    .selectDistinct({
      key: mailboxLabel.key,
      name: mailboxLabel.name,
      color: mailboxLabel.color,
    })
    .from(mailboxLabel)
    .where(inArray(mailboxLabel.mailboxId, mailboxIds));
  return rows;
}

export async function setUserLabel(params: {
  userId: string;
  mailboxId: string;
  messageId: string;
  label: string;
  at?: Date;
}): Promise<void> {
  const { userId, mailboxId, messageId, label } = params;
  const now = params.at ?? new Date();
  await db
    .insert(mailLabel)
    .values({
      id: crypto.randomUUID(),
      mailboxId,
      messageId,
      label,
      confidence: 100,
      source: "user",
      setByUserId: userId,
      classifiedAt: now,
    })
    .onConflictDoUpdate({
      target: [mailLabel.mailboxId, mailLabel.messageId],
      set: {
        label,
        source: "user",
        confidence: 100,
        setByUserId: userId,
        classifiedAt: now,
      },
    });
  labelsApplied([{ mailboxId, messageId }], label, "person");
}

export function labelTargets(mail: Pick<MailScope, "mailboxes" | "isAggregate">, ids: string[]) {
  return ids.map((id) => ({ id, target: scopeMessage(mail, id) }));
}

export function labelsIn(targets: { target: { mailboxId: string; messageId: string } }[]) {
  return and(
    inArray(
      mailLabel.mailboxId,
      targets.map((t) => t.target.mailboxId),
    ),
    inArray(
      mailLabel.messageId,
      targets.map((t) => t.target.messageId),
    ),
  );
}

export async function setLabelOnMessages(params: {
  userId: string;
  targets: { id: string; target: { mailboxId: string; messageId: string } }[];
  label: string;
}): Promise<Record<string, string | null>> {
  const existing = await db
    .select({
      mailboxId: mailLabel.mailboxId,
      messageId: mailLabel.messageId,
      label: mailLabel.label,
    })
    .from(mailLabel)
    .where(labelsIn(params.targets));

  const labelByPair = new Map(
    existing.map((row) => [compositeId(row.mailboxId, row.messageId), row.label]),
  );

  const previous: Record<string, string | null> = {};
  const now = new Date();
  for (const { id, target } of params.targets) {
    previous[id] = labelByPair.get(compositeId(target.mailboxId, target.messageId)) ?? null;
  }
  await Promise.all(
    params.targets.map(({ target }) =>
      setUserLabel({
        userId: params.userId,
        mailboxId: target.mailboxId,
        messageId: target.messageId,
        label: params.label,
        at: now,
      }),
    ),
  );
  return previous;
}

const DECISION_LABEL_MIN = 0.5;
const DECISION_MAX_OPTIONS = 255;
export async function classifyByDecision(
  mail: MailSession,
  items: ClassifyItemInput[],
  customLabels: { key: string; name: string }[],
): Promise<{ id: string; label: string; confidence: number }[]> {
  const options = [
    ...BUILT_IN_LABELS.map((key) => ({
      key,
      name: resolveLabelName(key, []),
      description: LABEL_DESCRIPTIONS[key],
    })),
    ...customLabels.map((label) => ({ key: label.key, name: label.name })),
  ];
  if (options.length > DECISION_MAX_OPTIONS) {
    console.warn(
      `[mail/labels] ${options.length} labels exceed the ${DECISION_MAX_OPTIONS} a decision question can carry; skipping classification`,
    );
    return [];
  }
  const { criteria, keyOf } = neutralCriteria<string>(options);

  const targets = items.map((item) => scopeMessage(mail, item.id));
  const unsure = await unsureMessages(targets);
  const pending = items.filter((_, index) => {
    const target = targets[index];
    return !target || !unsure.has(`${target.mailboxId}:${target.messageId}`);
  });

  async function decide(item: ClassifyItemInput) {
    try {
      const outcome = await decideOne({
        state: {
          from: item.sender ?? "",
          subject: item.subject ?? "",
          snippet: item.snippet ?? "",
        },
        questions: {
          label: {
            type: "choice",
            instructions: "Which category fits this email?",
            criteria,
          },
        },
      });
      return { item, outcome };
    } catch (err) {
      console.error("[mail/labels] classify decision call failed:", err);
      return { item, outcome: null };
    }
  }

  const outcomes: Awaited<ReturnType<typeof decide>>[] = [];
  const batch = decisionClassifierBatch();
  for (let i = 0; i < pending.length; i += batch) {
    outcomes.push(
      // oxlint-disable-next-line eslint/no-await-in-loop -- batches run one after another to cap concurrent decision-model calls
      ...(await Promise.all(pending.slice(i, i + batch).map(decide))),
    );
  }

  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const decided: { id: string; label: string; confidence: number }[] = [];
  const undecided: string[] = [];
  for (const { item, outcome } of outcomes) {
    if (!outcome) continue;
    usage.calls++;
    if (!outcome.refused) {
      usage.inputTokens += outcome.usage.inputTokens ?? 0;
      usage.outputTokens += outcome.usage.outputTokens ?? 0;
    }
    const top = outcome.refused ? null : topChoice(outcome.answers.label, DECISION_LABEL_MIN);
    const label = top ? keyOf.get(top.id) : undefined;
    if (top && label) {
      decided.push({
        id: item.id,
        label,
        confidence: Math.round(top.probability * 100),
      });
    } else {
      undecided.push(item.id);
    }
  }

  if (usage.calls > 0) {
    recordAiUsage({
      userId: mail.userId,
      workspaceId: mail.workspaceId,
      feature: "classify",
      provider: decisionUsageProvider(),
      model: getDecision().model.modelId,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      steps: usage.calls,
    });
  }

  await markUnsure(undecided.map((id) => scopeMessage(mail, id)));
  return decided;
}

export async function clearUserLabel(params: {
  mailboxId: string;
  messageId: string;
}): Promise<void> {
  await db
    .delete(mailLabel)
    .where(
      and(eq(mailLabel.mailboxId, params.mailboxId), eq(mailLabel.messageId, params.messageId)),
    );
}
