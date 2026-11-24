import { createUIMessageStreamResponse } from "ai";
import { headers as nextHeaders } from "next/headers";

import { parseUIMessages } from "@/ai/messages";
import { getMailSession } from "@/mail/session";
import { streamMailboxChat } from "@/mastra/chat-streams";
import { mailboxChatInputSchema } from "@/server/schema";
import { aiEnabled } from "@/services/llm";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";

export async function POST(request: Request) {
  if (!aiEnabled()) return new Response(null, { status: 404 });

  const h = await nextHeaders();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mailboxChatInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const body = parsed.data;
  const messages = await parseUIMessages(body.messages);
  if (!messages) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const session = await getMailSession(h, body.workspaceSlug, body.mailboxSlug);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const rl = await rateLimit(session.userId, {
    scope: "ai-chat",
    limit: 20,
    windowSec: 60,
  });
  if (!rl.ok) return tooManyRequests(rl);

  const stream = await streamMailboxChat(session, h, {
    messages,
    trigger: body.trigger,
  });
  if (!stream) {
    return Response.json({ error: "AI is turned off for this mailbox" }, { status: 403 });
  }

  return createUIMessageStreamResponse({ stream });
}
