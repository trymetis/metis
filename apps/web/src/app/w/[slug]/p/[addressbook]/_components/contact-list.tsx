"use client";

import { Input } from "@metis/ui/components/input";
import { cn } from "@metis/ui/lib/utils";
import { Loader2, Search } from "lucide-react";

import { primaryEmail } from "@/contacts/fields";
import type { ContactDto } from "@/server/schema";

import { useContacts } from "./contacts-context";

export function contactInitial(contact: Pick<ContactDto, "name">): string {
  return (contact.name.display.trim()[0] ?? "?").toUpperCase();
}

export function ContactAvatar({
  contact,
  className,
}: {
  contact: Pick<ContactDto, "name" | "photoUrl">;
  className?: string;
}) {
  return contact.photoUrl ? (
    // oxlint-disable-next-line nextjs/no-img-element -- provider photo URLs; next/image adds nothing here
    <img
      src={contact.photoUrl}
      alt=""
      referrerPolicy="no-referrer"
      className={cn("shrink-0 rounded-full border border-border object-cover", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface font-medium text-muted-foreground",
        className,
      )}
    >
      {contactInitial(contact)}
    </span>
  );
}

export function ContactList() {
  const { contacts, loading, query, setQuery, selected, openContact, book } = useContacts();
  const showBook = book === null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative border-b border-border px-3 py-2">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          aria-label="Filter contacts"
          placeholder="Filter by name, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 text-[13px]"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="size-4 animate-spin text-faint" />
        </div>
      ) : contacts.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-faint">
          {query ? "No contact matches that filter." : "No contacts here yet."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Contacts">
          {contacts.map((contact) => {
            const active =
              selected?.id === contact.id &&
              selected.bookId === contact.bookId &&
              selected.accountId === contact.accountId;
            const email = primaryEmail(contact);
            return (
              <li key={`${contact.accountId}:${contact.bookId}:${contact.id}`}>
                <button
                  type="button"
                  onClick={() => openContact(contact)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border-soft px-3 py-2.5 text-left transition-colors",
                    active ? "bg-brand-soft" : "hover:bg-hover",
                  )}
                >
                  <ContactAvatar contact={contact} className="size-8 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {contact.name.display || email || "Unnamed"}
                    </span>
                    <span className="block truncate text-[12px] text-faint">
                      {[
                        email ?? contact.phones[0]?.value ?? contact.organization,
                        showBook ? contact.bookName : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
