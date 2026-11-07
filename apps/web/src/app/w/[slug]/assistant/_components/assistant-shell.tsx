"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@metis/ui/components/resizable";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { usePanelRef } from "react-resizable-panels";

import { MobileAsideTrigger, ResponsiveAside } from "@/components/mobile-aside";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSavedLayout } from "@/hooks/use-saved-layout";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { assistantPath } from "@/workspace/path";

interface ThreadRow {
  id: string;
  title: string;
  updatedAt: string;
}

interface AssistantShellProps {
  mailboxes: string[];
  calendars: string[];
  drives: string[];
  addressBooks: string[];
  children: ReactNode;
}

function countLabel(n: number, one: string, many: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

export function AssistantShell({
  mailboxes,
  calendars,
  drives,
  addressBooks,
  children,
}: AssistantShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const newChatHref = assistantPath(workspaceSlug);
  const threadsQuery = useQuery(
    rpc.assistant.listThreads.queryOptions({ input: { workspaceSlug } }),
  );
  const threads: ThreadRow[] = threadsQuery.data?.threads ?? [];
  const refreshThreads = useCallback(
    () => refreshQuery(rpc.assistant.listThreads.queryKey({ input: { workspaceSlug } })),
    [workspaceSlug],
  );
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();
  const [panelCollapsed, setCollapsed] = useState(false);
  const collapsed = panelCollapsed && !isMobile;
  const [pendingDelete, setPendingDelete] = useState<ThreadRow | null>(null);
  const railRef = usePanelRef();
  const { groupRef, onLayoutChanged } = useSavedLayout("metis-assistant-shell-layout");

  const activeId = pathname.includes("/assistant/")
    ? (pathname.split("/assistant/")[1] ?? null)
    : null;

  useEffect(() => {
    void refreshThreads();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- refetch threads when the active route changes (new/deleted threads)
  }, [refreshThreads, pathname]);

  function toggleCollapsed() {
    const panel = railRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }

  async function deleteThread(id: string) {
    try {
      await orpc.assistant.deleteThread({
        workspaceSlug,
        threadId: id,
      });
    } catch (err) {
      console.error("[assistant] failed to delete thread:", err);
    }
    if (id === activeId) {
      router.push(assistantPath(workspaceSlug));
    }
    await refreshThreads();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    await deleteThread(id);
  }

  const needle = query.trim().toLowerCase();
  const visibleThreads = needle
    ? threads.filter((t) => t.title.toLowerCase().includes(needle))
    : threads;

  const counts = [
    countLabel(mailboxes.length, "mailbox", "mailboxes"),
    countLabel(calendars.length, "calendar", "calendars"),
    countLabel(drives.length, "drive", "drives"),
    countLabel(addressBooks.length, "address book", "address books"),
  ].filter(Boolean);
  const accounts = [...new Set([...mailboxes, ...calendars, ...drives, ...addressBooks])];
  const scope =
    counts.length > 0
      ? `Operating across ${counts.join(", ")} · ${accounts.join(" · ")}`
      : "AI is off for every mailbox, calendar, drive and address book here";

  const rail = (
    <aside className="flex h-full w-full flex-col overflow-hidden border-border border-r bg-panel">
      <div className="flex items-center gap-1 border-border-soft border-b px-2 py-2.5">
        {!collapsed && (
          <span className="flex-1 font-medium font-serif text-base text-foreground">
            Workspace Assistant
          </span>
        )}
        <Button
          aria-label={collapsed ? "Expand" : "Collapse"}
          className="max-md:hidden"
          onClick={toggleCollapsed}
          size="icon-sm"
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      <div className="p-2">
        <Button
          className={cn("w-full", collapsed && "px-0")}
          nativeButton={false}
          render={<Link href={newChatHref} />}
          variant="outline"
        >
          <Plus className="size-4" data-icon={collapsed ? undefined : "inline-start"} />
          {!collapsed && "New chat"}
        </Button>
      </div>

      {!collapsed && threads.length > 0 && (
        <div className="px-2 pb-2">
          <Input
            aria-label="Search conversations"
            className="h-8 text-[13px]"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            type="search"
            value={query}
          />
        </div>
      )}

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-faint text-xs">No conversations yet</p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-2 py-3 text-faint text-xs">No conversations match “{query.trim()}”</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {visibleThreads.map((t) => (
                <li className="group/thread relative" key={t.id}>
                  <Link
                    className={cn(
                      "block rounded-md px-2.5 py-2 pr-8 transition-colors hover:bg-hover",
                      t.id === activeId && "bg-active",
                    )}
                    href={assistantPath(workspaceSlug, t.id)}
                  >
                    <span className="block truncate text-foreground text-sm">{t.title}</span>
                    <span className="text-[11px] text-faint">
                      {formatDistanceToNowStrict(new Date(t.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </Link>
                  <Button
                    aria-label="Delete conversation"
                    className="-translate-y-1/2 absolute top-1/2 right-1 opacity-0 transition-opacity group-hover/thread:opacity-100 pointer-coarse:opacity-100"
                    onClick={() => setPendingDelete(t)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );

  const content = (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center gap-3 border-border-soft border-b px-6 py-4">
        <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft">
          <Sparkles className="size-4.5 text-brand-text" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-medium font-serif text-foreground text-lg">Workspace Assistant</h1>
          <p className="truncate text-faint text-xs" title={scope}>
            {scope}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );

  const deleteDialog = (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      open={pendingDelete !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            “{pendingDelete?.title}” and its history are permanently deleted. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <div className="flex h-full min-w-0 flex-1">
        <ResponsiveAside label="Conversations">{rail}</ResponsiveAside>
        <div className="min-w-0 flex-1">{content}</div>
        {deleteDialog}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      id="metis-assistant-shell"
      groupRef={groupRef}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        id="rail"
        panelRef={railRef}
        collapsible
        collapsedSize={56}
        defaultSize={288}
        minSize={200}
        maxSize={420}
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => setCollapsed(size.inPixels <= 64)}
      >
        {rail}
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id="content">{content}</ResizablePanel>

      {deleteDialog}
    </ResizablePanelGroup>
  );
}
