import { create } from "zustand";

import { bodyAsHtml, bodyFrom } from "@/hooks/use-email-detail";
import { orpc } from "@/lib/orpc";
import { refreshMailListHead } from "@/mail/mail-cache";
import type { RemoteImages } from "@/mail/render/types";
import type { MailboxScope } from "@/server/schema";
import type { DraftPayload, Email } from "@/types/mail";

import { useMailStore } from "./mail-store";

export type ComposeKind = "new" | "reply" | "forward" | "draft";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export interface ComposeAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentBase64: string;
}

export interface ComposeInitial {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  bodyHtml?: string;
  quotedHtml?: string;
  quoteImages?: RemoteImages;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
  attachments?: ComposeAttachment[];
  keepSignature?: boolean;
}

export interface ComposeReopen {
  kind: ComposeKind;
  replyingTo: string | null;
}

export interface ComposeFields {
  from: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  quotedHtml: string | null;
}

export interface ComposeSession extends ComposeFields {
  id: number;
  kind: ComposeKind;
  replyingTo: string | null;
  bodyHtml: string;
  typed: boolean;
  attachments: ComposeAttachment[];
  quoteImages: RemoteImages;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
  draftId: string | null;
  loading: boolean;
  loadFailed: boolean;
  status: DraftStatus;
  signature: { from: string; auto: boolean } | null;
}

interface ComposeEnv {
  scope: MailboxScope;
  defaultFrom: string;
}

interface ComposeState {
  session: ComposeSession | null;
  env: ComposeEnv | null;
  bind: (env: ComposeEnv) => void;
  open: (kind: ComposeKind, initial?: ComposeInitial | null, replyingTo?: string) => void;
  openDraft: (scope: MailboxScope, email: Email) => void;
  update: (fields: Partial<ComposeFields>) => void;
  setBody: (bodyHtml: string, typed: boolean, changed: boolean) => void;
  addAttachments: (attachments: ComposeAttachment[]) => void;
  removeAttachment: (id: string) => void;
  touch: () => void;
  markSignature: (signature: { from: string; auto: boolean }) => void;
  close: () => void;
  finish: (draft: "delete" | "keep") => void;
}

const SAVE_DEBOUNCE_MS = 1500;
const SAVE_MAX_WAIT_MS = 10_000;

let nextId = 0;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let firstChange: number | null = null;
let inFlight: Promise<void> | null = null;
const savedIds = new Map<number, string>();

function splitRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasText(html: string | undefined): boolean {
  return !!html && /\S/.test(html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "));
}

function lastMessageId(references: string): string | undefined {
  return references.match(/<[^>]+>/g)?.at(-1);
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
  firstChange = null;
}

function fromOf(session: ComposeSession, env: ComposeEnv): string | undefined {
  return session.from ?? (env.defaultFrom || undefined);
}

export function composePayload(session: ComposeSession): DraftPayload {
  const bodyHtml = session.quotedHtml
    ? `${session.bodyHtml}<br>${session.quotedHtml}`
    : session.bodyHtml;
  return {
    to: session.to,
    cc: session.cc,
    bcc: session.bcc,
    subject: session.subject,
    ...(session.inReplyTo && { inReplyTo: session.inReplyTo }),
    ...(session.references && { references: session.references }),
    ...(session.replyToMessageId && { replyToMessageId: session.replyToMessageId }),
    bodyHtml,
    attachments: session.attachments.map(({ filename, mimeType, contentBase64 }) => ({
      filename,
      mimeType,
      contentBase64,
    })),
  };
}

function blankSession(kind: ComposeKind): ComposeSession {
  nextId += 1;
  return {
    id: nextId,
    kind,
    replyingTo: null,
    from: null,
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    bodyHtml: "",
    typed: false,
    quotedHtml: null,
    quoteImages: "block",
    attachments: [],
    draftId: null,
    loading: false,
    loadFailed: false,
    status: "idle",
    signature: null,
  };
}

async function loadDraft(scope: MailboxScope, id: string): Promise<Partial<ComposeSession>> {
  const [message, listed] = await Promise.all([
    orpc.mail.messages.get({ ...scope, id, folder: "drafts" }),
    orpc.mail.attachments.list({ ...scope, id }),
  ]);
  const attachments = await Promise.all(
    listed.attachments.map(async (attachment) => {
      const file = await orpc.mail.attachments.download({
        ...scope,
        id,
        attachmentId: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      });
      return {
        id: crypto.randomUUID(),
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        contentBase64: file.data,
      };
    }),
  );
  const bodyHtml = bodyAsHtml(bodyFrom(message));
  const references = message.references;
  return {
    bodyHtml,
    typed: hasText(bodyHtml),
    bcc: message.bcc ?? [],
    ...(references && { references, inReplyTo: lastMessageId(references) }),
    attachments,
  };
}

export const useComposeStore = create<ComposeState>((set, get) => {
  function patchSession(id: number, patch: Partial<ComposeSession>) {
    set((s) => (s.session?.id === id ? { session: { ...s.session, ...patch } } : s));
  }

  async function saveOnce(session: ComposeSession): Promise<void> {
    const env = get().env;
    if (!env || session.loading || session.loadFailed) return;
    if (session.to.length === 0 && !session.subject.trim() && !session.typed) return;
    const previousId = savedIds.get(session.id) ?? session.draftId;
    patchSession(session.id, { status: "saving" });
    try {
      const { id } = await orpc.mail.drafts.save({
        ...env.scope,
        fromMailboxSlug: fromOf(session, env),
        draftId: previousId ?? undefined,
        payload: composePayload(session),
      });
      savedIds.set(session.id, id);
      patchSession(session.id, { draftId: id, status: "saved" });
      if (previousId && previousId !== id) useMailStore.getState().removeEmail(previousId);
      void refreshMailListHead(env.scope, "drafts").catch(() => {});
    } catch {
      if (get().session?.id === session.id) dirty = true;
      patchSession(session.id, { status: "error" });
    }
  }

  function flush(target?: ComposeSession): Promise<void> {
    clearTimer();
    if (inFlight) return inFlight.then(() => flush(target));
    const session = target ?? get().session;
    if (!dirty || !session) return Promise.resolve();
    dirty = false;
    inFlight = saveOnce(session).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function schedule() {
    dirty = true;
    const now = Date.now();
    firstChange ??= now;
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstChange + SAVE_MAX_WAIT_MS - now));
    timer = setTimeout(() => void flush(), wait);
  }

  function replace(session: ComposeSession | null) {
    const previous = get().session;
    if (previous && dirty) void flush(previous);
    else clearTimer();
    dirty = false;
    set({ session });
  }

  return {
    session: null,
    env: null,

    bind: (env) => set({ env }),

    open: (kind, initial, replyingTo) => {
      const session: ComposeSession = {
        ...blankSession(kind),
        replyingTo: replyingTo ?? null,
        from: initial?.from ?? null,
        to: splitRecipients(initial?.to),
        cc: splitRecipients(initial?.cc),
        bcc: splitRecipients(initial?.bcc),
        subject: initial?.subject ?? "",
        bodyHtml: initial?.bodyHtml ?? "",
        typed: hasText(initial?.bodyHtml),
        quotedHtml: initial?.quotedHtml ?? null,
        quoteImages: initial?.quoteImages ?? "block",
        inReplyTo: initial?.inReplyTo,
        references: initial?.references,
        replyToMessageId: initial?.replyToMessageId,
        attachments: initial?.attachments ?? [],
        signature: initial?.keepSignature
          ? { from: initial.from ?? get().env?.defaultFrom ?? "", auto: false }
          : null,
      };
      replace(session);
      if (session.typed) schedule();
    },

    openDraft: (scope, email) => {
      const session: ComposeSession = {
        ...blankSession("draft"),
        from: email.mailboxSlug ?? null,
        to: email.to,
        cc: email.cc ?? [],
        subject: email.subject ?? "",
        draftId: email.id,
        status: "saved",
        loading: true,
      };
      replace(session);
      loadDraft(scope, email.id).then(
        (loaded) => patchSession(session.id, { ...loaded, loading: false }),
        () => patchSession(session.id, { loading: false, loadFailed: true }),
      );
    },

    update: (fields) => {
      set((s) => (s.session ? { session: { ...s.session, ...fields } } : s));
      schedule();
    },

    setBody: (bodyHtml, typed, changed) => {
      set((s) => (s.session ? { session: { ...s.session, bodyHtml, typed } } : s));
      if (changed) schedule();
    },

    addAttachments: (attachments) => {
      set((s) =>
        s.session
          ? { session: { ...s.session, attachments: [...s.session.attachments, ...attachments] } }
          : s,
      );
      schedule();
    },

    removeAttachment: (id) => {
      set((s) =>
        s.session
          ? {
              session: {
                ...s.session,
                attachments: s.session.attachments.filter((a) => a.id !== id),
              },
            }
          : s,
      );
      schedule();
    },

    touch: schedule,

    markSignature: (signature) =>
      set((s) => (s.session ? { session: { ...s.session, signature } } : s)),

    close: () => replace(null),

    finish: (draft) => {
      const { session, env } = get();
      if (!session) return;
      clearTimer();
      dirty = false;
      set({ session: null });
      if (draft === "keep" || !env) return;
      const removeDraft = () => {
        const draftId = savedIds.get(session.id) ?? session.draftId;
        savedIds.delete(session.id);
        if (!draftId) return;
        orpc.mail.drafts
          .delete({ ...env.scope, fromMailboxSlug: fromOf(session, env), draftId })
          .then(
            () => {
              useMailStore.getState().removeEmail(draftId);
              void refreshMailListHead(env.scope, "drafts").catch(() => {});
            },
            () => {},
          );
      };
      if (inFlight) inFlight.then(removeDraft, removeDraft);
      else removeDraft();
    },
  };
});
