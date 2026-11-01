import { create } from "zustand";

import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient } from "@/lib/query-client";
import { compilePrivacyRules, type PrivacyRules } from "@/mail/render/rules";
import type { RemoteAllowEntry, RemoteAllowInput } from "@/server/schema";

interface MailPrivacyState {
  rules: PrivacyRules | null;
  loadedOnce: ReadonlySet<string>;
  ensureLoaded: () => void;
  allowRemote: (input: RemoteAllowInput) => Promise<void>;
  revokeRemote: (id: string) => Promise<void>;
  loadOnce: (messageId: string) => void;
}

export const remoteAllowQuery = rpc.user.listRemoteAllow.queryOptions({ staleTime: Infinity });

let rulesRequested = false;

export const useMailPrivacyStore = create<MailPrivacyState>((set) => ({
  rules: null,
  loadedOnce: new Set(),

  ensureLoaded: () => {
    if (!rulesRequested) {
      rulesRequested = true;
      Promise.all([import("@/mail/render/trackers"), import("@/mail/render/clearurls")])
        .then(([t, c]) =>
          set({ rules: compilePrivacyRules(t.TRACKER_VENDORS, c.CLEARURLS_PROVIDERS) }),
        )
        .catch((err) => {
          console.error("[mail-privacy] rules failed to load", err);
          set({ rules: compilePrivacyRules([], []) });
        });
    }
  },

  allowRemote: async (input) => {
    const entry = await orpc.user.allowRemote(input);
    getQueryClient().setQueryData(remoteAllowQuery.queryKey, (old) =>
      old
        ? {
            ...old,
            entries: [
              ...old.entries.filter((e) => !(e.kind === entry.kind && e.value === entry.value)),
              entry,
            ],
          }
        : old,
    );
  },

  revokeRemote: async (id) => {
    await orpc.user.revokeRemote({ id });
    getQueryClient().setQueryData(remoteAllowQuery.queryKey, (old) =>
      old ? { ...old, entries: old.entries.filter((e) => e.id !== id) } : old,
    );
  },

  loadOnce: (messageId) => set((s) => ({ loadedOnce: new Set(s.loadedOnce).add(messageId) })),
}));

export function senderDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  return at > 0
    ? address
        .slice(at + 1)
        .trim()
        .toLowerCase() || null
    : null;
}

export function isSenderAllowed(
  sender: string,
  allow: readonly RemoteAllowEntry[] | null,
): boolean {
  if (!allow?.length) return false;
  const address = sender.trim().toLowerCase();
  const domain = senderDomain(address);
  return allow.some((entry) =>
    entry.kind === "address"
      ? entry.value === address
      : domain !== null && (domain === entry.value || domain.endsWith(`.${entry.value}`)),
  );
}
