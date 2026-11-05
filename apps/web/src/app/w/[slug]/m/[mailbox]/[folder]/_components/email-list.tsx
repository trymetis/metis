"use client";

import { useDraggable } from "@dnd-kit/core";
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
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { cn } from "@metis/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MailOpen,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MobileAsideTrigger } from "@/components/mobile-aside";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";
import { useCustomLabels } from "@/hooks/use-custom-labels";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { formatEmailDate, getInitials, groupByThread } from "@/lib/utils";
import {
  customLabelMark,
  LABEL_OPTIONS,
  resolveChipStyle,
  resolveLabelName,
} from "@/mail/label-meta";
import { showLabelUndo } from "@/mail/label-undo";
import {
  listSource,
  refreshListOnSwitch,
  refreshMailListHead,
  refreshReadLaterList,
  setCachedLabels,
  useEmailSource,
  useMailLabels,
  useMutedThreadIds,
} from "@/mail/mail-cache";
import { mailboxChipStyle } from "@/mail/mailbox-color";
import { type MailListView, useMailStore } from "@/store/mail-store";
import type { Email, MailFolder } from "@/types/mail";
import { mailPath } from "@/workspace/path";

interface EmailListProps {
  folder: MailFolder;
  view: MailListView;
}

type FilterTab =
  | "primary"
  | "all"
  | "unread"
  | "starred"
  | "action_required"
  | "work"
  | "transactions"
  | "updates"
  | "newsletter"
  | "personal"
  | "promotional"
  | "social";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "primary", label: "Primary" },
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
  { id: "action_required", label: "Action Required" },
  { id: "work", label: "Work" },
  { id: "personal", label: "Personal" },
  { id: "updates", label: "Updates" },
  { id: "transactions", label: "Transactions" },
  { id: "newsletter", label: "Newsletter" },
  { id: "promotional", label: "Promos" },
  { id: "social", label: "Social" },
];

const PRIMARY_EXCLUDED_LABELS = new Set(["promotional", "social", "newsletter", "transactions"]);

