"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { Bot } from "lucide-react";
import { useCallback, useState } from "react";

import { AgentDisabled } from "@/components/agent/agent-disabled";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";

import { ContactCard } from "./contact-card";
import { ContactDialog } from "./contact-dialog";
import { ContactList } from "./contact-list";
import { ContactsAgentPanel } from "./contacts-agent-panel";
import { ContactsColumnHeader } from "./contacts-column-header";
import { ContactsProvider, useContacts } from "./contacts-context";

function Surface({ agentOpen, onToggleAgent }: { agentOpen: boolean; onToggleAgent: () => void }) {
  const platformAi = usePlatformPolicy().ai;
  const policy = useScopePolicy();
  const { scope, selected, selectedLoading, selectedError, errors, book, bookName } = useContacts();
  const hasSelection = selected !== null || selectedLoading;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="min-w-0 truncate text-[20px] font-medium tracking-tight text-foreground">
            {book ? bookName(book) : "All contacts"}
          </h1>
          {platformAi && (
            <Button
              variant={agentOpen ? "secondary" : "ghost"}
              size="icon"
              className="ml-auto"
              aria-label="Contacts AI"
              aria-pressed={agentOpen}
              onClick={onToggleAgent}
            >
              <Bot className="h-4 w-4" />
            </Button>
          )}
        </header>

        {!hasSelection && selectedError && (
          <div className="shrink-0 border-b border-destructive/25 bg-destructive/8 px-4 py-2 text-[12px] text-destructive-text">
            {selectedError}
          </div>
        )}

        {errors.length > 0 && (
          <div className="shrink-0 border-b border-destructive/25 bg-destructive/8 px-4 py-2 text-[12px] text-destructive-text">
            {errors.map((e) => `${e.accountName ?? e.accountEmail}: ${e.error}`).join(" · ")}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "flex min-h-0 flex-col max-md:w-full",
              hasSelection
                ? "w-80 shrink-0 border-r border-border max-md:hidden max-md:border-r-0"
                : "min-w-0 flex-1",
            )}
          >
            <ContactsColumnHeader wide={!hasSelection} />
            <ContactList wide={!hasSelection} />
          </div>
          {hasSelection && (
            <div className="min-w-0 flex-1">
              <ContactCard />
            </div>
          )}
        </div>
      </div>

      {agentOpen && (
        <div className="w-95 shrink-0 border-l border-border max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:bg-background">
          {policy.ai ? (
            <ContactsAgentPanel onClose={onToggleAgent} />
          ) : (
            <AgentDisabled
              onClose={onToggleAgent}
              reason={policy.workspaceAi ? "resource" : "workspace"}
              resource="addressbook"
              scopeLabel="this address book"
              workspaceSlug={scope.workspaceSlug}
            />
          )}
        </div>
      )}

      <ContactDialog />
    </>
  );
}

export function ContactsShell() {
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

  return (
    <ContactsProvider>
      <div className="flex h-full min-h-0">
        <Surface agentOpen={agentOpen} onToggleAgent={toggleAgent} />
      </div>
    </ContactsProvider>
  );
}
