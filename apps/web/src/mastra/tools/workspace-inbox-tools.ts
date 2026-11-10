import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as inbox from "@/ops/inbox";

import { getWorkspaceCtx } from "../runtime-context";
import { requireMailbox, withToolErrors } from "../toolkit/resolve";
import {
  mailboxTarget,
  messageTarget,
  scheduleFields,
  scheduleTarget,
  snoozeFields,
  subscriptionScanFields,
  threadTarget,
  unsubscribeFields,
} from "../toolkit/schema";

const snoozeEmailTool = createTool({
  id: "snoozeEmail",
  description:
    "Snooze an email in a specific mailbox: it is archived now and comes back to the inbox at wakeAt. Snoozing an already snoozed email moves its wake-up time.",
  inputSchema: z.object(snoozeFields),
  execute: async ({ mailboxId, id, wakeAt }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.snoozeEmail(ctx, r.mailbox, { id, wakeAt });
    }),
});

const cancelSnoozeTool = createTool({
  id: "cancelSnooze",
  description:
    "Cancel an email's snooze without bringing it back — it stays archived. Use unsnoozeEmail to bring it back to the inbox now.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.cancelSnooze(r.mailbox, id);
    }),
});

const unsnoozeEmailTool = createTool({
  id: "unsnoozeEmail",
  description: "Bring a snoozed email back to the inbox now and cancel its wake-up.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unsnoozeEmail(r.mailbox, id);
    }),
});

const listSnoozedTool = createTool({
  id: "listSnoozed",
  description: "List the snoozed emails in a specific mailbox with when each comes back.",
  inputSchema: z.object(mailboxTarget),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listSnoozed(r.mailbox);
    }),
});

const scheduleEmailTool = createTool({
  id: "scheduleEmail",
  description:
    "Schedule a new email to send from a specific mailbox at scheduledFor. Nothing is sent now; it goes out at that time unless cancelled.",
  inputSchema: z.object({
    ...scheduleFields,
    summary: z
      .string()
      .describe("Short description of the mail that will go out, to whom, and when"),
  }),
  requireApproval: true,
  execute: async (
    { mailboxId, to, cc, bcc, subject, bodyHtml, scheduledFor, signature },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.scheduleEmail(ctx, r.mailbox, {
        payload: { to, cc, bcc, subject, bodyHtml },
        scheduledFor,
        signature: signature ?? true,
      });
    }),
});

const listScheduledTool = createTool({
  id: "listScheduled",
  description:
    "List the scheduled emails in a specific mailbox — when each goes out, its status, subject and recipients.",
  inputSchema: z.object(mailboxTarget),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listScheduled(ctx, r.mailbox);
    }),
});

const cancelScheduledTool = createTool({
  id: "cancelScheduled",
  description:
    "Call back a scheduled email before it goes out. A send already in progress cannot be called back.",
  inputSchema: z.object({
    ...scheduleTarget,
    summary: z.string().describe("Short description of the scheduled mail being called back"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, scheduleId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.cancelScheduled(r.mailbox, scheduleId);
    }),
});

const retryScheduledTool = createTool({
  id: "retryScheduled",
  description:
    "Retry a scheduled email whose send failed. A send that went out is never repeated, and one with an unconfirmed outcome is refused until a person resolves it in the app. Relay the returned message as is.",
  inputSchema: z.object({
    ...scheduleTarget,
    summary: z.string().describe("Short description of the scheduled mail being retried"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, scheduleId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.retryScheduled(r.mailbox, scheduleId);
    }),
});

const muteThreadTool = createTool({
  id: "muteThread",
  description:
    "Mute a conversation in a specific mailbox for you: new replies stay out of your inbox. It does not affect anyone else.",
  inputSchema: z.object(threadTarget),
  execute: async ({ mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.muteThread(ctx, r.mailbox, threadId);
    }),
});

const unmuteThreadTool = createTool({
  id: "unmuteThread",
  description: "Unmute a conversation you muted in a specific mailbox.",
  inputSchema: z.object(threadTarget),
  execute: async ({ mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unmuteThread(ctx, r.mailbox, threadId);
    }),
});

const listMutedTool = createTool({
  id: "listMuted",
  description: "List the threadIds of the conversations you muted in a specific mailbox.",
  inputSchema: z.object(mailboxTarget),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listMuted(ctx, r.mailbox);
    }),
});

const addReadLaterTool = createTool({
  id: "addReadLater",
  description: "Keep an email in a specific mailbox on your personal read-later list.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.addReadLater(ctx, r.mailbox, id);
    }),
});

const removeReadLaterTool = createTool({
  id: "removeReadLater",
  description: "Take an email off your read-later list in a specific mailbox.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.removeReadLater(ctx, r.mailbox, id);
    }),
});

const listReadLaterTool = createTool({
  id: "listReadLater",
  description:
    "List the email ids on your read-later list in a specific mailbox, newest first. Fetch each with getEmail.",
  inputSchema: z.object(mailboxTarget),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listReadLater(ctx, r.mailbox);
    }),
});

const listSubscriptionsTool = createTool({
  id: "listSubscriptions",
  description:
    "Scan the recent inbox of a specific mailbox for newsletters and mailing lists that offer an unsubscribe, grouped by sender with how often each one writes.",
  inputSchema: z.object(subscriptionScanFields),
  execute: async ({ mailboxId, scanLimit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listSubscriptions(ctx, r.mailbox, scanLimit);
    }),
});

const unsubscribeTool = createTool({
  id: "unsubscribe",
  description:
    "Unsubscribe from senders found by listSubscriptions. It uses the sender's one-click unsubscribe or sends their unsubscribe email from this mailbox; a sender that only offers a web page comes back as 'manual' with the link for the user.",
  inputSchema: z.object({
    ...unsubscribeFields,
    summary: z.string().describe("Short description of which senders will be unsubscribed"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, items }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unsubscribe(ctx, r.mailbox, items);
    }),
});

export const workspaceInboxTools = {
  snoozeEmail: snoozeEmailTool,
  cancelSnooze: cancelSnoozeTool,
  unsnoozeEmail: unsnoozeEmailTool,
  listSnoozed: listSnoozedTool,
  scheduleEmail: scheduleEmailTool,
  listScheduled: listScheduledTool,
  cancelScheduled: cancelScheduledTool,
  retryScheduled: retryScheduledTool,
  muteThread: muteThreadTool,
  unmuteThread: unmuteThreadTool,
  listMuted: listMutedTool,
  addReadLater: addReadLaterTool,
  removeReadLater: removeReadLaterTool,
  listReadLater: listReadLaterTool,
  listSubscriptions: listSubscriptionsTool,
  unsubscribe: unsubscribeTool,
};
