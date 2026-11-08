import "server-only";
import { getInstanceConfig } from "@/config/runtime";
import { htmlToText, stripQuotedText, truncate } from "@/lib/utils";
import type { Attachment } from "@/types/mail";

import type { MailAdapter } from "./adapter";
import {
  imageMediaType,
  isParsableAttachment,
  isVisionImage,
  type ParsedAttachment,
  parseAttachment,
} from "./attachment-data";
import { cacheMessage, getCachedMessage } from "./cache";
import type { MessageHeaders } from "./headers";
import { messageLabels } from "./labels";
import { type MailScope, scopeMessage } from "./session";
import {
  extractMessageExtras,
  type Json,
  linksInText,
  type MessageAnchor,
  prepareHtml,
  prepareText,
} from "./structured-data";

const PER_MESSAGE_CHARS = 4000;
const TOTAL_TEXT_CHARS = 40_000;
const MIN_MESSAGE_CHARS = 300;
const ATTACHMENT_SCAN_MESSAGES = 5;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_IMAGES = 2;

export const AUTOMATION_HEADERS = [
  "auto-submitted",
  "precedence",
  "list-id",
  "list-unsubscribe",
  "x-auto-response-suppress",
];

export interface ConvImage {
  filename: string;
  mediaType: string;
  bytes: Buffer;
}

export interface ConvMsg {
  id: string;
  bareId: string;
  key: string;
  from?: string;
  date?: string;
  subject?: string;
  label?: string;
  text: string;
  structuredData: Json[];
  attachments: ParsedAttachment[];
  images: ConvImage[];
  headers: MessageHeaders;
  links: string[];
  anchors: MessageAnchor[];
}

export interface Conversation {
  owner: string | null;
  messages: ConvMsg[];
}

interface ConvMeta {
  id: string;
  key?: string;
  from?: string;
  date?: string;
  subject?: string;
  attachments?: Attachment[];
}

function oneCopyEach(metas: ConvMeta[], labelled: (meta: ConvMeta) => boolean): ConvMeta[] {
  const chosen = new Map<string, ConvMeta>();
  for (const meta of metas) {
    if (!meta.key) continue;
    const seen = chosen.get(meta.key);
    if (!seen || (!labelled(seen) && labelled(meta))) chosen.set(meta.key, meta);
  }
  const placed = new Set<string>();
  return metas.flatMap((meta) => {
    if (!meta.key) return [meta];
    if (placed.has(meta.key)) return [];
    placed.add(meta.key);
    return [chosen.get(meta.key) ?? meta];
  });
}

function visionEnabled(): boolean {
  const llm = getInstanceConfig().llm;
  return llm.driver !== "disabled" && llm.summaryVision;
}

async function resolveBody(
  adapter: MailAdapter,
  session: MailScope,
  meta: ConvMeta,
): Promise<ConvMeta & { html: string | null; text: string | null }> {
  const scoped = scopeMessage(session, meta.id);
  const cached = await getCachedMessage(scoped);
  let html = cached?.bodyHtml ?? null;
  let text = cached?.bodyText ?? null;

  if (!html && !text) {
    const body = await adapter.getMessage(meta.id);
    html = body.bodyHtml ?? null;
    text = body.bodyText ?? null;
    if (html || text) {
      try {
        await cacheMessage(scoped, {
          bodyHtml: html ?? undefined,
          bodyText: text ?? undefined,
        });
      } catch (err) {
        console.error("[mail/summary] body cache write failed:", err);
      }
    }
  }

  return {
    ...meta,
    from: meta.from ?? (cached?.sender || undefined),
    subject: meta.subject ?? (cached?.subject || undefined),
    date: meta.date ?? cached?.receivedAt.toISOString(),
    html,
    text,
  };
}

async function download(
  adapter: MailAdapter,
  messageId: string,
  att: Attachment,
): Promise<Buffer | null> {
  const file = await adapter.downloadAttachment(messageId, att.id).catch(() => null);
  return file?.buffer ?? null;
}

