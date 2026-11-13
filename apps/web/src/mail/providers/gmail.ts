import { auth, gmail as gmailApi } from "@googleapis/gmail";
import { decodeHTML } from "entities";

import { bind } from "@/lib/bind";
import { errorStatus } from "@/lib/token-map";
import { isPlainTerm, type TagToken, tagKey, tagText } from "@/search/ast";
import { parseSearchDate } from "@/search/dates";
import { compileWith, type Dialect, planPushdown } from "@/search/pushdown";
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

import type { MailAdapter, MailChanges } from "../adapter";
import { type MessageHeaders, pickHeaders } from "../headers";
import { decodeMimeHeader, parseRecipientList } from "../recipients";

export function gmailMail(accessToken: string): MailAdapter {
  return bind<MailAdapter, string>(
    {
      listMessages,
      getMessage,
      sendMessage,
      deleteMessage,
      starMessage,
      markRead,
      batchMarkRead: async (token, ids, read) => {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one request at a time stays inside Gmail's per-user rate limit for large selections
        for (const id of ids) await markRead(token, id, read);
      },
      search,
      searchAst,
      getRaw,
      getThread,
      listAllInFolder,
      batchDelete,
      archiveMessage,
      restoreMessage,
      createDraft,
      updateDraft,
      deleteDraft,
      getUnsubscribeInfo,
      getHeaders,
      listAttachments,
      downloadAttachment,
      changes,
    },
    accessToken,
  );
}

function getGmailClient(accessToken: string) {
  const client = new auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return gmailApi({ version: "v1", auth: client });
}

const LABEL_MAP: Record<MailFolder, string> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  starred: "STARRED",
  trash: "TRASH",
  archive: "",
  spam: "SPAM",
};

const HISTORY_PAGES = 20;

async function changes(
  accessToken: string,
  folder: MailFolder,
  cursor: string | null,
): Promise<MailChanges | null> {
  const label = LABEL_MAP[folder];
  if (!label) return null;
  const gmail = getGmailClient(accessToken);
  if (!cursor) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    return { cursor: profile.data.historyId ?? "", ids: [] };
  }
  const ids = new Set<string>();
  let latest = cursor;
  let pageToken: string | undefined;
  try {
    for (let page = 0; page < HISTORY_PAGES; page += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each history page needs the previous page's token
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId: cursor,
        historyTypes: ["messageAdded", "labelAdded"],
        labelId: label,
        maxResults: 500,
        pageToken,
      });
      for (const entry of res.data.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          const id = added.message?.id;
          if (id && (added.message?.labelIds ?? []).includes(label)) ids.add(id);
        }
        for (const added of entry.labelsAdded ?? []) {
          const id = added.message?.id;
          if (id && (added.labelIds ?? []).includes(label)) ids.add(id);
        }
      }
      latest = res.data.historyId ?? latest;
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  } catch (err) {
    if (errorStatus(err) === 404) return { cursor: "", ids: [], expired: true };
    throw err;
  }
  return { cursor: latest, ids: [...ids] };
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function folderFromLabels(labels: string[]): MailFolder {
  if (labels.includes("TRASH")) return "trash";
  if (labels.includes("SPAM")) return "spam";
  if (labels.includes("DRAFT")) return "drafts";
  if (labels.includes("INBOX")) return "inbox";
  if (labels.includes("SENT")) return "sent";
  return "archive";
}

async function listMessages(
  accessToken: string,
  folder: MailFolder,
  pageToken?: string,
  maxResults = 50,
): Promise<MessagesResponse> {
  const params: Record<string, unknown> = {
    userId: "me",
    maxResults,
  };
  if (folder === "archive") {
    params.q = "-in:inbox -in:trash -in:spam -in:drafts";
  } else {
    params.labelIds = [LABEL_MAP[folder]];
  }
  if (pageToken) params.pageToken = pageToken;
  return listPage(accessToken, params, folder);
}

