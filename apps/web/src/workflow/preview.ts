import "server-only";
import { recordAiUsage } from "@/ai/usage";
import { type MailScope, policyForMailbox } from "@/mail/session";
import { mailValue, readMail } from "@/ops/values";
import { decideOne, decisionEnabled, decisionUsageProvider } from "@/services/decision";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import {
  type DecisionAnswer,
  decisionState,
  nodeQuestions,
  toDecisionAnswer,
  wireQuestion,
} from "./decision";
import type { GraphNode } from "./schema";

export interface DecisionPreviewItem {
  messageId: string;
  from: string;
  subject: string;
  answers: Record<string, DecisionAnswer> | null;
}

export type DecisionPreview =
  | { ok: true; items: DecisionPreviewItem[] }
  | { ok: false; message: string };

const FULL_FIELDS = new Set(["body", "attachments", "hasAttachments"]);

function includeOf(node: Pick<GraphNode, "params">): string[] {
  const bound = node.params.include;
  return bound?.kind === "literal" && Array.isArray(bound.value)
    ? bound.value.map(String)
    : ["from", "subject", "snippet"];
}

export async function previewDecision(args: {
  userId: string;
  mail: Pick<MailScope, "userId" | "workspaceId" | "adapter" | "mailboxes" | "isAggregate"> | null;
  node: Pick<GraphNode, "params">;
  limit: number;
}): Promise<DecisionPreview> {
  await enforceRateLimit(args.userId, RATE_LIMITS.workflowDecisionPreview);
  if (!decisionEnabled("workflowNode")) {
    return { ok: false, message: "Ask and Branch steps are turned off on this instance" };
  }
  const questions = nodeQuestions(args.node);
  if (questions.length === 0)
    return { ok: false, message: "Add a question to this Ask step first" };

  const { mail } = args;
  const mailbox = mail?.mailboxes[0];
  if (!mail || mail.isAggregate || !mailbox)
    return { ok: false, message: "That mailbox is not in this workspace" };
  if (!policyForMailbox(mail, mailbox.mailboxId).ai) {
    return { ok: false, message: "AI is turned off for this mailbox" };
  }

  const include = includeOf(args.node);
  const full = include.length === 0 || include.some((field) => FULL_FIELDS.has(field));
  const handle = {
    mailboxId: mailbox.mailboxId,
    email: mailbox.mailboxEmail,
    adapter: mail.adapter,
  };
  const listed = await mail.adapter.listMessages("inbox", undefined, args.limit);
  const emails = (listed.emails ?? []).slice(0, args.limit);
  const wire = Object.fromEntries(
    questions.map((question) => [question.id, wireQuestion(question)]),
  );

  const items = await Promise.all(
    emails.map(async (email): Promise<DecisionPreviewItem> => {
      const value = full ? await readMail(handle, email.id, email) : mailValue(handle, email);
      const outcome = await decideOne({
        state: decisionState(value, include),
        questions: wire,
      });
      if (!outcome.refused) {
        recordAiUsage({
          userId: mail.userId,
          workspaceId: mail.workspaceId,
          feature: "workflow-decision",
          provider: decisionUsageProvider(),
          model: outcome.modelId,
          usage: outcome.usage,
        });
      }
      const answers = outcome.refused
        ? null
        : Object.fromEntries(
            questions.map((question) => [
              question.id,
              toDecisionAnswer(Object.fromEntries(Object.entries(outcome.answers))[question.id]),
            ]),
          );
      return {
        messageId: email.id,
        from: email.fromName || email.from,
        subject: email.subject,
        answers,
      };
    }),
  );
  return { ok: true, items };
}
