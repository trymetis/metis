"use client";

import type { Data } from "@dnd-kit/core";
import { UserRound } from "lucide-react";
import { useMemo } from "react";

import type { AgentContact } from "@/ai/turn";
import { AgentPanel } from "@/components/agent/agent-panel";
import { primaryEmail } from "@/contacts/fields";
import type { ContactDto } from "@/server/schema";

import { useContacts } from "./contacts-context";

const SUGGESTIONS = [
  "Who works at the same company as this contact?",
  "Find everyone without a phone number",
  "Add a contact for the person I'm looking at",
  "Fix the name on this contact",
];

export const CONTACT_DRAG = "contact";

type ContactItem = AgentContact & { id: string };

function toContactItem(contact: ContactDto): ContactItem {
  const email = primaryEmail(contact);
  const item: AgentContact = {
    addressBookId: contact.accountId ?? "",
    bookId: contact.bookId,
    contactId: contact.id,
    name: contact.name.display,
    ...(email ? { email } : {}),
    ...(contact.bookName ? { bookName: contact.bookName } : {}),
  };
  return { ...item, id: `${item.addressBookId}:${item.bookId}:${item.contactId}` };
}

function describe(contact: ContactItem) {
  return {
    title: contact.name || contact.email || "Contact",
    subtitle: contact.email ?? contact.bookName ?? "",
  };
}

function fromDrag(data: Data | undefined): ContactItem | null {
  const contact: ContactDto | undefined = data?.contact;
  return data?.type === CONTACT_DRAG && contact ? toContactItem(contact) : null;
}

export function ContactsAgentPanel({ onClose }: { onClose: () => void }) {
  const { scope, selected, contacts, openContact, refresh } = useContacts();
  const open = useMemo(() => (selected ? toContactItem(selected) : null), [selected]);
  const candidates = useMemo(() => contacts.map(toContactItem), [contacts]);

  return (
    <AgentPanel
      kind="addressbook"
      slug={scope.addressBookSlug}
      api="/api/ai/chat/contacts"
      body={scope}
      logTag="[contacts-agent]"
      name="Contacts AI"
      icon={UserRound}
      placeholder="Ask about your contacts…"
      emptyLabel={() => "Ask about your contacts"}
      suggestions={() => SUGGESTIONS}
      open={open}
      candidates={candidates}
      describe={describe}
      picker={{
        title: "Attach a contact",
        placeholder: "Attach a contact…",
        emptyLabel: "No contacts in view",
      }}
      onOpenItem={(item) =>
        openContact({ id: item.contactId, bookId: item.bookId, accountId: item.addressBookId })
      }
      fromDrag={fromDrag}
      turn={(items) => ({
        kind: "contacts",
        contacts: items.map(({ id: _id, ...contact }) => contact),
      })}
      onTurnFinished={() => void refresh()}
      onClose={onClose}
    />
  );
}