function gmailValue(text: string): string {
  return /[\s"(){}]/.test(text) ? `"${text.replaceAll('"', "")}"` : text;
}

const GMAIL_FOLDER_QUERY: Record<MailFolder, string> = {
  inbox: "in:inbox",
  sent: "in:sent",
  drafts: "in:drafts",
  starred: "is:starred",
  trash: "in:trash",
  spam: "in:spam",
  archive: "in:archive",
};

const GMAIL_TEXT_KEYS = new Set(["from", "to", "cc", "subject", "filename"]);

function seconds(ms: number): number {
  return Math.floor(ms / 1000);
}

function gmailDialect(timeZone: string): Dialect<string> {
  return {
    leaf(tag: TagToken) {
      const key = tagKey(tag);
      const text = tagText(tag) ?? "";
      if (key === "after" || key === "before" || key === "on") {
        const span = parseSearchDate(text, timeZone);
        if (!span) return null;
        const native =
          key === "after"
            ? `after:${seconds(span.start) - 1}`
            : key === "before"
              ? `before:${seconds(span.start)}`
              : `after:${seconds(span.start) - 1} before:${seconds(Math.max(span.end, span.start + 86_400_000))}`;
        return { native, exact: false };
      }
      if (!isPlainTerm(tag)) return null;
      if (key === null) return { native: gmailValue(text), exact: true };
      if (GMAIL_TEXT_KEYS.has(key)) {
        return { native: `${key}:${gmailValue(text)}`, exact: true };
      }
      const value = text.toLowerCase();
      if (key === "has" && value === "attachment") {
        return { native: "has:attachment", exact: true };
      }
      if (key === "is" && ["unread", "read", "starred"].includes(value)) {
        return { native: `is:${value}`, exact: true };
      }
      if (key === "mail-folder" && isMailFolder(value)) {
        return {
          native: GMAIL_FOLDER_QUERY[value],
          exact: true,
        };
      }
      return null;
    },
    and: (parts) => parts.join(" "),
    or: (parts) => `(${parts.join(" OR ")})`,
    not: (part) => (/\s/.test(part) ? `-(${part})` : `-${part}`),
  };
}

async function searchAst(
  accessToken: string,
  astSearch: AstSearch<Email>,
): Promise<MessagesResponse> {
  const plan = planPushdown(astSearch.query, compileWith(gmailDialect(astSearch.timeZone)));
  const params: Record<string, unknown> = {
    userId: "me",
    maxResults: SEARCH_PAGE_SIZE,
  };
  if (plan.native.length > 0) params.q = plan.native.join(" ");
  if (astSearch.cursor) params.pageToken = astSearch.cursor;
  const page = await listPage(accessToken, params, null);
  return {
    emails: await astSearch.accept(plan.residual, page.emails),
    nextPageToken: page.nextPageToken,
  };
}

async function listPage(
  accessToken: string,
  params: Record<string, unknown>,
  folder: MailFolder | null,
): Promise<MessagesResponse> {
  const gmail = getGmailClient(accessToken);
  const listRes = await gmail.users.messages.list(params);
  const messages = listRes.data.messages ?? [];

  if (messages.length === 0) {
    return {
      emails: [],
      nextPageToken: listRes.data.nextPageToken ?? undefined,
    };
  }

  const detailed = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        // oxlint-disable-next-line typescript/no-non-null-assertion --googleapis types Message.id as nullable for request bodies, but messages.list responses always populate it.
        id: m.id!,
        format: "metadata",
        metadataHeaders: [
          "From",
          "To",
          "Cc",
          "Reply-To",
          "Subject",
          "Date",
          "Message-ID",
          "References",
        ],
      }),
    ),
  );

  const emails: Email[] = detailed.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers ?? [];
    const fromEntry = parseRecipientList(getHeader(headers, "From"))[0];
    const toEntries = parseRecipientList(getHeader(headers, "To"));
    const ccEntries = parseRecipientList(getHeader(headers, "Cc"));
    return {
      messageIdHeader: getHeader(headers, "Message-ID") || undefined,
      references: getHeader(headers, "References") || undefined,
      replyTo: parseRecipientList(getHeader(headers, "Reply-To")),
      // oxlint-disable-next-line typescript/no-non-null-assertion --googleapis types Message.id as nullable for request bodies, but messages.get / threads.get responses always populate it.
      id: msg.id!,
      threadId: msg.threadId ?? undefined,
      from: fromEntry?.email ?? "",
      fromName: fromEntry?.name ?? "",
      to: toEntries.map((r) => r.email),
      cc: ccEntries.map((r) => r.email),
      toRecipients: toEntries,
      ccRecipients: ccEntries,
      subject: decodeMimeHeader(getHeader(headers, "Subject")) || "(no subject)",
      snippet: decodeHTML(msg.snippet ?? ""),
      date: getHeader(headers, "Date"),
      isRead: !(msg.labelIds ?? []).includes("UNREAD"),
      isStarred: (msg.labelIds ?? []).includes("STARRED"),
      labels: msg.labelIds ?? [],
      provider: "google",
      folder: folder ?? folderFromLabels(msg.labelIds ?? []),
    };
  });

  return {
    emails,
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

async function getHeaders(
  accessToken: string,
  id: string,
  names: string[],
): Promise<MessageHeaders> {
  const res = await getGmailClient(accessToken).users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: names,
  });
  return pickHeaders(res.data.payload?.headers ?? [], names);
}

