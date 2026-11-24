import { create } from "zustand";

import { dismissUndoSendToast, showUndoSendToast } from "@/components/undo-send-toast";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { MailboxScope } from "@/server/schema";
import type { DraftPayload, UndoSendStatus } from "@/types/mail";

import { type ComposeReopen, useComposeStore } from "./compose-store";

export const UNDO_SEND_HOLD_MS = 5000;
const ADDED_BCC_SHOW_MS = 10000;

interface Pending {
  id: string;
  payload: DraftPayload;
  scope: MailboxScope;
  fromMailboxSlug?: string;
  reopen?: ComposeReopen;
  status: UndoSendStatus;
  error?: string;
  scheduledFor?: Date;
  addedBcc?: string[];
}

interface UndoSendState {
  pending: Pending | null;
  startSend: (
    payload: DraftPayload,
    scope: MailboxScope,
    fromMailboxSlug?: string,
    reopen?: ComposeReopen,
  ) => void;
  notifyScheduled: (
    payload: DraftPayload,
    scope: MailboxScope,
    scheduledFor: Date,
    addedBcc: string[],
  ) => void;
  cancel: () => void;
  fire: () => Promise<void>;
  setStatus: (status: UndoSendStatus | null, error?: string) => void;
}

let holdTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function base64Size(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function clearTimers() {
  if (holdTimer) clearTimeout(holdTimer);
  if (clearTimer) clearTimeout(clearTimer);
  holdTimer = null;
  clearTimer = null;
}

export const useUndoSendStore = create<UndoSendState>((set, get) => {
  function render(pending: Pending) {
    const previous = get().pending;
    if (previous && previous.id !== pending.id) {
      dismissUndoSendToast(previous.id);
    }
    set({ pending });
    showUndoSendToast(pending.id, {
      status: pending.status,
      holdMs: UNDO_SEND_HOLD_MS,
      error: pending.error,
      scheduledFor: pending.scheduledFor,
      addedBcc: pending.addedBcc,
      onUndo: () => get().cancel(),
      onDismiss: () => get().setStatus(null),
    });
  }

  function clearAfter(id: string, ms: number) {
    clearTimer = setTimeout(() => {
      if (get().pending?.id === id) get().setStatus(null);
    }, ms);
  }

  return {
    pending: null,

    startSend: (payload, scope, fromMailboxSlug, reopen) => {
      clearTimers();
      const id = crypto.randomUUID();
      render({
        id,
        payload,
        scope,
        fromMailboxSlug,
        reopen,
        status: "pending",
      });
      holdTimer = setTimeout(() => {
        holdTimer = null;
        void get().fire();
      }, UNDO_SEND_HOLD_MS);
    },

    notifyScheduled: (payload, scope, scheduledFor, addedBcc) => {
      clearTimers();
      const id = crypto.randomUUID();
      render({ id, payload, scope, status: "scheduled", scheduledFor, addedBcc });
      clearAfter(id, addedBcc.length > 0 ? ADDED_BCC_SHOW_MS : 6000);
    },

    cancel: () => {
      const current = get().pending;
      if (!current) return;
      clearTimers();
      render({ ...current, status: "cancelled" });

      const { payload, reopen } = current;
      useComposeStore.getState().open(
        reopen?.kind ?? "new",
        {
          from: current.fromMailboxSlug,
          to: payload.to.join(", "),
          cc: payload.cc?.join(", "),
          bcc: payload.bcc?.join(", "),
          subject: payload.subject,
          bodyHtml: payload.bodyHtml,
          inReplyTo: payload.inReplyTo,
          references: payload.references,
          replyToMessageId: payload.replyToMessageId,
          attachments: payload.attachments?.map((a) => ({
            id: crypto.randomUUID(),
            filename: a.filename,
            mimeType: a.mimeType,
            size: base64Size(a.contentBase64),
            contentBase64: a.contentBase64,
          })),
          keepSignature: true,
        },
        reopen?.replyingTo ?? undefined,
      );

      clearAfter(current.id, 4000);
    },

    fire: async () => {
      const current = get().pending;
      if (current?.status !== "pending") return;
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      render({ ...current, status: "sending" });

      try {
        const { addedBcc } = await orpc.mail.messages.send({
          ...current.scope,
          fromMailboxSlug: current.fromMailboxSlug,
          ...current.payload,
        });
        render({ ...current, status: "sent", addedBcc });
        clearAfter(current.id, addedBcc.length > 0 ? ADDED_BCC_SHOW_MS : 3000);
        void refreshQueries(rpc.mail.messages.contacts.key());
      } catch (e) {
        render({
          ...current,
          status: "failed",
          error: e instanceof Error ? e.message : "Send failed",
        });
      }
    },

    setStatus: (status, error) => {
      const current = get().pending;
      if (status === null) {
        clearTimers();
        if (current) dismissUndoSendToast(current.id);
        set({ pending: null });
        return;
      }
      if (!current) return;
      render({ ...current, status, error });
    },
  };
});
