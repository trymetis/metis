import "server-only";
import { finishOutgoing } from "@/mail/signatures";
import { muteThreadOf } from "@/ops/inbox";
import { labelMessage } from "@/ops/labels";
import {
  createDraftMail,
  downloadAttachment,
  listMail,
  type MailHandle,
  mailValue,
  rawMail,
  readMail,
  readThread,
  resolveFolderPath,
  searchMail,
  sendMail,
  textToHtml,
  writeFileBytes,
} from "@/ops/values";
import type { DraftAttachment, DraftPayload, MailFolder, MailSignatureKind } from "@/types/mail";
import { isMailFolder } from "@/types/mail";

import { sendFingerprint } from "../fingerprint";
import type { Item } from "../runtime";
import { emptyValue, T } from "../values";
import {
  BlockedError,
  boolOf,
  emit,
  list,
  nothing,
  numberOf,
  type Params,
  record,
  type Runner,
  type StepCtx,
  type StepResult,
  str,
  text,
} from "./types";

interface MessageRef {
  id: string;
  mailboxId: string;
  threadId: string;
  value: Record<string, unknown>;
}

function messageOf(params: Params, name = "message"): MessageRef {
  const value = record(params[name]);
  const id = typeof value.id === "string" ? value.id : "";
  const mailboxId = typeof value.mailboxId === "string" ? value.mailboxId : "";
  if (!id || !mailboxId) throw new Error("This step needs a message, and got something else");
  return {
    id,
    mailboxId,
    threadId: typeof value.threadId === "string" ? value.threadId : "",
    value,
  };
}

function principalOf(ctx: StepCtx): string {
  if (!ctx.principal.userId) throw new BlockedError("This workflow has no execution principal");
  return ctx.principal.userId;
}

function folderOf(params: Params, name = "folder"): MailFolder {
  const value = text(params, name) || "inbox";
  return isMailFolder(value) ? value : "inbox";
}

function updated(message: MessageRef, patch: Record<string, unknown>): StepResult {
  return emit({ ...message.value, ...patch });
}

async function blobsToAttachments(ctx: StepCtx, value: unknown): Promise<DraftAttachment[]> {
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((entry) => {
    const id = record(entry).id;
    return typeof id === "string" && id ? [id] : [];
  });
  const loaded = await Promise.all(ids.map((id) => ctx.getBlob(id)));
  return loaded.map((blob) => ({
    filename: blob.name,
    mimeType: blob.mimeType,
    contentBase64: blob.data.toString("base64"),
  }));
}

async function finished(
  ctx: StepCtx,
  handle: MailHandle,
  params: Params,
  payload: DraftPayload,
  opts: { kind: MailSignatureKind; footer: boolean },
): Promise<DraftPayload> {
  const workspaceId = ctx.principal.workspaceId ?? ctx.definition.workspaceId;
  if (!workspaceId) return payload;
  return finishOutgoing(
    {
      workspaceId,
      mailboxId: handle.mailboxId,
      mailboxEmail: handle.email,
      userId: ctx.principal.userId,
    },
    payload,
    { signature: boolOf(params, "signature", true) ? opts.kind : null, footer: opts.footer },
  );
}

async function payloadOf(ctx: StepCtx, params: Params): Promise<DraftPayload> {
  const body = text(params, "body");
  return {
    to: list(params, "to"),
    cc: list(params, "cc"),
    bcc: list(params, "bcc"),
    subject: text(params, "subject"),
    bodyText: body,
    bodyHtml: textToHtml(body),
    attachments: await blobsToAttachments(ctx, params.attachments),
  };
}

function sentValue(handle: MailHandle, id: string | null, payload: DraftPayload) {
  return mailValue(handle, {
    id: id ?? "",
    from: handle.email,
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    bodyText: payload.bodyText,
    date: new Date().toISOString(),
    isRead: true,
    folder: "sent",
  });
}

async function dispatchSend(handle: MailHandle, payload: DraftPayload): Promise<StepResult> {
  const dispatchedAt = new Date().toISOString();
  const sent = await sendMail(handle, payload);
  return emit(sentValue(handle, sent.id, payload), sent.id ? `sent as ${sent.id}` : "sent", {
    operation: "send",
    providerMessageId: sent.id,
    resourceId: handle.mailboxId,
    dispatchedAt,
    settledAt: new Date().toISOString(),
    fingerprint: sendFingerprint(payload),
    message: { subject: payload.subject || "(no subject)", from: handle.email },
  });
}

