import "server-only";
import { and, eq, isNull, ne, type SQL } from "drizzle-orm";

import { type AuditActor, recordAuditEvent } from "@/audit";
import { getMailbox } from "@/connections";
import { db } from "@/db";
import { mailSignature, user, workspace } from "@/db/schema";
import { BadRequestError } from "@/lib/errors/bad-request";
import { sanitizeSignatureHtml } from "@/lib/sanitize-html";
import type { DraftPayload, MailSignatureKind, MailSignatureScope } from "@/types/mail";
import type { WorkspaceRole } from "@/types/workspace";
import { isAdmin } from "@/workspace";

import {
  fillSignatureVariables,
  footerBlock,
  hasSignatureBlock,
  htmlToPlainLines,
  SIGNATURES_PER_OWNER_MAX,
  signatureBlock,
} from "./signature-markup";

export type SignatureOwner =
  | { scope: "workspace"; workspaceId: string }
  | { scope: "mailbox"; mailboxId: string }
  | { scope: "personal"; mailboxId: string; userId: string };

export interface StoredSignature {
  id: string;
  scope: MailSignatureScope;
  name: string;
  html: string;
  defaultNew: boolean;
  defaultReply: boolean;
}

export interface ComposeSignature {
  id: string;
  scope: MailSignatureScope;
  name: string;
  html: string;
}

export interface ComposeSignatures {
  signatures: ComposeSignature[];
  defaultNew: string | null;
  defaultReply: string | null;
}

export interface SignatureInput {
  id?: string;
  name: string;
  html: string;
  defaultNew?: boolean;
  defaultReply?: boolean;
}

export const WORKSPACE_SIGNATURES_ADMIN_ONLY =
  "Only workspace owners and admins can change workspace signatures and the footer";
export const MAILBOX_SIGNATURES_OWNER_ONLY =
  "Only the person who connected this mailbox can change its signatures";

export interface SignatureEditor {
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  userId: string;
}

export function canEditWorkspaceSignatures(editor: Pick<SignatureEditor, "workspaceRole">) {
  return isAdmin(editor.workspaceRole);
}

export async function ownsMailbox(userId: string, mailboxId: string): Promise<boolean> {
  return (await getMailbox(mailboxId, userId)) !== null;
}

export async function signatureOwnerFor(
  editor: SignatureEditor,
  scope: MailSignatureScope,
  mailboxId: string | null,
): Promise<SignatureOwner | { error: string }> {
  if (scope === "workspace") {
    if (!canEditWorkspaceSignatures(editor)) return { error: WORKSPACE_SIGNATURES_ADMIN_ONLY };
    return { scope, workspaceId: editor.workspaceId };
  }
  if (!mailboxId) return { error: "Pick the mailbox this signature belongs to" };
  if (scope === "personal") return { scope, mailboxId, userId: editor.userId };
  if (!(await ownsMailbox(editor.userId, mailboxId))) {
    return { error: MAILBOX_SIGNATURES_OWNER_ONLY };
  }
  return { scope, mailboxId };
}

const SCOPE_ORDER: MailSignatureScope[] = ["personal", "mailbox", "workspace"];

function ownerWhere(owner: SignatureOwner): SQL | undefined {
  if (owner.scope === "workspace") {
    return and(
      eq(mailSignature.scope, "workspace"),
      eq(mailSignature.workspaceId, owner.workspaceId),
    );
  }
  if (owner.scope === "mailbox") {
    return and(
      eq(mailSignature.scope, "mailbox"),
      eq(mailSignature.mailboxId, owner.mailboxId),
      isNull(mailSignature.userId),
    );
  }
  return and(
    eq(mailSignature.scope, "personal"),
    eq(mailSignature.mailboxId, owner.mailboxId),
    eq(mailSignature.userId, owner.userId),
  );
}

function ownerColumns(owner: SignatureOwner) {
  return {
    scope: owner.scope,
    workspaceId: owner.scope === "workspace" ? owner.workspaceId : null,
    mailboxId: owner.scope === "workspace" ? null : owner.mailboxId,
    userId: owner.scope === "personal" ? owner.userId : null,
  };
}

function toStored(row: typeof mailSignature.$inferSelect): StoredSignature {
  return {
    id: row.id,
    scope: row.scope,
    name: row.name,
    html: row.html,
    defaultNew: row.defaultNew,
    defaultReply: row.defaultReply,
  };
}

export async function listSignatures(owner: SignatureOwner): Promise<StoredSignature[]> {
  const rows = await db
    .select()
    .from(mailSignature)
    .where(ownerWhere(owner))
    .orderBy(mailSignature.createdAt);
  return rows.map(toStored);
}

export async function saveSignature(
  owner: SignatureOwner,
  input: SignatureInput,
): Promise<StoredSignature | null> {
  const html = sanitizeSignatureHtml(input.html);
  const name = input.name.trim();
  const now = new Date();
  return db.transaction(async (tx) => {
    let id = input.id;
    if (id) {
      const updated = await tx
        .update(mailSignature)
        .set({
          name,
          html,
          ...(input.defaultNew !== undefined && { defaultNew: input.defaultNew }),
          ...(input.defaultReply !== undefined && { defaultReply: input.defaultReply }),
          updatedAt: now,
        })
        .where(and(eq(mailSignature.id, id), ownerWhere(owner)))
        .returning({ id: mailSignature.id });
      if (updated.length === 0) return null;
    } else {
      const existing = await tx
        .select({ id: mailSignature.id })
        .from(mailSignature)
        .where(ownerWhere(owner));
      if (existing.length >= SIGNATURES_PER_OWNER_MAX) {
        throw new BadRequestError(`You can keep up to ${SIGNATURES_PER_OWNER_MAX} signatures here`);
      }
      id = crypto.randomUUID();
      await tx.insert(mailSignature).values({
        id,
        ...ownerColumns(owner),
        name,
        html,
        defaultNew: input.defaultNew ?? false,
        defaultReply: input.defaultReply ?? false,
        createdAt: now,
        updatedAt: now,
      });
    }
    const others = and(ownerWhere(owner), ne(mailSignature.id, id));
    if (input.defaultNew) {
      await tx.update(mailSignature).set({ defaultNew: false }).where(others);
    }
    if (input.defaultReply) {
      await tx.update(mailSignature).set({ defaultReply: false }).where(others);
    }
    const [row] = await tx.select().from(mailSignature).where(eq(mailSignature.id, id));
    return row ? toStored(row) : null;
  });
}

