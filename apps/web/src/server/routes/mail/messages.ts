import "server-only";
import { ORPCError } from "@orpc/server";

import { adapterForMailbox } from "@/mail/aggregate";
import {
  cacheMessage,
  deleteCachedMessage,
  getCachedMessage,
  touchCachedMessage,
} from "@/mail/cache";
import { seedProviderLabels } from "@/mail/labels";
import { readRawMessage } from "@/mail/raw";
import { listMailInState } from "@/mail/search";
import { forSender, type MailSession, mailboxIds, scopeMessage } from "@/mail/session";
import { suggestPeople } from "@/people";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  bulkDeleteInputSchema,
  bulkDeleteOutputSchema,
  contactSuggestionsOutputSchema,
  deleteMessageInputSchema,
  getMessageInputSchema,
  listInStateInputSchema,
  getMessageOutputSchema,
  getRawOutputSchema,
  listMessagesInputSchema,
  listMessagesOutputSchema,
  listSnoozedOutputSchema,
  mailboxScopeSchema,
  markReadInputSchema,
  markReadOutputSchema,
  messageIdInputSchema,
  searchMessagesInputSchema,
  searchMessagesOutputSchema,
  sendMessageInputSchema,
  sendMessageOutputSchema,
  snoozeMessageInputSchema,
  snoozeMessageOutputSchema,
  starMessageInputSchema,
  successSchema,
} from "@/server/schema";
import { rateLimit } from "@/services/rate-limit";
import type { Email } from "@/types/mail";
import {
  cancelSnooze,
  listSnoozedEmails,
  prepareOutgoing,
  snoozeMessage,
  unsnoozeMessage,
} from "@/workflow/builtins";

import { resolveSender } from "./sender";

function adapterError(err: unknown): ORPCError<"BAD_GATEWAY", unknown> {
  return new ORPCError("BAD_GATEWAY", { cause: err });
}

function groupByMailbox(mail: MailSession, emails: Email[]): Map<string, Email[]> {
  const out = new Map<string, Email[]>();
  for (const email of emails) {
    const { mailboxId } = scopeMessage(mail, email.id);
    const bucket = out.get(mailboxId);
    if (bucket) bucket.push(email);
    else out.set(mailboxId, [email]);
  }
  return out;
}

