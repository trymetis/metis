import "server-only";
import {
  type AddressBookProvider,
  type ConnectionAuthRow,
  resolveConnectionAuth,
} from "@/connections";

import { getContactsAdapter } from "./adapter";
import type { ProviderBook } from "./types";

export async function listProviderBooks(
  target: ConnectionAuthRow & { provider: AddressBookProvider },
): Promise<ProviderBook[]> {
  const auth = await resolveConnectionAuth(target);
  if (!auth) {
    throw new Error("Could not authenticate that account");
  }
  return getContactsAdapter(target.provider, auth, target.email).listBooks();
}
