import { startAuthorization } from "@modelcontextprotocol/client";
import type { Page } from "@playwright/test";
import { z } from "zod";

import { enterCode } from "../auth";
import { entry } from "../drive";
import { type Rpc, uniqueName } from "../fixtures";
import { drivePath, harness } from "../harness";
import {
  approveConsent,
  authorize,
  authServerMetadata,
  beginAuthorization,
  clientIdFor,
  connect,
  denyConsent,
  finishAuthorization,
  ISSUER,
  MODERN,
  modernBody,
  modernHeaders,
  postMcp,
  RESOURCE,
  refresh,
  mcpTest as test,
  toolJson,
  toolText,
} from "../mcp";

const { expect } = test;

const MCP_CALLS_PER_MINUTE = 60;

interface McpClientRow {
  clientId: string;
  slug: string;
  label: string;
  enabled: boolean;
  tools: Record<string, boolean>;
}

const CLIENT_GONE = "This MCP client is disabled or no longer registered";

async function clientRow(rpc: Rpc, clientId: string): Promise<McpClientRow | undefined> {
  return (await rpc<McpClientRow[]>("mcp.listClients")).find((c) => c.clientId === clientId);
}

async function callStatus(accessToken: string): Promise<{ status: number; text: string }> {
  const res = await postMcp(accessToken, modernBody("tools/list"), modernHeaders("tools/list"));
  return { status: res.status, text: await res.text() };
}

async function workspaceIdOf(accessToken: string, slug: string): Promise<string | undefined> {
  const client = await connect(accessToken, MODERN);
  const { workspaces } = toolJson(
    await client.callTool({ name: "listWorkspaces", arguments: {} }),
    z.object({
      workspaces: z.array(z.object({ workspaceId: z.string(), slug: z.string() })),
    }),
  );
  await client.close();
  return workspaces.find((w) => w.slug === slug)?.workspaceId;
}

async function authorizeStatus(page: Page, clientId: string, redirectUri: string) {
  const { authorizationUrl } = await startAuthorization(ISSUER, {
    metadata: await authServerMetadata(),
    clientInformation: { client_id: clientId },
    redirectUrl: redirectUri,
    scope: "offline_access",
    resource: RESOURCE,
  });
  const res = await page.request.get(authorizationUrl.toString(), {
    maxRedirects: 0,
  });
  return {
    status: res.status(),
    body: await res.text(),
    location: res.headers().location,
  };
}

