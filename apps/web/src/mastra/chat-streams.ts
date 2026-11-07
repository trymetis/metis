import "server-only";
import { handleChatStream } from "@mastra/ai-sdk";
import type { UIMessage } from "ai";
import { inArray } from "drizzle-orm";

import { WORKSPACE_REFERENCE_TYPES } from "@/ai/references";
import { recordAiUsage } from "@/ai/usage";
import type { AiUsageFeature } from "@/ai/usage-features";
import type { CalendarSession } from "@/calendar/session";
import type { AddressBookSession } from "@/contacts/session";
import { db } from "@/db";
import { mailboxLabel } from "@/db/schema";
import type { DriveSession } from "@/drive/session";
import { type MailSession, mailboxIds } from "@/mail/session";
import { getLlm } from "@/services/llm";
import type { WorkspaceRole } from "@/types/workspace";

import {
  calendarAccountScope,
  contactsViewScope,
  driveViewScope,
  mailboxLabelDirectory,
} from "./chat-context";
import { mastra } from "./index";
import { referenceLegend } from "./reference-legend";
import {
  calendarRequestContext,
  contactsRequestContext,
  driveRequestContext,
  getWorkspaceCtx,
  mailboxRequestContext,
  workspaceCtxReferenceScope,
  workspaceRequestContext,
} from "./runtime-context";
import { mapStreamError } from "./stream-error";
import { applyTurnEnvelopes } from "./turn-envelope";

export type ChatStream = Awaited<ReturnType<typeof handleChatStream>>;

export interface ChatTurn {
  messages: UIMessage[];
  trigger?: "submit-message" | "regenerate-message";
}

export interface WorkspaceChatTurn extends ChatTurn {
  threadId: string;
  threadExists: boolean;
}

interface FinishedRun {
  totalUsage?: unknown;
  steps?: unknown[];
  finishReason?: unknown;
  runId?: string;
}

function recordChatUsage(scope: { userId: string; workspaceId: string }, feature: AiUsageFeature) {
  return ({ totalUsage, steps, finishReason, runId }: FinishedRun) => {
    recordAiUsage({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      feature,
      model: getLlm().chat.modelId,
      usage: totalUsage,
      steps: steps?.length,
      finishReason: typeof finishReason === "string" ? finishReason : undefined,
      runId,
    });
  };
}

export async function streamMailboxChat(
  session: MailSession,
  headers: Headers,
  turn: ChatTurn,
): Promise<ChatStream | null> {
  const requestContext = mailboxRequestContext(session, headers);
  if (!requestContext) return null;

  const customLabels = await db
    .selectDistinct({ key: mailboxLabel.key, name: mailboxLabel.name })
    .from(mailboxLabel)
    .where(inArray(mailboxLabel.mailboxId, mailboxIds(session)));

  return handleChatStream({
    mastra,
    agentId: "mailboxAgent",
    version: "v7",
    params: {
      messages: applyTurnEnvelopes(turn.messages),
      trigger: turn.trigger,
    },
    defaultOptions: {
      requestContext,
      context: [{ role: "system", content: mailboxLabelDirectory(customLabels) }],
      onFinish: recordChatUsage(session, "mailbox-chat"),
    },
    onError: mapStreamError,
  });
}

export async function streamCalendarChat(
  session: CalendarSession,
  headers: Headers,
  turn: ChatTurn,
): Promise<ChatStream | null> {
  const requestContext = calendarRequestContext(session, headers);
  if (!requestContext) return null;

  return handleChatStream({
    mastra,
    agentId: "calendarAgent",
    version: "v7",
    params: {
      messages: applyTurnEnvelopes(turn.messages),
      trigger: turn.trigger,
    },
    defaultOptions: {
      requestContext,
      context: [{ role: "system", content: calendarAccountScope(session) }],
      onFinish: recordChatUsage(session, "calendar-chat"),
    },
    onError: mapStreamError,
  });
}

export async function streamContactsChat(
  session: AddressBookSession,
  headers: Headers,
  turn: ChatTurn,
): Promise<ChatStream | null> {
  const requestContext = contactsRequestContext(session, headers);
  if (!requestContext) return null;

  return handleChatStream({
    mastra,
    agentId: "contactsAgent",
    version: "v7",
    params: {
      messages: applyTurnEnvelopes(turn.messages),
      trigger: turn.trigger,
    },
    defaultOptions: {
      requestContext,
      context: [{ role: "system", content: contactsViewScope(session) }],
      onFinish: recordChatUsage(session, "contacts-chat"),
    },
    onError: mapStreamError,
  });
}

export async function streamDriveChat(
  session: DriveSession,
  headers: Headers,
  turn: ChatTurn,
): Promise<ChatStream | null> {
  const requestContext = driveRequestContext(session, headers);
  if (!requestContext) return null;

  return handleChatStream({
    mastra,
    agentId: "driveAgent",
    version: "v7",
    params: {
      messages: applyTurnEnvelopes(turn.messages),
      trigger: turn.trigger,
    },
    defaultOptions: {
      requestContext,
      context: [{ role: "system", content: driveViewScope(session) }],
      onFinish: recordChatUsage(session, "drive-chat"),
    },
    onError: mapStreamError,
  });
}

export async function streamWorkspaceChat(
  session: {
    userId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRole;
  },
  headers: Headers,
  turn: WorkspaceChatTurn,
): Promise<ChatStream | null> {
  const requestContext = await workspaceRequestContext(session, headers);
  if (!requestContext) return null;

  const legend = await referenceLegend(
    workspaceCtxReferenceScope(getWorkspaceCtx(requestContext), WORKSPACE_REFERENCE_TYPES),
    turn.messages,
  );

  return handleChatStream({
    mastra,
    agentId: "workspaceAgent",
    version: "v7",
    params: {
      messages: applyTurnEnvelopes(turn.messages),
      trigger: turn.trigger,
    },
    defaultOptions: {
      requestContext,
      context: legend ? [{ role: "system", content: legend }] : undefined,
      memory: {
        thread: turn.threadExists
          ? turn.threadId
          : {
              id: turn.threadId,
              metadata: { workspaceId: session.workspaceId },
            },
        resource: session.userId,
      },
      onFinish: recordChatUsage(session, "workspace-chat"),
    },
    onError: mapStreamError,
  });
}