function previewSent(
  payload: Pick<DraftPayload, "to" | "cc" | "subject" | "bodyText">,
  mailboxId: string,
): StepResult {
  return emit(
    {
      ...record(emptyValue(T.mail)),
      mailboxId,
      to: payload.to,
      cc: payload.cc ?? [],
      subject: payload.subject,
      body: payload.bodyText ?? "",
      folder: "sent",
    },
    `would send to ${payload.to.join(", ") || "nobody"}`,
  );
}

const get: Runner = {
  async run(ctx, params) {
    const handle = await ctx.mailbox(text(params, "mailbox"));
    return emit(await readMail(handle, text(params, "id")), handle.email);
  },
};

function listing(
  load: (handle: MailHandle, params: Params) => Promise<ReturnType<typeof mailValue>[]>,
): Runner {
  return {
    async run(ctx, params) {
      const handle = await ctx.mailbox(text(params, "mailbox"));
      const values = await load(handle, params);
      return {
        kind: "emit",
        emits: values.map((value) => ({ result: value, key: `${value.mailboxId}:${value.id}` })),
        detail: `${values.length} message(s) in ${handle.email}`,
      };
    },
  };
}

const listRunner = listing((handle, params) =>
  listMail(handle, folderOf(params), numberOf(params, "limit", 25)),
);
const searchRunner = listing((handle, params) =>
  searchMail(handle, text(params, "query"), numberOf(params, "limit", 25)),
);

const thread: Runner = {
  async run(ctx, params) {
    const message = messageOf(params);
    const handle = await ctx.mailbox(message.mailboxId);
    return emit(await readThread(handle, message.threadId || message.id));
  },
};

function action(
  act: (
    ctx: StepCtx,
    handle: MailHandle,
    message: MessageRef,
    params: Params,
  ) => Promise<StepResult>,
): Runner {
  return {
    async run(ctx, params) {
      const message = messageOf(params);
      const handle = await ctx.mailbox(message.mailboxId);
      return act(ctx, handle, message, params);
    },
    preview(_ctx, params) {
      const message = messageOf(params);
      return emit(message.value, "would change this message");
    },
  };
}

const markRead = action(async (_ctx, handle, message, params) => {
  const read = boolOf(params, "read", true);
  await handle.adapter.markRead(message.id, read);
  return updated(message, { isRead: read });
});

const star = action(async (_ctx, handle, message, params) => {
  const starred = boolOf(params, "starred", true);
  await handle.adapter.starMessage(message.id, starred);
  return updated(message, { isStarred: starred });
});

const label = action(async (ctx, _handle, message, params) => {
  const key = text(params, "label");
  const remove = text(params, "action") === "remove";
  await labelMessage({
    userId: principalOf(ctx),
    mailboxId: message.mailboxId,
    messageId: message.id,
    label: key,
    action: remove ? "remove" : "add",
    validate: ctx.definition.kind === "user",
  });
  const labels = Array.isArray(message.value.labels) ? message.value.labels.map(String) : [];
  return updated(message, {
    labels: remove ? labels.filter((l) => l !== key) : [...new Set([...labels, key])],
  });
});

const mute = action(async (ctx, handle, message) => {
  if (!message.threadId) return { ...updated(message, {}), detail: `${handle.email} · no thread` };
  await muteThreadOf({
    userId: principalOf(ctx),
    mailboxId: message.mailboxId,
    threadId: message.threadId,
  });
  return updated(message, {});
});

const archive = action(async (_ctx, handle, message) => {
  const moved = await handle.adapter.archiveMessage(message.id);
  return updated(message, { id: moved, folder: "archive" });
});

const trash = action(async (_ctx, handle, message) => {
  const moved = await handle.adapter.deleteMessage(message.id);
  return updated(message, { id: moved ?? message.id, folder: "trash" });
});

const toInbox = action(async (_ctx, handle, message) => {
  const moved = await handle.adapter.restoreMessage(message.id);
  return updated(message, { id: moved, folder: "inbox" });
});

const draft: Runner = {
  async run(ctx, params) {
    const handle = await ctx.mailbox(text(params, "mailbox"));
    const payload = await finished(ctx, handle, params, await payloadOf(ctx, params), {
      kind: "new",
      footer: false,
    });
    const created = await createDraftMail(handle, payload);
    return emit(
      {
        id: created.id,
        mailboxId: handle.mailboxId,
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        subject: payload.subject,
        body: payload.bodyText ?? "",
        html: payload.bodyHtml,
        replyToMessageId: "",
        attachments: [],
      },
      `draft in ${handle.email}`,
    );
  },
  async preview(ctx, params) {
    const payload = await payloadOf(ctx, params);
    return emit(
      {
        ...record(emptyValue(T.draft)),
        mailboxId: text(params, "mailbox"),
        to: payload.to,
        subject: payload.subject,
        body: payload.bodyText ?? "",
      },
      "would save a draft",
    );
  },
};

