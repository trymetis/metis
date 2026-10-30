import { env } from "@metis/e2e/lib/env";
import type { Page } from "@playwright/test";

import { enterCode } from "../auth";
import { expect, type Rpc, test, uniqueName } from "../fixtures";
import { harness } from "../harness";
import { authorize, beginAuthorization, clientIdFor, connect, MODERN } from "../mcp";
import { ensureSecondUser, type SecondUser, secondUserContext, totpFor } from "../second-user";

interface Member {
  memberId: string;
  email: string;
  role: string;
}

async function memberId(rpc: Rpc, workspaceSlug: string, email: string): Promise<string> {
  const { members } = await rpc<{ members: Member[] }>("workspaces.listMembers", { workspaceSlug });
  const found = members.find((m) => m.email === email);
  if (!found) throw new Error(`${email} is not a member of ${workspaceSlug}`);
  return found.memberId;
}

async function joinByInvite(anaRpc: Rpc, page: Page, workspaceSlug: string, user: SecondUser) {
  const invite = await anaRpc<{ url: string }>("workspaces.createInvite", {
    workspaceSlug,
    email: user.email,
  });
  await page.goto(invite.url);
  await page.waitForURL(new RegExp(`/w/${workspaceSlug}`));
}

async function expectNotFound(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status()).toBe(404);
}

