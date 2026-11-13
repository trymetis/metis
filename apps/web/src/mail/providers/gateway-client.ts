import {
  attachmentsResponseSchema,
  emailsResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  idResponseSchema,
  idsResponseSchema,
  listResponseSchema,
  unsubscribeResponseSchema,
  type WireEmail,
  wireEmailSchema,
} from "@metis/gateway-contract/wire";
import { z } from "zod";

import type { GatewayConnectionCredentials, GatewayProvider } from "@/connections/types";
import { bind } from "@/lib/bind";
import { mergeHeaders } from "@/lib/headers";
import { freeText, pickText, topLevelValues, withoutTopLevel } from "@/search/pushdown";
import { type AstSearch, SEARCH_PAGE_SIZE } from "@/search/types";
import {
  type Attachment,
  type DraftPayload,
  type Email,
  isMailFolder,
  type MailFolder,
  type MessagesResponse,
  type UnsubscribeInfo,
} from "@/types/mail";

import type { MailAdapter } from "../adapter";
import { headersFromRaw, type MessageHeaders } from "../headers";

export function gatewayMail(target: GatewayTarget, from: string): MailAdapter {
  return bind<MailAdapter, GatewayTarget>(
    {
      listMessages,
      getMessage,
      sendMessage: (t, payload) => sendMessage(t, payload, from),
      deleteMessage,
      starMessage,
      markRead,
      batchMarkRead,
      search,
      searchAst,
      getRaw,
      getThread,
      listAllInFolder,
      batchDelete,
      archiveMessage,
      restoreMessage,
      createDraft: (t, payload) => createDraft(t, payload, from),
      updateDraft: (t, id, payload) => updateDraft(t, id, payload, from),
      deleteDraft,
      getUnsubscribeInfo,
      getHeaders,
      listAttachments,
      downloadAttachment,
    },
    target,
  );
}

const DEFAULT_PAGE_SIZE = 50;

export interface GatewayTarget {
  provider: GatewayProvider;
  endpoint: string;
  token: string;
  label: string;
}

export const GATEWAY_LABELS: Record<GatewayProvider, string> = {
  cloudflare: "Cloudflare Email Worker",
  resend: "Resend gateway",
  ses: "Amazon SES gateway",
};

export function gatewayTarget(credentials: GatewayConnectionCredentials): GatewayTarget {
  return {
    provider: credentials.provider,
    endpoint: credentials.endpoint,
    token: credentials.token,
    label: GATEWAY_LABELS[credentials.provider],
  };
}

function toEmail(target: GatewayTarget, wire: WireEmail): Email {
  return {
    id: wire.id,
    threadId: wire.threadId ?? wire.id,
    from: wire.from,
    fromName: wire.fromName,
    to: wire.to ?? [],
    cc: wire.cc,
    bcc: wire.bcc,
    subject: wire.subject ?? "",
    snippet: wire.snippet ?? "",
    bodyHtml: wire.bodyHtml,
    bodyText: wire.bodyText,
    date: wire.date,
    isRead: wire.isRead ?? false,
    isStarred: wire.isStarred ?? false,
    provider: target.provider,
    folder: wire.folder,
    messageIdHeader: wire.messageIdHeader,
    references: wire.references,
    attachments: wire.attachments,
  };
}

async function gatewayFetch(
  target: GatewayTarget,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${target.endpoint}/v1${path}`, {
    ...init,
    headers: mergeHeaders(
      {
        Authorization: `Bearer ${target.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      init?.headers,
    ),
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = errorResponseSchema.safeParse(await res.json());
      if (body.success) detail = body.data.error;
    } catch {}
    throw new GatewayResponseError(
      `${target.label} responded ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status === 401 || res.status === 403,
    );
  }

  return res;
}

class GatewayResponseError extends Error {
  readonly authenticationFailed: boolean;

  constructor(message: string, authenticationFailed: boolean) {
    super(message);
    this.authenticationFailed = authenticationFailed;
  }
}

async function gatewayJson<S extends z.ZodType>(
  schema: S,
  target: GatewayTarget,
  path: string,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const res = await gatewayFetch(target, path, init);
  return schema.parse(await res.json());
}

export async function gatewayHealth(target: GatewayTarget): Promise<{
  backend: string | null;
  domain: string | null;
  address: string | null;
}> {
  const body = await gatewayJson(healthResponseSchema.partial(), target, "/health");
  if (body.ok !== true) {
    throw new Error("That server did not identify itself as a Metis mailbox");
  }
  return {
    backend: body.backend ?? null,
    domain: body.domain ?? null,
    address: body.address ?? null,
  };
}

async function listMessages(
  target: GatewayTarget,
  folder: MailFolder,
  pageToken?: string,
  max?: number,
): Promise<MessagesResponse> {
  const params = new URLSearchParams({
    folder,
    limit: String(max ?? DEFAULT_PAGE_SIZE),
  });
  if (pageToken) params.set("cursor", pageToken);
  const body = await gatewayJson(listResponseSchema, target, `/messages?${params}`);
  return {
    emails: body.emails.map((wire) => toEmail(target, wire)),
    nextPageToken: body.nextCursor,
    total: body.total,
  };
}

async function getMessage(target: GatewayTarget, id: string): Promise<Partial<Email>> {
  const body = await gatewayJson(wireEmailSchema, target, `/messages/${encodeURIComponent(id)}`);
  return toEmail(target, body);
}

async function sendMessage(
  target: GatewayTarget,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string | null }> {
  const body = await gatewayJson(idResponseSchema.partial(), target, "/send", {
    method: "POST",
    body: JSON.stringify({ ...payload, from }),
  });
  return { id: body.id ?? null };
}

async function deleteMessage(target: GatewayTarget, id: string): Promise<null> {
  await gatewayFetch(target, `/messages/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return null;
}

