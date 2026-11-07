"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type BookRef,
  packBookRef,
  packContactRef,
  unpackBookRef,
  unpackContactRef,
} from "@/contacts/refs";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { refreshQueries, refreshQuery } from "@/lib/query-client";
import { route } from "@/lib/route";
import type {
  AddressBookScope,
  AddressBookSourceErrorDto,
  ContactDto,
  ContactGroupDto,
  SessionBook,
} from "@/server/schema";
import { ALL_ADDRESS_BOOKS_SLUG, ALL_BOOKS, contactsPath } from "@/workspace/path";

export type ContactEditor = { mode: "create" } | { mode: "edit"; contact: ContactDto } | null;

interface ContactsValue {
  scope: AddressBookScope;
  book: BookRef | null;
  selected: ContactDto | null;
  selectedLoading: boolean;
  selectedError: string | null;
  books: SessionBook[];
  groups: ContactGroupDto[];
  contacts: ContactDto[];
  loading: boolean;
  errors: AddressBookSourceErrorDto[];
  groupId: string | null;
  query: string;
  setQuery: (value: string) => void;
  bookName: (ref: BookRef) => string;
  openBook: (ref: BookRef | null, groupId?: string | null) => void;
  openContact: (contact: Pick<ContactDto, "id" | "bookId" | "accountId">) => void;
  closeContact: () => void;
  editor: ContactEditor;
  setEditor: (editor: ContactEditor) => void;
  refresh: () => Promise<void>;
}

const ContactsContext = createContext<ContactsValue | null>(null);

export function useContacts(): ContactsValue {
  const value = use(ContactsContext);
  if (!value) throw new Error("useContacts must be used inside ContactsProvider");
  return value;
}

export function ContactsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceSlug = useWorkspaceSlug();
  const path = useWorkspacePath();
  const addressBookSlug = path.addressBookSlug ?? ALL_ADDRESS_BOOKS_SLUG;
  const scope = useMemo(
    () => ({ workspaceSlug, addressBookSlug }),
    [workspaceSlug, addressBookSlug],
  );
  const bookRefValue = path.bookRef ?? ALL_BOOKS;
  const book = useMemo(() => unpackBookRef(bookRefValue), [bookRefValue]);
  const contactRef = useMemo(() => unpackContactRef(path.contactRef), [path.contactRef]);
  const groupId = searchParams.get("group");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [editor, setEditor] = useState<ContactEditor>(null);
  const [editConsumed, setEditConsumed] = useState<string | null>(null);

  const booksOptions = rpc.contacts.books.queryOptions({ input: scope });
  const booksQuery = useQuery(booksOptions);
  const listInput = {
    ...scope,
    ...(book ? { accountId: book.accountId, bookIds: [book.bookId] } : {}),
    ...(groupId ? { groupId } : {}),
    ...(deferredQuery ? { query: deferredQuery } : {}),
  };
  const listOptions = rpc.contacts.list.queryOptions({
    input: listInput,
    placeholderData: keepPreviousData,
  });
  const listQuery = useQuery(listOptions);
  const selectedQuery = useQuery({
    ...rpc.contacts.get.queryOptions({
      input: {
        ...scope,
        accountId: contactRef?.accountId,
        bookId: contactRef?.bookId ?? "",
        contactId: contactRef?.contactId ?? "",
      },
    }),
    enabled: contactRef !== null,
  });

  const wantsEdit = searchParams.get("edit") === "1" ? path.contactRef : null;
  if (wantsEdit && editConsumed !== wantsEdit && selectedQuery.data) {
    setEditConsumed(wantsEdit);
    setEditor({ mode: "edit", contact: selectedQuery.data });
  }

  useEffect(() => {
    if (!wantsEdit || editConsumed !== wantsEdit) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url.toString());
  }, [wantsEdit, editConsumed]);

  const books = useMemo(
    () => (booksQuery.data?.books ?? []).filter((b) => b.visible),
    [booksQuery.data],
  );
  const groups = useMemo(() => {
    const all = booksQuery.data?.groups ?? [];
    return book
      ? all.filter((g) => g.accountId === book.accountId && g.bookId === book.bookId)
      : all;
  }, [booksQuery.data, book]);

  const errors = useMemo(
    () => [...(booksQuery.data?.errors ?? []), ...(listQuery.data?.errors ?? [])],
    [booksQuery.data, listQuery.data],
  );

  const bookName = useCallback(
    (ref: BookRef) =>
      books.find((b) => b.accountId === ref.accountId && b.id === ref.bookId)?.name ?? "Contacts",
    [books],
  );

  const hrefFor = useCallback(
    (bookRef: string, contact?: string, group?: string | null) => {
      const base = contactsPath(workspaceSlug, addressBookSlug, bookRef, contact);
      return group ? route(`${base}?group=${encodeURIComponent(group)}`) : base;
    },
    [workspaceSlug, addressBookSlug],
  );

  const openBook = useCallback(
    (ref: BookRef | null, group: string | null = null) => {
      router.push(hrefFor(ref ? packBookRef(ref) : ALL_BOOKS, undefined, group));
    },
    [router, hrefFor],
  );

  const openContact = useCallback(
    (contact: Pick<ContactDto, "id" | "bookId" | "accountId">) => {
      if (!contact.accountId) return;
      router.push(
        hrefFor(
          bookRefValue,
          packContactRef({
            accountId: contact.accountId,
            bookId: contact.bookId,
            contactId: contact.id,
          }),
          groupId,
        ),
      );
    },
    [router, hrefFor, bookRefValue, groupId],
  );

  const closeContact = useCallback(() => {
    router.push(hrefFor(bookRefValue, undefined, groupId));
  }, [router, hrefFor, bookRefValue, groupId]);

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshQuery(rpc.contacts.books.queryKey({ input: scope })),
      refreshQueries(rpc.contacts.list.key()),
      refreshQueries(rpc.contacts.get.key()),
    ]);
  }, [scope]);

  const value = useMemo<ContactsValue>(
    () => ({
      scope,
      book,
      selected: contactRef ? (selectedQuery.data ?? null) : null,
      selectedLoading: contactRef !== null && selectedQuery.isPending,
      selectedError: selectedQuery.error
        ? selectedQuery.error.message || "Could not open that contact"
        : null,
      books,
      groups,
      contacts: listQuery.data?.contacts ?? [],
      loading: listQuery.isPending || booksQuery.isPending,
      errors,
      groupId,
      query,
      setQuery,
      bookName,
      openBook,
      openContact,
      closeContact,
      editor,
      setEditor,
      refresh,
    }),
    [
      scope,
      book,
      contactRef,
      selectedQuery.data,
      selectedQuery.isPending,
      selectedQuery.error,
      books,
      groups,
      listQuery.data,
      listQuery.isPending,
      booksQuery.isPending,
      errors,
      groupId,
      query,
      bookName,
      openBook,
      openContact,
      closeContact,
      editor,
      refresh,
      setQuery,
      setEditor,
    ],
  );

  return <ContactsContext value={value}>{children}</ContactsContext>;
}