async function loadAttachments(
  adapter: MailAdapter,
  meta: ConvMeta,
  wantImages: boolean,
): Promise<{ parsed: ParsedAttachment[]; images: ConvImage[] }> {
  const attachments = meta.attachments ?? (await adapter.listAttachments(meta.id).catch(() => []));

  const parsable = attachments.filter(isParsableAttachment).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
  const imageAtts = wantImages ? attachments.filter(isVisionImage).slice(0, MAX_IMAGES) : [];

  const [parsed, images] = await Promise.all([
    Promise.all(
      parsable.map(async (att) => {
        const bytes = await download(adapter, meta.id, att);
        return bytes ? parseAttachment(att, bytes).catch(() => null) : null;
      }),
    ),
    Promise.all(
      imageAtts.map(async (att) => {
        const bytes = await download(adapter, meta.id, att);
        return bytes ? { filename: att.filename, mediaType: imageMediaType(att), bytes } : null;
      }),
    ),
  ]);

  return {
    parsed: parsed.filter((p): p is ParsedAttachment => p !== null),
    images: images.filter((i): i is ConvImage => i !== null),
  };
}

export async function loadConversation(
  session: MailScope,
  messageId: string,
  threadId?: string,
): Promise<Conversation> {
  const adapter = session.adapter;
  const listed: ConvMeta[] = threadId
    ? (await adapter.getThread(threadId)).map((m) => ({
        id: m.id,
        key: m.messageIdHeader?.trim() || undefined,
        from: m.fromName ? `${m.fromName} <${m.from}>` : m.from,
        date: m.date,
        subject: m.subject,
        attachments: m.attachments,
      }))
    : [{ id: messageId }];

  const scopedAnchor = scopeMessage(session, listed.at(-1)?.id ?? messageId);
  const owner =
    session.mailboxes.find((m) => m.mailboxId === scopedAnchor.mailboxId)?.mailboxEmail ?? null;
  const labels = await messageLabels(
    scopedAnchor.mailboxId,
    listed.map((m) => scopeMessage(session, m.id).messageId),
  ).catch(() => new Map<string, string>());

  const metas = oneCopyEach(listed, (meta) => labels.has(scopeMessage(session, meta.id).messageId));
  const scanFrom = Math.max(0, metas.length - ATTACHMENT_SCAN_MESSAGES);
  const lastIndex = metas.length - 1;

  const messages = await Promise.all(
    metas.map(async (meta, i) => {
      const scan = i >= scanFrom;
      const [resolved, extrasFromAttachments, headers] = await Promise.all([
        resolveBody(adapter, session, meta),
        scan
          ? loadAttachments(adapter, meta, visionEnabled())
          : Promise.resolve({ parsed: [], images: [] as ConvImage[] }),
        i === lastIndex
          ? adapter.getHeaders(meta.id, AUTOMATION_HEADERS)
          : Promise.resolve<MessageHeaders>({}),
      ]);
      const html = resolved.html ? prepareHtml(resolved.html) : null;
      const text = resolved.text ? prepareText(resolved.text) : null;
      const raw = text?.trim() ? text : html ? prepareText(htmlToText(html)) : "";
      const extras = extractMessageExtras(html, text);
      const bareId = scopeMessage(session, resolved.id).messageId;
      const attachments = extrasFromAttachments.parsed;
      return {
        id: resolved.id,
        bareId,
        key: meta.key ?? bareId,
        from: resolved.from,
        date: resolved.date,
        subject: resolved.subject,
        label: labels.get(bareId),
        text: truncate(stripQuotedText(raw), PER_MESSAGE_CHARS),
        structuredData: extras.structuredData,
        attachments,
        images: extrasFromAttachments.images,
        headers,
        links: [...extras.links, ...linksInText(JSON.stringify(attachments))],
        anchors: extras.anchors,
      };
    }),
  );

  let imagesLeft = MAX_IMAGES;
  let textLeft = TOTAL_TEXT_CHARS;
  for (const message of messages.toReversed()) {
    message.images = message.images.slice(0, imagesLeft);
    imagesLeft -= message.images.length;
    message.text = truncate(message.text, Math.max(textLeft, MIN_MESSAGE_CHARS));
    textLeft = Math.max(0, textLeft - message.text.length);
  }

  return {
    owner,
    messages: messages.filter(
      (m) =>
        m.text || m.structuredData.length > 0 || m.attachments.length > 0 || m.images.length > 0,
    ),
  };
}
