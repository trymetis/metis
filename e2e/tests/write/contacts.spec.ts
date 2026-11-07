import { expect, test, uniqueName } from "../fixtures";
import { mailPath, workspacePath } from "../harness";
import { mailRow, openMail, rowLabel } from "../mail";

interface Match {
  email: string;
  accountId: string;
  bookId: string;
  contactId: string;
}

export default function contactSpecs() {
  test("create, edit and delete a contact from the Contacts section", async ({
    page,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    await page.goto(workspacePath(account, "/p/all/all"));

    await page.getByRole("button", { name: "New contact", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New contact" });
    await dialog.getByRole("textbox", { name: "Display name" }).fill(name);
    await dialog
      .getByRole("textbox", { name: "Email 1", exact: true })
      .fill(`${name}@demo.trymetis.email`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const card = page.getByRole("article", { name });
    await expect(card.getByRole("heading", { level: 1, name })).toBeVisible();

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit contact" });
    await edit.getByRole("textbox", { name: "Organization" }).fill("Harbour Hall Venues");
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(edit).toBeHidden();
    await expect(card.getByText("Harbour Hall Venues").first()).toBeVisible();

    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: `Delete ${name}?` })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(
      page.getByRole("list", { name: "Contacts" }).getByRole("button", { name: new RegExp(name) }),
    ).toHaveCount(0);
  });

  test("an unsaved recipient is saved from the email view through the address-book picker", async ({
    page,
    account,
    rpc,
  }) => {
    const address = account.email.toLowerCase();
    const lookup = async () =>
      (
        await rpc<{ matches: Match[] }>("contacts.lookup", {
          workspaceSlug: account.workspaceSlug,
          emails: [address],
        })
      ).matches;
    expect(await lookup()).toEqual([]);

    await page.goto(mailPath(account));
    await openMail(page, "Rebrand kickoff");
    await page.getByRole("button", { name: /^To: / }).click();
    const person = page.getByRole("button", {
      name: new RegExp(`\\(${address.replaceAll(".", "\\.")}\\)$`),
    });
    await person.click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Add to contacts" }).click();
    const picker = page.getByRole("dialog", { name: "Save contact" });
    await picker.getByRole("button", { name: /Studio contacts/ }).click();
    await picker.getByRole("button", { name: "Save", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByText("Saved to Studio contacts")).toBeVisible();

    try {
      await expect.poll(async () => (await lookup()).length).toBe(1);
      await person.click();
      await expect(
        page.getByRole("menu").getByRole("menuitem", { name: "Open contact" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    } finally {
      for (const match of await lookup()) {
        await rpc("contacts.delete", {
          workspaceSlug: account.workspaceSlug,
          addressBookSlug: "all",
          accountId: match.accountId,
          bookId: match.bookId,
          contactId: match.contactId,
        });
      }
    }
  });

  test("the summary Contact card saves the person to a picked address book", async ({
    page,
    account,
    rpc,
  }) => {
    const address = "layla@saffronandsage.ae";
    const lookup = async () =>
      (
        await rpc<{ matches: Match[] }>("contacts.lookup", {
          workspaceSlug: account.workspaceSlug,
          emails: [address],
        })
      ).matches;
    expect(await lookup()).toEqual([]);

    await page.goto(mailPath(account));
    await expect(
      rowLabel(mailRow(page, "Introducing Layla Haddad from Saffron & Sage"), "Work"),
    ).toBeVisible();
    await openMail(page, "Introducing Layla Haddad from Saffron & Sage");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Save contact", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Save contact" });
    await picker.getByRole("button", { name: /Studio contacts/ }).click();
    await picker.getByRole("button", { name: "Save", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByText("Saved to Studio contacts")).toBeVisible();

    try {
      await expect.poll(async () => (await lookup()).length).toBe(1);
      const [saved] = await lookup();
      const contact = await rpc<{ name: { display: string } }>("contacts.get", {
        workspaceSlug: account.workspaceSlug,
        addressBookSlug: "all",
        accountId: saved?.accountId,
        bookId: saved?.bookId,
        contactId: saved?.contactId,
      });
      expect(contact.name.display).toBe("Layla Haddad");
      await expect(main.getByRole("button", { name: "Open contact", exact: true })).toBeVisible();
    } finally {
      for (const match of await lookup()) {
        await rpc("contacts.delete", {
          workspaceSlug: account.workspaceSlug,
          addressBookSlug: "all",
          accountId: match.accountId,
          bookId: match.bookId,
          contactId: match.contactId,
        });
      }
    }
  });
}
