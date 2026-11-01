"use client";

import { skipToken, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { rpc } from "@/lib/orpc";
import { textToHtml } from "@/mail/text";
import { useMailStore } from "@/store/mail-store";
import type { Attachment, Email, UnsubscribeMethod, UnsubscribeStatus } from "@/types/mail";

import { useMailboxScope } from "./use-workspace-path";

export interface ThreadMessage {
  id: string;
  fromName?: string;
  from: string;
  date: string;
  snippet: string;
}

export type MessageBody =
  | { kind: "html"; html: string }
  | { kind: "text"; text: string }
  | { kind: "empty" }
  | { kind: "error" };

export interface ThreadBody {
  loading: boolean;
  body: MessageBody | null;
  attachments: Attachment[];
}

export interface SmartReply {
  label: string;
  body: string;
}

const NO_METHODS: UnsubscribeMethod[] = [];
const NO_ATTACHMENTS: Attachment[] = [];
const NO_MESSAGES: ThreadMessage[] = [];
const NO_REPLIES: SmartReply[] = [];

function bodyFrom(data: { bodyHtml?: string; bodyText?: string }): MessageBody {
  if (data.bodyHtml) return { kind: "html", html: data.bodyHtml };
  if (data.bodyText) return { kind: "text", text: data.bodyText };
  return { kind: "empty" };
}

export function bodyAsHtml(body: MessageBody | null): string {
  if (body?.kind === "html") return body.html;
  if (body?.kind === "text") return textToHtml(body.text);
  return "";
}

export function usePhishingAnalysis(emailId: string | undefined, enabled = true) {
  const scope = useMailboxScope();
  const query = useQuery(
    rpc.ai.analyzePhishing.queryOptions({
      input: emailId && enabled ? { ...scope, id: emailId } : skipToken,
    }),
  );
  return {
    result: query.data ?? null,
    loading: query.isFetching,
    error: query.error ? query.error.message || "Analysis failed" : null,
  };
}

export function useUnsubscribeInfo(email: Email | null) {
  const scope = useMailboxScope();
  const wanted = email && email.folder !== "drafts" && email.folder !== "sent" ? email : null;
  const query = useQuery(
    rpc.mail.subscriptions.infoForMessage.queryOptions({
      input: wanted ? { ...scope, id: wanted.id, senderEmail: wanted.from } : skipToken,
    }),
  );
  const emailId = email?.id ?? null;
  const [override, setOverride] = useState<{
    emailId: string | null;
    status: UnsubscribeStatus | null;
  } | null>(null);
  const status =
    override?.emailId === emailId
      ? override.status
      : wanted
        ? (query.data?.unsubscribedStatus ?? null)
        : null;
  const setStatus = useCallback(
    (next: UnsubscribeStatus | null) => setOverride({ emailId, status: next }),
    [emailId],
  );

  return { methods: wanted ? (query.data?.methods ?? NO_METHODS) : NO_METHODS, status, setStatus };
}

export function useAttachments(emailId: string | undefined): Attachment[] {
  const scope = useMailboxScope();
  const query = useQuery(
    rpc.mail.attachments.list.queryOptions({
      input: emailId ? { ...scope, id: emailId } : skipToken,
    }),
  );
  return (emailId && query.data?.attachments) || NO_ATTACHMENTS;
}

export function useThread(emailId: string | undefined, threadId: string | undefined) {
  const scope = useMailboxScope();
  const open = Boolean(threadId && emailId);
  const query = useQuery(
    rpc.mail.thread.get.queryOptions({
      input: threadId && emailId ? { ...scope, threadId } : skipToken,
    }),
  );
  const data = open ? query.data : undefined;
  const messages: ThreadMessage[] = data?.messages ?? NO_MESSAGES;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedFor, setExpandedFor] = useState<{
    data: typeof data;
    emailId: string | undefined;
  } | null>(null);
  if (!expandedFor || expandedFor.data !== data || expandedFor.emailId !== emailId) {
    setExpandedFor({ data, emailId });
    const latestId = data ? (data.messages?.at(-1)?.id ?? emailId) : undefined;
    setExpanded(new Set(latestId ? [latestId] : []));
  }

  return { messages, expanded, setExpanded };
}

