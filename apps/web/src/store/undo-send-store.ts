import { create } from "zustand";

import { dismissUndoSendToast, showUndoSendToast } from "@/components/undo-send-toast";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { MailboxScope } from "@/server/schema";
import type { UndoSendStatus } from "@/types/mail";

import { useMailStore } from "./mail-store";

export const UNDO_SEND_HOLD_MS = 5000;

interface DraftAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

interface DraftPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: DraftAttachment[];
}

interface Pending {
  id: string;
  payload: DraftPayload;
  scope: MailboxScope;
  fromMailboxSlug?: string;
  status: UndoSendStatus;
  error?: string;
  scheduledFor?: Date;
}

interface UndoSendState {
  pending: Pending | null;
  startSend: (payload: DraftPayload, scope: MailboxScope, fromMailboxSlug?: string) => void;
  notifyScheduled: (payload: DraftPayload, scope: MailboxScope, scheduledFor: Date) => void;
  cancel: () => void;
  fire: () => Promise<void>;
  setStatus: (status: UndoSendStatus | null, error?: string) => void;
}

let holdTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

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

    startSend: (payload, scope, fromMailboxSlug) => {
      clearTimers();
      const id = crypto.randomUUID();
      render({
        id,
        payload,
        scope,
        fromMailboxSlug,
        status: "pending",
      });
      holdTimer = setTimeout(() => {
        holdTimer = null;
        void get().fire();
      }, UNDO_SEND_HOLD_MS);
    },

    notifyScheduled: (payload, scope, scheduledFor) => {
      clearTimers();
      const id = crypto.randomUUID();
      render({ id, payload, scope, status: "scheduled", scheduledFor });
      clearAfter(id, 6000);
    },

    cancel: () => {
      const current = get().pending;
      if (!current) return;
      clearTimers();
      render({ ...current, status: "cancelled" });

      useMailStore.getState().setComposeInitial({
        to: current.payload.to.join(", "),
        subject: current.payload.subject,
        bodyHtml: current.payload.bodyHtml,
      });
      useMailStore.getState().setComposeOpen(true);

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
        await orpc.mail.messages.send({
          ...current.scope,
          fromMailboxSlug: current.fromMailboxSlug,
          ...current.payload,
        });
        render({ ...current, status: "sent" });
        clearAfter(current.id, 3000);
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