async function getUnsubscribeInfo(
  accessToken: string,
  id: string,
): Promise<UnsubscribeInfo | null> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["List-Unsubscribe", "List-Unsubscribe-Post"],
  });
  const headers = res.data.payload?.headers ?? [];
  const listUnsubscribe = getHeader(headers, "List-Unsubscribe");
  if (!listUnsubscribe) return null;
  const listUnsubscribePost = getHeader(headers, "List-Unsubscribe-Post");
  return {
    listUnsubscribe,
    listUnsubscribePost: listUnsubscribePost || undefined,
  };
}

async function getMessage(accessToken: string, id: string): Promise<Partial<Email>> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  const msg = res.data;

  let bodyHtml = "";
  let bodyText = "";

  type GmailPart = {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: GmailPart[] | null;
  };

  function extractParts(part: GmailPart) {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body?.data) {
      bodyHtml = Buffer.from(part.body.data, "base64").toString("utf-8");
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      bodyText = Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    for (const p of part.parts ?? []) {
      extractParts(p);
    }
  }

  if (msg.payload) extractParts(msg.payload);

  return { bodyHtml, bodyText, id };
}

function buildGmailMime(payload: DraftPayload): string {
  const hasAttachments = !!payload.attachments?.length;

  const baseHeaders: (string | null)[] = [
    `To: ${payload.to.join(", ")}`,
    payload.cc?.length ? `Cc: ${payload.cc.join(", ")}` : null,
    payload.bcc?.length ? `Bcc: ${payload.bcc.join(", ")}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(payload.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    payload.inReplyTo ? `In-Reply-To: ${payload.inReplyTo}` : null,
    payload.references ? `References: ${payload.references}` : null,
  ];

  if (!hasAttachments) {
    const headers = [...baseHeaders, "Content-Type: text/html; charset=utf-8"]
      .filter(Boolean)
      .join("\r\n");
    return `${headers}\r\n\r\n${payload.bodyHtml}`;
  }

  const boundary = `metis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const headers = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`]
    .filter(Boolean)
    .join("\r\n");

  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push("Content-Type: text/html; charset=utf-8");
  parts.push("Content-Transfer-Encoding: 7bit");
  parts.push("");
  parts.push(payload.bodyHtml);

  for (const att of payload.attachments ?? []) {
    const safeName = att.filename.replace(/"/g, '\\"');
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${safeName}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${safeName}"`);
    parts.push("");
    parts.push(att.contentBase64.replace(/(.{76})/g, "$1\r\n"));
  }
  parts.push(`--${boundary}--`);

  return `${headers}\r\n\r\n${parts.join("\r\n")}`;
}

