import { addressBookCollectionUrl, SEEDED_CONTACTS, UNSAVED_SENDER } from "@metis/e2e/lib/contacts";
import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { uniqueName } from "../support/poll";
import { ana } from "../support/session";

const BOOK_ID = addressBookCollectionUrl(env.servers.carddavOrigin, env.caldav.user, "contacts");

interface Book {
  id: string;
  accountId: string;
  name: string;
  visible: boolean;
}

interface Contact {
  id: string;
  bookId: string;
  bookName?: string;
  accountId?: string;
  name: { display: string };
  emails: { value: string }[];
  phones: { value: string }[];
}

interface Link {
  linkId: string;
  addressBookId: string;
  visibleBookIds: string[];
}

function scope(account: Account) {
  return { workspaceSlug: account.workspaceSlug, addressBookSlug: "all" };
}

async function books(rpc: Rpc, account: Account): Promise<Book[]> {
  return (await rpc<{ books: Book[] }>("contacts.books", scope(account))).books;
}

async function contacts(rpc: Rpc, account: Account, query?: string): Promise<Contact[]> {
  return (
    await rpc<{ contacts: Contact[] }>("contacts.list", {
      ...scope(account),
      ...(query ? { query } : {}),
    })
  ).contacts;
}

async function link(rpc: Rpc, account: Account): Promise<Link> {
  const { addressBooks } = await rpc<{ addressBooks: Link[] }>("workspaceAddressBooks.list", {
    workspaceSlug: account.workspaceSlug,
  });
  const [first] = addressBooks;
  if (!first) throw new Error("no address book in the workspace");
  return first;
}

test("the seeded CardDAV book is visible and lists every seeded contact by name", async () => {
  const { rpc, account } = await ana();
  const found = (await books(rpc, account)).find((b) => b.id === BOOK_ID);
  expect(found?.visible).toBe(true);
  const listed = await contacts(rpc, account);
  const names = listed.map((c) => c.name.display);
  for (const seeded of SEEDED_CONTACTS) expect(names).toContain(seeded.name);
  expect(names).toEqual(
    names.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  );
  for (const contact of listed) expect(contact.bookName).toBe("Studio contacts");
  const desk = listed.find((c) => c.name.display === "Harbour Hall front desk");
  expect(desk?.emails).toEqual([]);
});

test("a filter matches names, emails and phones", async () => {
  const { rpc, account } = await ana();
  expect((await contacts(rpc, account, "aozora")).map((c) => c.name.display)).toEqual([
    "Kenji Watanabe",
  ]);
  expect((await contacts(rpc, account, "7946")).map((c) => c.name.display)).toEqual([
    "Harbour Hall front desk",
  ]);
});

test("lookup finds saved addresses only", async () => {
  const { rpc, account } = await ana();
  const { matches } = await rpc<{ matches: { email: string; name: string }[] }>("contacts.lookup", {
    workspaceSlug: account.workspaceSlug,
    emails: ["RAJ@demo.trymetis.email", UNSAVED_SENDER],
  });
  expect(matches).toEqual([
    expect.objectContaining({ email: "raj@demo.trymetis.email", name: "Raj Mehta" }),
  ]);
});

test("hiding the book hides its contacts and refuses reads, and showing it again restores them", async () => {
  const { rpc, account } = await ana();
  const before = await link(rpc, account);
  const raj = (await contacts(rpc, account, "Raj")).at(0);
  expect(raj).toBeDefined();
  await rpc("workspaceAddressBooks.setVisibility", {
    workspaceSlug: account.workspaceSlug,
    linkId: before.linkId,
    visibleBookIds: [],
  });
  try {
    expect(await contacts(rpc, account)).toEqual([]);
    await expect(
      rpc("contacts.get", {
        ...scope(account),
        accountId: raj?.accountId,
        bookId: raj?.bookId,
        contactId: raj?.id,
      }),
    ).rejects.toBeInstanceOf(RpcError);
  } finally {
    await rpc("workspaceAddressBooks.setVisibility", {
      workspaceSlug: account.workspaceSlug,
      linkId: before.linkId,
      visibleBookIds: before.visibleBookIds,
    });
  }
  expect((await contacts(rpc, account)).length).toBe(SEEDED_CONTACTS.length);
});

test("create, update and delete a contact on the CardDAV book", async () => {
  const { rpc, account } = await ana();
  const name = uniqueName();
  const { accountId } = await link(rpc, account).then((l) => ({ accountId: l.addressBookId }));
  const draft = {
    name: { display: name },
    emails: [{ value: `${name}@demo.trymetis.email`, primary: true }],
    phones: [],
    addresses: [],
    urls: [],
    groupIds: [],
  };
  const created = await rpc<{ id: string; bookId: string }>("contacts.create", {
    ...scope(account),
    accountId,
    bookId: BOOK_ID,
    contact: draft,
  });
  try {
    await rpc("contacts.update", {
      ...scope(account),
      accountId,
      bookId: created.bookId,
      contactId: created.id,
      contact: { ...draft, phones: [{ value: "+351 210 000 000" }] },
    });
    const read = await rpc<Contact>("contacts.get", {
      ...scope(account),
      accountId,
      bookId: created.bookId,
      contactId: created.id,
    });
    expect(read.name.display).toBe(name);
    expect(read.phones.map((p) => p.value)).toEqual(["+351 210 000 000"]);
  } finally {
    await rpc("contacts.delete", {
      ...scope(account),
      accountId,
      bookId: created.bookId,
      contactId: created.id,
    });
  }
  expect((await contacts(rpc, account, name)).length).toBe(0);
});

test("the CardDAV connection carries the address book", async () => {
  const { rpc } = await ana();
  const { connections } = await rpc<{
    connections: { provider: string; linked: string[] }[];
  }>("connections.list", {});
  const carddav = connections.find((c) => c.provider === "carddav");
  expect(carddav?.linked).toEqual(["addressbook"]);
});
