"use client";

import type { Data } from "@dnd-kit/core";
import { Mail } from "lucide-react";
import { useMemo } from "react";

import { type AgentEmail, toAgentEmail } from "@/ai/turn";
import { AgentPanel } from "@/components/agent/agent-panel";
import { useScopePolicy } from "@/components/scope-policy-context";
import { useCurrentEmails } from "@/hooks/use-current-emails";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { formatEmailDate } from "@/lib/utils";
import { refetchMailLists, refreshMessageRowsAfter, refreshReadLaterList } from "@/mail/mail-cache";
import { useMailStore } from "@/store/mail-store";
import type { Email } from "@/types/mail";

const EMAIL_SUGGESTIONS = [
  "Summarize this email",
  "Is this email phishing?",
  "Draft a reply",
  "What does the sender want?",
];

const INBOX_SUGGESTIONS = [
  "Summarize my inbox",
  "Find emails from this week",
  "Delete all promotional emails",
  "Star the latest email",
];

function describe(email: AgentEmail) {
  return { title: email.subject, subtitle: `${email.from} · ${formatEmailDate(email.date)}` };
}

function fromDrag(data: Data | undefined): AgentEmail | null {
  const email: Email | undefined = data?.email;
  return email ? toAgentEmail(email) : null;
}

export function MailAgentPanel() {
  const scope = useMailboxScope();
  const { setAgentOpen, selectedEmail, setSelectedEmail, selectedFolder } = useMailStore();
  const emails = useCurrentEmails();
  const policy = useScopePolicy();
  const open = useMemo(() => (selectedEmail ? toAgentEmail(selectedEmail) : null), [selectedEmail]);
  const candidates = useMemo(() => emails.map(toAgentEmail), [emails]);

  return (
    <AgentPanel
      kind="mailbox"
      slug={scope.mailboxSlug}
      api="/api/ai/chat/mail"
      body={scope}
      logTag="[mail-agent]"
      name="Mail AI"
      icon={Mail}
      placeholder="Ask about your emails…"
      emptyLabel={(attached) => (attached > 0 ? "Ask about this email" : "Ask Mail AI")}
      suggestions={(attached) =>
        (attached > 0 ? EMAIL_SUGGESTIONS : INBOX_SUGGESTIONS).filter(
          (s) => policy.phishingDetection || s !== "Is this email phishing?",
        )
      }
      open={open}
      candidates={candidates}
      describe={describe}
      picker={{
        title: "Attach an email",
        placeholder: "Attach an email…",
        emptyLabel: "No other emails loaded",
      }}
      onOpenItem={(item) => {
        const found = emails.find((e) => e.id === item.id);
        if (found) setSelectedEmail(found);
      }}
      fromDrag={fromDrag}
      turn={(items) => ({ kind: "mail", folder: selectedFolder, emails: items })}
      onTurnFinished={() => {
        void refetchMailLists().catch(() => {});
        void refreshReadLaterList(scope).catch(() => {});
        refreshMessageRowsAfter(Promise.resolve());
      }}
      onClose={() => setAgentOpen(false)}
    />
  );
}