const ROW_ESTIMATE = 76;
const ROW_OVERSCAN = 30;
export function EmailList({ folder, view }: EmailListProps) {
  const scope = useMailboxScope();
  const {
    selectedEmail,
    searchQuery,
    submittedSearch,
    setSelectedEmail,
    setSearchQuery,
    submitSearch,
    updateEmail,
    selectedIds,
    toggleSelected,
    clearSelected,
    removeEmails,
    setVisibleEmailIds,
    agentOpen,
    setAgentOpen,
  } = useMailStore();
  const readLaterMode = view === "read-later";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceSlug, mailboxSlug } = scope;
  const urlLabel = searchParams.get("label");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const tabKey = `${workspaceSlug}/${mailboxSlug}/${folder}`;
  const storedTab = useMailStore((s) => s.listTabs[tabKey]);
  const setListTab = useMailStore((s) => s.setListTab);
  const activeTab =
    TABS.find((tab) => tab.id === storedTab)?.id ?? (folder === "inbox" ? "primary" : "all");
  const setActiveTab = (tab: FilterTab) => setListTab(tabKey, tab);

  const source = listSource(readLaterMode, urlLabel, activeTab);
  const {
    emails,
    loading: isLoading,
    hasMore,
    loadMore,
    mailboxErrors,
    error: listError,
    retry: retryList,
  } = useEmailSource(scope, folder, source, submittedSearch);
  const { labels, ready: labelsReady } = useMailLabels(scope);
  const customLabels = useCustomLabels();
  const mutedThreadIds = useMutedThreadIds(scope);
  const platformAi = usePlatformPolicy().ai;
  const aiEnabled = useScopePolicy().ai;
  const [classifying, setClassifying] = useState(false);
  const classifyRun = useRef<{
    scope: typeof scope | null;
    attempted: Set<string>;
  }>({ scope: null, attempted: new Set() });

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const scrollRootRef = useCallback((node: HTMLDivElement | null) => setScrollRoot(node), []);

  useEffect(() => {
    if (readLaterMode) return;
    void refreshMailListHead(scope, folder).catch(() => {});
  }, [scope, folder, readLaterMode]);

  useEffect(() => {
    refreshListOnSwitch(scope, folder, listSource(readLaterMode, urlLabel, activeTab));
  }, [scope, folder, readLaterMode, urlLabel, activeTab]);

  usePollingRefresh(async () => {
    if (listError) {
      retryList();
      return;
    }
    if (useMailStore.getState().submittedSearch) return;
    if (readLaterMode) await refreshReadLaterList(scope).catch(() => {});
    else await refreshMailListHead(scope, folder).catch(() => {});
  });

  function runSearch(q: string) {
    submitSearch(q);
  }

  useEffect(() => {
    if (!aiEnabled || !labelsReady || classifying) return;
    if (classifyRun.current.scope !== scope) {
      classifyRun.current = { scope, attempted: new Set() };
    }
    const run = classifyRun.current;
    const batch = emails.filter((e) => !labels[e.id] && !run.attempted.has(e.id)).slice(0, 25);
    if (batch.length === 0) return;

    for (const e of batch) run.attempted.add(e.id);
    const items = batch.map((e) => ({
      id: e.id,
      sender: e.fromName || e.from,
      subject: e.subject,
      snippet: e.snippet,
    }));

    setClassifying(true);
    orpc.mail.labels
      .classify({ ...scope, items })
      .then((d: { labels?: Record<string, { label: string; confidence: number }> }) => {
        const classified = d.labels;
        if (classified && classifyRun.current === run) {
          setCachedLabels(scope, (current) => ({ ...current, ...classified }));
        }
      })
      .catch(() => {})
      .finally(() => setClassifying(false));
  }, [emails, labels, scope, aiEnabled, labelsReady, classifying]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const visibleThreads = useMemo(() => {
    let filtered = emails;

    if (readLaterMode) {
      filtered = emails;
    } else if (urlLabel) {
      filtered = emails.filter((e) => labels[e.id]?.label === urlLabel);
    } else if (activeTab === "unread") {
      filtered = emails.filter((e) => !e.isRead || e.id === selectedEmail?.id);
    } else if (activeTab === "starred") {
      filtered = emails.filter((e) => e.isStarred);
    } else if (activeTab === "primary") {
      filtered = emails.filter((e) => {
        const label = labels[e.id]?.label;
        return !label || !PRIMARY_EXCLUDED_LABELS.has(label);
      });
    } else if (
      activeTab === "action_required" ||
      activeTab === "work" ||
      activeTab === "transactions" ||
      activeTab === "updates" ||
      activeTab === "newsletter" ||
      activeTab === "personal" ||
      activeTab === "promotional" ||
      activeTab === "social"
    ) {
      filtered = emails.filter((e) => labels[e.id]?.label === activeTab);
    }

    if (folder === "inbox" && mutedThreadIds.size > 0) {
      filtered = filtered.filter((e) => !e.threadId || !mutedThreadIds.has(e.threadId));
    }
    return groupByThread(filtered);
  }, [emails, activeTab, labels, urlLabel, folder, mutedThreadIds, readLaterMode, selectedEmail]);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is used as documented; the React Compiler is not enabled
  const virtualizer = useVirtualizer({
    count: visibleThreads.length,
    getScrollElement: () =>
      scrollRoot?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null,
    estimateSize: () => ROW_ESTIMATE,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => visibleThreads[index]?.threadId ?? index,
  });

  const selectedId = selectedEmail?.id ?? null;
  const selectedIndex = selectedId
    ? visibleThreads.findIndex((group) => group.latest.id === selectedId)
    : -1;
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (selectedIndex < 0 || scrolledTo.current === selectedId) return;
    scrolledTo.current = selectedId;
    virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedId, selectedIndex, virtualizer]);

  const visibleEmails = useMemo(() => visibleThreads.map((g) => g.latest), [visibleThreads]);

  useEffect(() => {
    setVisibleEmailIds(visibleEmails.map((e) => e.id));
  }, [visibleEmails, setVisibleEmailIds]);

  async function toggleStar(e: React.MouseEvent, email: Email) {
    e.stopPropagation();
    const next = !email.isStarred;
    updateEmail(email.id, { isStarred: next });
    await orpc.mail.messages.star({ ...scope, id: email.id, starred: next });
  }

  async function handleSelect(email: Email) {
    setSelectedEmail(email);
    if (!email.isRead) {
      updateEmail(email.id, { isRead: true });
      try {
        await orpc.mail.messages.markRead({
          ...scope,
          ids: [email.id],
          read: true,
        });
      } catch {}
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    setConfirmBulkDelete(false);
    if (ids.length === 0) return;
    clearSelected();
    const request = orpc.mail.messages.bulkDelete({ ...scope, ids });
    removeEmails(ids, request);
    await request;
  }

  async function bulkLabel(labelKey: string, labelName: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const previous = ids.map((id) => ({
      id,
      previousLabel: labels[id]?.label ?? null,
    }));

    setCachedLabels(scope, (current) => {
      const next = { ...current };
      for (const id of ids) next[id] = { label: labelKey, confidence: 100 };
      return next;
    });
    clearSelected();

    try {
      await orpc.mail.labels.setOnMessages({ ...scope, ids, label: labelKey });
      showLabelUndo(labelName, previous, scope);
    } catch {}
  }

  async function bulkMarkRead(read: boolean) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    for (const id of ids) {
      updateEmail(id, { isRead: read });
    }
    clearSelected();
    await orpc.mail.messages.markRead({ ...scope, ids, read });
  }

  const folderLabel = readLaterMode
    ? "Read later"
    : folder.charAt(0).toUpperCase() + folder.slice(1);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r bg-surface border-border">
      {mailboxErrors.length > 0 && (
        <div className="shrink-0 border-b border-border-soft bg-surface px-4.5 py-2 text-[12px] text-faint">
          Couldn't load {mailboxErrors.map((m) => m.mailboxEmail).join(", ")} — try Refresh.
        </div>
      )}
      <div className="shrink-0 border-b px-4.5 pb-3 pt-4.5 border-border-soft">
        <div className="mb-3 flex items-center gap-2">
          <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
          <h1 className="mr-auto text-[22px] font-medium leading-tight tracking-tight font-serif text-foreground">
            {folderLabel}
          </h1>
          {platformAi && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAgentOpen(!agentOpen)}
              aria-label="Toggle AI agent"
              aria-pressed={agentOpen}
              title="AI Agent"
              className={cn(
                "shrink-0",
                agentOpen && "border-primary/40 bg-brand-soft text-primary",
              )}
            >
              <Bot className="size-4" strokeWidth={1.8} />
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(searchQuery);
            }}
            className="w-full rounded-md border py-1.75 pl-8 pr-8 text-[13px] outline-none transition-colors focus:border-[rgba(200,146,42,0.4)] bg-panel border-border text-foreground"
            aria-label="Search emails"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setSearchQuery("");
                runSearch("");
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {urlLabel && (
        <div className="flex shrink-0 items-center gap-2 border-b px-4.5 py-2 bg-brand-soft border-border-soft">
          <span className="text-xs text-brand-text">Filtered by:</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-panel text-brand-text">
            {resolveLabelName(urlLabel, customLabels)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => router.push(mailPath(workspaceSlug, mailboxSlug, folder))}
            className="ml-auto text-faint"
            title="Clear label filter"
          >
            <X />
          </Button>
        </div>
      )}

      {selectedIds.size > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-soft bg-brand-soft px-4.5 py-2">
          <span className="text-xs text-primary">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => bulkMarkRead(true)}
            title="Mark as read"
            className="ml-2 text-[11px] text-muted-foreground"
          >
            <MailOpen className="h-3 w-3" /> Read
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => bulkMarkRead(false)}
            title="Mark as unread"
            className="text-[11px] text-muted-foreground"
          >
            Unread
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  title="Apply label"
                  className="text-[11px] text-muted-foreground"
                >
                  <TagIcon className="h-3 w-3" />
                  Label
                  <ChevronDown className="h-2.5 w-2.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-[1.5px] text-faint">
                Built-in
              </div>
              {LABEL_OPTIONS.map((opt) => (
                <DropdownMenuItem key={opt.key} onClick={() => bulkLabel(opt.key, opt.name)}>
                  <TagIcon className="mr-2 h-3 w-3" strokeWidth={2} style={{ color: opt.mark }} />
                  {opt.name}
                </DropdownMenuItem>
              ))}
              {customLabels.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-[1.5px] text-faint">
                    Custom
                  </div>
                  {customLabels.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => bulkLabel(c.key, c.name)}>
                      <TagIcon
                        className="mr-2 h-3 w-3"
                        strokeWidth={2}
                        style={{ color: customLabelMark(c.color) }}
                      />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setConfirmBulkDelete(true)}
            title="Delete"
            className="text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text dark:hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={clearSelected}
            className="ml-auto text-faint"
            title="Clear selection"
          >
            <X />
          </Button>
        </div>
      ) : readLaterMode ? null : (
        <div
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-soft px-4.5 pt-2 scrollbar-none [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 pb-2 pt-1.5 text-xs transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-faint",
                )}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="ml-auto pb-1 text-xs text-faint">{visibleEmails.length}</div>
        </div>
      )}

      <ScrollArea ref={scrollRootRef} className="flex-1 min-h-0">
        {isLoading && emails.length === 0 ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                // oxlint-disable-next-line react/no-array-index-key --static skeleton placeholders
                key={i}
                className="h-16 animate-pulse rounded-md bg-hover"
              />
            ))}
          </div>
        ) : listError && emails.length === 0 ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-2 py-16 text-faint"
          >
            <p className="text-base font-serif">Couldn't load your {folderLabel.toLowerCase()}</p>
            <span className="text-xs">
              {listError.message || "The request did not go through."}
            </span>
            <Button variant="outline" size="sm" className="mt-2" onClick={retryList}>
              Try again
            </Button>
          </div>
        ) : visibleEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-faint">
            <p className="text-base font-serif">No emails</p>
            <span className="text-xs">
              {activeTab === "all" || readLaterMode
                ? `Your ${folderLabel.toLowerCase()} is empty`
                : `Nothing in this filter`}
            </span>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={isLoading}
                onClick={loadMore}
              >
                {isLoading && <Loader2 className="animate-spin" />}
                Load more
              </Button>
            )}
          </div>
        ) : (
          <div>
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const group = visibleThreads[item.index];
                if (!group) return null;
                const labelKey = labels[group.latest.id]?.label;
                const labelInfo = labelKey ? resolveChipStyle(labelKey, customLabels) : undefined;
                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <EmailRow
                      email={group.latest}
                      threadCount={group.count}
                      labelInfo={labelInfo}
                      isSelected={selectedEmail?.id === group.latest.id}
                      isChecked={selectedIds.has(group.latest.id)}
                      onSelect={handleSelect}
                      onStar={toggleStar}
                      onCheck={(e) => {
                        e.stopPropagation();
                        toggleSelected(group.latest.id);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {hasMore && (
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more…
                </div>
              )}
              {!hasMore && emails.length > 0 && (
                <p className="text-xs text-faint">— end of list —</p>
              )}
            </div>
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? "email" : "emails"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They move to Trash. You can restore them from the Trash folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void bulkDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface EmailRowProps {
  email: Email;
  threadCount?: number;
  labelInfo?: { label: string; bg: string; fg: string };
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (email: Email) => void;
  onStar: (e: React.MouseEvent, email: Email) => void;
  onCheck: (e: React.MouseEvent) => void;
}

function EmailRow({
  email,
  threadCount = 1,
  labelInfo,
  isSelected,
  isChecked,
  onSelect,
  onStar,
  onCheck,
}: EmailRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `email:${email.id}`,
    data: { email },
  });
  const mailboxChip = email.mailboxEmail ? mailboxChipStyle(email.mailboxEmail) : null;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- dnd-kit's attributes give the row role="button" and tabIndex 0; it holds the checkbox button, so it cannot be a <button>
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      onClick={() => onSelect(email)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(email);
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer border-b border-border-soft px-4.5 py-3.5 text-left transition-colors",
        isDragging && "opacity-40",
        isSelected
          ? "bg-selected"
          : !email.isRead
            ? "bg-active hover:bg-active"
            : "bg-transparent hover:bg-hover",
      )}
    >
      {!email.isRead && (
        <span className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r-xs bg-primary" />
      )}

      <div className="mb-1 flex items-baseline justify-between">
        <span
          className={cn(
            "flex max-w-45 items-center gap-1.5 truncate text-[13px] font-medium",
            !email.isRead ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <button
            type="button"
            onClick={onCheck}
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-all",
              isChecked
                ? "border-primary bg-primary"
                : "border-faint bg-transparent hover:border-foreground",
            )}
            aria-label={isChecked ? "Deselect" : "Select"}
          >
            {isChecked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </button>
          <span className="truncate">
            {email.fromName || email.from || getInitials(email.from)}
          </span>
          <button
            type="button"
            onClick={(e) => onStar(e, email)}
            className={cn(
              "transition-opacity hover:opacity-70",
              email.isStarred ? "text-primary opacity-100" : "opacity-30",
            )}
            aria-label={email.isStarred ? "Unstar" : "Star"}
          >
            <Star
              className="size-3.25"
              fill={email.isStarred ? "currentColor" : "none"}
              strokeWidth={2}
            />
          </button>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {threadCount > 1 && (
            <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-medium tabular-nums text-primary">
              {threadCount}
            </span>
          )}
          <span className="text-[11px] tabular-nums text-faint">{formatEmailDate(email.date)}</span>
        </span>
      </div>

      <div
        className={cn(
          "mb-1 truncate text-[13px]",
          !email.isRead ? "font-medium text-foreground" : "font-normal text-muted-foreground",
        )}
      >
        {email.subject}
      </div>

      {email.snippet && <div className="truncate text-[12px] text-faint">{email.snippet}</div>}

      <div className="mt-1.75 flex flex-wrap gap-1.5">
        {mailboxChip && (
          <Tag label={mailboxChip.label} color={mailboxChip.bg} fg={mailboxChip.fg} />
        )}
        {labelInfo && <Tag label={labelInfo.label} color={labelInfo.bg} fg={labelInfo.fg} />}
        <Tag
          label={
            email.provider === "google"
              ? "Gmail"
              : email.provider === "microsoft"
                ? "Outlook"
                : email.provider === "zoho"
                  ? "Zoho"
                  : "Mail"
          }
          color={
            email.provider === "google"
              ? "color-mix(in srgb, var(--brand) 12%, transparent)"
              : email.provider === "microsoft"
                ? "color-mix(in srgb, var(--provider-microsoft) 15%, transparent)"
                : email.provider === "zoho"
                  ? "color-mix(in srgb, var(--provider-zoho) 15%, transparent)"
                  : "color-mix(in srgb, var(--provider-neutral) 12%, transparent)"
          }
          fg={
            email.provider === "google"
              ? "var(--brand-on-tint)"
              : email.provider === "microsoft"
                ? "var(--provider-microsoft)"
                : email.provider === "zoho"
                  ? "var(--provider-zoho)"
                  : "var(--provider-neutral)"
          }
        />
      </div>
    </div>
  );
}

function Tag({ label, color, fg }: { label: string; color: string; fg: string }) {
  return (
    <span
      className="rounded-full px-1.75 py-px text-[10px] font-medium tracking-wider"
      style={{ background: color, color: fg }}
    >
      {label}
    </span>
  );
}