function expectFrom(params: Params): Record<string, unknown> {
  return {
    mailboxId: text(params, "mailbox"),
    to: list(params, "to"),
    cc: list(params, "cc"),
    bcc: list(params, "bcc"),
    subject: text(params, "subject"),
  };
}

const send: Runner = {
  expect: expectFrom,
  async run(ctx, params) {
    const handle = await ctx.mailbox(text(params, "mailbox"));
    return dispatchSend(
      handle,
      await finished(ctx, handle, params, await payloadOf(ctx, params), {
        kind: "new",
        footer: true,
      }),
    );
  },
  async preview(ctx, params) {
    return previewSent(await payloadOf(ctx, params), text(params, "mailbox"));
  },
};

async function replyPayload(
  handle: MailHandle,
  message: MessageRef,
  params: Params,
): Promise<DraftPayload> {
  const original = await handle.adapter.getMessage(message.id);
  const self = handle.email.toLowerCase();
  const sender = original.replyTo?.[0]?.email ?? original.from ?? str(message.value.from);
  const everyone = boolOf(params, "replyAll", false)
    ? [...(original.to ?? []), ...(original.cc ?? [])].filter(
        (a) => !a.toLowerCase().includes(self),
      )
    : [];
  const subject = original.subject ?? str(message.value.subject);
  const body = text(params, "body");
  return {
    to: [sender],
    cc: everyone.filter((a) => a !== sender),
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    bodyText: body,
    bodyHtml: textToHtml(body),
    inReplyTo: original.messageIdHeader,
    references:
      [original.references, original.messageIdHeader].filter(Boolean).join(" ") || undefined,
    replyToMessageId: message.id,
  };
}

const reply: Runner = {
  expect(params) {
    const message = messageOf(params);
    const subject = str(message.value.subject);
    return {
      mailboxId: message.mailboxId,
      to: [str(message.value.from)],
      cc: [],
      bcc: [],
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    };
  },
  async run(ctx, params) {
    const message = messageOf(params);
    const handle = await ctx.mailbox(message.mailboxId);
    return dispatchSend(
      handle,
      await finished(ctx, handle, params, await replyPayload(handle, message, params), {
        kind: "reply",
        footer: true,
      }),
    );
  },
  preview(_ctx, params) {
    const message = messageOf(params);
    const subject = str(message.value.subject);
    return previewSent(
      { to: [str(message.value.from)], subject: `Re: ${subject}`, bodyText: text(params, "body") },
      message.mailboxId,
    );
  },
};

const FORWARD_ATTACHMENT_LIMIT = 15 * 1024 * 1024;

const forward: Runner = {
  expect(params) {
    const message = messageOf(params);
    const subject = str(message.value.subject);
    return {
      mailboxId: message.mailboxId,
      to: list(params, "to"),
      cc: [],
      bcc: [],
      subject: /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`,
    };
  },
  async run(ctx, params) {
    const message = messageOf(params);
    const handle = await ctx.mailbox(message.mailboxId);
    const original = await readMail(handle, message.id);
    const attachments: DraftAttachment[] = [];
    let total = 0;
    for (const attachment of original.attachments) {
      total += attachment.size;
      if (total > FORWARD_ATTACHMENT_LIMIT) break;
      // oxlint-disable-next-line eslint/no-await-in-loop -- attachments download one at a time to bound memory
      const downloaded = await downloadAttachment(handle, message.id, attachment.id);
      attachments.push({
        filename: downloaded.name,
        mimeType: downloaded.mimeType,
        contentBase64: downloaded.data.toString("base64"),
      });
    }
    const note = text(params, "note");
    const body = `${note}\n\n---------- Forwarded message ----------\nFrom: ${original.fromName ? `${original.fromName} <${original.from}>` : original.from}\nSubject: ${original.subject}\n\n${original.body}`;
    return dispatchSend(
      handle,
      await finished(
        ctx,
        handle,
        params,
        {
          to: list(params, "to"),
          subject: /^fwd?:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`,
          bodyText: body,
          bodyHtml: textToHtml(body),
          attachments,
        },
        { kind: "reply", footer: true },
      ),
    );
  },
  preview(_ctx, params) {
    const message = messageOf(params);
    return previewSent(
      {
        to: list(params, "to"),
        subject: `Fwd: ${str(message.value.subject)}`,
        bodyText: text(params, "note"),
      },
      message.mailboxId,
    );
  },
};