function mimeToBase64Url(mime: string): string {
  return Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createDraft(accessToken: string, payload: DraftPayload): Promise<{ id: string }> {
  const gmail = getGmailClient(accessToken);
  const raw = mimeToBase64Url(buildGmailMime(payload));
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  if (!res.data.id) throw new Error("Gmail returned no draft id");
  return { id: res.data.id };
}

async function updateDraft(
  accessToken: string,
  draftId: string,
  payload: DraftPayload,
): Promise<{ id: string }> {
  const gmail = getGmailClient(accessToken);
  const raw = mimeToBase64Url(buildGmailMime(payload));
  await gmail.users.drafts.update({
    userId: "me",
    id: draftId,
    requestBody: { message: { raw } },
  });
  return { id: draftId };
}

async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.drafts.delete({ userId: "me", id: draftId });
}

async function sendMessage(
  accessToken: string,
  payload: DraftPayload,
): Promise<{ id: string | null }> {
  const gmail = getGmailClient(accessToken);
  const hasAttachments = !!payload.attachments?.length;

  const baseHeaders: (string | null)[] = [
    `To: ${payload.to.join(", ")}`,
    payload.cc?.length ? `Cc: ${payload.cc.join(", ")}` : null,
    payload.bcc?.length ? `Bcc: ${payload.bcc.join(", ")}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(payload.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    payload.inReplyTo ? `In-Reply-To: ${payload.inReplyTo}` : null,
    payload.references ? `References: ${payload.references}` : null,
  ];

  let mime: string;

  if (!hasAttachments) {
    const headers = [...baseHeaders, "Content-Type: text/html; charset=utf-8"]
      .filter(Boolean)
      .join("\r\n");
    mime = `${headers}\r\n\r\n${payload.bodyHtml}`;
  } else {
    const boundary = `metis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const headers = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`]
      .filter(Boolean)
      .join("\r\n");

    const parts: string[] = [];
    parts.push(`--${boundary}`);
    parts.push("Content-Type: text/html; charset=utf-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(payload.bodyHtml);

    for (const att of payload.attachments ?? []) {
      const safeName = att.filename.replace(/"/g, '\\"');
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: ${att.mimeType}; name="${safeName}"`);
      parts.push("Content-Transfer-Encoding: base64");
      parts.push(`Content-Disposition: attachment; filename="${safeName}"`);
      parts.push("");
      parts.push(att.contentBase64.replace(/(.{76})/g, "$1\r\n"));
    }
    parts.push(`--${boundary}--`);

    mime = `${headers}\r\n\r\n${parts.join("\r\n")}`;
  }

  const raw = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return { id: res.data.id ?? null };
}

async function getThread(accessToken: string, threadId: string): Promise<Email[]> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });
  const messages = res.data.messages ?? [];
  return messages.map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const fromEntry = parseRecipientList(getHeader(headers, "From"))[0];
    const toEntries = parseRecipientList(getHeader(headers, "To"));
    return {
      // oxlint-disable-next-line typescript/no-non-null-assertion --googleapis types Message.id as nullable for request bodies, but messages.get / threads.get responses always populate it.
      id: msg.id!,
      threadId: msg.threadId ?? undefined,
      from: fromEntry?.email ?? "",
      fromName: fromEntry?.name ?? "",
      to: toEntries.map((r) => r.email),
      toRecipients: toEntries,
      cc: parseRecipientList(getHeader(headers, "Cc")).map((r) => r.email),
      subject: decodeMimeHeader(getHeader(headers, "Subject")) || "(no subject)",
      snippet: decodeHTML(msg.snippet ?? ""),
      date: getHeader(headers, "Date"),
      isRead: !(msg.labelIds ?? []).includes("UNREAD"),
      isStarred: (msg.labelIds ?? []).includes("STARRED"),
      labels: msg.labelIds ?? [],
      provider: "google",
      folder: "inbox",
    };
  });
}

async function getRaw(accessToken: string, id: string): Promise<string> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "raw",
  });
  const rawB64Url = res.data.raw ?? "";
  return rawB64Url.replace(/-/g, "+").replace(/_/g, "/");
}

async function deleteMessage(accessToken: string, id: string): Promise<string> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.trash({ userId: "me", id });
  return id;
}

