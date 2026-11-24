import { expect, test, uniqueName } from "../fixtures";
import { workspacePath } from "../harness";

export default function assistantSpecs() {
  test("a chat is renamed, pinned, unpinned and deleted from its menu", async ({
    page,
    account,
    rpc,
  }, testInfo) => {
    const title = uniqueName(testInfo);
    const renamed = `${title} renamed`;
    await rpc("assistant.createThread", { workspaceSlug: account.workspaceSlug, title });
    await page.goto(workspacePath(account, "/assistant"));

    const rail = page.getByRole("complementary");
    const actions = (name: string) => rail.getByRole("button", { name: `Actions for ${name}` });

    await rail.getByRole("textbox", { name: "Filter chats" }).fill(title);
    await actions(title).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const field = rail.getByRole("textbox", { name: "Chat title" });
    await field.fill(renamed);
    await field.press("Enter");
    await expect(rail.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();

    await actions(renamed).click();
    await page.getByRole("menuitem", { name: "Pin" }).click();
    await expect(
      rail.getByRole("link", { name: new RegExp(renamed) }).getByLabel("Pinned"),
    ).toBeVisible();

    await actions(renamed).click();
    await page.getByRole("menuitem", { name: "Unpin" }).click();
    await expect(
      rail.getByRole("link", { name: new RegExp(renamed) }).getByLabel("Pinned"),
    ).toHaveCount(0);

    await actions(renamed).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this conversation?" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(rail.getByRole("link", { name: new RegExp(renamed) })).toHaveCount(0);
  });
}
