"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { Bot } from "lucide-react";
import { useCallback, useState } from "react";

import { AgentDisabled } from "@/components/agent/agent-disabled";
import { MobileAsideTrigger, ResponsiveAside } from "@/components/mobile-aside";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";

import { ContactCard } from "./contact-card";
import { ContactDialog } from "./contact-dialog";
import { ContactList } from "./contact-list";
import { ContactsAgentPanel } from "./contacts-agent-panel";
import { ContactsProvider, useContacts } from "./contacts-context";
import { ContactsSidebar } from "./contacts-sidebar";

function Surface({ agentOpen, onToggleAgent }: { agentOpen: boolean; onToggleAgent: () => void }) {
  const platformAi = usePlatformPolicy().ai;
  const policy = useScopePolicy();
  const { scope, selected, selectedLoading, errors, book, bookName } = useContacts();
  const hasSelection = selected !== null || selectedLoading;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
          <h1 className="font-serif text-[20px] font-medium tracking-tight text-foreground">
            {book ? bookName(book) : "All contacts"}
          </h1>
          {platformAi && (
            <Button
              variant={agentOpen ? "secondary" : "ghost"}
              size="icon"
              aria-label="Contacts AI"
              aria-pressed={agentOpen}
              className="ml-auto"
              onClick={onToggleAgent}
            >
              <Bot className="h-4 w-4" />
            </Button>
          )}
        </header>

        {errors.length > 0 && (
          <div className="shrink-0 border-b border-destructive/25 bg-destructive/8 px-4 py-2 text-[12px] text-destructive-text">
            {errors.map((e) => `${e.accountName ?? e.accountEmail}: ${e.error}`).join(" · ")}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "flex min-h-0 w-80 shrink-0 flex-col border-r border-border max-md:w-full max-md:border-r-0",
              hasSelection && "max-md:hidden",
            )}
          >
            <ContactList />
          </div>
          <div className={cn("min-w-0 flex-1", !hasSelection && "max-md:hidden")}>
            <ContactCard />
          </div>
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
        <ResponsiveAside label="Address books">
          <ContactsSidebar />
        </ResponsiveAside>
        <Surface agentOpen={agentOpen} onToggleAgent={toggleAgent} />
      </div>
    </ContactsProvider>
  );
}
