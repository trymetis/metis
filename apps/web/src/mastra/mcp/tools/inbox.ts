import "server-only";
import { createTool } from "@mastra/core/tools";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  mailboxTarget,
  messageTarget,
  scheduleFields,
  scheduleTarget,
  snoozeFields,
  subscriptionScanFields,
  threadTarget,
  unsubscribeFields,
} from "@/mastra/toolkit/schema";
import * as inbox from "@/ops/inbox";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const snoozeEmail = createTool({
  id: "snoozeEmail",
  description:
    "Snooze an email in a specific mailbox: it is archived now and comes back to the inbox at wakeAt. Snoozing an already snoozed email moves its wake-up time.",
  inputSchema: inWorkspace(snoozeFields),
  execute: async ({ workspaceId, mailboxId, id, wakeAt }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.snoozeEmail(ctx, r.mailbox, { id, wakeAt });
    }),
});

export const cancelSnooze = createTool({
  id: "cancelSnooze",
  description:
    "Cancel an email's snooze without bringing it back — it stays archived. Use unsnoozeEmail to bring it back to the inbox now.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.cancelSnooze(r.mailbox, id);
    }),
});

export const unsnoozeEmail = createTool({
  id: "unsnoozeEmail",
  description: "Bring a snoozed email back to the inbox now and cancel its wake-up.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unsnoozeEmail(r.mailbox, id);
    }),
});

export const listSnoozed = createTool({
  id: "listSnoozed",
  description: "List the snoozed emails in a specific mailbox with when each comes back.",
  inputSchema: inWorkspace(mailboxTarget),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listSnoozed(r.mailbox);
    }),
});

export const scheduleEmail = createTool({
  id: "scheduleEmail",
  description:
    "Schedule a new email to send from a specific mailbox at scheduledFor. Nothing is sent now; it goes out at that time unless cancelled.",
  inputSchema: inWorkspace(scheduleFields),
  execute: async (
    { workspaceId, mailboxId, to, cc, bcc, subject, bodyHtml, scheduledFor, signature },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.scheduleEmail(ctx, r.mailbox, {
        payload: { to, cc, bcc, subject, bodyHtml },
        scheduledFor,
        signature: signature ?? true,
      });
    }),
});

export const listScheduled = createTool({
  id: "listScheduled",
  description:
    "List the scheduled emails in a specific mailbox — when each goes out, its status, subject and recipients.",
  inputSchema: inWorkspace(mailboxTarget),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listScheduled(ctx, r.mailbox);
    }),
});

export const cancelScheduled = createTool({
  id: "cancelScheduled",
  description:
    "Call back a scheduled email before it goes out. A send already in progress cannot be called back.",
  inputSchema: inWorkspace(scheduleTarget),
  execute: async ({ workspaceId, mailboxId, scheduleId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.cancelScheduled(r.mailbox, scheduleId);
    }),
});

export const retryScheduled = createTool({
  id: "retryScheduled",
  description:
    "Retry a scheduled email whose send failed. A send that went out is never repeated, and one with an unconfirmed outcome is refused until a person resolves it in the app. Relay the returned message as is.",
  inputSchema: inWorkspace(scheduleTarget),
  execute: async ({ workspaceId, mailboxId, scheduleId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.retryScheduled(r.mailbox, scheduleId);
    }),
});

export const muteThread = createTool({
  id: "muteThread",
  description:
    "Mute a conversation in a specific mailbox for you: new replies stay out of your inbox. It does not affect anyone else.",
  inputSchema: inWorkspace(threadTarget),
  execute: async ({ workspaceId, mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.muteThread(ctx, r.mailbox, threadId);
    }),
});

export const unmuteThread = createTool({
  id: "unmuteThread",
  description: "Unmute a conversation you muted in a specific mailbox.",
  inputSchema: inWorkspace(threadTarget),
  execute: async ({ workspaceId, mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unmuteThread(ctx, r.mailbox, threadId);
    }),
});

export const listMuted = createTool({
  id: "listMuted",
  description: "List the threadIds of the conversations you muted in a specific mailbox.",
  inputSchema: inWorkspace(mailboxTarget),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listMuted(ctx, r.mailbox);
    }),
});

export const addReadLater = createTool({
  id: "addReadLater",
  description: "Keep an email in a specific mailbox on your personal read-later list.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.addReadLater(ctx, r.mailbox, id);
    }),
});

export const removeReadLater = createTool({
  id: "removeReadLater",
  description: "Take an email off your read-later list in a specific mailbox.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.removeReadLater(ctx, r.mailbox, id);
    }),
});

export const listReadLater = createTool({
  id: "listReadLater",
  description:
    "List the email ids on your read-later list in a specific mailbox, newest first. Fetch each with getEmail.",
  inputSchema: inWorkspace(mailboxTarget),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listReadLater(ctx, r.mailbox);
    }),
});

export const listSubscriptions = createTool({
  id: "listSubscriptions",
  description:
    "Scan the recent inbox of a specific mailbox for newsletters and mailing lists that offer an unsubscribe, grouped by sender with how often each one writes.",
  inputSchema: inWorkspace(subscriptionScanFields),
  execute: async ({ workspaceId, mailboxId, scanLimit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.listSubscriptions(ctx, r.mailbox, scanLimit);
    }),
});

export const unsubscribe = createTool({
  id: "unsubscribe",
  description:
    "Unsubscribe from senders found by listSubscriptions. It uses the sender's one-click unsubscribe or sends their unsubscribe email from this mailbox; a sender that only offers a web page comes back as 'manual' with the link for the user.",
  inputSchema: inWorkspace(unsubscribeFields),
  execute: async ({ workspaceId, mailboxId, items }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return inbox.unsubscribe(ctx, r.mailbox, items);
    }),
});
