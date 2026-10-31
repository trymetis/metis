import type { Page } from "@playwright/test";

import { WEBHOOK_WORKFLOW } from "../../lib/workflow-seeds";
import { expect, test } from "../fixtures";
import { workspacePath } from "../harness";

const REBRAND = "Label rebrand mail";
const NEWSLETTER = "Morning newsletter sweep";

function sidebar(page: Page) {
  return page.getByRole("complementary").filter({
    has: page.getByRole("button", { name: "New workflow", exact: true }),
  });
}

function canvas(page: Page) {
  return page.getByRole("application");
}

function step(page: Page, name: string) {
  return canvas(page).getByRole("group", { name, exact: true });
}

function inspector(page: Page) {
  return page.getByRole("region", { name: "Inspector" });
}

async function fromTemplate(page: Page, template: string) {
  await sidebar(page).getByRole("button", { name: "New workflow", exact: true }).click();
  await page
    .getByRole("menu", { name: "New workflow" })
    .getByRole("menuitem", { name: template, exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Create workflow", exact: true })).toBeVisible();
}

async function openSeeded(page: Page, name: string) {
  await sidebar(page)
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue(name);
}

test.beforeEach(async ({ page, account }) => {
  await page.goto(workspacePath(account, "/workflow"));
  await expect(canvas(page)).toBeVisible();
});

test("the palette starts closed and Show steps opens it", async ({ page }) => {
  await expect(page.getByRole("listbox")).toBeHidden();
  await page.getByRole("button", { name: "Show steps", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("button", { name: "Hide steps", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("the palette groups steps by category and filters them by search", async ({ page }) => {
  await page.getByRole("button", { name: "Show steps", exact: true }).click();
  const palette = page.getByRole("listbox");
  for (const heading of [
    "Triggers",
    "Mail",
    "Calendar",
    "Drive",
    "Logic",
    "Waits and flow",
    "AI",
  ]) {
    await expect(palette.getByText(heading, { exact: true })).toBeVisible();
  }
  const option = (name: string) =>
    page.getByRole("option").filter({ has: page.getByText(name, { exact: true }) });
  await expect(option("Archive")).toBeVisible();
  await page.getByPlaceholder("Search steps").fill("label");
  await expect(option("Label")).toBeVisible();
  await expect(option("Archive")).toHaveCount(0);
});

test("a template's cards summarize their settings and flag a missing label live", async ({
  page,
  account,
}) => {
  await fromTemplate(page, "Label mail from a sender");
  await expect(step(page, "Mail arrives")).toContainText(`Watching ${account.email}`);
  await expect(step(page, "Label")).toContainText("Pick a label");

  const problems = page.getByRole("button", { name: "1 problem", exact: true });
  await expect(problems).toBeVisible();
  await problems.click();
  await expect(inspector(page).getByRole("heading", { name: "Label", exact: true })).toBeVisible();

  await inspector(page).getByRole("combobox", { name: "Label" }).click();
  await page.getByRole("option", { name: "Work", exact: true }).click();
  await expect(problems).toHaveCount(0);
  await expect(step(page, "Label")).toContainText("Add Work");
});

test("an expression is type-checked as it is typed, and a value from an earlier step can be inserted", async ({
  page,
}) => {
  await fromTemplate(page, "Label mail from a sender");
  await step(page, "If").click();
  const condition = inspector(page).getByRole("textbox", { name: "Condition" });
  await condition.fill("item.nonsense");
  await expect(inspector(page).getByRole("alert")).toBeVisible();
  await expect(step(page, "If")).toContainText("Condition:");

  await condition.fill("");
  await inspector(page)
    .getByRole("button", { name: "Insert a value from an earlier step" })
    .first()
    .click();
  await page.getByRole("option").filter({ hasText: "item.subject" }).first().click();
  await expect(condition).toHaveValue("item.subject");
  await expect(inspector(page).getByRole("alert")).toContainText("needed");
  await condition.fill('item.subject.contains("Rebrand")');
  await expect(inspector(page).getByText("Gives yes / no")).toBeVisible();
  await expect(step(page, "If")).toContainText('item.subject.contains("Rebrand")');
});

test("a simple condition opens as rows and switches to its expression and back", async ({
  page,
}) => {
  await openSeeded(page, REBRAND);
  await step(page, "Filter").click();
  const panel = inspector(page);
  await expect(panel.getByRole("combobox", { name: "Comparison" })).toContainText("contains");
  await expect(panel.getByRole("textbox", { name: "Value" })).toHaveValue("rebrand");

  await panel.getByRole("button", { name: "Edit as expression", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Keep when" })).toHaveValue(
    'lower(item.subject).contains("rebrand")',
  );
  await panel.getByRole("button", { name: "Edit as conditions", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Value" })).toHaveValue("rebrand");
});

test("a pattern condition flags an invalid pattern and writes matches()", async ({ page }) => {
  await openSeeded(page, REBRAND);
  await step(page, "Filter").click();
  const panel = inspector(page);
  await panel.getByRole("combobox", { name: "Comparison" }).click();
  await page.getByRole("option", { name: "matches pattern", exact: true }).click();
  const value = panel.getByRole("textbox", { name: "Value" });
  await value.fill("(");
  await expect(panel.getByText("Not a valid pattern.")).toBeVisible();
  await value.fill("^Rebrand");
  await expect(panel.getByText("Not a valid pattern.")).toHaveCount(0);

  await panel.getByRole("button", { name: "Edit as expression", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Keep when" })).toHaveValue(
    'item.subject.matches("^Rebrand")',
  );
});

test("Ask questions start collapsed to a summary and expand and collapse on click", async ({
  page,
}) => {
  await openSeeded(page, "Triage with the decision model");
  await step(page, "Ask").click();
  const panel = inspector(page);
  const summary = panel.getByRole("button", { name: /^Q1 Yes\/No Does this email ask/ });
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(panel.getByRole("button", { name: /^Q2 Pick one Which team/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Q3 Rate How urgent/ })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Q1", exact: true })).toHaveCount(0);

  await summary.click();
  await expect(panel.getByRole("textbox", { name: "Q1", exact: true })).toHaveValue(
    /^Does this email ask/,
  );
  await panel.getByRole("button", { name: "Collapse Q1", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Q1", exact: true })).toHaveCount(0);
});

test("the revisions sheet lists saves and shows unsaved changes as a diff", async ({ page }) => {
  await openSeeded(page, REBRAND);
  await step(page, "Filter").click();
  const name = inspector(page).getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Rebrand only");
  await name.press("Tab");

  await page.getByRole("button", { name: "More workflow actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Revisions", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Revisions" });
  await expect(sheet.getByRole("button", { name: /^Revision 1/ })).toBeVisible();
  const changes = sheet.getByRole("region", { name: "Changes in Unsaved changes" });
  await expect(changes).toContainText("Title");
  await expect(changes).toContainText("Rebrand only");

  await sheet.getByRole("button", { name: /^Revision 1/ }).click();
  await expect(sheet.getByRole("region", { name: "Changes in Revision 1" })).toContainText(
    "nothing older to compare it with",
  );
});

test("clicking a palette step adds it to the canvas, and Delete removes it", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  const before = await canvas(page).getByRole("group").count();
  await page.getByRole("button", { name: "Show steps", exact: true }).click();
  await page
    .getByRole("option")
    .filter({ has: page.getByText("Star", { exact: true }) })
    .click();
  await expect(step(page, "Star")).toBeVisible();
  await expect(canvas(page).getByRole("group")).toHaveCount(before + 1);
  await expect(inspector(page).getByRole("heading", { name: "Star", exact: true })).toBeVisible();

  await inspector(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(step(page, "Star")).toHaveCount(0);
  await expect(canvas(page).getByRole("group")).toHaveCount(before);
});

test("undo and redo step back and forth over a step's new name", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  await step(page, "If").click();
  const name = inspector(page).getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Mail from Raj");
  await name.press("Tab");
  await expect(step(page, "Mail from Raj")).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(step(page, "If")).toBeVisible();
  await expect(step(page, "Mail from Raj")).toHaveCount(0);

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(step(page, "Mail from Raj")).toBeVisible();
});

test("the w a chord opens quick add, and the picked step lands on the canvas", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  await page.keyboard.press("w");
  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: "Add step" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("Mark as read");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(step(page, "Mark as read")).toBeVisible();
});

test("the schedule picker edits the schedule and lists its next runs", async ({ page }) => {
  await fromTemplate(page, "Two mailboxes, one shared action");
  const schedule = step(page, "On a schedule");
  await expect(schedule).toContainText("Weekdays at 09:00");
  await schedule.click();

  const repeats = inspector(page).getByRole("combobox", { name: "Repeats" });
  await expect(repeats).toContainText("Every weekday");
  await expect(
    inspector(page).getByText("Next runs").locator("xpath=..").getByRole("listitem"),
  ).toHaveCount(3);

  await repeats.click();
  await page.getByRole("option", { name: "Every day", exact: true }).click();
  await expect(schedule).toContainText("Every day at 09:00");

  await repeats.click();
  await page.getByRole("option", { name: "Custom (cron)", exact: true }).click();
  await inspector(page).getByRole("textbox", { name: "Cron expression" }).fill("not a cron");
  await expect(schedule).toContainText("Use a five-field cron expression");
  await expect(inspector(page).getByText("This schedule never fires as written.")).toBeVisible();
});

test("skipping a step that changes something marks its card as skipped", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  await step(page, "Label").click();
  await inspector(page).getByRole("switch", { name: "Skip this step" }).click();
  await expect(step(page, "Label")).toContainText("Skipped");
});

test("routing a step's errors adds an Error output to its card", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  await step(page, "Label").click();
  await inspector(page).getByRole("combobox", { name: "When this step fails" }).click();
  await page
    .getByRole("option", { name: "Route the item to an Error output", exact: true })
    .click();
  await expect(step(page, "Label")).toContainText("Error");
  await expect(step(page, "Label")).toContainText("On error: branch");
});

test("the workflow settings show when no step is selected", async ({ page }) => {
  await fromTemplate(page, "Label mail from a sender");
  const settings = inspector(page).getByRole("region", { name: "Workflow settings" });
  await expect(settings.getByRole("spinbutton", { name: "Runs at the same time" })).toBeVisible();
  await settings.getByRole("combobox", { name: "Rate limit" }).click();
  await page.getByRole("option", { name: "Run at most once per period", exact: true }).click();
  await expect(settings.getByRole("textbox", { name: "Per" })).toHaveValue('"all"');
  await expect(settings.getByRole("spinbutton", { name: "Period in minutes" })).toHaveValue("60");
});

test("a webhook trigger shows its address and reveals its secret", async ({ page }) => {
  await openSeeded(page, WEBHOOK_WORKFLOW);
  await step(page, "Webhook").click();
  await expect(inspector(page).getByRole("textbox", { name: "Webhook address" })).toHaveValue(
    /\/api\/inbound\//,
  );
  await inspector(page).getByRole("button", { name: "Show secret", exact: true }).click();
  await expect(inspector(page).getByRole("textbox", { name: "Webhook secret" })).not.toHaveValue(
    "",
  );
});

test("leaving a workflow with unsaved changes asks first", async ({ page }) => {
  await openSeeded(page, REBRAND);
  const name = page.getByRole("textbox", { name: "Workflow name" });
  await name.fill(`${REBRAND} (edited)`);
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

  const leave = () =>
    sidebar(page)
      .getByRole("button")
      .filter({ has: page.getByText(NEWSLETTER, { exact: true }) })
      .click();
  const confirm = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });

  await leave();
  await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(name).toHaveValue(`${REBRAND} (edited)`);

  await leave();
  await confirm.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(name).toHaveValue(NEWSLETTER);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("a test run of a seeded workflow shows each step's result and changes nothing", async ({
  page,
}) => {
  await openSeeded(page, REBRAND);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Test run" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Run test", exact: true }).click();

  const result = page.getByRole("region", { name: "Test result" });
  await expect(result).toContainText("completed");
  await expect(page.getByText("Showing the test run on the canvas")).toBeVisible();

  await step(page, "Label").click();
  const ran = inspector(page).getByRole("region", { name: "In the test run" });
  await expect(ran).toContainText("Rebrand kickoff");
  await expect(ran).toContainText("would change this message");
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
});

test("the runs dock lists the seeded run and draws it on the canvas", async ({ page }) => {
  await openSeeded(page, REBRAND);
  await page.getByRole("tab", { name: "Runs" }).click();
  const completed = page
    .getByRole("list", { name: "Recent runs" })
    .getByRole("button")
    .filter({ hasText: "completed" })
    .first();
  await expect(completed).toBeVisible();
  await completed.click();
  await expect(page.getByText(/^Showing run \w{8} on the canvas$/)).toBeVisible();
  await expect(page.getByText("Showing a run on the canvas")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Filter to Label" }).locator("path.react-flow__edge-path"),
  ).toHaveCSS("stroke-dasharray", "none");

  await page.getByRole("button", { name: "Replay in a test", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Test run" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText(/^Replaying run \w{8}$/)).toBeVisible();
});

test("the keyboard shortcuts dialog lists the workflow keys", async ({ page }) => {
  await page.getByRole("button", { name: "More workflow actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  const help = page.getByRole("dialog");
  await expect(help.getByText("Add step", { exact: true })).toBeVisible();
  await expect(help.getByText("Tidy up the layout", { exact: true })).toBeVisible();
  await expect(help.getByText("Save", { exact: true })).toBeVisible();
  await expect(help.getByText("Duplicate the selected steps", { exact: true })).toBeVisible();
});
