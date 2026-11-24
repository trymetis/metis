import { createUIMessageStreamResponse } from "ai";

import { parseUIMessages } from "@/ai/messages";
import { getAppUser } from "@/auth/session";
import { streamWorkspaceChat } from "@/mastra/chat-streams";
import { ownsThread, workspaceMemory } from "@/mastra/memory";
import { workspaceChatInputSchema } from "@/server/schema";
import { aiEnabled } from "@/services/llm";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";

export async function POST(request: Request) {
  if (!aiEnabled()) return new Response(null, { status: 404 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = workspaceChatInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const body = parsed.data;
  const messages = await parseUIMessages(body.messages);
  if (!messages) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const session = await getAppUser(request.headers, body.workspaceSlug);
  if (!session?.workspaceId || !session.workspaceRole) {
    return new Response("Unauthorized", { status: 401 });
  }

  const threadId = body.threadId ?? `ws-${session.workspaceId}-${session.userId}`;
  const existingThread = await workspaceMemory.getThreadById({ threadId });
  if (existingThread && !ownsThread(existingThread, session.userId, session.workspaceId)) {
    return new Response("Not found", { status: 404 });
  }

  const rl = await rateLimit(session.userId, {
    scope: "ai-workspace-chat",
    limit: 20,
    windowSec: 60,
  });
  if (!rl.ok) return tooManyRequests(rl);

  const stream = await streamWorkspaceChat(
    {
      userId: session.userId,
      workspaceId: session.workspaceId,
      workspaceRole: session.workspaceRole,
    },
    request.headers,
    {
      messages,
      trigger: body.trigger,
      threadId,
      threadExists: Boolean(existingThread),
    },
  );
  if (!stream) {
    return Response.json({ error: "AI is turned off for this workspace" }, { status: 403 });
  }

  return createUIMessageStreamResponse({ stream });
}
