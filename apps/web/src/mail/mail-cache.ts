"use client";

import {
  hashKey,
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient, refreshQueries, refreshQuery } from "@/lib/query-client";
import type { MailboxScope, MailListState } from "@/server/schema";
import type { Email, MailFolder } from "@/types/mail";

const PAGE_SIZE = 100;

type ListPage = Awaited<ReturnType<typeof orpc.mail.messages.list>>;
type SearchResult = Awaited<ReturnType<typeof orpc.mail.messages.search>>;
type SavedEmails = Awaited<ReturnType<typeof orpc.mail.readLater.listEmails>>;
type LabelMap = Awaited<ReturnType<typeof orpc.mail.labels.getMap>>["labels"];

const NO_EMAILS: Email[] = [];
const NO_ERRORS: NonNullable<ListPage["mailboxErrors"]> = [];

const removals = new Map<string, number | null>();

function refreshMessageRows() {
  void refreshQueries(rpc.mail.labels.getMap.key());
  void refreshQueries(rpc.mail.readLater.key());
}

export function refreshMessageRowsAfter(request?: Promise<unknown>) {
  request?.then(refreshMessageRows, refreshMessageRows);
}

export function holdRemoved(ids: string[], request?: Promise<unknown>) {
  for (const id of ids) removals.set(id, null);
  const settle = () => {
    const at = Date.now();
    for (const id of ids) if (removals.get(id) === null) removals.set(id, at);
  };
  if (request) request.then(settle, settle);
  else settle();
}

function withoutRemoved(emails: Email[], startedAt: number): Email[] {
  for (const [id, settledAt] of removals) {
    if (settledAt !== null && settledAt <= startedAt) removals.delete(id);
  }
  return emails.filter((e) => !removals.has(e.id));
}

export function mailListOptions(scope: MailboxScope, folder: MailFolder) {
  return {
    ...rpc.mail.messages.list.infiniteOptions({
      input: (pageToken: string | undefined) => ({ ...scope, folder, pageToken, limit: PAGE_SIZE }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextPageToken ?? undefined,
      staleTime: Infinity,
    }),
    queryFn: async ({
      pageParam,
      signal,
    }: {
      pageParam: string | undefined;
      signal: AbortSignal;
    }): Promise<ListPage> => {
      const startedAt = Date.now();
      const page = await orpc.mail.messages.list(
        { ...scope, folder, pageToken: pageParam, limit: PAGE_SIZE },
        { signal },
      );
      return { ...page, emails: withoutRemoved(page.emails ?? [], startedAt) };
    },
  };
}

export function mailSearchOptions(scope: MailboxScope, q: string) {
  return {
    ...rpc.mail.messages.search.queryOptions({ input: { ...scope, q }, staleTime: Infinity }),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SearchResult> => {
      const startedAt = Date.now();
      const result = await orpc.mail.messages.search({ ...scope, q }, { signal });
      return { ...result, emails: withoutRemoved(result.emails ?? [], startedAt) };
    },
  };
}

export function useMailList(
  scope: MailboxScope,
  folder: MailFolder,
  search: string,
  fetching = true,
) {
  const list = useInfiniteQuery({
    ...mailListOptions(scope, folder),
    enabled: fetching && !search,
  });
  const searched = useQuery({
    ...mailSearchOptions(scope, search),
    enabled: fetching && Boolean(search),
  });
  const pages = list.data?.pages;
  const listed = useMemo(() => pages?.flatMap((page) => page.emails) ?? NO_EMAILS, [pages]);
  const { isFetching, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (!isFetching) void fetchNextPage();
  }, [isFetching, fetchNextPage]);

  if (search) {
    return {
      emails: searched.data?.emails ?? NO_EMAILS,
      loading: searched.isFetching,
      hasMore: false,
      loadMore,
      mailboxErrors: searched.data?.mailboxErrors ?? NO_ERRORS,
      error: searched.data ? null : searched.error,
      retry: () => void searched.refetch(),
    };
  }
  return {
    emails: listed,
    loading: isFetching,
    hasMore: list.hasNextPage,
    loadMore,
    mailboxErrors: pages?.[0]?.mailboxErrors ?? NO_ERRORS,
    error: pages ? null : list.error,
    retry: () => void list.refetch(),
  };
}

type PagedQueryFn = (context: {
  pageParam: string | undefined;
  signal: AbortSignal;
}) => Promise<ListPage>;