const addBcc: Runner = {
  run(_ctx, params, item: Item) {
    const draftValue = record(item.value);
    const address = text(params, "address").trim();
    const taken = new Set(
      ["to", "cc", "bcc"]
        .flatMap((field) => (Array.isArray(draftValue[field]) ? draftValue[field].map(String) : []))
        .map((a) => a.trim().toLowerCase()),
    );
    if (!address || taken.has(address.toLowerCase())) {
      return Promise.resolve(emit(draftValue, "already a recipient"));
    }
    const bcc = Array.isArray(draftValue.bcc) ? draftValue.bcc.map(String) : [];
    return Promise.resolve(emit({ ...draftValue, bcc: [...bcc, address] }, address));
  },
};

const sendScheduled: Runner = {
  async run(ctx, params) {
    const payload = await ctx.draftPayload();
    if (!payload) return nothing("no payload left to send");
    const handle = await ctx.mailbox(text(params, "mailbox"));
    return dispatchSend(handle, payload);
  },
  async preview(ctx, params) {
    const payload = await ctx.draftPayload();
    return previewSent(
      { to: payload?.to ?? [], subject: payload?.subject ?? "", bodyText: payload?.bodyText },
      text(params, "mailbox"),
    );
  },
};

function safeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 150);
}

function attachmentName(params: Params, fallback: string): string {
  return safeName(text(params, "name") || fallback, "attachment");
}

function emlName(params: Params): string {
  const base = text(params, "name") || str(record(params.message).subject) || "message";
  return safeName(base.endsWith(".eml") ? base : `${base}.eml`, "message.eml");
}

const saveAttachment: Runner = {
  expect(params) {
    return {
      driveId: text(params, "drive"),
      folder: text(params, "folder"),
      name: attachmentName(params, str(record(params.attachment).name)),
    };
  },
  async run(ctx, params) {
    const attachment = record(params.attachment);
    const mailboxId = str(attachment.mailboxId);
    const messageId = str(attachment.messageId);
    const attachmentId = str(attachment.id);
    if (!mailboxId || !messageId || !attachmentId) throw new Error("This step needs an attachment");
    const handle = await ctx.mailbox(mailboxId);
    const downloaded = await downloadAttachment(handle, messageId, attachmentId);
    const drive = await ctx.drive(text(params, "drive"));
    const parentId = await resolveFolderPath(drive, text(params, "folder"));
    const file = await writeFileBytes(drive, {
      parentId,
      name: attachmentName(params, downloaded.name),
      mimeType: downloaded.mimeType,
      data: downloaded.data,
      signal: ctx.signal,
    });
    return emit(file, `saved ${file.name}`, {
      operation: "upload",
      providerMessageId: file.id,
      resourceId: drive.driveId,
    });
  },
  preview(_ctx, params) {
    const attachment = record(params.attachment);
    return emit(
      {
        ...record(emptyValue(T.file)),
        driveId: text(params, "drive"),
        name: text(params, "name") || str(attachment.name) || "attachment",
      },
      `would save to ${text(params, "folder") || "the top of the drive"}`,
    );
  },
};

const saveEml: Runner = {
  expect(params) {
    return {
      driveId: text(params, "drive"),
      folder: text(params, "folder"),
      name: emlName(params),
    };
  },
  async run(ctx, params) {
    const message = messageOf(params);
    const handle = await ctx.mailbox(message.mailboxId);
    const data = await rawMail(handle, message.id);
    const drive = await ctx.drive(text(params, "drive"));
    const parentId = await resolveFolderPath(drive, text(params, "folder"));
    const name = emlName(params);
    const file = await writeFileBytes(drive, {
      parentId,
      name,
      mimeType: "message/rfc822",
      data,
      signal: ctx.signal,
    });
    return emit(file, `saved ${file.name}`, {
      operation: "upload",
      providerMessageId: file.id,
      resourceId: drive.driveId,
    });
  },
  preview(_ctx, params) {
    return emit(
      {
        ...record(emptyValue(T.file)),
        driveId: text(params, "drive"),
        name: text(params, "name") || "message.eml",
      },
      `would save to ${text(params, "folder") || "the top of the drive"}`,
    );
  },
};

export const MAIL_RUNNERS = {
  "mail.get": get,
  "mail.list": listRunner,
  "mail.search": searchRunner,
  "mail.thread": thread,
  "mail.markRead": markRead,
  "mail.star": star,
  "mail.label": label,
  "mail.mute": mute,
  "mail.archive": archive,
  "mail.trash": trash,
  "mail.toInbox": toInbox,
  "mail.draft": draft,
  "mail.send": send,
  "mail.reply": reply,
  "mail.forward": forward,
  "mail.addBcc": addBcc,
  "mail.sendScheduled": sendScheduled,
  "mail.saveAttachment": saveAttachment,
  "mail.saveEml": saveEml,
} as const satisfies Record<string, Runner>;
