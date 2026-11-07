import { setTimeout as sleep } from "node:timers/promises";

import {
  APPROVAL_CHAT,
  CALENDAR_CHAT,
  CONTACTS_CHAT,
  DRIVE_CHAT,
  MAIL_CHAT,
  REFERENCE_CHAT,
  VIEWER_TIME_ZONE,
  WORKSPACE_CHATS,
} from "@metis/e2e/lib/llm-scenarios";
import { isToolUIPart, readUIMessageStream, type UIMessage } from "ai";

import { suggestReferences, workspaceReferenceScope } from "../../../../src/ai/reference-directory";
import { serializeReference, WORKSPACE_REFERENCE_TYPES } from "../../../../src/ai/references";
import { TURN_PART_TYPE, toAgentEmail } from "../../../../src/ai/turn";
import { viewRange } from "../../../../src/calendar/layout";
import { getCalendarSession } from "../../../../src/calendar/session";
import { getAddressBookSession } from "../../../../src/contacts/session";
import { driveName } from "../../../../src/drive/name";
import { getDriveSession } from "../../../../src/drive/session";
import {
  type ChatStream,
  streamCalendarChat,
  streamContactsChat,
  streamDriveChat,
  streamMailboxChat,
  streamWorkspaceChat,
} from "../../../../src/mastra/chat-streams";
import { createAssistantThread, workspaceMemory } from "../../../../src/mastra/memory";
import type { RecordSession } from "../session";
import { removeApprovalFolder } from "./approval-folder";
import { findEmail, loadWorld, type StepContext } from "./context";

type Send = (messages: UIMessage[]) => Promise<ChatStream>;

const TITLE_TIMEOUT_MS = 30_000;
const TITLE_POLL_MS = 500;

function describeReply(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") return `text: ${part.text}`;
      if (isToolUIPart(part)) return `${part.type} (${part.state})`;
      return part.type;
    })
    .join(" | ");
}

function userMessage(text: string, turn: Record<string, unknown>): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      { type: "text", text },
      {
        type: TURN_PART_TYPE,
        data: {
          sentAt: new Date().toISOString(),
          timeZone: VIEWER_TIME_ZONE,
          ...turn,
        },
      },
    ],
  };
}

function required(stream: ChatStream | null, what: string): ChatStream {
  if (!stream) throw new Error(`AI is turned off for the ${what}`);
  return stream;
}

async function reply(name: string, stream: ChatStream, continuing?: UIMessage): Promise<UIMessage> {
  let last: UIMessage | undefined;
  let streamError: unknown;
  try {
    for await (const message of readUIMessageStream<UIMessage>({
      message: continuing,
      stream,
      terminateOnError: true,
      onError: (err) => {
        streamError ??= err;
      },
    })) {
      last = message;
    }
  } catch (err) {
    streamError ??= err;
  }
  if (streamError !== undefined) {
    throw new Error(
      `${name}: ${streamError instanceof Error ? streamError.message : JSON.stringify(streamError)}`,
    );
  }
  if (!last) throw new Error(`${name}: no reply`);
  return last;
}

async function converse(
  name: string,
  turns: readonly string[],
  turnData: (index: number) => Record<string, unknown>,
  send: Send,
): Promise<void> {
  const messages: UIMessage[] = [];
  for (const [index, text] of turns.entries()) {
    messages.push(userMessage(text, turnData(index)));
    messages.push(await reply(`${name} turn ${index + 1}`, await send(messages)));
    console.log(`[record] ${name} turn ${index + 1}/${turns.length}`);
  }
}

async function mailboxChat(ctx: StepContext): Promise<void> {
  const { mail, headers } = ctx.session;
  const attached = toAgentEmail(findEmail(await loadWorld(ctx), MAIL_CHAT.attachedSubject));
  await converse(
    "chat:mailbox",
    MAIL_CHAT.turns,
    (index) => ({
      kind: "mail",
      folder: MAIL_CHAT.folder,
      emails: index === 0 ? [attached] : [],
    }),
    async (messages) =>
      required(
        await streamMailboxChat(mail, headers, {
          messages,
          trigger: "submit-message",
        }),
        "mailbox",
      ),
  );
}

async function calendarChat(session: RecordSession): Promise<void> {
  const { headers, enrollment } = session;
  const calendar = await getCalendarSession(
    headers,
    enrollment.workspaceSlug,
    enrollment.calendarSlug,
  );
  if (!calendar) {
    throw new Error(`calendar ${enrollment.calendarSlug} not reachable`);
  }
  const range = viewRange(CALENDAR_CHAT.view, new Date(CALENDAR_CHAT.date));
  await converse(
    "chat:calendar",
    CALENDAR_CHAT.turns,
    () => ({
      kind: "calendar",
      view: CALENDAR_CHAT.view,
      visibleRange: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      events: [],
    }),
    async (messages) =>
      required(
        await streamCalendarChat(calendar, headers, {
          messages,
          trigger: "submit-message",
        }),
        "calendar",
      ),
  );
}

async function driveChat(session: RecordSession, kind: string): Promise<void> {
  const { headers, enrollment } = session;
  const driveSlug = enrollment.driveSlugs[kind];
  if (!driveSlug) throw new Error(`no ${kind} drive enrolled`);
  const drive = await getDriveSession(headers, enrollment.workspaceSlug, driveSlug);
  if (!drive) throw new Error(`drive ${kind} (${driveSlug}) not reachable`);
  const current = drive.drives.find((d) => d.driveSlug === driveSlug);
  const root = current ? driveName(current, drive.drives) : "Drive";
  await converse(
    `chat:drive:${kind}`,
    kind === DRIVE_CHAT.conversationDrive ? DRIVE_CHAT.turns : DRIVE_CHAT.turns.slice(0, 1),
    () => ({ kind: "drive", folderPath: [root], files: [] }),
    async (messages) =>
      required(
        await streamDriveChat(drive, headers, {
          messages,
          trigger: "submit-message",
        }),
        `${kind} drive`,
      ),
  );
}

