"use client";

import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@metis/ui/components/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@metis/ui/components/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@metis/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@metis/ui/components/sheet";
import { cn } from "@metis/ui/lib/utils";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useMemberAdmin } from "@/components/members/member-admin";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { stashDriveAction } from "@/drive/pending-open";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { switchWorkspaceHref, useWorkspaces } from "@/hooks/use-workspaces";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { matcherFor } from "@/search/match";
import { caretContext } from "@/search/tokens";
import type { SavedSearch, SearchSuggestion } from "@/server/schema";
import { useSearchStore } from "@/store/search-store";
import {
  ALL_CALENDARS_SLUG,
  ALL_ADDRESS_BOOKS_SLUG,
  ALL_DRIVES_SLUG,
  ALL_MAILBOXES_SLUG,
  drivePath,
  driveRootPath,
} from "@/workspace/path";

import { type ActionContext, actionsFor, type SearchAction } from "./actions";
import { type ClientEntry, clientEntries, filterEntries } from "./entries";
import { eventKey, fileKey, groupItems, mailKey, type SearchItem } from "./items";
import { composeMail, newEventWith } from "./navigate";
import { SearchPreview } from "./preview";
import { useSearchPrompts } from "./prompts";
import { qualifier } from "./queries";
import { describe, ResultRow } from "./result-row";
import { SearchInput, type SearchInputHandle, type SearchKey } from "./search-input";
import { buildSuggestions, REMOTE_SUGGEST_KEYS } from "./suggestions";
import { useSearch } from "./use-search";

const RECENT_LIMIT = 8;
const SUGGEST_DEBOUNCE_MS = 200;
const NO_SAVED: SavedSearch[] = [];

const TOGGLES: { id: string; label: string; text: string }[] = [
  { id: "mail", label: "Mail", text: "type:mail" },
  { id: "events", label: "Events", text: "type:event" },
  { id: "files", label: "Files", text: "type:file" },
  { id: "chats", label: "Chats", text: "type:chat" },
  { id: "people", label: "People", text: "(type:member OR type:contact)" },
  { id: "workflows", label: "Workflows", text: "(type:workflow OR type:run)" },
  {
    id: "workspace",
    label: "Workspace",
    text: "(type:mailbox OR type:calendar OR type:drive OR type:addressbook OR type:mail-folder OR type:label OR type:connection)",
  },
  {
    id: "commands",
    label: "Commands",
    text: "(type:command OR type:setting OR type:workspace)",
  },
];

function recentKey(workspaceSlug: string) {
  return `metis:search:recent:${workspaceSlug}`;
}

