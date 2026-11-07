"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Download, Loader2, Mail, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { downloadVcard } from "@/components/contacts/download-vcard";
import { MemberActivity } from "@/components/members/member-activity";
import { composeMail, newEventWith } from "@/components/search/navigate";
import { contactEmails, primaryEmail } from "@/contacts/fields";
import { orpc, rpc } from "@/lib/orpc";
import type { ContactDto } from "@/server/schema";

import { ContactAvatar } from "./contact-list";
import { useContacts } from "./contacts-context";

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === "" || children === null || children === undefined) return null;
  return (
    <div className="flex gap-3 text-[13px]">
      <dt className="w-28 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

function labelled(value: string, label?: string): string {
  return label ? `${value} (${label})` : value;
}

function addressLine(address: ContactDto["addresses"][number]): string {
  return [address.street, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean)
    .join(", ");
}

function MemberBadge({ contact }: { contact: ContactDto }) {
  const { scope } = useContacts();
  const membersQuery = useQuery(
    rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug: scope.workspaceSlug } }),
  );
  const emails = new Set(contactEmails(contact));
  const member = membersQuery.data?.members.find((m) => emails.has(m.email.toLowerCase()));
  if (!member) return null;
  return <Badge variant="secondary">Member · {member.role}</Badge>;
}

export function ContactCard() {
  const router = useRouter();
  const {
    scope,
    books,
    selected,
    selectedLoading,
    selectedError,
    closeContact,
    setEditor,
    refresh,
  } = useContacts();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (selectedLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-faint">
        {selectedError ?? "Pick a contact to see its details."}
      </div>
    );
  }

  const contact = selected;
  const email = primaryEmail(contact);
  const readOnly = books.some(
    (b) => b.accountId === contact.accountId && b.id === contact.bookId && b.readOnly,
  );

  async function remove() {
    setDeleting(true);
    try {
      await orpc.contacts.delete({
        ...scope,
        accountId: contact.accountId,
        bookId: contact.bookId,
        contactId: contact.id,
      });
      toast.success("Contact deleted");
      closeContact();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the contact");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={contact.name.display}>
      <header className="flex items-start gap-4 border-b border-border px-6 py-5 max-md:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to contacts"
          className="md:hidden"
          onClick={closeContact}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <ContactAvatar contact={contact} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-[24px] font-medium tracking-tight text-foreground">
            {contact.name.display || email || "Unnamed"}
          </h1>
          <p className="truncate text-[13px] text-faint">
            {[contact.title, contact.organization].filter(Boolean).join(" · ") ||
              contact.bookName ||
              ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MemberBadge contact={contact} />
            {contact.bookName && <Badge variant="outline">{contact.bookName}</Badge>}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!email}
            onClick={() => email && composeMail(router, scope.workspaceSlug, { to: email })}
          >
            <Mail className="size-3.5" />
            Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!email}
            onClick={() => email && newEventWith(router, scope.workspaceSlug, [email])}
          >
            <CalendarPlus className="size-3.5" />
            Invite to event
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => setEditor({ mode: "edit", contact })}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive-text hover:bg-destructive/10"
            disabled={readOnly}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadVcard(contact, contact.id)}>
            <Download className="size-3.5" />
            Download
          </Button>
        </div>

        <dl className="mt-6 flex flex-col gap-2">
          {contact.emails.map((e) => (
            <Field key={`email:${e.value}`} label={e.primary ? "Email (primary)" : "Email"}>
              {labelled(e.value, e.label)}
            </Field>
          ))}
          {contact.phones.map((p) => (
            <Field key={`phone:${p.value}`} label="Phone">
              {labelled(p.value, p.label)}
            </Field>
          ))}
          {contact.addresses.map((a, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- addresses have no id and never reorder here
            <Field key={`address:${index}`} label={a.label ? `Address (${a.label})` : "Address"}>
              {addressLine(a)}
            </Field>
          ))}
          <Field label="Nickname">{contact.nickname}</Field>
          <Field label="Organization">{contact.organization}</Field>
          <Field label="Department">{contact.department}</Field>
          <Field label="Job title">{contact.title}</Field>
          <Field label="Birthday">{contact.birthday}</Field>
          {contact.urls.map((u) => (
            <Field key={`url:${u.value}`} label="Website">
              {labelled(u.value, u.label)}
            </Field>
          ))}
          <Field label="Notes">
            {contact.notes ? <span className="whitespace-pre-wrap">{contact.notes}</span> : null}
          </Field>
          <Field label="Address book">{contact.accountName}</Field>
        </dl>

        {email && (
          <div className="mt-8">
            <MemberActivity workspaceSlug={scope.workspaceSlug} email={email} />
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {contact.name.display || "this contact"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The contact is deleted from {contact.bookName ?? "its address book"} at the provider,
              for every app that uses that address book.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
