"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";

import { AddressBookPickerDialog } from "@/components/address-book-picker-dialog";
import { emptyDraft } from "@/contacts/fields";
import { packContactRef } from "@/contacts/refs";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import { route } from "@/lib/route";
import type { ContactDraft, ContactMatch } from "@/server/schema";
import { ALL_ADDRESS_BOOKS_SLUG, ALL_BOOKS, contactsPath } from "@/workspace/path";

export function draftForAddress(email: string, name?: string): ContactDraft {
  const display = name && name.trim() && name.trim() !== email ? name.trim() : "";
  return { ...emptyDraft(), name: { display }, emails: [{ value: email, primary: true }] };
}

export function contactHref(
  workspaceSlug: string,
  ref: { accountId: string; bookId: string; contactId: string },
  edit = false,
): string {
  const path = contactsPath(workspaceSlug, ALL_ADDRESS_BOOKS_SLUG, ALL_BOOKS, packContactRef(ref));
  return edit ? `${path}?edit=1` : path;
}

export function matchHref(workspaceSlug: string, match: ContactMatch): string {
  return contactHref(workspaceSlug, {
    accountId: match.accountId,
    bookId: match.bookId,
    contactId: match.contactId,
  });
}

export function useSaveContact(): { save: (draft: ContactDraft) => void; dialog: ReactNode } {
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const [pending, setPending] = useState<ContactDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useCallback((draft: ContactDraft) => setPending(draft), []);

  const dialog = (
    <AddressBookPickerDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setPending(null);
      }}
      title="Save contact"
      description="Pick the address book to save this contact to."
      confirmLabel="Save"
      busy={busy}
      onPick={(pick) => {
        if (!pending) return;
        setBusy(true);
        orpc.contacts
          .create({
            workspaceSlug,
            addressBookSlug: ALL_ADDRESS_BOOKS_SLUG,
            accountId: pick.accountId,
            bookId: pick.bookId,
            contact: pending,
          })
          .then(async (created) => {
            setPending(null);
            await refreshQueries(rpc.contacts.lookup.key());
            toast.success(`Saved to ${pick.label}`, {
              action: {
                label: "Edit",
                onClick: () =>
                  router.push(
                    route(
                      contactHref(
                        workspaceSlug,
                        {
                          accountId: created.accountId,
                          bookId: created.bookId,
                          contactId: created.id,
                        },
                        true,
                      ),
                    ),
                  ),
              },
            });
          })
          .catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Could not save the contact");
          })
          .finally(() => setBusy(false));
      }}
    />
  );

  return { save, dialog };
}
