import "server-only";
import { z } from "zod";

import { db } from "@/db";
import { mailMute } from "@/db/schema";
import { listMutedThreads, muteThreads, unmuteThreads } from "@/mail/mute";
import {
  addReadLater as addToReadLater,
  listReadLater as listReadLaterIds,
  removeReadLater as removeFromReadLater,
} from "@/mail/read-later";
import { sendingMailbox } from "@/mail/session";
import { scanSubscriptions, unsubscribeSenders } from "@/mail/subscriptions";
import {
  bulkUnsubscribeResultSchema,
  runStatusSchema,
  subscriptionSenderSchema,
} from "@/server/schema";
import type { DraftPayload } from "@/types/mail";
import {
  cancelScheduledSend,
  cancelSnooze as cancelSnoozeRun,
  listScheduledMail,
  listSnoozedEmails,
  retryScheduledSend,
  scheduleOutgoing,
  snoozeMessage,
  unsnoozeMessage,
} from "@/workflow/builtins";

import { orFailure, type Output } from "./output";
import { type AgentMailbox, mailScopeFor, type WorkspaceCtx } from "./scope";

export const snoozeEmailOutput = orFailure(
  z.object({ snoozed: z.literal(true), mailboxId: z.string(), id: z.string(), wakeAt: z.string() }),
);

export const cancelSnoozeOutput = orFailure(
  z.object({ cancelled: z.literal(true), mailboxId: z.string(), id: z.string(), note: z.string() }),
);

export const unsnoozeEmailOutput = orFailure(
  z.object({ unsnoozed: z.literal(true), mailboxId: z.string(), id: z.string() }),
);

export const listSnoozedOutput = z.object({
  mailbox: z.string(),
  count: z.number(),
  emails: z.array(
    z.object({
      id: z.string(),
      threadId: z.string().optional(),
      from: z.string(),
      subject: z.string(),
      wakeAt: z.string(),
      status: runStatusSchema,
      error: z.string().nullable(),
    }),
  ),
});

export const scheduleEmailOutput = orFailure(
  z.object({
    scheduled: z.literal(true),
    mailboxId: z.string(),
    scheduleId: z.string(),
    scheduledFor: z.string(),
    note: z.string(),
  }),
);

export const listScheduledOutput = z.object({
  mailbox: z.string(),
  count: z.number(),
  scheduled: z.array(
    z.object({
      scheduleId: z.string(),
      scheduledFor: z.string(),
      status: runStatusSchema,
      sent: z.boolean(),
      unconfirmed: z.boolean(),
      subject: z.string(),
      to: z.array(z.string()),
      scheduledBy: z.string(),
      scheduledByYou: z.boolean(),
      error: z.string().nullable(),
    }),
  ),
});

export const cancelScheduledOutput = orFailure(
  z.object({ cancelled: z.literal(true), mailboxId: z.string(), scheduleId: z.string() }),
);

export const retryScheduledOutput = orFailure(
  z.object({
    state: z.literal("resumed"),
    mailboxId: z.string(),
    scheduleId: z.string(),
    message: z.string(),
  }),
);

export const muteOutput = z.object({
  muted: z.boolean(),
  mailboxId: z.string(),
  threadId: z.string(),
});

export const listMutedOutput = z.object({
  mailbox: z.string(),
  count: z.number(),
  threadIds: z.array(z.string()),
});

export const readLaterOutput = z.object({
  readLater: z.boolean(),
  mailboxId: z.string(),
  id: z.string(),
});

export const listReadLaterOutput = z.object({
  mailbox: z.string(),
  count: z.number(),
  ids: z.array(z.string()),
});

export const listSubscriptionsOutput = z.object({
  mailbox: z.string(),
  scanned: z.number(),
  count: z.number(),
  senders: z.array(
    subscriptionSenderSchema
      .omit({ unsubscribedStatus: true })
      .extend({ unsubscribed: subscriptionSenderSchema.shape.unsubscribedStatus }),
  ),
});

export const unsubscribeOutput = z.object({
  mailboxId: z.string(),
  results: z.array(bulkUnsubscribeResultSchema),
});

export async function snoozeEmail(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { id: string; wakeAt: string },
): Promise<Output<typeof snoozeEmailOutput>> {
  const target = mailbox.scope(args.id);
  const result = await snoozeMessage({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    linkId: target.linkId,
    target: {
      mailboxId: target.mailboxId,
      messageId: target.messageId,
      threadId: args.id,
    },
    wakeAt: new Date(args.wakeAt),
  });
  if (!result.ok || !result.wakeAt) {
    return { error: result.error ?? "Could not snooze that email" };
  }
  return {
    snoozed: true,
    mailboxId: mailbox.mailboxId,
    id: args.id,
    wakeAt: result.wakeAt,
  };
}

