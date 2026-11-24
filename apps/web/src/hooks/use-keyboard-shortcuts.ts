"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { useAgentAvailable } from "@/components/agent/use-agent-available";
import { orpc } from "@/lib/orpc";
import { useComposeStore } from "@/store/compose-store";
import { useMailStore } from "@/store/mail-store";
import { mailboxScope, mailPath } from "@/workspace/path";

import { type ChordBindings, isTypingTarget, useChord } from "./use-chord";
import { useCurrentEmails } from "./use-current-emails";
import { useReplyActions } from "./use-reply-actions";
import { useMailboxScope } from "./use-workspace-path";

export const MAIL_CHORD_PREFIX = "m";

export const MAIL_UNCHORDED: [string[], string][] = [
  [["j", "n"], "Next email"],
  [["k", "p"], "Previous email"],
];

export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const scope = useMailboxScope();
  const emails = useCurrentEmails();
  const { selectedEmail, setSelectedEmail, setAgentOpen, agentOpen, updateEmail, removeEmail } =
    useMailStore();
  const openCompose = useComposeStore((s) => s.open);
  const agentAvailable = useAgentAvailable();
  const { reply } = useReplyActions(selectedEmail);

  const bindings = useMemo<ChordBindings>(() => {
    const folderScope = mailboxScope(pathname);
    const go = (leaf: string) => {
      if (!folderScope) return;
      router.push(mailPath(folderScope.workspaceSlug, folderScope.mailboxSlug, leaf));
    };
    const all: ChordBindings = {
      i: { label: "Inbox", run: () => go("inbox") },
      s: { label: "Sent", run: () => go("sent") },
      d: { label: "Drafts", run: () => go("drafts") },
      f: { label: "Starred", run: () => go("starred") },
      t: { label: "Trash", run: () => go("trash") },
      v: { label: "Archive", run: () => go("archive") },
      p: { label: "Spam", run: () => go("spam") },
      c: { label: "Compose", run: () => openCompose("new") },
      r: {
        label: "Reply",
        run: () => {
          if (selectedEmail?.folder !== "drafts") reply();
        },
      },
      x: {
        label: "Star",
        run: () => {
          if (!selectedEmail) return;
          const next = !selectedEmail.isStarred;
          updateEmail(selectedEmail.id, { isStarred: next });
          orpc.mail.messages
            .star({ ...scope, id: selectedEmail.id, starred: next })
            .catch(() => {});
        },
      },
      u: {
        label: "Read/unread",
        run: () => {
          if (!selectedEmail) return;
          const next = !selectedEmail.isRead;
          updateEmail(selectedEmail.id, { isRead: next });
          orpc.mail.messages
            .markRead({ ...scope, ids: [selectedEmail.id], read: next })
            .catch(() => {});
        },
      },
      e: {
        label: "Archive email",
        run: () => {
          if (!selectedEmail) return;
          const request = orpc.mail.messages.archive({
            ...scope,
            id: selectedEmail.id,
          });
          request.catch(() => {});
          removeEmail(selectedEmail.id, request);
        },
      },
      "#": {
        label: "Delete",
        run: () => {
          if (!selectedEmail) return;
          const request = orpc.mail.messages.delete({
            ...scope,
            id: selectedEmail.id,
          });
          request.catch(() => {});
          removeEmail(selectedEmail.id, request);
        },
      },
      "/": {
        label: "Search",
        run: () => {
          document
            .querySelector<HTMLInputElement>('input[type="text"][placeholder*="Search"]')
            ?.focus();
        },
      },
      ...(agentAvailable ? { a: { label: "Agent", run: () => setAgentOpen(!agentOpen) } } : {}),
    };
    return Object.fromEntries(
      Object.entries(all).map(([key, binding]) => [
        key,
        {
          ...binding,
          run: () => {
            if (!useComposeStore.getState().session) binding.run();
          },
        },
      ]),
    );
  }, [
    pathname,
    router,
    scope,
    selectedEmail,
    agentOpen,
    agentAvailable,
    openCompose,
    reply,
    setAgentOpen,
    updateEmail,
    removeEmail,
  ]);

  const chord = useChord({ prefix: MAIL_CHORD_PREFIX, bindings });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (useComposeStore.getState().session) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (emails.length === 0) return;

      const currentIdx = selectedEmail ? emails.findIndex((em) => em.id === selectedEmail.id) : -1;
      let target: number;
      if (e.key === "j" || e.key === "n") {
        target = Math.min(currentIdx + 1, emails.length - 1);
      } else if (e.key === "k" || e.key === "p") {
        target = Math.max(currentIdx - 1, 0);
      } else {
        return;
      }

      e.preventDefault();
      const email = emails[target];
      if (!email) return;
      setSelectedEmail(email);
      if (!email.isRead) {
        updateEmail(email.id, { isRead: true });
        orpc.mail.messages.markRead({ ...scope, ids: [email.id], read: true }).catch(() => {});
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emails, selectedEmail, setSelectedEmail, updateEmail, scope]);

  return { ...chord, bindings };
}
