"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { SessionBook, WorkspaceAddressBook } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { AddressBookSwitcher } from "./address-book-switcher";
import { useContacts } from "./contacts-context";

const ALL = "all";

interface ShowOption {
  value: string;
  label: string;
  open: () => void;
}

function groupByAccount(
  books: SessionBook[],
): { accountId: string; email: string; books: SessionBook[] }[] {
  const groups = new Map<string, SessionBook[]>();
  for (const book of books) {
    const list = groups.get(book.accountId) ?? [];
    list.push(book);
    groups.set(book.accountId, list);
  }
  return [...groups.entries()].map(([accountId, list]) => ({
    accountId,
    email: list[0]?.accountEmail ?? "",
    books: list,
  }));
}

function BookFilter() {
  const { books, groups, book, groupId, openBook } = useContacts();
  const accounts = useMemo(() => groupByAccount(books), [books]);

  const sections = useMemo(() => {
    const bookSections = accounts.map((account) => ({
      label: accounts.length > 1 ? account.email : "Books",
      options: account.books.map((b): ShowOption => ({
        value: `book:${b.accountId}:${b.id}`,
        label: b.name,
        open: () => openBook({ accountId: b.accountId, bookId: b.id }),
      })),
    }));
    const groupSection = {
      label: "Groups",
      options: groups.map((g): ShowOption => ({
        value: `group:${g.accountId}:${g.id}`,
        label: g.name,
        open: () =>
          openBook(g.accountId ? { accountId: g.accountId, bookId: g.bookId } : book, g.id),
      })),
    };
    return [...bookSections, groupSection].filter((s) => s.options.length > 0);
  }, [accounts, groups, book, openBook]);

  const all: ShowOption = { value: ALL, label: "All contacts", open: () => openBook(null) };
  const options = [all, ...sections.flatMap((s) => s.options)];
  const current = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;
  const value = current
    ? `group:${current.accountId}:${current.id}`
    : book
      ? `book:${book.accountId}:${book.bookId}`
      : ALL;

  return (
    <Select
      items={options.map(({ value: v, label }) => ({ value: v, label }))}
      value={value}
      onValueChange={(next) => options.find((o) => o.value === next)?.open()}
    >
      <SelectTrigger size="sm" className="w-full" aria-label="Show">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All contacts</SelectItem>
        {sections.map((section) => (
          <SelectGroup key={section.label}>
            <SelectLabel>{section.label}</SelectLabel>
            {section.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContactsColumnHeader() {
  const scope = useWorkspaceScope();
  const { books } = useContacts();
  const attachedQuery = useQuery(rpc.workspaceAddressBooks.list.queryOptions({ input: scope }));
  const attached: WorkspaceAddressBook[] | null =
    attachedQuery.data?.addressBooks ?? (attachedQuery.isError ? [] : null);
  const mine = attached?.find((b) => b.ownedByMe) ?? null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
      <AddressBookSwitcher books={attached} />
      {books.length > 0 && <BookFilter />}
      {books.length === 0 && attached !== null && (
        <div className="flex flex-col items-start gap-1 px-1">
          <p className="text-[12px] text-faint">
            {mine
              ? "None of your address books are showing in this workspace yet."
              : "No address books are showing in this workspace yet."}
          </p>
          <Link
            href={workspaceSettingsPath(
              scope.workspaceSlug,
              "contacts",
              mine ? `?addressBook=${encodeURIComponent(mine.addressBookId)}` : "",
            )}
            className="text-[12px] text-primary underline-offset-2 hover:underline"
          >
            {mine ? "Choose which address books to show" : "Contacts settings"}
          </Link>
        </div>
      )}
    </div>
  );
}
