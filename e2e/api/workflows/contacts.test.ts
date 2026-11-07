import { SEEDED_CONTACTS } from "@metis/e2e/lib/contacts";
import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { uniqueName } from "../support/poll";
import { ana, scope } from "../support/session";
import {
  at,
  cel,
  edge,
  type Graph,
  graphOf,
  lit,
  node,
  nodeOf,
  type RunDetail,
  waitForRun,
} from "../support/workflow";

interface Contact {
  id: string;
  bookId: string;
  accountId?: string;
  name: { display: string };
  organization?: string;
  emails: { value: string }[];
}

function contactsScope(account: Account) {
  return { workspaceSlug: account.workspaceSlug, addressBookSlug: "all" };
}

async function addressBookId(rpc: Rpc, account: Account): Promise<string> {
  const { directory } = await rpc<{ directory: { addressBooks: { id: string }[] } }>(
    "workflows.list",
    scope(account),
  );
  const id = directory.addressBooks[0]?.id;
  if (!id) throw new Error("the address book is not in the workflow directory");
  return id;
}

async function find(rpc: Rpc, account: Account, query: string): Promise<Contact[]> {
  return (await rpc<{ contacts: Contact[] }>("contacts.list", { ...contactsScope(account), query }))
    .contacts;
}

async function remove(rpc: Rpc, account: Account, contact: Contact): Promise<void> {
  await rpc("contacts.delete", {
    ...contactsScope(account),
    accountId: contact.accountId,
    bookId: contact.bookId,
    contactId: contact.id,
  });
}

async function runOnce(rpc: Rpc, account: Account, graph: Graph): Promise<RunDetail> {
  const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
    ...scope(account),
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  try {
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    return await waitForRun(rpc, account, runId);
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: workflow.id });
  }
}

test("List contacts passes on one item per contact in the address book", async () => {
  const { rpc, account } = await ana();
  const book = await addressBookId(rpc, account);
  const run = await runOnce(
    rpc,
    account,
    graphOf(
      [
        node("manual", "trigger.manual", at(0)),
        node("list", "contacts.list", at(1), { addressbook: lit(book), limit: lit(100) }),
        node("each", "logic.filter", at(2), { condition: cel('item.id != ""') }),
      ],
      [edge("manual", "list"), edge("list", "each")],
    ),
  );
  expect(run.status).toBe("completed");
  expect(nodeOf(run, "each").items).toHaveLength(SEEDED_CONTACTS.length);
});

test("Search contacts then Get a contact load the matching contact", async () => {
  const { rpc, account } = await ana();
  const book = await addressBookId(rpc, account);
  const [raj] = await find(rpc, account, "Raj Mehta");
  if (!raj) throw new Error("Raj is not seeded");
  const run = await runOnce(
    rpc,
    account,
    graphOf(
      [
        node("manual", "trigger.manual", at(0)),
        node("search", "contacts.search", at(1), {
          addressbook: lit(book),
          query: lit("aozora"),
          limit: lit(10),
        }),
        node("get", "contacts.get", at(1, 1), {
          addressbook: lit(book),
          book: lit(raj.bookId),
          contactId: lit(raj.id),
        }),
      ],
      [edge("manual", "search"), edge("manual", "get")],
    ),
  );
  expect(run.status).toBe("completed");
  expect(nodeOf(run, "search").items).toHaveLength(1);
  expect(nodeOf(run, "get").items).toHaveLength(1);
});

test("Create a contact then Update a contact save it with the changed field", async () => {
  const { rpc, account } = await ana();
  const book = await addressBookId(rpc, account);
  const name = uniqueName();
  const email = `${name}@demo.trymetis.email`;
  try {
    const run = await runOnce(
      rpc,
      account,
      graphOf(
        [
          node("manual", "trigger.manual", at(0)),
          node("create", "contacts.create", at(1), {
            addressbook: lit(book),
            name: lit(name),
            email: lit(email),
          }),
          node("update", "contacts.update", at(2), {
            contact: cel("item"),
            organization: lit("Harbour Hall Venues"),
          }),
        ],
        [edge("manual", "create"), edge("create", "update")],
      ),
    );
    expect(run.status).toBe("completed");
    const [saved] = await find(rpc, account, name);
    expect(saved?.name.display).toBe(name);
    expect(saved?.organization).toBe("Harbour Hall Venues");
    expect(saved?.emails.map((e) => e.value)).toEqual([email]);
  } finally {
    for (const contact of await find(rpc, account, name)) await remove(rpc, account, contact);
  }
});

test("Search contacts then Delete a contact removes it from the address book", async () => {
  const { rpc, account } = await ana();
  const book = await addressBookId(rpc, account);
  const name = uniqueName();
  const accountId = (await find(rpc, account, "Raj Mehta"))[0]?.accountId;
  const bookId = (await find(rpc, account, "Raj Mehta"))[0]?.bookId;
  await rpc("contacts.create", {
    ...contactsScope(account),
    accountId,
    bookId,
    contact: {
      name: { display: name },
      emails: [],
      phones: [{ value: "+351 210 000 111" }],
      addresses: [],
      urls: [],
      groupIds: [],
    },
  });
  try {
    expect(await find(rpc, account, name)).toHaveLength(1);
    const run = await runOnce(
      rpc,
      account,
      graphOf(
        [
          node("manual", "trigger.manual", at(0)),
          node("search", "contacts.search", at(1), {
            addressbook: lit(book),
            query: lit(name),
            limit: lit(5),
          }),
          node("delete", "contacts.delete", at(2), { contact: cel("item") }),
        ],
        [edge("manual", "search"), edge("search", "delete")],
      ),
    );
    expect(run.status).toBe("completed");
    expect(nodeOf(run, "delete").items).toHaveLength(1);
    expect(await find(rpc, account, name)).toEqual([]);
  } finally {
    for (const contact of await find(rpc, account, name)) await remove(rpc, account, contact);
  }
});

test("a contact step on an address book not in the workspace is refused", async () => {
  const { rpc, account } = await ana();
  const refused = rpc("workflows.create", {
    ...scope(account),
    workflow: {
      name: uniqueName(),
      enabled: false,
      graph: graphOf(
        [
          node("manual", "trigger.manual", at(0)),
          node("list", "contacts.list", at(1), { addressbook: lit("not-an-address-book") }),
        ],
        [edge("manual", "list")],
      ),
    },
  });
  await expect(refused).rejects.toThrow("That address book is not in this workspace");
});
