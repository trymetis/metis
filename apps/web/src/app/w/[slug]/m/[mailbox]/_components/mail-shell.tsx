"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@metis/ui/components/resizable";
import { Mail } from "lucide-react";
import { useState } from "react";

import { ChordHint } from "@/components/chord-hint";
import { ResponsiveAside } from "@/components/mobile-aside";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  MAIL_CHORD_PREFIX,
  MAIL_UNCHORDED,
  useKeyboardShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { useSavedLayout } from "@/hooks/use-saved-layout";
import { useComposeStore } from "@/store/compose-store";
import { useMailStore } from "@/store/mail-store";
import type { Email } from "@/types/mail";

import { AgentPanel } from "./agent-panel";
import { ComposeDialog } from "./compose-dialog";
import { Sidebar } from "./sidebar";

interface MailShellProps {
  children: React.ReactNode;
}

export function MailShell({ children }: MailShellProps) {
  const { armed, bindings, helpOpen, setHelpOpen } = useKeyboardShortcuts();
  const { agentOpen } = useMailStore();
  const composeOpen = useComposeStore((s) => s.session !== null);
  const { groupRef, onLayoutChanged } = useSavedLayout(
    "metis-suite-shell-layout",
    agentOpen ? ["folders", "main", "agent"] : ["folders", "main"],
  );
  const isMobile = useIsMobile();
  const [dragging, setDragging] = useState<Email | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  return (
    <DndContext
      onDragEnd={() => setDragging(null)}
      onDragStart={({ active }) => {
        const data = active.data.current as { email?: Email } | undefined;
        setDragging(data?.email ?? null);
      }}
      sensors={sensors}
    >
      <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-background">
        {isMobile ? (
          <>
            <ResponsiveAside label="Mail folders" closeKey={composeOpen ? "compose" : undefined}>
              <Sidebar />
            </ResponsiveAside>
            <main className="flex h-full min-w-0 flex-1 overflow-hidden">{children}</main>
            {agentOpen && (
              <div className="fixed inset-0 z-50 bg-background">
                <AgentPanel />
              </div>
            )}
          </>
        ) : (
          <ResizablePanelGroup
            id="metis-suite-shell"
            groupRef={groupRef}
            onLayoutChanged={onLayoutChanged}
            className="min-w-0 flex-1"
          >
            <ResizablePanel
              id="folders"
              defaultSize={224}
              minSize={180}
              maxSize={320}
              groupResizeBehavior="preserve-pixel-size"
            >
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="main" className="flex overflow-hidden">
              <main className="flex h-full w-full overflow-hidden">{children}</main>
            </ResizablePanel>
            {agentOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="agent"
                  defaultSize={320}
                  minSize={280}
                  maxSize={560}
                  groupResizeBehavior="preserve-pixel-size"
                >
                  <AgentPanel />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
        <ComposeDialog />
        <ShortcutsHelp
          open={helpOpen}
          onOpenChange={setHelpOpen}
          prefix={MAIL_CHORD_PREFIX}
          bindings={bindings}
          unchorded={MAIL_UNCHORDED}
        />
        <ChordHint prefix={MAIL_CHORD_PREFIX} bindings={bindings} visible={armed} />
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="flex max-w-70 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 shadow-lg">
            <Mail className="size-3 shrink-0 text-faint" strokeWidth={1.75} />
            <span className="min-w-0 truncate text-[12px] text-foreground">{dragging.subject}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
