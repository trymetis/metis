import "server-only";
import { ORPCError } from "@orpc/server";

import { adapterForMailbox, compositeId } from "@/mail/aggregate";
import { forSender, type MailSession, scopeMessage } from "@/mail/session";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  deleteDraftInputSchema,
  deleteDraftOutputSchema,
  saveDraftInputSchema,
  saveDraftOutputSchema,
} from "@/server/schema";

import { resolveSender } from "./sender";

function aggregateDraft(mail: MailSession, draftId: string) {
  try {
    const { mailboxId, messageId } = scopeMessage(mail, draftId);
    const mailbox = mail.mailboxes.find((m) => m.mailboxId === mailboxId);
    if (!mailbox) throw new Error("Draft does not belong to a mailbox you can see");
    return { mailbox, messageId };
  } catch (err) {
    throw new ORPCError("BAD_REQUEST", { message: "Unknown draft.", cause: err });
  }
}

export const draftsRouter = {
  save: mailSession(saveDraftInputSchema)
    .output(saveDraftOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const adapter = await adapterForMailbox(from);
      const payload = forSender(mail, from, input.payload);
      const existing =
        input.draftId && mail.isAggregate ? aggregateDraft(mail, input.draftId) : null;
      if (existing && existing.mailbox.mailboxId !== from.mailboxId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This draft is saved in another mailbox.",
        });
      }
      const draftId = existing ? existing.messageId : input.draftId;
      const idFor = (id: string) => (mail.isAggregate ? compositeId(from.mailboxId, id) : id);

      try {
        if (draftId) {
          if (from.provider === "zoho") {
            const { id } = await adapter.createDraft(payload);
            try {
              await adapter.deleteDraft(draftId);
            } catch {}
            return { id: idFor(id) };
          }
          const { id } = await adapter.updateDraft(draftId, payload);
          return { id: idFor(id) };
        }

        const { id } = await adapter.createDraft(payload);
        return { id: idFor(id) };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  delete: mailSession(deleteDraftInputSchema)
    .output(deleteDraftOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const existing = mail.isAggregate ? aggregateDraft(mail, input.draftId) : null;
      const adapter = existing
        ? await adapterForMailbox(existing.mailbox)
        : await adapterForMailbox(await resolveSender(mail, input.fromMailboxSlug));

      try {
        await adapter.deleteDraft(existing ? existing.messageId : input.draftId);
        return { success: true as const };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),
};
