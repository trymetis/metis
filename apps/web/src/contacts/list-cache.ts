import "server-only";
import { z } from "zod";

import {
  addressBookSourceErrorSchema,
  contactGroupSchema,
  sessionBookSchema,
} from "@/server/schema";
import { cachedField, forgetHash } from "@/services/cache";

const BOOK_LIST_TTL_SEC = 60;
const TAG = "[contacts] books";

const bookListSchema = z.object({
  books: z.array(sessionBookSchema),
  groups: z.array(contactGroupSchema),
  errors: z.array(addressBookSourceErrorSchema),
});

export type BookList = z.infer<typeof bookListSchema>;

function workspaceKey(workspaceId: string): string {
  return `address-book-lists:${workspaceId}`;
}

export function cachedBookList(
  workspaceId: string,
  field: string,
  load: () => Promise<BookList>,
): Promise<BookList> {
  return cachedField({
    key: workspaceKey(workspaceId),
    field,
    ttlSec: BOOK_LIST_TTL_SEC,
    schema: bookListSchema,
    tag: TAG,
    load,
    keep: (list) => list.errors.length === 0,
  });
}

export function forgetBookLists(workspaceId: string): Promise<void> {
  return forgetHash(workspaceKey(workspaceId), TAG);
}

const LOOKUP_FIELD = "saved-index";

const savedIndexSchema = z.object({
  entries: z.array(
    z.object({
      email: z.string(),
      name: z.string(),
      addressBookSlug: z.string(),
      accountId: z.string(),
      bookId: z.string(),
      bookName: z.string(),
      contactId: z.string(),
      phones: z.array(z.string()),
      organization: z.string().optional(),
      title: z.string().optional(),
    }),
  ),
  complete: z.boolean(),
});

export type SavedIndex = z.infer<typeof savedIndexSchema>;

export function cachedSavedIndex(
  workspaceId: string,
  load: () => Promise<SavedIndex>,
): Promise<SavedIndex> {
  return cachedField({
    key: workspaceKey(workspaceId),
    field: LOOKUP_FIELD,
    ttlSec: BOOK_LIST_TTL_SEC,
    schema: savedIndexSchema,
    tag: TAG,
    load,
    keep: (index) => index.complete,
  });
}