async function starMessage(target: GatewayTarget, id: string, starred: boolean): Promise<void> {
  await gatewayFetch(target, `/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ starred }),
  });
}

async function markRead(target: GatewayTarget, id: string, read: boolean): Promise<void> {
  await gatewayFetch(target, `/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
}

async function batchMarkRead(target: GatewayTarget, ids: string[], read: boolean): Promise<void> {
  if (ids.length === 0) return;
  await gatewayFetch(target, "/messages/mark-read", {
    method: "POST",
    body: JSON.stringify({ ids, read }),
  });
}

async function search(target: GatewayTarget, query: string): Promise<MessagesResponse> {
  const body = await gatewayJson(
    emailsResponseSchema,
    target,
    `/search?q=${encodeURIComponent(query)}`,
  );
  return { emails: body.emails.map((wire) => toEmail(target, wire)) };
}

async function searchAst(
  target: GatewayTarget,
  request: AstSearch<Email>,
): Promise<MessagesResponse> {
  const picked = pickText(request.query, freeText);
  if (picked.text) {
    const found = await search(target, picked.text);
    return { emails: await request.accept(picked.residual, found.emails) };
  }
  const [value] = topLevelValues(request.query, "mail-folder");
  const lowered = value?.toLowerCase();
  const folder = isMailFolder(lowered) ? lowered : null;
  const rest = folder ? withoutTopLevel(request.query, "mail-folder") : request.query;
  const page = await listMessages(target, folder ?? "inbox", request.cursor, SEARCH_PAGE_SIZE);
  return {
    emails: await request.accept(typeof rest === "boolean" ? null : rest, page.emails),
    nextPageToken: page.nextPageToken,
  };
}

async function getRaw(target: GatewayTarget, id: string): Promise<string> {
  const res = await gatewayFetch(target, `/messages/${encodeURIComponent(id)}/raw`);
  return res.text();
}

async function getThread(target: GatewayTarget, threadId: string): Promise<Email[]> {
  const body = await gatewayJson(
    emailsResponseSchema,
    target,
    `/threads/${encodeURIComponent(threadId)}`,
  );
  return body.emails.map((wire) => toEmail(target, wire));
}

async function listAllInFolder(target: GatewayTarget, folder: MailFolder): Promise<string[]> {
  const body = await gatewayJson(idsResponseSchema, target, `/folders/${folder}/ids`);
  return body.ids;
}

async function batchDelete(target: GatewayTarget, ids: string[]): Promise<Map<string, string>> {
  if (ids.length > 0) {
    await gatewayFetch(target, "/messages/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  }
  return new Map();
}

async function archiveMessage(target: GatewayTarget, id: string): Promise<string> {
  await gatewayFetch(target, `/messages/${encodeURIComponent(id)}/archive`, {
    method: "POST",
  });
  return id;
}

async function restoreMessage(target: GatewayTarget, id: string): Promise<string> {
  await gatewayFetch(target, `/messages/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  return id;
}

async function createDraft(
  target: GatewayTarget,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string }> {
  const body = await gatewayJson(z.object({ id: z.string() }), target, "/drafts", {
    method: "POST",
    body: JSON.stringify({ ...payload, from }),
  });
  return { id: body.id };
}

async function updateDraft(
  target: GatewayTarget,
  draftId: string,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string }> {
  await gatewayFetch(target, `/drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    body: JSON.stringify({ ...payload, from }),
  });
  return { id: draftId };
}

async function deleteDraft(target: GatewayTarget, draftId: string): Promise<void> {
  await gatewayFetch(target, `/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE",
  });
}

async function getHeaders(
  target: GatewayTarget,
  id: string,
  names: string[],
): Promise<MessageHeaders> {
  return headersFromRaw(await getRaw(target, id), names);
}

async function getUnsubscribeInfo(
  target: GatewayTarget,
  id: string,
): Promise<UnsubscribeInfo | null> {
  const body = await gatewayJson(
    unsubscribeResponseSchema,
    target,
    `/messages/${encodeURIComponent(id)}/unsubscribe`,
  );
  return body.unsubscribe;
}

async function listAttachments(target: GatewayTarget, id: string): Promise<Attachment[]> {
  const body = await gatewayJson(
    attachmentsResponseSchema,
    target,
    `/messages/${encodeURIComponent(id)}/attachments`,
  );
  return body.attachments;
}

async function downloadAttachment(
  target: GatewayTarget,
  id: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  const res = await gatewayFetch(
    target,
    `/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  if (res.status === 204) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    mimeType: res.headers.get("content-type") ?? undefined,
  };
}