function readRecent(workspaceSlug: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(workspaceSlug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(workspaceSlug: string, list: string[]) {
  try {
    window.localStorage.setItem(recentKey(workspaceSlug), JSON.stringify(list));
  } catch {}
}

const RESOURCE_GROUP_LABELS = {
  mailbox: "Mailboxes",
  calendar: "Calendars",
  drive: "Drives",
  addressbook: "Address books",
} as const;

function withoutToggles(query: string): string {
  let next = query;
  for (const toggle of TOGGLES) next = next.replace(toggle.text, " ");
  return next.replace(/\s+/g, " ").trim();
}

function prefillFor(path: ReturnType<typeof useWorkspacePath>): string {
  if (path.section === "mail" && path.mailboxSlug) {
    return path.mailboxSlug === ALL_MAILBOXES_SLUG
      ? ""
      : `${qualifier("mailbox", path.mailboxSlug)} `;
  }
  if (path.section === "calendar" && path.calendarSlug) {
    return path.calendarSlug === ALL_CALENDARS_SLUG
      ? ""
      : `${qualifier("calendar", path.calendarSlug)} `;
  }
  if (path.section === "drive" && path.driveSlug) {
    return path.driveSlug === ALL_DRIVES_SLUG ? "" : `${qualifier("drive", path.driveSlug)} `;
  }
  if (path.section === "contacts" && path.addressBookSlug) {
    return path.addressBookSlug === ALL_ADDRESS_BOOKS_SLUG
      ? ""
      : `${qualifier("addressbook", path.addressBookSlug)} `;
  }
  return "";
}

function Shell({
  mobile,
  open,
  onOpenChange,
  children,
}: {
  mobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean, details: DialogPrimitive.Root.ChangeEventDetails) => void;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-dvh gap-0 p-0 data-[side=bottom]:h-dvh"
        >
          <SheetTitle className="sr-only">Search</SheetTitle>
          <SheetDescription className="sr-only">
            Search mail, events, files, chats, people and everything else in this workspace.
          </SheetDescription>
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search mail, events, files, chats, people and everything else in this workspace.
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function SearchDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const path = useWorkspacePath();
  const workspaceSlug = useWorkspaceSlug();
  const mobile = useIsMobile();
  const access = useWorkspaceAccess();
  const platformAi = usePlatformPolicy().ai;
  const ai = platformAi && access.workspaceAi;
  const { resolvedTheme, setTheme } = useTheme();
  const { workspaces } = useWorkspaces();
  const { open, query, seeded, closeSearch, setQuery } = useSearchStore();
  const inputRef = useRef<SearchInputHandle>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [caret, setCaret] = useState(0);
  const [chosenActive, setActive] = useState("");
  const [page, setPage] = useState<SearchItem | null>(null);
  const [chosenAction, setActionActive] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestFor, setSuggestFor] = useState<{ key: string; prefix: string } | null>(null);
  const suggestQuery = useQuery(
    rpc.search.suggest.queryOptions({
      input: suggestFor ? { workspaceSlug, ...suggestFor } : skipToken,
    }),
  );
  const suggested = suggestQuery.data;
  const remote = useMemo(
    (): { key: string; prefix: string; values: SearchSuggestion[] } | null =>
      suggestFor && suggested ? { ...suggestFor, values: suggested.values } : null,
    [suggestFor, suggested],
  );

  const results = useSearch(workspaceSlug, query, open);
  const { prompts, elements: promptElements } = useSearchPrompts(workspaceSlug);
  const current = workspaces.find((w) => w.slug === workspaceSlug);
  const admin = useMemberAdmin({
    workspaceSlug,
    workspaceName: current?.name ?? "this workspace",
    role: access.role,
    selfUserId: access.userId,
    onChange: results.refresh,
  });

  const savedQuery = useQuery(
    rpc.search.saved.list.queryOptions({ input: { workspaceSlug }, enabled: open }),
  );
  const saved: SavedSearch[] = savedQuery.data?.searches ?? NO_SAVED;
  const loadSaved = useCallback(() => {
    void refreshQuery(rpc.search.saved.list.queryKey({ input: { workspaceSlug } }));
  }, [workspaceSlug]);

  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setRecent(readRecent(workspaceSlug));
    setPage(null);
    if (!seeded) {
      const prefill = prefillFor(path);
      setQuery(prefill);
      if (prefill) {
        requestAnimationFrame(() => inputRef.current?.setText(prefill, true));
      }
    }
  }, [open, seeded, path, setQuery, workspaceSlug]);

  const remember = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const next = [trimmed, ...readRecent(workspaceSlug).filter((q) => q !== trimmed)].slice(
        0,
        RECENT_LIMIT,
      );
      writeRecent(workspaceSlug, next);
      setRecent(next);
    },
    [workspaceSlug],
  );

  const context = useMemo(() => caretContext(query, caret), [query, caret]);
  const remoteKey =
    context?.mode === "value" && REMOTE_SUGGEST_KEYS.has(context.key) ? context.key : null;
  const remotePrefix = context?.prefix ?? "";

  useEffect(() => {
    if (!remoteKey) return;
    const timer = setTimeout(
      () => setSuggestFor({ key: remoteKey, prefix: remotePrefix }),
      SUGGEST_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [remoteKey, remotePrefix]);

  const suggestions = useMemo(
    () =>
      buildSuggestions(
        context,
        results.ast,
        remote && context?.mode === "value" && remote.key === context.key ? remote.values : null,
      ),
    [context, results.ast, remote],
  );

  const entries = useMemo(
    () =>
      clientEntries({
        workspaceSlug,
        ai,
        hasDashboard: access.hasDashboard,
        isAdmin: access.role === "owner" || access.role === "admin",
        dark: resolvedTheme === "dark",
        saved: saved.map((s) => ({ id: s.id, name: s.name, query: s.query })),
        workspaces: workspaces.map((w) => ({
          name: w.name,
          slug: w.slug,
          href: switchWorkspaceHref(pathname, w),
          current: w.slug === workspaceSlug,
        })),
      }),
    [
      workspaceSlug,
      ai,
      access.hasDashboard,
      access.role,
      resolvedTheme,
      saved,
      workspaces,
      pathname,
    ],
  );

  const trimmed = query.trim();
  const items = useMemo<SearchItem[]>(() => {
    const out: SearchItem[] = suggestions.map((suggestion) => ({
      key: `suggestion:${suggestion.value}`,
      source: "suggestion",
      suggestion,
    }));
    if (!trimmed) {
      out.push(
        ...saved.map((s): SearchItem => ({
          key: `saved:${s.id}`,
          source: "saved",
          id: s.id,
          name: s.name,
          query: s.query,
        })),
        ...recent.map((q): SearchItem => ({
          key: `recent:${q}`,
          source: "recent",
          query: q,
        })),
        ...entries
          .filter((e) => e.kind === "command" && !e.id.startsWith("command:saved:"))
          .map((entry): SearchItem => ({
            key: entry.id,
            source: "client",
            entry,
          })),
      );
      return out;
    }
    out.push(
      ...results.mail.items.map((hit): SearchItem => ({ key: mailKey(hit), source: "mail", hit })),
    );
    if (results.mail.more) {
      out.push({ key: "more:mail", source: "more", kind: "mail" });
    }
    out.push(
      ...results.event.items.map((hit): SearchItem => ({
        key: eventKey(hit),
        source: "event",
        hit,
      })),
      ...results.file.items.map((hit): SearchItem => ({ key: fileKey(hit), source: "file", hit })),
    );
    if (results.file.more) {
      out.push({ key: "more:file", source: "more", kind: "file" });
    }
    out.push(
      ...results.local.items.map((hit): SearchItem => ({
        key: `local:${hit.id}`,
        source: "local",
        hit,
      })),
      ...filterEntries(entries, results.ast, results.kinds, results.timeZone).map(
        (entry): SearchItem => ({ key: entry.id, source: "client", entry }),
      ),
    );
    return out;
  }, [suggestions, trimmed, saved, recent, entries, results]);

  const groups = useMemo(() => groupItems(items), [items]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const active = flat.some((item) => item.key === chosenActive)
    ? chosenActive
    : (flat[0]?.key ?? "");

  const selected = useMemo(
    () => (page ? page : (flat.find((item) => item.key === active) ?? null)),
    [page, flat, active],
  );

  const matcher = useMemo(
    () => (results.ast ? matcherFor(results.ast, results.timeZone) : null),
    [results.ast, results.timeZone],
  );

  const close = useCallback(() => {
    setPage(null);
    closeSearch();
  }, [closeSearch]);

  const runClient = useCallback(
    (entry: ClientEntry) => {
      const run = entry.run;
      switch (run.type) {
        case "href":
        case "switch":
          router.push(run.href);
          close();
          return;
        case "compose":
          composeMail(router, workspaceSlug, {});
          close();
          return;
        case "new-event":
          newEventWith(router, workspaceSlug, []);
          close();
          return;
        case "upload":
          uploadRef.current?.click();
          return;
        case "new-folder":
          stashDriveAction({ kind: "folder" });
          router.push(
            path.driveSlug
              ? drivePath(workspaceSlug, path.driveSlug, path.drivePath)
              : driveRootPath(workspaceSlug),
          );
          close();
          return;
        case "theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          return;
        case "query":
          setQuery(run.query);
          return;
      }
    },
    [router, workspaceSlug, close, path, setTheme, resolvedTheme, setQuery],
  );

  const actionContext: ActionContext = useMemo(
    () => ({
      router,
      workspaceSlug,
      role: access.role,
      ai,
      prompts,
      admin,
      setQuery: (q: string) => {
        setPage(null);
        setQuery(q);
      },
      close,
      refresh: results.refresh,
      runClient,
    }),
    [
      router,
      workspaceSlug,
      access.role,
      ai,
      prompts,
      admin,
      setQuery,
      close,
      results.refresh,
      runClient,
    ],
  );

  const actions = useMemo<SearchAction[]>(
    // oxlint-disable-next-line react/refs -- actionsFor only captures the context callbacks in each action's run, which reads refs on click, not during render
    () => (selected ? actionsFor(actionContext, selected) : []),
    [selected, actionContext],
  );

  const actionActive =
    page && !actions.some((a) => a.id === chosenAction) ? (actions[0]?.id ?? "") : chosenAction;

  const runAction = useCallback(
    async (action: SearchAction) => {
      if (trimmed) remember(trimmed);
      try {
        await action.run();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not work");
      }
      if (!action.keepOpen) close();
    },
    [trimmed, remember, close],
  );

  const accept = useCallback((item: SearchItem) => {
    if (item.source !== "suggestion") return false;
    inputRef.current?.replace(item.suggestion.start, item.suggestion.end, item.suggestion.value);
    return true;
  }, []);

  const choose = useCallback(
    (item: SearchItem) => {
      if (accept(item)) return;
      if (item.source === "more") {
        results.loadMore(item.kind);
        return;
      }
      const list = actionsFor(actionContext, item);
      const primary = list[0];
      if (primary) void runAction(primary);
    },
    [accept, results, actionContext, runAction],
  );

  const openActions = useCallback(
    (item: SearchItem | null) => {
      if (!item || item.source === "suggestion" || item.source === "more") {
        return false;
      }
      if (actionsFor(actionContext, item).length === 0) return false;
      setActive(item.key);
      setPage(item);
      return true;
    },
    [actionContext],
  );

  const move = useCallback(
    (delta: number) => {
      if (page) {
        const index = actions.findIndex((a) => a.id === actionActive);
        const next = actions[(index + delta + actions.length) % actions.length];
        if (next) setActionActive(next.id);
        return;
      }
      if (flat.length === 0) return;
      const index = flat.findIndex((item) => item.key === active);
      const next = flat[(index + delta + flat.length) % flat.length];
      if (next) setActive(next.key);
    },
    [page, actions, actionActive, flat, active],
  );

  const onKey = useCallback(
    (key: SearchKey): boolean => {
      switch (key) {
        case "down":
          move(1);
          return true;
        case "up":
          move(-1);
          return true;
        case "enter": {
          if (page) {
            const action = actions.find((a) => a.id === actionActive);
            if (action) void runAction(action);
            return true;
          }
          const item = flat.find((i) => i.key === active);
          if (item) choose(item);
          else results.runNow();
          return true;
        }
        case "mod-enter":
          return openActions(flat.find((i) => i.key === active) ?? null);
        case "tab": {
          const item = flat.find((i) => i.key === active);
          if (item?.source === "suggestion") return accept(item);
          const first = flat.find((i) => i.source === "suggestion");
          if (first) return accept(first);
          return openActions(item ?? null);
        }
        case "right":
          return openActions(flat.find((i) => i.key === active) ?? null);
        case "escape":
          return false;
      }
    },
    [
      move,
      page,
      actions,
      actionActive,
      runAction,
      flat,
      active,
      choose,
      results,
      openActions,
      accept,
    ],
  );

  const activeToggle = TOGGLES.find((t) => query.includes(t.text));

  const toggle = (id: string) => {
    const target = TOGGLES.find((t) => t.id === id);
    if (!target) return;
    const rest = withoutToggles(query);
    const next = activeToggle?.id === id ? rest : `${target.text} ${rest}`.trim();
    setQuery(next ? `${next} ` : "");
    inputRef.current?.focus();
  };

  const [resources, setResources] = useState<
    { key: keyof typeof RESOURCE_GROUP_LABELS; values: SearchSuggestion[] }[]
  >([]);
  const loadResources = () => {
    void Promise.all(
      (["mailbox", "calendar", "drive", "addressbook"] as const).map((key) =>
        orpc.search
          .suggest({ workspaceSlug, key, prefix: "" })
          .then((res) => ({ key, values: res.values }))
          .catch(() => ({ key, values: [] })),
      ),
    ).then(setResources);
  };

  const addFilter = (text: string) => {
    const base = query.trim();
    setQuery(`${base ? `${base} ` : ""}${text} `);
    inputRef.current?.focus();
  };

  const saveCurrent = async () => {
    const name = await prompts.askText({
      title: "Save this search",
      label: "Name",
      initial: trimmed.slice(0, 40),
      confirm: "Save",
    });
    if (!name) return;
    try {
      await orpc.search.saved.create({ workspaceSlug, name, query: trimmed });
      toast.success("Search saved");
      loadSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };

  const removeSaved = async (id: string) => {
    try {
      await orpc.search.saved.delete({ workspaceSlug, id });
      loadSaved();
    } catch {
      toast.error("Could not remove that search");
    }
  };

  const removeRecent = (q: string) => {
    const next = readRecent(workspaceSlug).filter((r) => r !== q);
    writeRecent(workspaceSlug, next);
    setRecent(next);
  };

  const diagnostic = results.diagnostics[0];
  const errors = [
    ...results.mail.errors,
    ...results.event.errors,
    ...results.file.errors,
    ...results.local.errors,
  ];
  const nothing =
    !!results.ran &&
    !results.loading &&
    trimmed === results.ran &&
    flat.filter((i) => i.source !== "suggestion").length === 0;

  return (
    <Shell
      mobile={mobile}
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        if (page && details.reason === "escape-key") {
          details.cancel();
          setPage(null);
          return;
        }
        close();
      }}
    >
      <Command
        shouldFilter={false}
        vimBindings={false}
        loop
        value={page ? actionActive : active}
        onValueChange={(value) => (page ? setActionActive(value) : setActive(value))}
        className="flex h-full min-h-0 flex-col rounded-none! bg-popover p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          {page ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to results"
              onClick={() => setPage(null)}
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Search className="size-4 shrink-0 text-faint" />
          )}
          <SearchInput
            ref={inputRef}
            value={query}
            timeZone={results.timeZone}
            label="Search this workspace"
            placeholder="Search everything…  try from:ana, type:file, after:7d"
            onChange={(text, at) => {
              setPage(null);
              setQuery(text);
              setCaret(at);
            }}
            onCaret={setCaret}
            onKey={onKey}
          />
          {results.loading && <Loader2 className="size-4 shrink-0 animate-spin text-faint" />}
          {trimmed && !diagnostic && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Save this search"
              onClick={() => void saveCurrent()}
            >
              <Bookmark className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={close}>
            <X className="size-4" />
          </Button>
        </div>

        {results.incomplete ? (
          <p className="border-b border-border px-4 py-1.5 text-[12px] text-faint">
            Finish the search: close every quote and parenthesis.
          </p>
        ) : diagnostic ? (
          <p
            role="alert"
            className="border-b border-border bg-destructive/8 px-4 py-1.5 text-[12px] text-destructive-text"
          >
            {diagnostic.message}
          </p>
        ) : null}

        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2 [scrollbar-width:none]">
          {TOGGLES.map((t) => (
            <Button
              key={t.id}
              variant={activeToggle?.id === t.id ? "tinted" : "ghost"}
              size="xs"
              aria-pressed={activeToggle?.id === t.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggle(t.id)}
            >
              {t.label}
            </Button>
          ))}
          <DropdownMenu
            onOpenChange={(next) => {
              if (next) loadResources();
            }}
          >
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="xs">
                  In a resource
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
            <DropdownMenuContent
              align="start"
              className="w-64"
              finalFocus={() => {
                inputRef.current?.focus();
                return false;
              }}
            >
              {resources.map((group) =>
                group.values.length === 0 ? null : (
                  <DropdownMenuGroup key={group.key}>
                    <DropdownMenuLabel>{RESOURCE_GROUP_LABELS[group.key]}</DropdownMenuLabel>
                    {group.values.map((value) => (
                      <DropdownMenuItem
                        key={`${group.key}:${value.value}`}
                        onClick={() => addFilter(qualifier(group.key, value.value))}
                      >
                        <span className="truncate">{value.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1">
          <CommandList
            className={cn(
              "max-h-none min-h-0 flex-1 overflow-y-auto px-2 py-2",
              !mobile && "max-w-[44%] border-r border-border",
            )}
          >
            {page ? (
              <CommandGroup heading={describe(page).title}>
                {actions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    onSelect={() => void runAction(action)}
                    className={cn("gap-2.5 py-2", action.destructive && "text-destructive-text")}
                  >
                    <action.icon className="size-4" />
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <>
                {groups.map((group) => (
                  <CommandGroup key={group.kind} heading={group.label}>
                    {group.items.map((item) => (
                      <ResultRow
                        key={item.key}
                        item={item}
                        matcher={
                          item.source === "suggestion" ||
                          item.source === "recent" ||
                          item.source === "saved"
                            ? null
                            : matcher
                        }
                        compact={false}
                        onSelect={() => {
                          setActive(item.key);
                          choose(item);
                        }}
                        onActions={
                          item.source === "suggestion" || item.source === "more"
                            ? undefined
                            : () => openActions(item)
                        }
                        onRemove={
                          item.source === "saved"
                            ? () => void removeSaved(item.id)
                            : item.source === "recent"
                              ? () => removeRecent(item.query)
                              : undefined
                        }
                      />
                    ))}
                  </CommandGroup>
                ))}
                {nothing && (
                  <p className="px-3 py-8 text-center text-[13px] text-faint">
                    Nothing matched that search.
                  </p>
                )}
                {!trimmed && groups.length === 0 && (
                  <p className="px-3 py-8 text-center text-[13px] text-faint">
                    Type to search mail, events, files, chats, people and more.
                  </p>
                )}
                {errors.length > 0 && (
                  <p className="px-3 py-2 text-[11px] text-faint">
                    Some places could not be searched: {errors.join(" · ")}
                  </p>
                )}
              </>
            )}
          </CommandList>
          {!mobile && (
            <aside aria-label="Preview" className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
              <SearchPreview workspaceSlug={workspaceSlug} item={selected} onNavigate={close} />
            </aside>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-1.5 text-[11px] text-faint max-md:hidden">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Tab or → for actions</span>
          <span>Esc to close</span>
        </div>
        <input
          ref={uploadRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length === 0) return;
            stashDriveAction({ kind: "upload", files });
            router.push(
              path.driveSlug
                ? drivePath(workspaceSlug, path.driveSlug, path.drivePath)
                : driveRootPath(workspaceSlug),
            );
            close();
          }}
        />
      </Command>
      {promptElements}
      {admin.dialogs}
    </Shell>
  );
}
