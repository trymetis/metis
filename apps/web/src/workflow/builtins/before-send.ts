import "server-only";
import { htmlToText } from "@/lib/utils";
import { finishOutgoing } from "@/mail/signatures";
import type { DraftPayload, MailSignatureKind } from "@/types/mail";

import { authorizeMailboxAccess, resolvePrincipal } from "../authorization";
import { executeRun } from "../executor";
import { listDefinitions } from "../store";

export interface SendPolicyInput {
  workspaceId: string;
  mailboxId: string;
  draft: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    hasAttachment: boolean;
  };
}

function bccOf(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("bcc" in value)) return [];
  return Array.isArray(value.bcc) ? value.bcc.map(String) : [];
}

export async function collectSendPolicyBccs(opts: SendPolicyInput): Promise<string[]> {
  const definitions = await listDefinitions({ workspaceId: opts.workspaceId, kind: "user" });
  const known = new Set(
    [...opts.draft.to, ...(opts.draft.cc ?? []), ...(opts.draft.bcc ?? [])]
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
  const draft = {
    id: "",
    mailboxId: opts.mailboxId,
    to: opts.draft.to,
    cc: opts.draft.cc ?? [],
    bcc: opts.draft.bcc ?? [],
    subject: opts.draft.subject,
    body: opts.draft.body,
    html: "",
    replyToMessageId: "",
    attachments: [],
  };

  const outcomes = await Promise.all(
    definitions.map(async (loaded) => {
      if (!loaded.definition.enabled) return null;
      const trigger = loaded.graph.nodes.find((node) => node.step === "trigger.mail.beforeSend");
      if (!trigger) return null;
      const only = trigger.params.mailbox;
      if (
        only?.kind === "literal" &&
        typeof only.value === "string" &&
        only.value &&
        only.value !== opts.mailboxId
      ) {
        return null;
      }
      const principal = await resolvePrincipal(loaded.definition);
      if (!principal.ok) return null;
      const access = await authorizeMailboxAccess({
        definition: loaded.definition,
        principal: principal.value,
        mailboxId: opts.mailboxId,
      });
      if (!access.ok) return null;
      return executeRun({
        runId: null,
        mode: "policy",
        definition: loaded.definition,
        graph: loaded.graph,
        principal: principal.value,
        input: { triggerNodeId: trigger.id, source: "app", event: draft },
        now: new Date(),
      });
    }),
  );

  const added: string[] = [];
  for (const outcome of outcomes) {
    for (const value of outcome?.values ?? []) {
      for (const address of bccOf(value)) {
        const key = address.trim().toLowerCase();
        if (!key || known.has(key)) continue;
        known.add(key);
        added.push(address.trim());
      }
    }
  }
  return added;
}

export async function prepareOutgoing(opts: {
  workspaceId: string;
  mailboxId: string;
  mailboxEmail: string;
  userId: string;
  payload: DraftPayload;
  signature?: MailSignatureKind | null;
}): Promise<{ payload: DraftPayload; addedBcc: string[] }> {
  const { payload } = opts;
  const bccs = await collectSendPolicyBccs({
    workspaceId: opts.workspaceId,
    mailboxId: opts.mailboxId,
    draft: {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      body: payload.bodyText ?? (payload.bodyHtml ? htmlToText(payload.bodyHtml) : ""),
      hasAttachment: (payload.attachments?.length ?? 0) > 0,
    },
  });
  const finished = await finishOutgoing(
    {
      workspaceId: opts.workspaceId,
      mailboxId: opts.mailboxId,
      mailboxEmail: opts.mailboxEmail,
      userId: opts.userId,
    },
    payload,
    { signature: opts.signature ?? null, footer: true },
  );
  if (bccs.length === 0) return { payload: finished, addedBcc: [] };
  return { payload: { ...finished, bcc: [...(finished.bcc ?? []), ...bccs] }, addedBcc: bccs };
}