export const messagesRouter = {
  list: mailSession(listMessagesInputSchema)
    .output(listMessagesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        const data = await adapter.listMessages(input.folder, input.pageToken, input.limit);

        const byMailbox = groupByMailbox(mail, data.emails ?? []);

        await Promise.all(
          [...byMailbox].map(([mailboxId, emails]) =>
            seedProviderLabels({ mailboxId, emails }).catch((err: unknown) => {
              console.error("[mail/messages] provider label seed failed:", err);
            }),
          ),
        );

        return {
          emails: data.emails ?? [],
          mailboxErrors: data.mailboxErrors,
          nextPageToken: data.nextPageToken,
          total: data.total,
        };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  listInState: mailSession(listInStateInputSchema)
    .output(listMessagesOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await listMailInState(context.mail, input.folder, input.state, input.pageToken);
      } catch (err) {
        throw adapterError(err);
      }
    }),

  get: mailSession(getMessageInputSchema)
    .output(getMessageOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const cacheable = input.folder !== "drafts";

      try {
        const scoped = scopeMessage(mail, input.id);
        if (cacheable) {
          const cached = await getCachedMessage(scoped);
          if (cached?.bodyHtml || cached?.bodyText) {
            await touchCachedMessage(scoped).catch((err: unknown) => {
              console.error("[mail/messages] body cache touch failed:", err);
            });
            return {
              bodyHtml: cached.bodyHtml ?? undefined,
              bodyText: cached.bodyText ?? undefined,
            };
          }
        }

        const adapter = mail.adapter;
        const body = await adapter.getMessage(input.id);

        if (cacheable && (body.bodyHtml || body.bodyText)) {
          try {
            await cacheMessage(scoped, body);
          } catch (err) {
            console.error("[mail/messages] body cache write failed:", err);
          }
        }

        return body;
      } catch (err) {
        throw adapterError(err);
      }
    }),

  delete: mailSession(deleteMessageInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        await adapter.deleteMessage(input.id);
        await deleteCachedMessage(scopeMessage(mail, input.id));
        return { success: true as const };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  send: mailSession(sendMessageInputSchema)
    .output(sendMessageOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const rl = await rateLimit(mail.userId, {
        scope: "mail-send",
        limit: 60,
        windowSec: 60,
      });
      if (!rl.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many requests. Please slow down.",
          data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
        });
      }

      const { workspaceSlug: _ws, mailboxSlug: _mb, fromMailboxSlug: _from, ...draft } = input;
      const from = await resolveSender(mail, input.fromMailboxSlug);

      try {
        const { payload, addedBcc } = await prepareOutgoing({
          workspaceId: mail.workspaceId,
          mailboxId: from.mailboxId,
          mailboxEmail: from.mailboxEmail,
          userId: mail.userId,
          payload: forSender(mail, from, draft),
        });

        const adapter = await adapterForMailbox(from);
        await adapter.sendMessage(payload);
        return { success: true as const, addedBcc };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  search: mailSession(searchMessagesInputSchema)
    .output(searchMessagesOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      if (!input.q.trim()) {
        return { emails: [] };
      }

      try {
        const adapter = mail.adapter;
        const data = await adapter.search(input.q);
        return {
          emails: data.emails ?? [],
          mailboxErrors: data.mailboxErrors,
          nextPageToken: data.nextPageToken,
          total: data.total,
        };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  star: mailSession(starMessageInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        await adapter.starMessage(input.id, input.starred);
        return { success: true as const };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  markRead: mailSession(markReadInputSchema)
    .output(markReadOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      if (input.ids.length === 0) {
        return { success: true as const, updated: 0 };
      }

      try {
        const adapter = mail.adapter;
        await adapter.batchMarkRead(input.ids, input.read);
        return { success: true as const, updated: input.ids.length };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  contacts: mailSession(mailboxScopeSchema)
    .output(contactSuggestionsOutputSchema)
    .handler(async ({ context }) => {
      const { mail } = context;
      return {
        contacts: (
          await suggestPeople({
            userId: mail.userId,
            workspaceId: mail.workspaceId,
            mailboxIds: mailboxIds(mail),
            adapter: mail.adapter,
          })
        ).map(({ email, name }) => ({ email, ...(name ? { name } : {}) })),
      };
    }),

  bulkDelete: mailSession(bulkDeleteInputSchema)
    .output(bulkDeleteOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        let ids = input.ids ?? [];

        if (input.deleteAll && input.folder) {
          ids = await adapter.listAllInFolder(input.folder);
        }
        if (ids.length === 0) {
          return { success: true as const, deleted: 0 };
        }

        await adapter.batchDelete(ids);
        return { success: true as const, deleted: ids.length };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  archive: mailSession(messageIdInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        await adapter.archiveMessage(input.id);
        return { success: true as const };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  restore: mailSession(messageIdInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const adapter = mail.adapter;
        await adapter.restoreMessage(input.id);
        return { success: true as const };
      } catch (err) {
        throw adapterError(err);
      }
    }),

  getRaw: mailSession(messageIdInputSchema)
    .output(getRawOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        return { raw: await readRawMessage(mail.adapter, input.id) };
      } catch (err) {
        console.error("[mail/raw]", err);
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  snooze: mailSession(snoozeMessageInputSchema)
    .output(snoozeMessageOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      const target = scopeMessage(mail, input.id);
      const result = await snoozeMessage({
        userId: mail.userId,
        workspaceId: mail.workspaceId,
        linkId: target.linkId,
        target: {
          mailboxId: target.mailboxId,
          messageId: target.messageId,
          threadId: input.id,
        },
        folder: input.folder,
        wakeAt: new Date(input.wakeAt),
      });

      if (!result.ok || !result.id || !result.wakeAt) {
        throw new ORPCError(result.invalid ? "BAD_REQUEST" : "BAD_GATEWAY", {
          message: result.error ?? "Could not snooze that message",
        });
      }

      return { id: result.id, wakeAt: result.wakeAt };
    }),

  cancelSnooze: mailSession(messageIdInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const target = scopeMessage(mail, input.id);
      const result = await cancelSnooze({
        mailboxId: target.mailboxId,
        messageId: target.messageId,
      });
      if (!result.cancelled) {
        throw new ORPCError("CONFLICT", {
          message: result.reason ?? "That snooze could not be cancelled",
        });
      }
      return { success: true as const };
    }),

  unsnooze: mailSession(messageIdInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const target = scopeMessage(mail, input.id);
      let result: Awaited<ReturnType<typeof unsnoozeMessage>>;
      try {
        result = await unsnoozeMessage({
          adapter: mail.adapter,
          id: input.id,
          target,
        });
      } catch (err) {
        throw adapterError(err);
      }
      if (!result.cancelled) {
        throw new ORPCError("CONFLICT", { message: result.reason });
      }
      return { success: true as const };
    }),

  listSnoozed: mailSession(mailboxScopeSchema)
    .output(listSnoozedOutputSchema)
    .handler(async ({ context }) => ({
      emails: await listSnoozedEmails(context.mail),
    })),
};
