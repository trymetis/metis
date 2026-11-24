"use client";

import { cn } from "@metis/ui/lib/utils";
import { UserRound } from "lucide-react";
import { useCallback, useState } from "react";

import { AgentDragContext } from "@/components/agent/agent-drag-context";
import { AgentToggle } from "@/components/agent/agent-toggle";
import { useAgentAvailable } from "@/components/agent/use-agent-available";

import { ContactCard } from "./contact-card";
import { ContactDialog } from "./contact-dialog";
import { ContactList } from "./contact-list";
import { ContactsAgentPanel } from "./contacts-agent-panel";
import { ContactsColumnHeader } from "./contacts-column-header";
import { ContactsProvider, useContacts } from "./contacts-context";

function Surface({ agentOpen, onToggleAgent }: { agentOpen: boolean; onToggleAgent: () => void }) {
  const agentAvailable = useAgentAvailable();
  const { selected, selectedLoading, selectedError, errors, book, bookName } = useContacts();
  const hasSelection = selected !== null || selectedLoading;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="min-w-0 truncate text-[20px] font-medium tracking-tight text-foreground">
            {book ? bookName(book) : "All contacts"}
          </h1>
          {agentAvailable && (
            <AgentToggle
              label="Contacts AI"
              open={agentOpen}
              onToggle={onToggleAgent}
              className="ml-auto"
            />
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
            <ContactList wide={!hasSelection} dragToAgent={agentOpen && agentAvailable} />
          </div>
          {hasSelection && (
            <div className="min-w-0 flex-1">
              <ContactCard />
            </div>
          )}
        </div>
      </div>

      {agentOpen && agentAvailable && (
        <div className="w-95 shrink-0 border-l border-border max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:bg-background">
          <ContactsAgentPanel onClose={onToggleAgent} />
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
      <AgentDragContext icon={UserRound}>
        <div className="flex h-full min-h-0">
          <Surface agentOpen={agentOpen} onToggleAgent={toggleAgent} />
        </div>
      </AgentDragContext>
    </ContactsProvider>
  );
}
