import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { Email } from "@/types/mail";

import { type MailScope, scopeMessage } from "./session";

export type ListingScope = Pick<MailScope, "adapter" | "mailboxes" | "isAggregate">;

export async function readListedEmail(
  mail: ListingScope,
  id: string,
): Promise<{ email: Email; readable: boolean }> {
  const target = scopeMessage(mail, id);
  const box = mail.mailboxes.find((m) => m.mailboxId === target.mailboxId);
  let meta: Partial<Email> = {};
  let metaError: string | null = null;
  try {
    meta = await mail.adapter.getMessage(id);
  } catch (err) {
    metaError = sanitizeError(err);
  }
  const email: Email = {
    id,
    threadId: meta.threadId,
    from: meta.from ?? "",
    fromName: meta.fromName,
    to: meta.to ?? [],
    cc: meta.cc,
    toRecipients: meta.toRecipients,
    ccRecipients: meta.ccRecipients,
    replyTo: meta.replyTo,
    messageIdHeader: meta.messageIdHeader,
    references: meta.references,
    subject: meta.subject ?? (metaError ? "(message details unavailable)" : "(no subject)"),
    snippet: meta.snippet ?? metaError ?? "",
    date: meta.date ?? new Date().toISOString(),
    isRead: meta.isRead ?? true,
    isStarred: meta.isStarred ?? false,
    labels: meta.labels ?? [],
    hasAttachments:
      meta.hasAttachments ?? (meta.attachments ? meta.attachments.length > 0 : undefined),
    provider: target.provider,
    folder: meta.folder ?? "inbox",
    ...(mail.isAggregate && box
      ? { mailboxId: box.mailboxId, mailboxSlug: box.mailboxSlug, mailboxEmail: box.mailboxEmail }
      : {}),
  };
  return { email, readable: metaError === null };
}
