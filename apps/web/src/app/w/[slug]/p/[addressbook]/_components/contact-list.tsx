"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@metis/ui/lib/utils";
import { Loader2, UserPlus } from "lucide-react";

import { IconButton } from "@/components/icon-button";
import { PersonAvatar } from "@/components/person-avatar";
import { SearchInput } from "@/components/search-input";
import { primaryEmail } from "@/contacts/fields";
import type { ContactDto } from "@/server/schema";

import { CONTACT_DRAG } from "./contacts-agent-panel";
import { useContacts } from "./contacts-context";

const COLUMNS_WITH_BOOK =
  "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]";
const COLUMNS = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]";

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden truncate text-[13px] text-muted-foreground md:block">{children}</span>
  );
}

function ContactRow({
  contact,
  wide,
  showBook,
  active,
  onOpen,
  dragToAgent,
}: {
  contact: ContactDto;
  wide: boolean;
  showBook: boolean;
  active: boolean;
  onOpen: () => void;
  dragToAgent: boolean;
}) {
  const email = primaryEmail(contact);
  const name = contact.name.display || email || "Unnamed";
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `contact:${contact.accountId}:${contact.bookId}:${contact.id}`,
    data: { type: CONTACT_DRAG, contact, label: name },
    disabled: !dragToAgent,
  });
  const secondary = [
    email ?? contact.phones[0]?.value ?? contact.organization,
    showBook ? contact.bookName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border-soft px-3 py-2.5 text-left transition-colors",
        isDragging && "opacity-40",
        wide && cn("md:grid md:gap-4 md:px-4 md:py-2", showBook ? COLUMNS_WITH_BOOK : COLUMNS),
        active ? "bg-brand-soft" : "hover:bg-hover",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <PersonAvatar
          name={contact.name.display}
          email={email}
          photoUrl={contact.photoUrl}
          className="size-8 text-xs"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
          <span className={cn("block truncate text-[12px] text-faint", wide && "md:hidden")}>
            {secondary}
          </span>
        </span>
      </span>
      {wide && (
        <>
          <Cell>{email}</Cell>
          <Cell>{contact.phones[0]?.value}</Cell>
          <Cell>{contact.organization}</Cell>
          {showBook && <Cell>{contact.bookName}</Cell>}
        </>
      )}
    </button>
  );
}

export function ContactList({ wide, dragToAgent }: { wide: boolean; dragToAgent: boolean }) {
  const { contacts, loading, query, setQuery, selected, openContact, book, setEditor } =
    useContacts();
  const showBook = book === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SearchInput
          label="Filter contacts"
          placeholder="Filter by name, email or phone"
          value={query}
          onValueChange={setQuery}
          className="min-w-0 flex-1"
        />
        <IconButton
          label="New contact"
          variant="default"
          size="icon"
          onClick={() => setEditor({ mode: "create" })}
        >
          <UserPlus className="size-4" />
        </IconButton>
      </div>

      {wide && contacts.length > 0 && !loading && (
        <div
          aria-hidden
          className={cn(
            "hidden shrink-0 gap-4 border-b border-border px-4 py-2 text-[11px] font-medium text-faint md:grid",
            showBook ? COLUMNS_WITH_BOOK : COLUMNS,
          )}
        >
          <span className="pl-11">Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Organization</span>
          {showBook && <span>Address book</span>}
        </div>
      )}

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
          {contacts.map((contact) => (
            <li key={`${contact.accountId}:${contact.bookId}:${contact.id}`}>
              <ContactRow
                contact={contact}
                wide={wide}
                showBook={showBook}
                active={
                  selected?.id === contact.id &&
                  selected.bookId === contact.bookId &&
                  selected.accountId === contact.accountId
                }
                onOpen={() => openContact(contact)}
                dragToAgent={dragToAgent}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