export function useThreadBodies(
  emailId: string | undefined,
  expanded: Set<string>,
): Record<string, ThreadBody> {
  const scope = useMailboxScope();
  const ids = Array.from(expanded).filter((id) => id !== emailId);
  const messages = useQueries({
    queries: ids.map((id) => rpc.mail.messages.get.queryOptions({ input: { ...scope, id } })),
  });
  const attachments = useQueries({
    queries: ids.map((id) => rpc.mail.attachments.list.queryOptions({ input: { ...scope, id } })),
  });

  return Object.fromEntries(
    ids.map((id, index) => {
      const message = messages[index];
      const files = attachments[index]?.data?.attachments ?? NO_ATTACHMENTS;
      const body: MessageBody | null = message?.data
        ? bodyFrom(message.data)
        : message?.isError
          ? { kind: "error" }
          : null;
      return [id, { loading: body === null, body, attachments: body ? files : NO_ATTACHMENTS }];
    }),
  );
}

export function useEmailBody(email: Email | null) {
  const scope = useMailboxScope();
  const setFetchingBody = useMailStore((s) => s.setFetchingBody);
  const updateEmail = useMailStore((s) => s.updateEmail);
  const cached = email?.bodyHtml || email?.bodyText ? email : null;
  const query = useQuery(
    rpc.mail.messages.get.queryOptions({
      input: email && !cached ? { ...scope, id: email.id, folder: email.folder } : skipToken,
    }),
  );
  const fetched = email && !cached ? query.data : undefined;
  const hasEmail = Boolean(email);
  const cachedHtml = cached?.bodyHtml;
  const cachedText = cached?.bodyText;
  const failed = query.isError;
  const body = useMemo<MessageBody | null>(() => {
    if (!hasEmail) return null;
    if (cachedHtml || cachedText) return bodyFrom({ bodyHtml: cachedHtml, bodyText: cachedText });
    if (fetched) return bodyFrom(fetched);
    return failed ? { kind: "error" } : null;
  }, [hasEmail, cachedHtml, cachedText, fetched, failed]);

  const fetching = query.isFetching;
  useEffect(() => {
    if (!fetching) return;
    setFetchingBody(true);
    return () => setFetchingBody(false);
  }, [fetching, setFetchingBody]);

  const emailId = email?.id;
  useEffect(() => {
    if (!emailId || !fetched) return;
    const next = bodyFrom(fetched);
    if (next.kind === "html") updateEmail(emailId, { bodyHtml: next.html });
    if (next.kind === "text") updateEmail(emailId, { bodyText: next.text });
  }, [emailId, fetched, updateEmail]);

  return { body, bodyHtml: bodyAsHtml(body) };
}

export function useSmartReplies(email: Email | null) {
  const scope = useMailboxScope();
  const query = useQuery(
    rpc.ai.smartReplies.queryOptions({
      input:
        email?.folder === "inbox"
          ? {
              ...scope,
              id: email.id,
              sender: email.fromName || email.from,
              subject: email.subject,
              snippet: email.snippet,
            }
          : skipToken,
    }),
  );
  const inbox = email?.folder === "inbox";
  return {
    replies: (inbox && query.data?.replies) || NO_REPLIES,
    loading: inbox && query.isFetching,
  };
}

export function useThreadSummary(email: Email | null, enabled = true) {
  const scope = useMailboxScope();
  const id = email?.id;
  const threadId = email?.threadId;
  const folder = email?.folder;
  const wanted = Boolean(id && enabled && folder !== "drafts");
  const query = useQuery(
    rpc.ai.threadSummary.queryOptions({
      input: id && wanted ? { ...scope, messageId: id, threadId } : skipToken,
    }),
  );

  return {
    result: wanted ? (query.data ?? null) : null,
    loading: query.isFetching,
    error: wanted && query.error ? query.error.message || "Summary failed" : null,
  };
}
