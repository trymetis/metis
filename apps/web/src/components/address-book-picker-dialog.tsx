"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { BookUser, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { ALL_ADDRESS_BOOKS_SLUG, workspaceSettingsPath } from "@/workspace/path";

export interface BookPick {
  accountId: string;
  bookId: string;
  label: string;
}

function key(b: { accountId: string; id: string }): string {
  return `${b.accountId}::${b.id}`;
}

export function AddressBookPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onPick: (pick: BookPick) => void;
}) {
  const workspaceSlug = useWorkspaceSlug();
  const attachedQuery = useQuery(
    rpc.workspaceAddressBooks.list.queryOptions({ input: { workspaceSlug }, enabled: open }),
  );
  const hasAny = (attachedQuery.data?.addressBooks.length ?? 0) > 0;
  const booksQuery = useQuery(
    rpc.contacts.books.queryOptions({
      input: { workspaceSlug, addressBookSlug: ALL_ADDRESS_BOOKS_SLUG },
      enabled: open && hasAny,
    }),
  );
  const books = (booksQuery.data?.books ?? []).filter((b) => b.visible && !b.readOnly);
  const [picked, setPicked] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPicked(null);
  }
  const chosen =
    books.find((b) => key(b) === picked) ?? (books.length === 1 ? books[0] : undefined);
  const loading = attachedQuery.isPending || (hasAny && booksQuery.isPending);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-5 text-center text-[12px] text-faint">
              <p>
                {hasAny
                  ? "No address book is showing in this workspace yet."
                  : "This workspace has no address book yet."}
              </p>
              <Link
                href={workspaceSettingsPath(workspaceSlug, "contacts")}
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => onOpenChange(false)}
              >
                Contacts settings
              </Link>
            </div>
          ) : (
            <ul aria-label="Address books">
              {books.map((b) => {
                const active = chosen !== undefined && key(chosen) === key(b);
                return (
                  <li key={key(b)}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPicked(key(b))}
                      className={cn(
                        "flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-hover",
                        active && "bg-brand-soft",
                      )}
                    >
                      <BookUser className="size-4 shrink-0 text-faint" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">{b.name}</span>
                        <span className="block truncate text-[11px] text-faint">
                          {b.accountEmail}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!chosen || busy}
            onClick={() =>
              chosen &&
              onPick({ accountId: chosen.accountId, bookId: chosen.id, label: chosen.name })
            }
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