export default function memberSpecs() {
  test("a member sees every linked resource, never another member's personal rows, and leaves with their links", async ({
    browser,
    rpc,
    account,
  }) => {
    const user = await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    const ws = { workspaceSlug: account.workspaceSlug };
    const mailbox = { ...ws, mailboxSlug: account.mailboxSlug };

    await joinByInvite(rpc, second.page, account.workspaceSlug, user);

    try {
      await test.step("Ana's mailbox is visible, Ana's personal rows are not", async () => {
        const { mailboxes } = await second.rpc<{
          mailboxes: { email: string }[];
        }>("workspaceMailboxes.list", ws);
        expect(mailboxes.map((m) => m.email)).toContain(account.email);

        const anaMuted = await rpc<{ threadIds: string[] }>("mail.mute.list", mailbox);
        const anaLater = await rpc<{ messageIds: string[] }>("mail.readLater.list", mailbox);
        const anaThreads = await rpc<{ threads: unknown[] }>("assistant.listThreads", ws);
        expect(anaMuted.threadIds.length).toBeGreaterThan(0);
        expect(anaLater.messageIds.length).toBeGreaterThan(0);
        expect(anaThreads.threads.length).toBeGreaterThan(0);

        expect(
          (await second.rpc<{ threadIds: string[] }>("mail.mute.list", mailbox)).threadIds,
        ).toEqual([]);
        expect(
          (await second.rpc<{ messageIds: string[] }>("mail.readLater.list", mailbox)).messageIds,
        ).toEqual([]);
        expect(
          (await second.rpc<{ threads: unknown[] }>("assistant.listThreads", ws)).threads,
        ).toEqual([]);
      });

      await test.step("a run over the workspace's mailboxes is visible", async () => {
        const { runs } = await second.rpc<{ runs: unknown[] }>("workflows.runs", ws);
        expect(runs.length).toBeGreaterThan(0);
      });

      const attached = await second.rpc<{ slug: string | null }>("connections.createCredential", {
        email: `${env.caldavStress.user}@demo.trymetis.email`,
        credentials: {
          provider: "caldav",
          server: env.servers.caldav,
          user: env.caldavStress.user,
          pass: env.caldavStress.pass,
        },
        attachToWorkspaceSlug: account.workspaceSlug,
      });
      expect(attached.slug).toBeTruthy();
      const calendarsOf = async () =>
        (
          await rpc<{ calendars: { email: string }[] }>("workspaceCalendars.list", ws)
        ).calendars.map((c) => c.email);
      expect(await calendarsOf()).toContain(`${env.caldavStress.user}@demo.trymetis.email`);

      await rpc("workspaces.removeMember", {
        ...ws,
        memberId: await memberId(rpc, account.workspaceSlug, user.email),
      });
      expect(await calendarsOf()).not.toContain(`${env.caldavStress.user}@demo.trymetis.email`);
      const { workspaces } = await second.rpc<{
        workspaces: { slug: string }[];
      }>("workspaces.list");
      expect(workspaces.map((w) => w.slug)).not.toContain(account.workspaceSlug);

      const { calendars } = await second.rpc<{
        calendars: { calendarId: string; email: string }[];
      }>("calendars.list");
      for (const calendar of calendars) {
        await second.rpc("calendars.delete", {
          calendarId: calendar.calendarId,
        });
      }
    } finally {
      const { members } = await rpc<{ members: Member[] }>("workspaces.listMembers", ws);
      const stayed = members.find((m) => m.email === user.email);
      if (stayed)
        await rpc("workspaces.removeMember", {
          ...ws,
          memberId: stayed.memberId,
        });
      const { calendars: left } = await second.rpc<{
        calendars: { calendarId: string }[];
      }>("calendars.list");
      for (const calendar of left)
        await second.rpc("calendars.delete", {
          calendarId: calendar.calendarId,
        });
      await second.context.close();
    }
  });

  test("ownership of a test workspace moves to the member and back, each with their own TOTP", async ({
    browser,
    rpc,
  }, testInfo) => {
    const user = await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    const created = await rpc<{ slug: string }>("workspaces.create", {
      name: uniqueName(testInfo),
    });
    const ws = { workspaceSlug: created.slug };
    try {
      await joinByInvite(rpc, second.page, created.slug, user);
      await rpc("workspaces.transferOwnership", {
        ...ws,
        memberId: await memberId(rpc, created.slug, user.email),
        code: await harness.totp(),
      });
      const roleOf = async (who: Rpc) =>
        (
          await who<{ workspaces: { slug: string; role: string }[] }>("workspaces.list")
        ).workspaces.find((w) => w.slug === created.slug)?.role;
      expect(await roleOf(second.rpc)).toBe("owner");

      const ana = (await harness.account()).email;
      await second.rpc("workspaces.transferOwnership", {
        ...ws,
        memberId: await memberId(second.rpc, created.slug, ana),
        code: totpFor(user),
      });
      expect(await roleOf(rpc)).toBe("owner");
    } finally {
      await rpc("workspaces.delete", { ...ws, code: await harness.totp() });
      await second.context.close();
    }
  });

  test("the member profile promotes with TOTP, demotes and removes a member", async ({
    browser,
    page,
    rpc,
  }, testInfo) => {
    const user = await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    const created = await rpc<{ slug: string }>("workspaces.create", {
      name: uniqueName(testInfo),
    });
    const ws = { workspaceSlug: created.slug };
    const roleOf = async () =>
      (
        await rpc<{ members: (Member & { userId: string })[] }>("workspaces.listMembers", ws)
      ).members.find((m) => m.email === user.email)?.role;
    try {
      await joinByInvite(rpc, second.page, created.slug, user);
      const { members } = await rpc<{
        members: (Member & { userId: string })[];
      }>("workspaces.listMembers", ws);
      const target = members.find((m) => m.email === user.email);
      expect(target).toBeDefined();

      await page.goto(`/w/${created.slug}/members`);
      await page
        .getByRole("list", { name: "Members" })
        .getByRole("link", { name: new RegExp(user.email) })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/members/${encodeURIComponent(target?.userId ?? "")}`),
      );
      const main = page.getByRole("main");

      await test.step("promoting asks for a TOTP code", async () => {
        await main.getByRole("combobox", { name: "Role" }).click();
        await page.getByRole("option", { name: "Admin", exact: true }).click();
        const confirm = page.getByRole("alertdialog", {
          name: "Make this member an admin?",
        });
        await expect(confirm).toBeVisible();
        await enterCode(page, await harness.totp());
        await confirm.getByRole("button", { name: "Make admin", exact: true }).click();
        await expect.poll(roleOf).toBe("admin");
      });

      await test.step("demoting needs no code", async () => {
        await main.getByRole("combobox", { name: "Role" }).click();
        await page.getByRole("option", { name: "Member", exact: true }).click();
        await expect.poll(roleOf).toBe("member");
      });

      await test.step("removing confirms first", async () => {
        await main.getByRole("button", { name: "Remove from workspace", exact: true }).click();
        await page
          .getByRole("alertdialog", { name: /^Remove / })
          .getByRole("button", { name: "Remove", exact: true })
          .click();
        await expect.poll(roleOf).toBeUndefined();
        await expect(
          main.getByText("This person is not a member of this workspace."),
        ).toBeVisible();
      });
    } finally {
      await rpc("workspaces.delete", { ...ws, code: await harness.totp() });
      await second.context.close();
    }
  });

  test("the owner dashboard is a 404 for a member", async ({ browser, rpc }) => {
    await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    await expectNotFound(second.page, "/dashboard");
    await second.context.close();
  });

  test("MCP: a member cannot take over Ana's client, gets no owner tools, and cannot open Ana's client page", async ({
    browser,
    page,
    rpc,
  }, testInfo) => {
    const user = await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    const anaClient = clientIdFor(`${uniqueName(testInfo)}-ana`);
    const ownClient = clientIdFor(`${uniqueName(testInfo)}-member`);
    await authorize(page, anaClient);
    try {
      await test.step("approving a client URL Ana connected is a conflict", async () => {
        const start = await beginAuthorization(anaClient);
        await second.page.goto(start.authorizationUrl.toString());
        await enterCode(second.page, totpFor(user));
        await second.page
          .getByRole("main")
          .getByRole("button", { name: "Approve", exact: true })
          .click();
        await expect(
          second.page
            .getByRole("main")
            .getByText("This client is already connected", { exact: true }),
        ).toBeVisible();
        await start.callback.close();
      });

      await test.step("the member's own client gets no owner tools", async () => {
        const grant = await authorize(second.page, ownClient, {
          totp: () => totpFor(user),
        });
        const client = await connect(grant.tokens.access_token, MODERN);
        const names = (await client.listTools()).tools.map((t) => t.name);
        await client.close();
        expect(names).toContain("listWorkspaces");
        for (const tool of ["getInstanceStats", "getSystemOverview", "getPreflightWarnings"]) {
          expect(names).not.toContain(tool);
        }
      });

      await test.step("Ana's client page is a 404 for the member", async () => {
        const slug = (await rpc<{ clientId: string; slug: string }[]>("mcp.listClients")).find(
          (c) => c.clientId === anaClient,
        )?.slug;
        expect(slug).toBeTruthy();
        await expectNotFound(second.page, `/settings/mcp/${slug}`);
      });
    } finally {
      await rpc("mcp.deleteClient", { clientId: anaClient }).catch(() => {});
      await second.rpc("mcp.deleteClient", { clientId: ownClient }).catch(() => {});
      await second.context.close();
    }
  });

  test("a revoked invite shows in workspace activity, security activity and the dashboard audit log", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const ws = { workspaceSlug: account.workspaceSlug };
    const email = `${uniqueName(testInfo)}@discard.demo.trymetis.email`;
    const { id } = await rpc<{ id: string }>("workspaces.createInvite", {
      ...ws,
      email,
    });
    await rpc("workspaces.revokeInvite", { ...ws, inviteId: id });

    const events = page.getByRole("list", { name: "Audit events" });
    const revoked = events
      .getByRole("listitem")
      .filter({ hasText: "Workspace invite revoked" })
      .filter({ hasText: email });

    await page.goto(`/w/${account.workspaceSlug}/settings/general`);
    await page.getByRole("navigation").getByRole("link", { name: "Activity" }).click();
    await page.waitForURL(/\/settings\/activity$/);
    await expect(revoked).toBeVisible();

    await page.goto("/settings/security");
    await expect(revoked).toBeVisible();

    await page.goto("/dashboard/audit");
    await expect(revoked).toBeVisible();
  });
}
