import { calendars, chooseView, monthDay, REVIEW_WEEK, timedEvent, toolbar } from "../calendar";
import { expect, test } from "../fixtures";
import { ANA_STATE, calendarPath } from "../harness";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(REVIEW_WEEK);
});

test("day, week, month, year and schedule views, and today", async ({ page, account }) => {
  await page.goto(calendarPath(account));
  await expect(
    toolbar(page).getByRole("heading", { level: 1, name: "October 2026" }),
  ).toBeVisible();

  await chooseView(page, "Day");
  await expect(timedEvent(page, "Design review 3pm – 4pm")).toBeVisible();
  await expect(timedEvent(page, "Daily standup")).toHaveCount(1);

  await chooseView(page, "Week");
  await expect(timedEvent(page, "Daily standup")).toHaveCount(5);
  await expect(timedEvent(page, "Design review 3pm – 4pm")).toBeVisible();

  await chooseView(page, "Month");
  await expect(
    monthDay(page, "October 8").getByRole("button", {
      name: "9am Daily standup",
      exact: true,
    }),
  ).toBeVisible();

  await chooseView(page, "Year");
  await expect(toolbar(page).getByRole("heading", { level: 1, name: "2026" })).toBeVisible();
  for (const month of ["January", "June", "December"]) {
    await expect(page.getByRole("heading", { level: 2, name: month, exact: true })).toBeVisible();
  }

  await chooseView(page, "Schedule");
  await expect(timedEvent(page, "3pm – 4pm Design review ana@demo.trymetis.email")).toBeVisible();

  await chooseView(page, "Month");
  await toolbar(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    toolbar(page).getByRole("heading", { level: 1, name: "November 2026" }),
  ).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    toolbar(page).getByRole("heading", { level: 1, name: "October 2026" }),
  ).toBeVisible();
});

test("a sidebar toggle hides a calendar for this browser only", async ({
  page,
  browser,
  account,
}) => {
  await page.goto(calendarPath(account));
  await chooseView(page, "Month");
  const standup = monthDay(page, "October 8").getByRole("button", {
    name: "9am Daily standup",
    exact: true,
  });
  await expect(standup).toBeVisible();
  const showWork = calendars(page).getByRole("checkbox", { name: "Show Work" });
  await showWork.click();
  await expect(showWork).not.toBeChecked();
  await expect(standup).toHaveCount(0);

  const other = await browser.newContext({
    storageState: ANA_STATE,
    timezoneId: "UTC",
  });
  const second = await other.newPage();
  await second.clock.setFixedTime(REVIEW_WEEK);
  await second.goto(calendarPath(account));
  await chooseView(second, "Month");
  await expect(
    monthDay(second, "October 8").getByRole("button", {
      name: "9am Daily standup",
      exact: true,
    }),
  ).toBeVisible();
  await other.close();

  await showWork.click();
  await expect(showWork).toBeChecked();
  await expect(standup).toBeVisible();
});

test("another time zone sees the same instants moved", async ({ page, browser, account }) => {
  await page.goto(calendarPath(account));
  await chooseView(page, "Month");
  await expect(
    monthDay(page, "October 8").getByRole("button", {
      name: "9am Daily standup",
      exact: true,
    }),
  ).toBeVisible();

  const kolkata = await browser.newContext({
    storageState: ANA_STATE,
    timezoneId: "Asia/Kolkata",
  });
  const second = await kolkata.newPage();
  await second.clock.setFixedTime(REVIEW_WEEK);
  await second.goto(calendarPath(account));
  await chooseView(second, "Month");
  await expect(
    monthDay(second, "October 8").getByRole("button", {
      name: "2:30pm Daily standup",
      exact: true,
    }),
  ).toBeVisible();
  await kolkata.close();
});

test("the c chord switches views", async ({ page, account }) => {
  await page.goto(calendarPath(account));
  const heading = toolbar(page).getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("October 2026");
  await heading.click();
  await page.keyboard.press("c");
  await page.keyboard.press("m");
  await expect(toolbar(page).getByRole("button", { name: "Month", exact: true })).toBeVisible();
  await page.keyboard.press("c");
  await page.keyboard.press("y");
  await expect(toolbar(page).getByRole("button", { name: "Year", exact: true })).toBeVisible();
});
