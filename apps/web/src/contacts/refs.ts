import { packReferenceId, unpackReferenceId } from "@/ai/references";
import { ALL_BOOKS } from "@/workspace/path";

export interface BookRef {
  accountId: string;
  bookId: string;
}

export interface ContactRef extends BookRef {
  contactId: string;
}

export function packBookRef(ref: BookRef): string {
  return packReferenceId(ref.accountId, ref.bookId);
}

export function unpackBookRef(value: string | null | undefined): BookRef | null {
  if (!value || value === ALL_BOOKS) return null;
  const parts = unpackReferenceId(value, 2);
  return parts ? { accountId: parts[0], bookId: parts[1] } : null;
}

export function packContactRef(ref: ContactRef): string {
  return packReferenceId(ref.accountId, ref.bookId, ref.contactId);
}

export function unpackContactRef(value: string | null | undefined): ContactRef | null {
  if (!value) return null;
  const parts = unpackReferenceId(value, 3);
  return parts ? { accountId: parts[0], bookId: parts[1], contactId: parts[2] } : null;
}
