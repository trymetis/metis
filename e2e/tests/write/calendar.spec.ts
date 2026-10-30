import { calendarCollectionUrl } from "@metis/e2e/lib/calendars";
import { env } from "@metis/e2e/lib/env";
import type { Page } from "@playwright/test";

import { vcalendar } from "../../seed/ics";
import { REBRAND_REVIEW } from "../../seed/mailbox/anchors";
import { REVIEW_WEEK, timedEvent, toolbar } from "../calendar";
import { expect, test, uniqueName } from "../fixtures";
import { calendarPath } from "../harness";

const INVITE_HREF = `${calendarCollectionUrl(env.servers.caldavOrigin, env.caldav.user, "work")}rebrand-review.ics`;
const AUTH = `Basic ${Buffer.from(`${env.caldav.user}:${env.caldav.pass}`).toString("base64")}`;

function inviteEvent(): string {
  return vcalendar([REBRAND_REVIEW]);
}

async function putEvent(href: string, ics: string): Promise<void> {
  const res = await fetch(href, {
    method: "PUT",
    headers: {
      authorization: AUTH,
      "content-type": "text/calendar; charset=utf-8",
    },
    body: ics,
  });
  if (!res.ok) throw new Error(`PUT ${href}: HTTP ${res.status}`);
}

async function getEvent(href: string): Promise<string> {
  const res = await fetch(href, { headers: { authorization: AUTH } });
  if (!res.ok) throw new Error(`GET ${href}: HTTP ${res.status}`);
  return res.text();
}

async function deleteEvent(href: string): Promise<void> {
  await fetch(href, { method: "DELETE", headers: { authorization: AUTH } });
}

async function openCalendarWeek(page: Page, path: string) {
  await page.clock.setFixedTime(REVIEW_WEEK);
  await page.goto(path);
  await expect(
    toolbar(page).getByRole("heading", { level: 1, name: "October 2026" }),
  ).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Week", exact: true })).toBeVisible();
}

function eventPopover(page: Page, title: string) {
  return page.getByRole("dialog").filter({
    has: page.getByRole("heading", { level: 2, name: title, exact: true }),
  });
}

export default function calendarSpecs() {
  test("create, edit and delete an event on the CalDAV calendar", async ({
    page,
    account,
  }, testInfo) => {
    const title = uniqueName(testInfo);
    const renamed = `${title}-edited`;
    await openCalendarWeek(page, calendarPath(account));

    await toolbar(page).getByRole("heading", { level: 1 }).click();
    await page.keyboard.press("c");
    await page.keyboard.press("n");
    const dialog = page.getByRole("dialog", { name: "New event" });
    await dialog.getByRole("textbox", { name: "Event title" }).fill(title);
    await expect(dialog.getByRole("combobox", { name: "Starts at" })).toContainText("1:00 PM");
    await dialog.getByRole("combobox").filter({ hasText: "ana@demo.trymetis.email" }).click();
    await page
      .getByRole("listbox")
      .getByRole("option", { name: "Work · ana@demo.trymetis.email", exact: true })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "Event title" }),
      "the typed title survives until Save",
    ).toHaveValue(title);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const created = timedEvent(page, `${title} 1pm – 2pm`);
    await expect(created).toBeVisible();

    await created.click();
    await eventPopover(page, title).getByRole("button", { name: "Edit event" }).click();
    const edit = page.getByRole("dialog", { name: "Edit event" });
    await expect(
      edit.getByRole("combobox").filter({ hasText: "ana@demo.trymetis.email" }),
    ).toContainText("Work · ana@demo.trymetis.email");
    await edit.getByRole("textbox", { name: "Event title" }).fill(renamed);
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(edit).toBeHidden();
    const edited = timedEvent(page, `${renamed} 1pm – 2pm`);
    await expect(edited).toBeVisible();
    await page.reload();
    await expect(edited).toBeVisible();
    await expect(created).toHaveCount(0);

    await edited.click();
    await eventPopover(page, renamed).getByRole("button", { name: "Delete event" }).click();
    await page
      .getByRole("alertdialog", { name: `Delete ${renamed}?` })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(eventPopover(page, renamed)).toHaveCount(0);
    await expect(edited).toHaveCount(0);
    await page.reload();
    await expect(timedEvent(page, "Design review 3pm – 4pm")).toBeVisible();
    await expect(edited).toHaveCount(0);
  });

  test("respond to the seeded invite, then restore the original response", async ({
    page,
    account,
  }) => {
    const invite = inviteEvent();
    const review = timedEvent(page, "Rebrand review 3pm – 3:45pm");
    await putEvent(INVITE_HREF, invite);
    try {
      await openCalendarWeek(page, calendarPath(account));
      await review.click();
      const popover = eventPopover(page, "Rebrand review");
      const yes = popover.getByRole("button", { name: "Yes", exact: true });
      await expect(yes).toHaveAttribute("aria-pressed", "false");
      await yes.click();
      await expect(yes).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(async () => (await getEvent(INVITE_HREF)).replace(/\r\n /g, ""))
        .toMatch(/ATTENDEE[^\r\n]*PARTSTAT=ACCEPTED[^\r\n]*mailto:ana@demo\.trymetis\.email/);

      await putEvent(INVITE_HREF, invite);
      await page.reload();
      await review.click();
      await expect(yes).toHaveAttribute("aria-pressed", "false");
      expect(await getEvent(INVITE_HREF)).toContain("PARTSTAT=NEEDS-ACTION");
    } finally {
      await deleteEvent(INVITE_HREF);
    }
    await page.reload();
    await expect(timedEvent(page, "Design review 3pm – 4pm")).toBeVisible();
    await expect(review).toHaveCount(0);
  });
}
