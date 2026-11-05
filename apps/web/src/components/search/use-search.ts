"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { viewerTimeZone } from "@/calendar/layout";
import { rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { ParserAst } from "@/search/ast";
import { REMOTE_KINDS, type SearchKind } from "@/search/fields";
import { kindsFor } from "@/search/kinds";
import { isEmptySearch, parseSearch, type SearchDiagnostic } from "@/search/query";
import type {
  EventSearchHitDto,
  FileSearchHitDto,
  LocalSearchHit,
  MailSearchHitDto,
} from "@/server/schema";
import type { DriveSourceError } from "@/types/drive";

const DEBOUNCE_MS = 300;

interface Slot<T> {
  items: T[];
  loading: boolean;
  more: boolean;
  errors: string[];
}

function empty<T>(): Slot<T> {
  return { items: [], loading: false, more: false, errors: [] };
}

export interface SearchResults {
  timeZone: string;
  ast: ParserAst | null;
  diagnostics: SearchDiagnostic[];
  incomplete: boolean;
  kinds: SearchKind[];
  ran: string;
  mail: Slot<MailSearchHitDto>;
  event: Slot<EventSearchHitDto>;
  file: Slot<FileSearchHitDto>;
  local: Slot<LocalSearchHit>;
  loading: boolean;
  runNow: () => void;
  loadMore: (kind: "mail" | "file") => void;
  refresh: () => void;
}

function message(err: Error): string {
  return err.message || "Search failed";
}

function slot<T>(
  active: boolean,
  query: { isFetching: boolean; error: Error | null },
  items: T[] | undefined,
  more: boolean,
  errors: string[] | undefined,
): Slot<T> {
  if (!active) return empty();
  if (query.error && !items) return { ...empty<T>(), errors: [message(query.error)] };
  return { items: items ?? [], loading: query.isFetching, more, errors: errors ?? [] };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function driveErrorLines(errors: DriveSourceError[]): string[] {
  const seen = new Set<string>();
  return errors
    .filter((e) => {
      if (seen.has(e.driveId)) return false;
      seen.add(e.driveId);
      return true;
    })
    .map((e) => `${e.email}: ${e.message}`);
}

export function useSearch(workspaceSlug: string, query: string, enabled: boolean): SearchResults {
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const parsed = useMemo(() => parseSearch(query.trim(), timeZone), [query, timeZone]);
  const ast =
    parsed.ok && parsed.diagnostics.length === 0 && !isEmptySearch(parsed.ast) ? parsed.ast : null;
  const kinds = useMemo(() => (ast ? kindsFor(ast) : []), [ast]);

  const [ran, setRan] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const text = ast ? query.trim() : "";
    const timer = setTimeout(() => setRan(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, ast, query]);

  const ranKinds = useMemo(() => {
    const ranParsed = parseSearch(ran, timeZone);
    return ranParsed.ok && !isEmptySearch(ranParsed.ast) ? kindsFor(ranParsed.ast) : [];
  }, [ran, timeZone]);
  const remote: readonly SearchKind[] = REMOTE_KINDS;
  const live = enabled && Boolean(ran);
  const wantsMail = live && ranKinds.includes("mail");
  const wantsEvent = live && ranKinds.includes("event");
  const wantsFile = live && ranKinds.includes("file");
  const wantsLocal =
    live &&
    ranKinds.some(
      (k) => !remote.includes(k) && k !== "command" && k !== "setting" && k !== "workspace",
    );
  const input = { workspaceSlug, q: ran, timeZone };

  const mailQuery = useInfiniteQuery(
    rpc.search.mail.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...input, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextPageToken ?? undefined,
      enabled: wantsMail,
    }),
  );
  const eventQuery = useQuery(rpc.search.events.queryOptions({ input, enabled: wantsEvent }));
  const fileQuery = useInfiniteQuery(
    rpc.search.files.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...input, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.cursor ?? undefined,
      enabled: wantsFile,
    }),
  );
  const localQuery = useQuery(rpc.search.local.queryOptions({ input, enabled: wantsLocal }));

  const mailPages = mailQuery.data?.pages;
  const mail = slot(
    wantsMail,
    mailQuery,
    mailPages && uniqueById(mailPages.flatMap((page) => page.emails)),
    mailQuery.hasNextPage,
    mailPages?.[0]?.mailboxErrors?.map((e) => `${e.mailboxEmail}: ${e.error}`),
  );
  const event = slot(
    wantsEvent,
    eventQuery,
    eventQuery.data?.events,
    false,
    eventQuery.data?.calendarErrors?.map((e) => `${e.accountName ?? e.accountEmail}: ${e.error}`),
  );
  const filePages = fileQuery.data?.pages;
  const file = slot(
    wantsFile,
    fileQuery,
    filePages?.flatMap((page) => page.entries),
    fileQuery.hasNextPage,
    filePages && driveErrorLines(filePages.flatMap((page) => page.driveErrors ?? [])),
  );
  const local = slot(wantsLocal, localQuery, localQuery.data?.hits, false, localQuery.data?.errors);

  const { fetchNextPage: nextMail } = mailQuery;
  const { fetchNextPage: nextFiles } = fileQuery;
  const refresh = useCallback(() => {
    if (wantsMail) void refreshQueries(rpc.search.mail.key());
    if (wantsEvent) void refreshQueries(rpc.search.events.key());
    if (wantsFile) void refreshQueries(rpc.search.files.key());
    if (wantsLocal) void refreshQueries(rpc.search.local.key());
  }, [wantsMail, wantsEvent, wantsFile, wantsLocal]);

  const runNow = useCallback(() => {
    const text = ast ? query.trim() : "";
    if (text === ran) refresh();
    else setRan(text);
  }, [ast, query, ran, refresh]);

  const loadMore = useCallback(
    (kind: "mail" | "file") => {
      const target = kind === "mail" ? mail : file;
      if (!target.more || target.loading) return;
      void (kind === "mail" ? nextMail() : nextFiles());
    },
    [mail, file, nextMail, nextFiles],
  );

  return {
    timeZone,
    ast,
    diagnostics: parsed.diagnostics,
    incomplete: !parsed.ok && parsed.incomplete,
    kinds,
    ran,
    mail,
    event,
    file,
    local,
    loading: mail.loading || event.loading || file.loading || local.loading,
    runNow,
    loadMore,
    refresh,
  };
}