export async function cancelSnooze(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof cancelSnoozeOutput>> {
  const target = mailbox.scope(id);
  const result = await cancelSnoozeRun({
    mailboxId: target.mailboxId,
    messageId: target.messageId,
  });
  if (!result.cancelled) {
    return { error: result.reason ?? "That snooze could not be cancelled" };
  }
  return {
    cancelled: true,
    mailboxId: mailbox.mailboxId,
    id,
    note: "The email stays archived; use unsnoozeEmail to bring it back now.",
  };
}

export async function unsnoozeEmail(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof unsnoozeEmailOutput>> {
  const target = mailbox.scope(id);
  const result = await unsnoozeMessage({
    adapter: mailbox.adapter,
    id,
    target,
  });
  if (!result.cancelled) {
    return { error: result.reason ?? "That snooze could not be cancelled" };
  }
  return { unsnoozed: true, mailboxId: mailbox.mailboxId, id };
}

export async function listSnoozed(
  mailbox: AgentMailbox,
): Promise<Output<typeof listSnoozedOutput>> {
  const emails = await listSnoozedEmails(mailbox);
  return {
    mailbox: mailbox.email,
    count: emails.length,
    emails: emails.map((e) => ({
      id: e.id,
      threadId: e.threadId,
      from: e.fromName || e.from,
      subject: e.subject,
      wakeAt: e.wakeAt,
      status: e.status,
      error: e.error,
    })),
  };
}

export async function scheduleEmail(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { payload: DraftPayload; scheduledFor: string; signature: boolean },
): Promise<Output<typeof scheduleEmailOutput>> {
  const mail = mailScopeFor(ctx, mailbox);
  const from = await sendingMailbox(mail);
  const scheduled = await scheduleOutgoing({
    mail,
    from,
    payload: args.payload,
    scheduledFor: args.scheduledFor,
    signature: args.signature ? "new" : null,
  });
  if ("error" in scheduled) return scheduled;
  return {
    scheduled: true,
    mailboxId: mailbox.mailboxId,
    scheduleId: scheduled.id,
    scheduledFor: scheduled.scheduledFor,
    note: "Nothing is sent now; the workflow runner sends it at that time.",
  };
}

export async function listScheduled(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
): Promise<Output<typeof listScheduledOutput>> {
  const items = await listScheduledMail([mailbox.mailboxId], ctx.userId);
  return {
    mailbox: mailbox.email,
    count: items.length,
    scheduled: items.map((item) => ({
      scheduleId: item.id,
      scheduledFor: item.scheduledFor.toISOString(),
      status: item.status,
      sent: item.sent,
      unconfirmed: item.unconfirmed,
      subject: item.subject,
      to: item.payload?.to ?? [],
      scheduledBy: item.scheduledByName,
      scheduledByYou: item.scheduledByMe,
      error: item.error,
    })),
  };
}

export async function cancelScheduled(
  mailbox: AgentMailbox,
  scheduleId: string,
): Promise<Output<typeof cancelScheduledOutput>> {
  const result = await cancelScheduledSend(scheduleId, [mailbox.mailboxId]);
  if (!result.cancelled) {
    return { error: result.reason ?? "That message could not be called back" };
  }
  return { cancelled: true, mailboxId: mailbox.mailboxId, scheduleId };
}

export async function retryScheduled(
  mailbox: AgentMailbox,
  scheduleId: string,
): Promise<Output<typeof retryScheduledOutput>> {
  const result = await retryScheduledSend(scheduleId, [mailbox.mailboxId]);
  if (!result) return { error: "That scheduled message is gone" };
  if (result.state === "refused") return { error: result.message };
  return {
    state: result.state,
    mailboxId: mailbox.mailboxId,
    scheduleId,
    message: result.message,
  };
}

export async function muteThread(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  threadId: string,
): Promise<Output<typeof muteOutput>> {
  await muteThreads(mailScopeFor(ctx, mailbox), [threadId]);
  return { muted: true, mailboxId: mailbox.mailboxId, threadId };
}

export async function unmuteThread(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  threadId: string,
): Promise<Output<typeof muteOutput>> {
  await unmuteThreads(mailScopeFor(ctx, mailbox), [threadId]);
  return { muted: false, mailboxId: mailbox.mailboxId, threadId };
}

export async function listMuted(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
): Promise<Output<typeof listMutedOutput>> {
  const threadIds = await listMutedThreads(mailScopeFor(ctx, mailbox));
  return { mailbox: mailbox.email, count: threadIds.length, threadIds };
}

export async function addReadLater(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof readLaterOutput>> {
  await addToReadLater(mailScopeFor(ctx, mailbox), id);
  return { readLater: true, mailboxId: mailbox.mailboxId, id };
}

export async function removeReadLater(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof readLaterOutput>> {
  await removeFromReadLater(mailScopeFor(ctx, mailbox), id);
  return { readLater: false, mailboxId: mailbox.mailboxId, id };
}

export async function listReadLater(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
): Promise<Output<typeof listReadLaterOutput>> {
  const ids = await listReadLaterIds(mailScopeFor(ctx, mailbox));
  return { mailbox: mailbox.email, count: ids.length, ids };
}

export async function listSubscriptions(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  scanLimit: number,
): Promise<Output<typeof listSubscriptionsOutput>> {
  const { senders, scanned } = await scanSubscriptions(mailScopeFor(ctx, mailbox), scanLimit);
  return {
    mailbox: mailbox.email,
    scanned,
    count: senders.length,
    senders: senders.map((s) => ({
      senderEmail: s.senderEmail,
      senderName: s.senderName,
      messageId: s.messageId,
      count: s.count,
      latestSubject: s.latestSubject,
      latestDate: s.latestDate,
      methods: s.methods,
      unsubscribed: s.unsubscribedStatus,
    })),
  };
}

export async function unsubscribe(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  items: { messageId: string; senderEmail: string }[],
): Promise<Output<typeof unsubscribeOutput>> {
  const results = await unsubscribeSenders(mailScopeFor(ctx, mailbox), items);
  return { mailboxId: mailbox.mailboxId, results };
}

export async function muteThreadOf(args: {
  userId: string;
  mailboxId: string;
  threadId: string;
}): Promise<void> {
  await db
    .insert(mailMute)
    .values({
      id: crypto.randomUUID(),
      userId: args.userId,
      mailboxId: args.mailboxId,
      threadId: args.threadId,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: [mailMute.userId, mailMute.mailboxId, mailMute.threadId] });
}
