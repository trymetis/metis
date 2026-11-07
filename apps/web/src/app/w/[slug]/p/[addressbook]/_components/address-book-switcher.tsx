"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Check, ChevronsUpDown, Layers, Loader2, Plus } from "lucide-react";
import Link from "next/link";

import { AccountIdentity } from "@/components/account-identity";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import type { WorkspaceAddressBook } from "@/server/schema";
import { ALL_ADDRESS_BOOKS_SLUG, contactsPath, workspaceSettingsPath } from "@/workspace/path";

export function AddressBookSwitcher({ books }: { books: WorkspaceAddressBook[] | null }) {
  const { addressBookSlug } = useWorkspacePath();
  const workspaceSlug = useWorkspaceSlug();

  if (!books) {
    return (
      <div className="flex h-12 items-center gap-2 rounded-[10px] border border-border bg-surface px-3">
        <Loader2 className="h-3 w-3 animate-spin opacity-50" />
      </div>
    );
  }

  const isAll = addressBookSlug === ALL_ADDRESS_BOOKS_SLUG;
  const active = books.find((c) => c.slug === addressBookSlug) ?? null;
  const manageHref = workspaceSettingsPath(workspaceSlug, "contacts");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="h-12 w-full justify-start gap-2 rounded-[10px] bg-surface px-2.5 text-left dark:bg-surface"
            aria-label="Switch address book"
          >
            {isAll || !active ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-brand-soft">
                  <Layers className="h-4 w-4 text-primary" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-foreground">
                    All address books
                  </div>
                  <div className="truncate text-[10px] text-faint">
                    {books.length} {books.length === 1 ? "account" : "accounts"}
                  </div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" />
              </>
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
                  {(() => {
                    const { Mark } = RESOURCE_PROVIDER_META.addressbook[active.provider];
                    return <Mark className="h-4 w-4" />;
                  })()}
                </span>
                <AccountIdentity
                  size="trigger"
                  email={active.email}
                  label={RESOURCE_PROVIDER_META.addressbook[active.provider].label}
                  server={active.server}
                />
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" />
              </>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[1.5px] opacity-60">
            Switch address book
          </DropdownMenuLabel>

          {books.length > 1 && (
            <DropdownMenuItem
              render={<Link href={contactsPath(workspaceSlug, ALL_ADDRESS_BOOKS_SLUG)} />}
              className="flex items-center gap-2"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-soft">
                <Layers className="h-3 w-3 text-primary" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px]">All address books</div>
                <div className="truncate text-[10px] text-faint">
                  Every address book in this workspace
                </div>
              </div>
              {isAll && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )}

          {books.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-faint">
              No address books in this workspace yet.
            </div>
          ) : (
            books.map((book) => {
              const { Mark, label } = RESOURCE_PROVIDER_META.addressbook[book.provider];
              const isActive = book.slug === addressBookSlug;
              return (
                <DropdownMenuItem
                  key={book.addressBookId}
                  render={<Link href={contactsPath(workspaceSlug, book.slug)} />}
                  className="flex items-center gap-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface">
                    <Mark className="h-3 w-3" />
                  </span>
                  <AccountIdentity
                    size="compact"
                    email={book.email}
                    label={label}
                    server={book.server}
                    detail={
                      book.visibleBookIds.length === 0
                        ? "No address books shown"
                        : `${book.visibleBookIds.length} shown`
                    }
                  />
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={manageHref} />} className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="text-[12px]">Add address book</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