function pagedQueryFn(
  load: (pageToken: string | undefined, signal: AbortSignal) => Promise<ListPage>,
): PagedQueryFn {
  return async ({ pageParam, signal }) => {
    const startedAt = Date.now();
    const page = await load(pageParam, signal);
    return { ...page, emails: withoutRemoved(page.emails ?? [], startedAt) };
  };
}

function stateListOptions(scope: MailboxScope, folder: MailFolder, state: MailListState) {
  return {
    ...rpc.mail.messages.listInState.infiniteOptions({
      input: (pageToken: string | undefined) => ({ ...scope, folder, state, pageToken }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextPageToken ?? undefined,
      staleTime: Infinity,
    }),
    queryFn: pagedQueryFn((pageToken, signal) =>
      orpc.mail.messages.listInState({ ...scope, folder, state, pageToken }, { signal }),
    ),
  };
}

function labelListOptions(scope: MailboxScope, label: string) {
  return {
    ...rpc.mail.labels.listEmails.infiniteOptions({
      input: (pageToken: string | undefined) => ({ ...scope, label, pageToken }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextPageToken ?? undefined,
      staleTime: Infinity,
    }),
    queryFn: pagedQueryFn((pageToken, signal) =>
      orpc.mail.labels.listEmails({ ...scope, label, pageToken }, { signal }),
    ),
  };
}

function usePagedEmails(list: {
  data?: InfiniteData<ListPage>;
  isFetching: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  error: Error | null;
  refetch: () => Promise<unknown>;
}) {
  const pages = list.data?.pages;
  const emails = useMemo(() => pages?.flatMap((page) => page.emails) ?? NO_EMAILS, [pages]);
  const { isFetching, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (!isFetching) void fetchNextPage();
  }, [isFetching, fetchNextPage]);
  return {
    emails,
    loading: isFetching,
    hasMore: list.hasNextPage,
    loadMore,
    mailboxErrors: pages?.[0]?.mailboxErrors ?? NO_ERRORS,
    error: pages ? null : list.error,
    retry: () => void list.refetch(),
  };
}

export type ListSource =
  | { kind: "folder" }
  | { kind: "read-later" }
  | { kind: "label"; label: string }
  | { kind: "state"; state: MailListState };

export function listSource(
  readLater: boolean,
  label: string | null,
  tab: string | undefined,
): ListSource {
  if (readLater) return { kind: "read-later" };
  if (label) return { kind: "label", label };
  if (tab === "unread" || tab === "starred") return { kind: "state", state: tab };
  return { kind: "folder" };
}

let shownList: string | null = null;

export function refreshListOnSwitch(scope: MailboxScope, folder: MailFolder, source: ListSource) {
  const key = JSON.stringify([scope.workspaceSlug, scope.mailboxSlug, folder, source]);
  if (key === shownList) return;
  shownList = key;
  const queryKey =
    source.kind === "state"
      ? stateListOptions(scope, folder, source.state).queryKey
      : source.kind === "label"
        ? labelListOptions(scope, source.label).queryKey
        : null;
  if (!queryKey || !getQueryClient().getQueryData(queryKey)) return;
  void refreshQuery(queryKey);
}

export function useEmailSource(
  scope: MailboxScope,
  folder: MailFolder,
  source: ListSource,
  search: string,
  fetching = true,
) {
  const paged = !search && (source.kind === "label" || source.kind === "state");
  const folderList = useMailList(
    scope,
    folder,
    search,
    fetching && source.kind !== "read-later" && !paged,
  );
  const savedList = useReadLaterList(scope, search, fetching && source.kind === "read-later");
  const labelList = usePagedEmails(
    useInfiniteQuery({
      ...labelListOptions(scope, source.kind === "label" ? source.label : ""),
      enabled: fetching && paged && source.kind === "label",
    }),
  );
  const stateList = usePagedEmails(
    useInfiniteQuery({
      ...stateListOptions(scope, folder, source.kind === "state" ? source.state : "unread"),
      enabled: fetching && paged && source.kind === "state",
    }),
  );
  if (source.kind === "read-later") return savedList;
  if (paged && source.kind === "label") return labelList;
  if (paged && source.kind === "state") return stateList;
  return folderList;
}

export async function refreshMailListHead(scope: MailboxScope, folder: MailFolder) {
  const client = getQueryClient();
  const { queryKey } = mailListOptions(scope, folder);
  if (!client.getQueryData(queryKey) || client.isFetching({ queryKey }) > 0) return;
  const startedAt = Date.now();
  const page = await orpc.mail.messages.list({ ...scope, folder, limit: PAGE_SIZE });
  const incoming = withoutRemoved(page.emails ?? [], startedAt);
  if (incoming.length === 0) return;
  client.setQueryData(queryKey, (old) => {
    if (!old) return old;
    const byId = new Map(incoming.map((e) => [e.id, e]));
    const known = new Set(old.pages.flatMap((p) => p.emails.map((e) => e.id)));
    const fresh = incoming.filter((e) => !known.has(e.id));
    return {
      ...old,
      pages: old.pages.map((p, index) => ({
        ...p,
        ...(index === 0 ? { mailboxErrors: page.mailboxErrors } : {}),
        emails: [...(index === 0 ? fresh : []), ...p.emails.map((e) => byId.get(e.id) ?? e)],
      })),
    };
  });
}

export async function refetchMailLists() {
  const client = getQueryClient();
  await Promise.all(
    [
      rpc.mail.messages.list.key({ type: "infinite" }),
      rpc.mail.messages.listInState.key({ type: "infinite" }),
      rpc.mail.labels.listEmails.key({ type: "infinite" }),
    ].map((queryKey) =>
      client.refetchQueries({ queryKey, type: "active" }, { cancelRefetch: false }),
    ),
  );
}

function mapCachedEmails(map: (emails: Email[]) => Email[]) {
  const client = getQueryClient();
  for (const pagedKey of [
    rpc.mail.messages.list.key({ type: "infinite" }),
    rpc.mail.messages.listInState.key({ type: "infinite" }),
    rpc.mail.labels.listEmails.key({ type: "infinite" }),
  ]) {
    for (const [queryKey, data] of client.getQueriesData<InfiniteData<ListPage>>({
      queryKey: pagedKey,
    })) {
      if (data) setPages(queryKey, data, map);
    }
  }
  for (const [queryKey, data] of client.getQueriesData<SearchResult>({
    queryKey: rpc.mail.messages.search.key({ type: "query" }),
  })) {
    if (data) client.setQueryData(queryKey, { ...data, emails: map(data.emails) });
  }
  for (const [queryKey, data] of client.getQueriesData<SavedEmails>({
    queryKey: rpc.mail.readLater.listEmails.key({ type: "query" }),
  })) {
    if (data) client.setQueryData(queryKey, { ...data, emails: map(data.emails) });
  }
}

function setPages(
  queryKey: QueryKey,
  data: InfiniteData<ListPage>,
  map: (emails: Email[]) => Email[],
) {
  getQueryClient().setQueryData(queryKey, {
    ...data,
    pages: data.pages.map((page) => ({ ...page, emails: map(page.emails) })),
  });
}

export function patchCachedEmail(id: string, patch: Partial<Email>) {
  mapCachedEmails((emails) => emails.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function dropCachedEmails(ids: string[]) {
  const gone = new Set(ids);
  mapCachedEmails((emails) => emails.filter((e) => !gone.has(e.id)));
}

const NO_LABELS: LabelMap = {};

const editedAt = new Map<string, number>();

function markEdited(queryKey: QueryKey) {
  editedAt.set(hashKey(queryKey), Date.now());
}

function keepingEdits<T>(queryKey: QueryKey, fetch: (signal: AbortSignal) => Promise<T>) {
  return async ({ signal }: { signal: AbortSignal }): Promise<T> => {
    const startedAt = Date.now();
    const data = await fetch(signal);
    const edited = editedAt.get(hashKey(queryKey));
    if (edited === undefined || edited < startedAt) return data;
    return getQueryClient().getQueryData<T>(queryKey) ?? data;
  };
}

function labelsOptions(scope: MailboxScope) {
  const options = rpc.mail.labels.getMap.queryOptions({ input: scope, staleTime: Infinity });
  return {
    ...options,
    queryFn: keepingEdits(options.queryKey, (signal) => orpc.mail.labels.getMap(scope, { signal })),
  };
}

export function useMailLabels(scope: MailboxScope) {
  const query = useQuery(labelsOptions(scope));
  return { labels: query.data?.labels ?? NO_LABELS, ready: !query.isPending };
}

export function setCachedLabels(scope: MailboxScope, update: (labels: LabelMap) => LabelMap) {
  const client = getQueryClient();
  const { queryKey } = labelsOptions(scope);
  markEdited(queryKey);
  client.setQueryData(queryKey, (old) => ({ ...old, labels: update(old?.labels ?? {}) }));
}

function idSetCache<T>(
  options: (scope: MailboxScope) => { queryKey: QueryKey },
  read: (data: T) => string[],
  write: (data: T | undefined, ids: string[]) => T,
) {
  const update = (scope: MailboxScope, change: (ids: Set<string>) => void) => {
    const client = getQueryClient();
    const { queryKey } = options(scope);
    markEdited(queryKey);
    client.setQueryData<T>(queryKey, (old) => {
      const ids = new Set(old ? read(old) : []);
      change(ids);
      return write(old, [...ids]);
    });
  };
  return {
    add: (scope: MailboxScope, id: string) => update(scope, (ids) => ids.add(id)),
    remove: (scope: MailboxScope, id: string) => update(scope, (ids) => ids.delete(id)),
  };
}

function mutedOptions(scope: MailboxScope) {
  const options = rpc.mail.mute.list.queryOptions({ input: scope, staleTime: Infinity });
  return {
    ...options,
    queryFn: keepingEdits(options.queryKey, (signal) => orpc.mail.mute.list(scope, { signal })),
  };
}

function readLaterOptions(scope: MailboxScope) {
  const options = rpc.mail.readLater.list.queryOptions({ input: scope, staleTime: Infinity });
  return {
    ...options,
    queryFn: keepingEdits(options.queryKey, (signal) =>
      orpc.mail.readLater.list(scope, { signal }),
    ),
  };
}

function savedEmailsOptions(scope: MailboxScope) {
  return {
    ...rpc.mail.readLater.listEmails.queryOptions({ input: scope }),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SavedEmails> => {
      const startedAt = Date.now();
      const result = await orpc.mail.readLater.listEmails(scope, { signal });
      return { ...result, emails: withoutRemoved(result.emails, startedAt) };
    },
  };
}

function noMore() {}

export function useReadLaterList(scope: MailboxScope, search: string, fetching = true) {
  const saved = useQuery({ ...savedEmailsOptions(scope), enabled: fetching && !search });
  const searched = useMailList(scope, "inbox", search, fetching && Boolean(search));
  const savedIds = useQuery(readLaterOptions(scope));
  const ids = savedIds.data?.messageIds;
  const source = search ? searched.emails : saved.data?.emails;
  const emails = useMemo(() => {
    if (!source || !ids) return NO_EMAILS;
    const kept = new Set(ids);
    return source.filter((e) => kept.has(e.id));
  }, [source, ids]);
  return {
    emails,
    loading: (search ? searched.loading : saved.isFetching) || savedIds.isPending,
    hasMore: false,
    loadMore: noMore,
    mailboxErrors: search ? searched.mailboxErrors : NO_ERRORS,
    error: search
      ? searched.error
      : ((saved.data ? null : saved.error) ?? (savedIds.data ? null : savedIds.error)),
    retry: () => {
      if (search) searched.retry();
      else {
        void saved.refetch();
        void savedIds.refetch();
      }
    },
  };
}

export async function refreshReadLaterList(scope: MailboxScope) {
  const client = getQueryClient();
  const { queryKey } = savedEmailsOptions(scope);
  if (!client.getQueryData(queryKey) || client.isFetching({ queryKey }) > 0) return;
  await client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false });
}

export function useMutedThreadIds(scope: MailboxScope): ReadonlySet<string> {
  const ids = useQuery(mutedOptions(scope)).data?.threadIds;
  return useMemo(() => new Set(ids), [ids]);
}

export function useReadLaterIds(scope: MailboxScope): ReadonlySet<string> {
  const ids = useQuery(readLaterOptions(scope)).data?.messageIds;
  return useMemo(() => new Set(ids), [ids]);
}

export const mutedThreads = idSetCache<{ threadIds: string[] }>(
  mutedOptions,
  (data) => data.threadIds,
  (data, threadIds) => ({ ...data, threadIds }),
);

export const readLater = idSetCache<{ messageIds: string[] }>(
  readLaterOptions,
  (data) => data.messageIds,
  (data, messageIds) => ({ ...data, messageIds }),
);
