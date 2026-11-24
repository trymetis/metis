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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Input } from "@metis/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@metis/ui/components/resizable";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import { MobileAsideTrigger, ResponsiveAside } from "@/components/mobile-aside";
import { SearchInput } from "@/components/search-input";
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
  pinned: boolean;
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
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
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
      toast.error("Could not delete the conversation");
    }
    if (id === activeId) {
      router.push(assistantPath(workspaceSlug));
    }
    await refreshThreads();
  }

  async function saveRename() {
    if (!renaming) return;
    const { id, title } = renaming;
    setRenaming(null);
    const next = title.trim();
    if (!next || next === threads.find((t) => t.id === id)?.title) return;
    try {
      await orpc.assistant.renameThread({ workspaceSlug, threadId: id, title: next });
    } catch (err) {
      console.error("[assistant] failed to rename thread:", err);
      toast.error("Could not rename the conversation");
    }
    await refreshThreads();
  }

  async function setPinned(id: string, pinned: boolean) {
    try {
      await orpc.assistant.pinThread({ workspaceSlug, threadId: id, pinned });
    } catch (err) {
      console.error("[assistant] failed to pin thread:", err);
      toast.error(pinned ? "Could not pin the conversation" : "Could not unpin the conversation");
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
      <div
        className={cn(
          "flex items-center gap-1 border-border-soft border-b px-2 py-2",
          collapsed && "flex-col",
        )}
      >
        <IconButton
          label={collapsed ? "Expand" : "Collapse"}
          className="max-md:hidden"
          onClick={toggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
        {!collapsed && (
          <SearchInput
            label="Filter chats"
            placeholder="Filter chats"
            value={query}
            onValueChange={setQuery}
            className="min-w-0 flex-1"
          />
        )}
        <IconButton label="New chat" nativeButton={false} render={<Link href={newChatHref} />}>
          <SquarePen className="size-4" />
        </IconButton>
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-faint text-xs">No conversations yet</p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-2 py-3 text-faint text-xs">No conversations match “{query.trim()}”</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {visibleThreads.map((t) =>
                renaming?.id === t.id ? (
                  <li key={t.id}>
                    <Input
                      aria-label="Chat title"
                      autoFocus
                      className="h-8 text-sm"
                      value={renaming.title}
                      onChange={(e) => setRenaming({ id: t.id, title: e.target.value })}
                      onBlur={() => void saveRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveRename();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenaming(null);
                        }
                      }}
                    />
                  </li>
                ) : (
                  <li className="group/thread relative" key={t.id}>
                    <Link
                      className={cn(
                        "block rounded-md px-2.5 py-2 pr-8 transition-colors hover:bg-hover",
                        t.id === activeId && "bg-active",
                      )}
                      href={assistantPath(workspaceSlug, t.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        {t.pinned && (
                          <Pin aria-label="Pinned" className="size-3 shrink-0 text-faint" />
                        )}
                        <span className="truncate text-foreground text-sm">{t.title}</span>
                      </span>
                      <span className="text-[11px] text-faint">
                        {formatDistanceToNowStrict(new Date(t.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label={`Actions for ${t.title}`}
                            className="-translate-y-1/2 absolute top-1/2 right-1 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                            size="icon-sm"
                            variant="ghost"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setRenaming({ id: t.id, title: t.title })}>
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void setPinned(t.id, !t.pinned)}>
                          {t.pinned ? <PinOff /> : <Pin />}
                          {t.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(t)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ),
              )}
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
          <h1 className="font-medium text-foreground text-lg">Workspace Assistant</h1>
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