export default function mcpSpecs() {
  test("first-time consent shows the client, its workspaces and its tools, and approving again after a failed grant succeeds", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const clientId = clientIdFor(name);
    const listed = async () =>
      (await rpc<McpClientRow[]>("mcp.listClients")).filter((c) => c.clientId === clientId);
    const start = await beginAuthorization(clientId);
    try {
      await page.goto(start.authorizationUrl.toString());

      const main = page.getByRole("main");
      const approve = main.getByRole("button", {
        name: "Approve",
        exact: true,
      });
      await expect(
        main.getByRole("heading", { level: 1, name: `Quillmate ${name}` }),
      ).toBeVisible();
      await expect(main.getByText(clientId)).toBeVisible();
      await expect(main.getByText("returns to 127.0.0.1")).toBeVisible();
      await expect(
        main.getByRole("toolbar").getByText(`${account.name}'s workspace`, { exact: true }),
      ).toBeVisible();
      await expect(
        main.getByRole("button", { name: /^Non-sensitive .* (\d+) \/ \1$/ }),
      ).toBeVisible();
      await expect(main.getByRole("button", { name: /^Sensitive .* 0 \/ \d+$/ })).toBeVisible();
      await expect(approve).toBeDisabled();

      await page.route("**/api/auth/oauth2/consent", (route) => route.abort());
      await enterCode(page, await harness.totp());
      await approve.click();
      await expect(approve).toBeEnabled();
      await page.unroute("**/api/auth/oauth2/consent");
      await approve.click();

      const tokens = await finishAuthorization(clientId, start);
      expect((await callStatus(tokens.access_token)).status).toBe(200);
      const rows = await listed();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.label).toBe(`Quillmate ${name}`);
    } finally {
      if ((await listed()).length > 0) {
        await rpc("mcp.deleteClient", { clientId });
      }
    }
  });

  test("denying consent returns access_denied and registers nothing", async ({
    page,
    rpc,
  }, testInfo) => {
    const clientId = clientIdFor(uniqueName(testInfo));
    const start = await beginAuthorization(clientId);
    await page.goto(start.authorizationUrl.toString());
    await denyConsent(page);
    const params = await start.callback.next();
    await start.callback.close();
    expect(params.get("error")).toBe("access_denied");
    expect(params.get("iss")).toBe(ISSUER);
    expect(await clientRow(rpc, clientId)).toBeUndefined();
  });

  test("a client's lifecycle: refresh rotation, disable, re-enable, revoke and delete", async ({
    page,
    rpc,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const grant = await authorize(page, clientIdFor(name));
    const { clientId } = grant;
    const firstRefresh = grant.tokens.refresh_token ?? "";
    expect(firstRefresh).not.toBe("");

    let tokens = grant.tokens;
    await test.step("a refresh token works once", async () => {
      tokens = await refresh(clientId, firstRefresh);
      expect(tokens.refresh_token).toBeTruthy();
      expect(tokens.refresh_token).not.toBe(firstRefresh);
      await expect.soft(refresh(clientId, firstRefresh)).rejects.toThrow();
    });

    const row = await clientRow(rpc, clientId);
    expect(row).toBeDefined();
    await page.goto(`/settings/mcp/${row?.slug}`);

    await test.step("disabling turns an issued token into a 403", async () => {
      const enabled = page
        .getByRole("main")
        .getByRole("switch", { name: `Quillmate ${name} enabled`, exact: true });
      await expect(enabled).toHaveAttribute("aria-checked", "true");
      await enabled.click();
      await expect(enabled).toHaveAttribute("aria-checked", "false");
      await expect.poll(async () => (await clientRow(rpc, clientId))?.enabled).toBe(false);
      const call = await callStatus(tokens.access_token);
      expect(call.status).toBe(403);
      expect(call.text).toContain(CLIENT_GONE);
    });

    await test.step("re-enabling asks for TOTP", async () => {
      await expect(rpc("mcp.setEnabled", { clientId, enabled: true })).rejects.toMatchObject({
        status: 400,
      });
      await rpc("mcp.setEnabled", {
        clientId,
        enabled: true,
        code: await harness.totp(),
      });
      expect((await callStatus(tokens.access_token)).status).toBe(200);
    });

    await test.step("revoking its grants makes a refresh fail", async () => {
      await rpc("mcp.revokeGrants", { clientId });
      await expect(refresh(clientId, tokens.refresh_token ?? "")).rejects.toThrow();
    });

    await test.step("removing the client turns the token into a 403", async () => {
      await page.reload();
      await page
        .getByRole("main")
        .getByRole("button", { name: "Remove client", exact: true })
        .click();
      await page
        .getByRole("alertdialog", { name: `Remove Quillmate ${name}?` })
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await expect.poll(async () => clientRow(rpc, clientId)).toBeUndefined();
      const call = await callStatus(tokens.access_token);
      expect(call.status).toBe(403);
      expect(call.text).toContain(CLIENT_GONE);
    });
  });

  test("tool and workspace switches take effect on the next request", async ({
    page,
    rpc,
    workerGrant,
    account,
  }, testInfo) => {
    const { clientId } = workerGrant;
    const token = workerGrant.tokens.access_token;
    const names = async () => {
      const client = await connect(token, MODERN);
      const listed = (await client.listTools()).tools.map((t) => t.name);
      await client.close();
      return listed;
    };

    await test.step("turning a sensitive tool on lists it", async () => {
      expect(await names()).not.toContain("createFolder");
      await rpc("mcp.setTools", {
        clientId,
        tools: { createFolder: true, deleteFile: true },
      });
      expect(await names()).toEqual(expect.arrayContaining(["createFolder", "deleteFile"]));
    });

    await test.step("createFolder through MCP shows in the drive explorer", async () => {
      const workspaceId = await workspaceIdOf(token, account.workspaceSlug);
      const client = await connect(token, MODERN);
      const { drives } = toolJson(
        await client.callTool({
          name: "listDrives",
          arguments: { workspaceId },
        }),
        z.object({
          drives: z.array(z.object({ driveId: z.string(), provider: z.string() })),
        }),
      );
      const driveId = drives.find((d) => d.provider === "webdav")?.driveId;
      const folder = uniqueName(testInfo);
      const created = await client.callTool({
        name: "createFolder",
        arguments: { workspaceId, driveId, name: folder },
      });
      expect(created.isError).toBeFalsy();

      await page.goto(drivePath(account, "webdav"));
      await expect(entry(page, folder)).toBeVisible();

      const { entries } = toolJson(
        await client.callTool({
          name: "listFolder",
          arguments: { workspaceId, driveId },
        }),
        z.object({
          entries: z.array(z.object({ fileId: z.string(), name: z.string() })),
        }),
      );
      const fileId = entries.find((e) => e.name === folder)?.fileId;
      const deleted = await client.callTool({
        name: "deleteFile",
        arguments: { workspaceId, driveId, fileId },
      });
      expect(deleted.isError).toBeFalsy();
      await client.close();
      await page.reload();
      await expect(entry(page, "welcome.txt")).toBeVisible();
      await expect(entry(page, folder)).toHaveCount(0);
      await rpc("mcp.setTools", { clientId, tools: {} });
    });

    await test.step("a hidden workspace and a workspace with AI off are unreachable", async () => {
      const created = await rpc<{ workspaceId: string; slug: string }>("workspaces.create", {
        name: uniqueName(testInfo),
      });
      try {
        expect(await workspaceIdOf(token, created.slug)).toBe(created.workspaceId);

        await rpc("mcp.setHiddenWorkspaces", {
          clientId,
          workspaceIds: [created.workspaceId],
        });
        expect(await workspaceIdOf(token, created.slug)).toBeUndefined();
        const client = await connect(token, MODERN);
        const refused = toolText(
          await client.callTool({
            name: "listMailboxes",
            arguments: { workspaceId: created.workspaceId },
          }),
        );
        expect(refused).toContain("not a workspace this client can reach");
        await client.close();

        await rpc("mcp.setHiddenWorkspaces", { clientId, workspaceIds: [] });
        expect(await workspaceIdOf(token, created.slug)).toBe(created.workspaceId);

        await rpc("workspaces.setPolicy", {
          workspaceSlug: created.slug,
          aiPolicy: "off",
          code: await harness.totp(),
        });
        expect(await workspaceIdOf(token, created.slug)).toBeUndefined();
      } finally {
        await rpc("workspaces.delete", {
          workspaceSlug: created.slug,
          code: await harness.totp(),
        });
      }
    });

    await test.step("the 61st call in a minute is a 429 with Retry-After", async () => {
      let last: Response | undefined;
      for (let i = 0; i < 2 * MCP_CALLS_PER_MINUTE + 1; i++) {
        last = await postMcp(token, modernBody("tools/list"), modernHeaders("tools/list"));
        if (last.status === 429) break;
      }
      expect(last?.status).toBe(429);
      expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    });
  });

  test("a manually added client: loopback ports on 127.0.0.1 only, and repeated labels get a numbered slug", async ({
    page,
    rpc,
  }, testInfo) => {
    const label = uniqueName(testInfo);
    const created = await rpc<{ client: McpClientRow }>("mcp.createClient", {
      label,
      preset: "custom",
      redirectUris: ["http://127.0.0.1/callback", "http://localhost:43123/callback"],
    });
    const second = await rpc<{ client: McpClientRow }>("mcp.createClient", {
      label,
      preset: "custom",
      redirectUris: ["http://127.0.0.1/callback"],
    });
    try {
      expect(second.client.slug).toBe(`${created.client.slug}-2`);
      const { clientId } = created.client;

      const start = await beginAuthorization(clientId);
      await page.goto(start.authorizationUrl.toString());
      await approveConsent(page);
      const tokens = await finishAuthorization(clientId, start);
      expect((await callStatus(tokens.access_token)).status).toBe(200);

      const elsewhere = await authorizeStatus(page, clientId, "http://localhost:43999/callback");
      expect(
        elsewhere.location ?? "",
        "an unregistered localhost port must not reach consent",
      ).not.toContain("/oauth/consent");
      expect(elsewhere.location ?? "").not.toMatch(/^http:\/\/localhost:43999\//);
    } finally {
      await rpc("mcp.deleteClient", { clientId: created.client.clientId });
      await rpc("mcp.deleteClient", { clientId: second.client.clientId });
    }
  });

  test("the consent page names a redirect host that is not loopback", async ({ page }) => {
    const clientId = clientIdFor("foreign-redirect");
    const { authorizationUrl } = await startAuthorization(ISSUER, {
      metadata: await authServerMetadata(),
      clientInformation: { client_id: clientId },
      redirectUrl: "https://callback.example.org/oauth",
      scope: "offline_access",
      resource: RESOURCE,
    });
    await page.goto(authorizationUrl.toString());
    await expect(page.getByText("returns to callback.example.org")).toBeVisible();
  });
}
