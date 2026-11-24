import { create } from "zustand";

import {
  dropCachedEmails,
  holdRemoved,
  patchCachedEmail,
  refreshMessageRowsAfter,
} from "@/mail/mail-cache";
import type { Email, MailFolder } from "@/types/mail";

export type MailListView = "folder" | "read-later";

interface MailState {
  selectedEmail: Email | null;
  selectedFolder: MailFolder;
  selectedView: MailListView;
  isFetchingBody: boolean;
  searchQuery: string;
  submittedSearch: string;
  agentOpen: boolean;
  selectedIds: Set<string>;
  listTabs: Record<string, string>;
  setListTab: (key: string, tab: string) => void;
  visibleEmailIds: string[];

  setVisibleEmailIds: (ids: string[]) => void;
  setSelectedEmail: (email: Email | null) => void;
  setSelectedFolder: (folder: MailFolder, view?: MailListView) => void;
  setFetchingBody: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  submitSearch: (q: string) => void;
  setAgentOpen: (v: boolean) => void;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
  updateEmail: (id: string, patch: Partial<Email>) => void;
  removeEmail: (id: string, request?: Promise<unknown>) => void;
  removeEmails: (ids: string[], request?: Promise<unknown>) => void;
}

export const useMailStore = create<MailState>((set) => ({
  selectedEmail: null,
  selectedFolder: "inbox",
  selectedView: "folder",
  isFetchingBody: false,
  searchQuery: "",
  submittedSearch: "",
  agentOpen: false,
  selectedIds: new Set<string>(),
  listTabs: {},
  setListTab: (key, tab) => set((s) => ({ listTabs: { ...s.listTabs, [key]: tab } })),
  visibleEmailIds: [],

  setVisibleEmailIds: (ids) => set({ visibleEmailIds: ids }),
  setSelectedEmail: (email) => set({ selectedEmail: email }),
  setSelectedFolder: (folder, view = "folder") =>
    set({
      selectedFolder: folder,
      selectedView: view,
      selectedEmail: null,
      submittedSearch: "",
    }),
  setFetchingBody: (v) => set({ isFetchingBody: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  submitSearch: (q) => set({ submittedSearch: q.trim() }),
  setAgentOpen: (v) => set({ agentOpen: v }),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clearSelected: () => set({ selectedIds: new Set() }),
  updateEmail: (id, patch) => {
    patchCachedEmail(id, patch);
    set((s) => ({
      selectedEmail:
        s.selectedEmail?.id === id ? { ...s.selectedEmail, ...patch } : s.selectedEmail,
    }));
  },
  removeEmail: (id, request) => {
    holdRemoved([id], request);
    dropCachedEmails([id]);
    refreshMessageRowsAfter(request);
    set((s) => ({ selectedEmail: s.selectedEmail?.id === id ? null : s.selectedEmail }));
  },
  removeEmails: (ids, request) => {
    holdRemoved(ids, request);
    dropCachedEmails(ids);
    refreshMessageRowsAfter(request);
    const idSet = new Set(ids);
    set((s) => ({
      selectedEmail: idSet.has(s.selectedEmail?.id ?? "") ? null : s.selectedEmail,
    }));
  },
}));