async function contactsChat(session: RecordSession): Promise<void> {
  const { headers, enrollment } = session;
  const book = await getAddressBookSession(headers, enrollment.workspaceSlug, "all");
  if (!book) throw new Error("no address book enrolled");
  await converse(
    "chat:contacts",
    CONTACTS_CHAT.turns,
    () => ({ kind: "contacts", contacts: [] }),
    async (messages) =>
      required(
        await streamContactsChat(book, headers, {
          messages,
          trigger: "submit-message",
        }),
        "address book",
      ),
  );
}

async function referenceText(session: RecordSession): Promise<string> {
  const scope = await workspaceReferenceScope(session.appUser, WORKSPACE_REFERENCE_TYPES);
  const tokens = await Promise.all(
    REFERENCE_CHAT.picks.map(async (pick) => {
      const groups = await suggestReferences(scope, pick.query, 8);
      const found = groups
        .flatMap((group) => group.items)
        .find((item) => item.type === pick.type && item.label === pick.label);
      if (!found) throw new Error(`no ${pick.type} reference "${pick.label}" for "${pick.query}"`);
      return serializeReference(found);
    }),
  );
  return `${tokens.join(" ")} ${REFERENCE_CHAT.question}`;
}

async function waitForTitle(name: string, threadId: string): Promise<void> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const thread = await workspaceMemory.getThreadById({ threadId });
    if (thread?.title) return;
    await sleep(TITLE_POLL_MS);
  }
  console.log(`[record] ${name}: no thread title after ${TITLE_TIMEOUT_MS / 1000}s`);
}

async function workspaceSender(
  session: RecordSession,
  name: string,
  firstTurn: string,
): Promise<{ send: Send; titled: () => Promise<void> }> {
  const { appUser, headers } = session;
  const { id: threadId } = await createAssistantThread(appUser, firstTurn);
  const send: Send = async (messages) => {
    const existing = await workspaceMemory.getThreadById({ threadId });
    return required(
      await streamWorkspaceChat(
        {
          userId: appUser.userId,
          workspaceId: appUser.workspaceId,
          workspaceRole: appUser.workspaceRole,
        },
        headers,
        {
          messages,
          trigger: "submit-message",
          threadId,
          threadExists: Boolean(existing),
        },
      ),
      "workspace",
    );
  };
  return { send, titled: () => waitForTitle(name, threadId) };
}

async function workspaceChat(
  session: RecordSession,
  name: string,
  turns: readonly string[],
): Promise<void> {
  const chat = `chat:workspace:${name}`;
  const { send, titled } = await workspaceSender(session, chat, turns[0] ?? "");
  await converse(chat, turns, () => ({ kind: "workspace" }), send);
  await titled();
}

function approve(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      isToolUIPart(part) && part.state === "approval-requested"
        ? {
            ...part,
            state: "approval-responded",
            approval: {
              ...part.approval,
              id: part.approval.id,
              approved: true,
              reason: undefined,
            },
          }
        : part,
    ),
  };
}

async function approvalChat(session: RecordSession): Promise<void> {
  const messages: UIMessage[] = [userMessage(APPROVAL_CHAT.turn, { kind: "workspace" })];
  let failure: unknown;
  try {
    const { send, titled } = await workspaceSender(
      session,
      "chat:workspace:approval",
      APPROVAL_CHAT.turn,
    );
    const asked = await reply("chat:workspace:approval", await send(messages));
    if (!asked.parts.some((part) => isToolUIPart(part) && part.state === "approval-requested")) {
      throw new Error(
        `no tool call is waiting for approval; the reply was: ${describeReply(asked)}`,
      );
    }
    const approved = approve(asked);
    messages.push(approved);
    messages[messages.length - 1] = await reply(
      "chat:workspace:approval continued",
      await send(messages),
      approved,
    );
    console.log("[record] chat:workspace:approval approved and continued");
    await titled();
  } catch (err) {
    failure = err;
  }
  try {
    const removed = await removeApprovalFolder(session);
    console.log(`[record] removed ${removed} approval folder(s)`);
  } catch (err) {
    failure ??= err;
  }
  if (failure !== undefined) throw failure;
}

export async function run(ctx: StepContext): Promise<void> {
  const arg = ctx.scenario.arg ?? "";
  const [kind, name = ""] = arg.split(/:(.*)/s);
  if (kind === "mailbox") return mailboxChat(ctx);
  if (kind === "calendar") return calendarChat(ctx.session);
  if (kind === "drive") return driveChat(ctx.session, name);
  if (kind === "contacts") return contactsChat(ctx.session);
  if (kind === "workspace") {
    if (name === "approval") return approvalChat(ctx.session);
    if (name === "stored") {
      return workspaceChat(ctx.session, name, WORKSPACE_CHATS.stored);
    }
    if (name === "live") {
      return workspaceChat(ctx.session, name, WORKSPACE_CHATS.live);
    }
    if (name === "references") {
      return workspaceChat(ctx.session, name, [await referenceText(ctx.session)]);
    }
    const chip = WORKSPACE_CHATS.liveChips[Number(name.replace("chip-", "")) - 1];
    if (chip) return workspaceChat(ctx.session, name, chip);
  }
  throw new Error(`unknown chat ${arg}`);
}
