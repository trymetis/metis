import "server-only";
import { convertMessages } from "@mastra/core/agent/message-list";
import { ORPCError } from "@orpc/server";

import {
  assistantThreadTitle,
  createAssistantThread,
  listAssistantThreads,
  ownsThread,
  workspaceMemory,
} from "@/mastra/memory";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  assistantThreadIdInputSchema,
  assistantThreadMessagesOutputSchema,
  createAssistantThreadInputSchema,
  createAssistantThreadOutputSchema,
  listAssistantThreadsOutputSchema,
  okOutputSchema,
  pinAssistantThreadInputSchema,
  renameAssistantThreadInputSchema,
  workspaceScopeSchema,
} from "../schema";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function requireOwnedThread(threadId: string, userId: string, workspaceId: string) {
  const thread = await workspaceMemory.getThreadById({ threadId });
  if (!thread || !ownsThread(thread, userId, workspaceId)) {
    throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
  }
  return thread;
}

export const assistantRouter = {
  listThreads: workspaceSession(workspaceScopeSchema)
    .output(listAssistantThreadsOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) return { threads: [] };

      const listed = await listAssistantThreads({
        userId: appUser.userId,
        workspaceId: appUser.workspaceId,
      });

      const threads = listed
        .map((t) => ({
          id: t.id,
          title: assistantThreadTitle(t),
          updatedAt: toIso(t.updatedAt),
          pinned: typeof t.metadata?.pinnedAt === "string",
        }))
        .toSorted(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
        );

      return { threads };
    }),

  createThread: workspaceSession(createAssistantThreadInputSchema)
    .output(createAssistantThreadOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) {
        throw new ORPCError("BAD_REQUEST", { message: "No active workspace" });
      }
      const thread = await createAssistantThread(
        { userId: appUser.userId, workspaceId: appUser.workspaceId },
        input.title,
      );
      return { id: thread.id, title: assistantThreadTitle(thread) };
    }),

  threadMessages: workspaceSession(assistantThreadIdInputSchema)
    .output(assistantThreadMessagesOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) return { messages: [] };
      await requireOwnedThread(input.threadId, appUser.userId, appUser.workspaceId);

      const recalled = await workspaceMemory.recall({
        threadId: input.threadId,
        resourceId: appUser.userId,
        perPage: false,
      });

      const messages = convertMessages(recalled.messages).to("AIV6.UI");
      return { messages };
    }),

  renameThread: workspaceSession(renameAssistantThreadInputSchema)
    .output(okOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) {
        throw new ORPCError("BAD_REQUEST", { message: "No active workspace" });
      }
      const thread = await requireOwnedThread(input.threadId, appUser.userId, appUser.workspaceId);
      await workspaceMemory.updateThread({
        id: input.threadId,
        title: input.title.trim().slice(0, 80),
        metadata: thread.metadata ?? {},
      });
      return { success: true as const };
    }),

  pinThread: workspaceSession(pinAssistantThreadInputSchema)
    .output(okOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) {
        throw new ORPCError("BAD_REQUEST", { message: "No active workspace" });
      }
      const thread = await requireOwnedThread(input.threadId, appUser.userId, appUser.workspaceId);
      await workspaceMemory.updateThread({
        id: input.threadId,
        title: thread.title ?? "",
        metadata: {
          ...thread.metadata,
          pinnedAt: input.pinned ? new Date().toISOString() : null,
        },
      });
      return { success: true as const };
    }),

  deleteThread: workspaceSession(assistantThreadIdInputSchema)
    .output(okOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (!appUser.workspaceId) {
        throw new ORPCError("BAD_REQUEST", { message: "No active workspace" });
      }
      await requireOwnedThread(input.threadId, appUser.userId, appUser.workspaceId);
      await workspaceMemory.deleteThread(input.threadId);
      return { success: true as const };
    }),
};