export async function deleteSignature(owner: SignatureOwner, id: string): Promise<boolean> {
  const deleted = await db
    .delete(mailSignature)
    .where(and(eq(mailSignature.id, id), ownerWhere(owner)))
    .returning({ id: mailSignature.id });
  return deleted.length > 0;
}

async function userName(userId: string | null): Promise<string> {
  if (!userId) return "";
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.name ?? "";
}

export interface SenderContext {
  workspaceId: string;
  mailboxId: string;
  mailboxEmail: string;
  userId: string | null;
}

export async function composeSignatures(sender: SenderContext): Promise<ComposeSignatures> {
  const [personal, mailbox, shared, name] = await Promise.all([
    sender.userId
      ? listSignatures({ scope: "personal", mailboxId: sender.mailboxId, userId: sender.userId })
      : Promise.resolve([]),
    listSignatures({ scope: "mailbox", mailboxId: sender.mailboxId }),
    listSignatures({ scope: "workspace", workspaceId: sender.workspaceId }),
    userName(sender.userId),
  ]);
  const filled = (rows: StoredSignature[]) => rows.filter((s) => s.html.length > 0);
  const byScope: Record<MailSignatureScope, StoredSignature[]> = {
    personal: filled(personal),
    mailbox: filled(mailbox),
    workspace: filled(shared),
  };
  const vars = { name, email: sender.mailboxEmail };
  const ordered = SCOPE_ORDER.flatMap((scope) => byScope[scope]);
  const pick = (flag: "defaultNew" | "defaultReply") =>
    SCOPE_ORDER.map((scope) => byScope[scope].find((s) => s[flag])).find(Boolean)?.id ?? null;
  return {
    signatures: ordered.map((s) => ({
      id: s.id,
      scope: s.scope,
      name: s.name,
      html: fillSignatureVariables(s.html, vars),
    })),
    defaultNew: pick("defaultNew"),
    defaultReply: pick("defaultReply"),
  };
}

export interface MailFooter {
  html: string;
  enabled: boolean;
}

export async function getMailFooter(workspaceId: string): Promise<MailFooter> {
  const [row] = await db
    .select({ html: workspace.mailFooterHtml, enabled: workspace.mailFooterEnabled })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return row ?? { html: "", enabled: false };
}

export async function setMailFooter(
  workspaceId: string,
  footer: MailFooter,
  by: AuditActor,
): Promise<MailFooter> {
  const html = sanitizeSignatureHtml(footer.html);
  const enabled = footer.enabled && html.length > 0;
  const before = await getMailFooter(workspaceId);
  await db
    .update(workspace)
    .set({ mailFooterHtml: html, mailFooterEnabled: enabled })
    .where(eq(workspace.id, workspaceId));
  if (before.html !== html || before.enabled !== enabled) {
    await recordAuditEvent(by, {
      action: "workspace.mail_footer_changed",
      workspaceId,
      detail: { enabled },
    });
  }
  return { html, enabled };
}

function appendHtml(payload: DraftPayload, html: string): DraftPayload {
  const text = htmlToPlainLines(html);
  return {
    ...payload,
    bodyHtml: `${payload.bodyHtml}${html}`,
    ...(payload.bodyText !== undefined && {
      bodyText: text ? `${payload.bodyText}\n\n${text}` : payload.bodyText,
    }),
  };
}

export async function withSignature(
  sender: SenderContext,
  payload: DraftPayload,
  kind: MailSignatureKind,
): Promise<DraftPayload> {
  if (hasSignatureBlock(payload.bodyHtml)) return payload;
  const options = await composeSignatures(sender);
  const id = kind === "reply" ? options.defaultReply : options.defaultNew;
  const chosen = options.signatures.find((s) => s.id === id);
  if (!chosen || !chosen.html) return payload;
  const text = htmlToPlainLines(chosen.html);
  return {
    ...payload,
    bodyHtml: `${payload.bodyHtml}${signatureBlock(chosen.id, chosen.html)}`,
    ...(payload.bodyText !== undefined && {
      bodyText: text ? `${payload.bodyText}\n\n-- \n${text}` : payload.bodyText,
    }),
  };
}

export async function withFooter(
  workspaceId: string,
  payload: DraftPayload,
): Promise<DraftPayload> {
  const footer = await getMailFooter(workspaceId);
  if (!footer.enabled || !footer.html) return payload;
  return appendHtml(payload, footerBlock(footer.html));
}

export async function finishOutgoing(
  sender: SenderContext,
  payload: DraftPayload,
  opts: { signature: MailSignatureKind | null; footer: boolean },
): Promise<DraftPayload> {
  const signed = opts.signature ? await withSignature(sender, payload, opts.signature) : payload;
  return opts.footer ? withFooter(sender.workspaceId, signed) : signed;
}