async function restoreMessage(accessToken: string, id: string): Promise<string> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.untrash({ userId: "me", id });
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] },
  });
  return id;
}

async function archiveMessage(accessToken: string, id: string): Promise<string> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
  return id;
}

async function starMessage(accessToken: string, id: string, starred: boolean): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: {
      addLabelIds: starred ? ["STARRED"] : [],
      removeLabelIds: starred ? [] : ["STARRED"],
    },
  });
}

async function markRead(accessToken: string, id: string, read: boolean): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: {
      addLabelIds: read ? [] : ["UNREAD"],
      removeLabelIds: read ? ["UNREAD"] : [],
    },
  });
}

async function search(
  accessToken: string,
  query: string,
  maxResults = 20,
): Promise<MessagesResponse> {
  const gmail = getGmailClient(accessToken);
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });
  const messages = listRes.data.messages ?? [];

  if (messages.length === 0) return { emails: [] };

  const detailed = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        // oxlint-disable-next-line typescript/no-non-null-assertion --googleapis types Message.id as nullable for request bodies, but messages.list responses always populate it.
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Reply-To", "Subject", "Date", "Message-ID", "References"],
      }),
    ),
  );

  const emails: Email[] = detailed.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers ?? [];
    const fromEntry = parseRecipientList(getHeader(headers, "From"))[0];
    const toEntries = parseRecipientList(getHeader(headers, "To"));
    return {
      messageIdHeader: getHeader(headers, "Message-ID") || undefined,
      references: getHeader(headers, "References") || undefined,
      replyTo: parseRecipientList(getHeader(headers, "Reply-To")),
      // oxlint-disable-next-line typescript/no-non-null-assertion --googleapis types Message.id as nullable for request bodies, but messages.get / threads.get responses always populate it.
      id: msg.id!,
      threadId: msg.threadId ?? undefined,
      from: fromEntry?.email ?? "",
      fromName: fromEntry?.name ?? "",
      to: toEntries.map((r) => r.email),
      toRecipients: toEntries,
      subject: decodeMimeHeader(getHeader(headers, "Subject")) || "(no subject)",
      snippet: decodeHTML(msg.snippet ?? ""),
      date: getHeader(headers, "Date"),
      isRead: !(msg.labelIds ?? []).includes("UNREAD"),
      isStarred: (msg.labelIds ?? []).includes("STARRED"),
      labels: msg.labelIds ?? [],
      provider: "google",
      folder: "inbox",
    };
  });

  return { emails };
}

async function listAllInFolder(accessToken: string, folder: MailFolder): Promise<string[]> {
  const gmail = getGmailClient(accessToken);
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, unknown> = {
      userId: "me",
      maxResults: 500,
      pageToken,
    };
    if (folder === "archive") {
      params.q = "-in:inbox -in:trash -in:spam -in:drafts";
    } else {
      params.labelIds = [LABEL_MAP[folder]];
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return ids;
}

async function batchDelete(accessToken: string, ids: string[]): Promise<Map<string, string>> {
  const gmail = getGmailClient(accessToken);
  for (let i = 0; i < ids.length; i += 1000) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- batches of the API's 1000-id maximum run in order and stop at the first failure
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: ids.slice(i, i + 1000),
        addLabelIds: ["TRASH"],
        removeLabelIds: ["INBOX"],
      },
    });
  }
  return new Map();
}

type GmailMessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { attachmentId?: string | null; size?: number | null } | null;
  parts?: GmailMessagePart[] | null;
};

function collectAttachments(part: GmailMessagePart, out: Attachment[]) {
  if (part.filename && part.body?.attachmentId) {
    out.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }
  for (const p of part.parts ?? []) collectAttachments(p, out);
}

async function listAttachments(accessToken: string, id: string): Promise<Attachment[]> {
  const msg = await getGmailClient(accessToken).users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  const attachments: Attachment[] = [];
  if (msg.data.payload) {
    collectAttachments(msg.data.payload, attachments);
  }
  return attachments;
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; mimeType?: string }> {
  const att = await getGmailClient(accessToken).users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = att.data.data ?? "";
  return {
    buffer: Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  };
}
