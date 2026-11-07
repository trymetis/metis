"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { BookUser, Layers, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { SessionBook, WorkspaceAddressBook } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { AddressBookSwitcher } from "./address-book-switcher";
import { useContacts } from "./contacts-context";

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

function NavRow({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookUser;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-brand-soft text-primary"
          : "text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ContactsSidebar() {
  const scope = useWorkspaceScope();
  const { books, groups, book, groupId, openBook, setEditor } = useContacts();
  const attachedQuery = useQuery(rpc.workspaceAddressBooks.list.queryOptions({ input: scope }));
  const attached: WorkspaceAddressBook[] | null =
    attachedQuery.data?.addressBooks ?? (attachedQuery.isError ? [] : null);
  const accounts = useMemo(() => groupByAccount(books), [books]);
  const grouped = accounts.length > 1;
  const mine = attached?.find((b) => b.ownedByMe) ?? null;

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-panel px-3 py-4"
      aria-label="Address books"
    >
      <AddressBookSwitcher books={attached} />

      <Button
        className="w-fit gap-2 rounded-full pr-5"
        onClick={() => setEditor({ mode: "create" })}
      >
        <Plus className="h-4 w-4" />
        New contact
      </Button>

      <nav className="flex flex-col gap-3" aria-label="Books">
        <NavRow
          active={book === null && groupId === null}
          onClick={() => openBook(null)}
          icon={Layers}
          label="All contacts"
        />
        {accounts.map((account) => (
          <section key={account.accountId} className="flex flex-col">
            {grouped && (
              <p className="truncate px-2 pb-0.5 text-[11px] text-faint">{account.email}</p>
            )}
            {account.books.map((b) => (
              <NavRow
                key={`${b.accountId}:${b.id}`}
                active={book?.accountId === b.accountId && book.bookId === b.id && groupId === null}
                onClick={() => openBook({ accountId: b.accountId, bookId: b.id })}
                icon={BookUser}
                label={b.name}
              />
            ))}
          </section>
        ))}

        {groups.length > 0 && (
          <section className="flex flex-col" aria-label="Groups">
            <p className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              Groups
            </p>
            {groups.map((g) => (
              <NavRow
                key={`${g.accountId}:${g.id}`}
                active={groupId === g.id}
                onClick={() =>
                  openBook(g.accountId ? { accountId: g.accountId, bookId: g.bookId } : book, g.id)
                }
                icon={Tag}
                label={g.name}
              />
            ))}
          </section>
        )}

        {books.length === 0 && attached !== null && (
          <div className="flex flex-col items-start gap-2 px-1.5">
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
      </nav>
    </aside>
  );
}
