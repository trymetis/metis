"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Textarea } from "@metis/ui/components/textarea";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { emptyDraft } from "@/contacts/fields";
import { orpc } from "@/lib/orpc";
import type { ContactDraft, ContactDto } from "@/server/schema";

import { type ContactEditor, useContacts } from "./contacts-context";

interface Row {
  value: string;
  label: string;
}

interface FormState {
  given: string;
  family: string;
  display: string;
  emails: Row[];
  phones: Row[];
  organization: string;
  title: string;
  department: string;
  birthday: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  website: string;
  notes: string;
  groupIds: string[];
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rows(values: { value: string; label?: string }[]): Row[] {
  const list = values.map((v) => ({ value: v.value, label: v.label ?? "" }));
  return list.length > 0 ? list : [{ value: "", label: "" }];
}

function formFrom(contact: ContactDto | null): FormState {
  const source = contact ?? { ...emptyDraft() };
  const address = source.addresses[0];
  return {
    given: source.name.given ?? "",
    family: source.name.family ?? "",
    display: contact && !source.name.given && !source.name.family ? source.name.display : "",
    emails: rows(source.emails),
    phones: rows(source.phones),
    organization: source.organization ?? "",
    title: source.title ?? "",
    department: source.department ?? "",
    birthday: source.birthday ?? "",
    street: address?.street ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "",
    website: source.urls[0]?.value ?? "",
    notes: source.notes ?? "",
    groupIds: source.groupIds,
  };
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function draftFrom(form: FormState, original: ContactDto | null): ContactDraft {
  const filled = (list: Row[]) =>
    list
      .filter((r) => r.value.trim())
      .map((r) => ({
        value: r.value.trim(),
        ...(optional(r.label) ? { label: r.label.trim() } : {}),
      }));
  const address = {
    street: optional(form.street),
    city: optional(form.city),
    region: optional(form.region),
    postalCode: optional(form.postalCode),
    country: optional(form.country),
  };
  const hasAddress = Object.values(address).some(Boolean);
  const kept = original?.addresses.slice(1) ?? [];
  return {
    name: {
      display: form.display.trim(),
      given: optional(form.given),
      family: optional(form.family),
      ...(original?.name.middle ? { middle: original.name.middle } : {}),
      ...(original?.name.prefix ? { prefix: original.name.prefix } : {}),
      ...(original?.name.suffix ? { suffix: original.name.suffix } : {}),
    },
    nickname: original?.nickname,
    emails: filled(form.emails).map((e, index) => ({
      ...e,
      ...(index === 0 ? { primary: true } : {}),
    })),
    phones: filled(form.phones),
    addresses: hasAddress
      ? [
          {
            ...address,
            ...(original?.addresses[0]?.label ? { label: original.addresses[0].label } : {}),
          },
          ...kept,
        ]
      : kept,
    organization: optional(form.organization),
    department: optional(form.department),
    title: optional(form.title),
    birthday: optional(form.birthday),
    urls: [
      ...(optional(form.website) ? [{ value: form.website.trim() }] : []),
      ...(original?.urls.slice(1) ?? []),
    ],
    notes: optional(form.notes),
    groupIds: form.groupIds,
  };
}

function RowsField({
  label,
  rows: list,
  type,
  onChange,
}: {
  label: string;
  rows: Row[];
  type: "email" | "tel";
  onChange: (rows: Row[]) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-1.5">
        {list.map((row, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- rows are edited in place and have no id
          <div key={index} className="flex items-center gap-1.5">
            <Input
              type={type}
              aria-label={`${label} ${index + 1}`}
              value={row.value}
              onChange={(e) =>
                onChange(list.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
              }
              className="text-[13px]"
            />
            <Input
              aria-label={`${label} ${index + 1} label`}
              placeholder="Label"
              value={row.label}
              onChange={(e) =>
                onChange(list.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))
              }
              className="w-28 text-[13px]"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              disabled={list.length === 1 && !row.value}
              onClick={() =>
                onChange(
                  list.length === 1
                    ? [{ value: "", label: "" }]
                    : list.filter((_, i) => i !== index),
                )
              }
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...list, { value: "", label: "" }])}
        >
          <Plus className="size-3.5" />
          Add {label.toLowerCase()}
        </Button>
      </div>
    </Field>
  );
}

function ContactForm({
  editor,
  onDone,
}: {
  editor: Exclude<ContactEditor, null>;
  onDone: () => void;
}) {
  const { scope, books, book, groups, refresh, openContact } = useContacts();
  const original = editor.mode === "edit" ? editor.contact : null;
  const [form, setForm] = useState<FormState>(() => formFrom(original));
  const writable = books.filter((b) => !b.readOnly);
  const initialTarget = book
    ? `${book.accountId}::${book.bookId}`
    : writable.find((b) => b.primary)
      ? `${writable.find((b) => b.primary)?.accountId}::${writable.find((b) => b.primary)?.id}`
      : writable[0]
        ? `${writable[0].accountId}::${writable[0].id}`
        : "";
  const [picked, setTarget] = useState<string | null>(null);
  const target = picked ?? initialTarget;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, bookId] = original
    ? [original.accountId ?? "", original.bookId]
    : target.split("::");
  const bookGroups = groups.filter((g) => g.accountId === accountId && g.bookId === bookId);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const draft = draftFrom(form, original);
    if (
      !draft.name.display &&
      !draft.name.given &&
      !draft.name.family &&
      draft.emails.length === 0 &&
      !draft.organization
    ) {
      setError("Give the contact a name, an email or an organization");
      return;
    }
    const badEmail = draft.emails.find((e) => !EMAIL_SHAPE.test(e.value));
    if (badEmail) {
      setError(`${badEmail.value} is not an email address`);
      return;
    }
    if (!accountId || !bookId) {
      setError("Pick an address book");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (original) {
        await orpc.contacts.update({
          ...scope,
          accountId,
          bookId,
          contactId: original.id,
          contact: draft,
        });
        toast.success("Contact saved");
      } else {
        const created = await orpc.contacts.create({ ...scope, accountId, bookId, contact: draft });
        toast.success("Contact created");
        openContact({ id: created.id, bookId: created.bookId, accountId: created.accountId });
      }
      await refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{original ? "Edit contact" : "New contact"}</DialogTitle>
      </DialogHeader>
      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <Field>
            <FieldLabel htmlFor="contact-given">First name</FieldLabel>
            <Input
              id="contact-given"
              value={form.given}
              onChange={(e) => set("given", e.target.value)}
              className="text-[13px]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-family">Last name</FieldLabel>
            <Input
              id="contact-family"
              value={form.family}
              onChange={(e) => set("family", e.target.value)}
              className="text-[13px]"
            />
          </Field>
        </div>
        {!form.given && !form.family && (
          <Field>
            <FieldLabel htmlFor="contact-display">Display name</FieldLabel>
            <Input
              id="contact-display"
              value={form.display}
              onChange={(e) => set("display", e.target.value)}
              className="text-[13px]"
            />
          </Field>
        )}
        <RowsField
          label="Email"
          type="email"
          rows={form.emails}
          onChange={(v) => set("emails", v)}
        />
        <RowsField label="Phone" type="tel" rows={form.phones} onChange={(v) => set("phones", v)} />
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <Field>
            <FieldLabel htmlFor="contact-org">Organization</FieldLabel>
            <Input
              id="contact-org"
              value={form.organization}
              onChange={(e) => set("organization", e.target.value)}
              className="text-[13px]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-title">Job title</FieldLabel>
            <Input
              id="contact-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="text-[13px]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-department">Department</FieldLabel>
            <Input
              id="contact-department"
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              className="text-[13px]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-birthday">Birthday</FieldLabel>
            <Input
              id="contact-birthday"
              placeholder="1990-04-21 or --04-21"
              value={form.birthday}
              onChange={(e) => set("birthday", e.target.value)}
              className="text-[13px]"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="contact-street">Address</FieldLabel>
          <Input
            id="contact-street"
            placeholder="Street"
            value={form.street}
            onChange={(e) => set("street", e.target.value)}
            className="text-[13px]"
          />
          <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            <Input
              aria-label="City"
              placeholder="City"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className="text-[13px]"
            />
            <Input
              aria-label="Region"
              placeholder="Region"
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              className="text-[13px]"
            />
            <Input
              aria-label="Postal code"
              placeholder="Postal code"
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              className="text-[13px]"
            />
            <Input
              aria-label="Country"
              placeholder="Country"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              className="text-[13px]"
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-website">Website</FieldLabel>
          <Input
            id="contact-website"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            className="text-[13px]"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-notes">Notes</FieldLabel>
          <Textarea
            id="contact-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="text-[13px]"
            rows={3}
          />
        </Field>
        {bookGroups.length > 0 && (
          <Field>
            <FieldLabel>Groups</FieldLabel>
            <div className="flex flex-col gap-1">
              {bookGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={form.groupIds.includes(g.id)}
                    onCheckedChange={(checked) =>
                      set(
                        "groupIds",
                        checked
                          ? [...form.groupIds, g.id]
                          : form.groupIds.filter((id) => id !== g.id),
                      )
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </Field>
        )}
        {!original && (
          <Field>
            <FieldLabel>Address book</FieldLabel>
            <Select
              value={target}
              onValueChange={(value) => setTarget(String(value))}
              items={writable.map((b) => ({
                value: `${b.accountId}::${b.id}`,
                label: `${b.name} · ${b.accountEmail}`,
              }))}
            >
              <SelectTrigger aria-label="Address book" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {writable.map((b) => (
                  <SelectItem key={`${b.accountId}::${b.id}`} value={`${b.accountId}::${b.id}`}>
                    {b.name} · {b.accountEmail}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {error && <FieldError>{error}</FieldError>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ContactDialog() {
  const { editor, setEditor } = useContacts();
  const key =
    editor === null ? "closed" : editor.mode === "edit" ? `edit:${editor.contact.id}` : "create";
  return (
    <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
      <DialogContent className="sm:max-w-xl">
        {editor && <ContactForm key={key} editor={editor} onDone={() => setEditor(null)} />}
      </DialogContent>
    </Dialog>
  );
}
