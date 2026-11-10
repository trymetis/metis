import "server-only";
import { ORPCError } from "@orpc/server";

import type { MailSession } from "@/mail/session";
import {
  composeSignatures,
  deleteSignature,
  listSignatures,
  ownsMailbox,
  saveSignature,
  type SignatureOwner,
  signatureOwnerFor,
} from "@/mail/signatures";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  composeSignaturesInputSchema,
  composeSignaturesOutputSchema,
  deleteMailboxSignatureInputSchema,
  listMailboxSignaturesInputSchema,
  listMailboxSignaturesOutputSchema,
  saveMailboxSignatureInputSchema,
  saveSignatureOutputSchema,
  successSchema,
} from "@/server/schema";

import { resolveSender } from "./sender";

async function ownerFor(
  mail: MailSession,
  mailboxId: string,
  scope: "mailbox" | "personal",
): Promise<SignatureOwner> {
  const owner = await signatureOwnerFor(mail, scope, mailboxId);
  if ("error" in owner) throw new ORPCError("FORBIDDEN", { message: owner.error });
  return owner;
}

export const signaturesRouter = {
  list: mailSession(listMailboxSignaturesInputSchema)
    .output(listMailboxSignaturesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const [mailbox, personal, canEditMailbox] = await Promise.all([
        listSignatures({ scope: "mailbox", mailboxId: from.mailboxId }),
        listSignatures({ scope: "personal", mailboxId: from.mailboxId, userId: mail.userId }),
        ownsMailbox(mail.userId, from.mailboxId),
      ]);
      return { mailbox, personal, canEditMailbox };
    }),

  save: mailSession(saveMailboxSignatureInputSchema)
    .output(saveSignatureOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const owner = await ownerFor(mail, from.mailboxId, input.scope);
      const signature = await saveSignature(owner, input.signature);
      if (!signature) throw new ORPCError("NOT_FOUND", { message: "That signature is gone" });
      return { signature };
    }),

  delete: mailSession(deleteMailboxSignatureInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const owner = await ownerFor(mail, from.mailboxId, input.scope);
      if (!(await deleteSignature(owner, input.id))) {
        throw new ORPCError("NOT_FOUND", { message: "That signature is gone" });
      }
      return { success: true as const };
    }),

  forCompose: mailSession(composeSignaturesInputSchema)
    .output(composeSignaturesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      return composeSignatures({
        workspaceId: mail.workspaceId,
        mailboxId: from.mailboxId,
        mailboxEmail: from.mailboxEmail,
        userId: mail.userId,
      });
    }),
};
