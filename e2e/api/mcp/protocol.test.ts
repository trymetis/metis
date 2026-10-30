import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from "@modelcontextprotocol/client";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { APP, harness } from "../../clients/harness";
import {
  connect,
  ERAS,
  ISSUER,
  jsonRpc,
  MODERN,
  modernBody,
  modernHeaders,
  PROTECTED_RESOURCE_METADATA,
  postMcp,
  RESOURCE,
  toolJson,
  toolText,
} from "../../clients/mcp";
import { seededToken } from "../support/mcp";

const workspacesSchema = z.object({
  workspaces: z.array(z.object({ workspaceId: z.string(), slug: z.string() })),
});

const OWNER_TOOLS = ["getInstanceStats", "getSystemOverview", "getPreflightWarnings"];
const SENSITIVE_TOOLS = [
  "sendEmail",
  "deleteEmails",
  "createFolder",
  "deleteFile",
  "createEvent",
  "createWorkflow",
  "runSystemCheck",
  "unsubscribe",
];
const SEEDED_WORKFLOWS = [
  "Label rebrand mail",
  "Morning newsletter sweep",
  "File new mail from Raj",
  "Collect rebrand and Codeyard mail",
  "Label orders once both checks finish",
  "Triage with the decision model",
  "Triage new mail",
  "Star the newest mail once approved",
  "Label mail a webhook names",
];

const token = () => seededToken("defaults");

describe("discovery", () => {
  test("advertises the resource and an authorization server that supports metadata-document clients", async () => {
    const resource = z
      .object({
        resource: z.string(),
        authorization_servers: z.array(z.string()),
      })
      .parse(await (await fetch(PROTECTED_RESOURCE_METADATA)).json());
    expect(resource.resource).toBe(RESOURCE);
    expect(resource.authorization_servers).toHaveLength(1);

    const server = z
      .record(z.string(), z.unknown())
      .parse(await (await fetch(`${APP}/.well-known/oauth-authorization-server/api/auth`)).json());
    expect(server.issuer).toBe(ISSUER);
    expect(server.client_id_metadata_document_supported).toBe(true);
    expect(server.token_endpoint_auth_methods_supported).toContain("none");
    expect(server.code_challenge_methods_supported).toContain("S256");
    expect(server.authorization_response_iss_parameter_supported).toBe(true);
    expect(server).not.toHaveProperty("registration_endpoint");
  });

  test("a spec-following client finds the authorization server from the resource metadata", async () => {
    const resource = await discoverOAuthProtectedResourceMetadata(RESOURCE);
    const [authorizationServer] = resource.authorization_servers ?? [];
    expect(authorizationServer).toBeDefined();
    const metadata = await discoverAuthorizationServerMetadata(authorizationServer ?? "");
    expect(metadata?.issuer).toBe(authorizationServer);
  });

  test("a request without a token is a 401 naming the resource metadata", async () => {
    const res = await postMcp(null, modernBody("tools/list"), modernHeaders("tools/list"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      `resource_metadata="${PROTECTED_RESOURCE_METADATA}"`,
    );
  });

  test("a tampered token is a 401", async () => {
    const issued = await token();
    const tampered = `${issued.slice(0, -4)}${issued.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
    const res = await postMcp(tampered, modernBody("tools/list"), modernHeaders("tools/list"));
    expect(res.status).toBe(401);
  });
});

for (const era of ERAS) {
  describe(`tools in the ${era} era`, () => {
    test("tools/list is the default set", async () => {
      const client = await connect(await token(), era);
      const names = (await client.listTools()).tools.map((t) => t.name);
      await client.close();

      expect(names).toContain("listWorkspaces");
      expect(names).toContain("previewDecision");
      expect(names).not.toContain("analyzePhishing");
      for (const tool of OWNER_TOOLS) expect(names).toContain(tool);
      for (const tool of SENSITIVE_TOOLS) expect(names).not.toContain(tool);
    });

    test("list tools return the seeded workspace", async () => {
      const account = await harness.account();
      const client = await connect(await token(), era);
      const { workspaces } = toolJson(
        await client.callTool({ name: "listWorkspaces", arguments: {} }),
        workspacesSchema,
      );
      const workspace = workspaces.find((w) => w.slug === account.workspaceSlug);
      expect(workspace).toBeDefined();
      const workspaceId = workspace?.workspaceId ?? "";

      const { mailboxes } = toolJson(
        await client.callTool({
          name: "listMailboxes",
          arguments: { workspaceId },
        }),
        z.object({ mailboxes: z.array(z.object({ email: z.string() })) }),
      );
      expect(mailboxes.map((m) => m.email)).toEqual([account.email]);

      const { drives } = toolJson(
        await client.callTool({
          name: "listDrives",
          arguments: { workspaceId },
        }),
        z.object({ drives: z.array(z.unknown()) }),
      );
      expect(drives).toHaveLength(Object.keys(account.driveSlugs).length);

      const { calendars } = toolJson(
        await client.callTool({
          name: "listCalendars",
          arguments: { workspaceId },
        }),
        z.object({ calendars: z.array(z.object({ name: z.string() })) }),
      );
      expect(calendars.map((c) => c.name).toSorted()).toEqual([
        "Bulk",
        "Edge cases",
        "Personal",
        "Work",
      ]);

      const { workflows } = toolJson(
        await client.callTool({
          name: "listWorkflows",
          arguments: { workspaceId },
        }),
        z.object({ workflows: z.array(z.object({ name: z.string() })) }),
      );
      expect(workflows.map((w) => w.name)).toEqual(expect.arrayContaining(SEEDED_WORKFLOWS));
      await client.close();
    });

    test("a workspace the client cannot reach is refused, naming the reachable ones", async () => {
      const account = await harness.account();
      const client = await connect(await token(), era);
      const text = toolText(
        await client.callTool({
          name: "listMailboxes",
          arguments: { workspaceId: "00000000-0000-0000-0000-000000000000" },
        }),
      );
      await client.close();
      expect(text).toContain("not a workspace this client can reach");
      expect(text).toContain(account.name);
    });
  });
}

describe("Streamable HTTP rules (2026-07-28)", () => {
  test("a foreign Origin is a 403", async () => {
    const res = await postMcp(await token(), modernBody("tools/list"), {
      ...modernHeaders("tools/list"),
      origin: "https://attacker.example",
    });
    expect(res.status).toBe(403);
  });

  test("a missing Mcp-Method header is a 400 HeaderMismatch", async () => {
    const res = await postMcp(await token(), modernBody("tools/list"), {
      "MCP-Protocol-Version": MODERN,
    });
    expect(res.status).toBe(400);
    expect((await jsonRpc(res)).error).toMatchObject({ code: -32020 });
  });

  test("an Mcp-Method that does not match the body is a 400 HeaderMismatch", async () => {
    const res = await postMcp(
      await token(),
      modernBody("tools/list"),
      modernHeaders("prompts/list"),
    );
    expect(res.status).toBe(400);
    expect((await jsonRpc(res)).error).toMatchObject({ code: -32020 });
  });

  test("an Mcp-Name that does not match the called tool is a 400 HeaderMismatch", async () => {
    const res = await postMcp(
      await token(),
      modernBody("tools/call", { name: "listWorkspaces", arguments: {} }),
      modernHeaders("tools/call", "listMailboxes"),
    );
    expect(res.status).toBe(400);
    expect((await jsonRpc(res)).error).toMatchObject({ code: -32020 });
  });

  test("an MCP-Protocol-Version that does not match the body is a 400 HeaderMismatch", async () => {
    const res = await postMcp(await token(), modernBody("tools/list"), {
      ...modernHeaders("tools/list"),
      "MCP-Protocol-Version": "2025-11-25",
    });
    expect(res.status).toBe(400);
    expect((await jsonRpc(res)).error).toMatchObject({ code: -32020 });
  });

  test("an unsupported protocol version is a 400 listing the supported ones", async () => {
    const body = modernBody("tools/list", {}, "2099-01-01");
    const res = await postMcp(await token(), body, {
      ...modernHeaders("tools/list"),
      "MCP-Protocol-Version": "2099-01-01",
    });
    expect(res.status).toBe(400);
    const error = z
      .object({ data: z.object({ supported: z.array(z.string()) }) })
      .parse((await jsonRpc(res)).error);
    expect(error.data.supported).toContain(MODERN);
  });

  test("GET on the endpoint is a 405", async () => {
    const res = await fetch(RESOURCE, {
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(405);
  });

  test("tools/list carries private caching hints", async () => {
    const res = await postMcp(await token(), modernBody("tools/list"), modernHeaders("tools/list"));
    expect(res.status).toBe(200);
    const result = z
      .object({ ttlMs: z.number().int().min(0), cacheScope: z.string() })
      .parse((await jsonRpc(res)).result);
    expect(result.cacheScope).toBe("private");
  });
});

test("summarizeThread and previewDecision replay", async () => {
  const account = await harness.account();
  const client = await connect(await token(), MODERN);
  const { workspaces } = toolJson(
    await client.callTool({ name: "listWorkspaces", arguments: {} }),
    workspacesSchema,
  );
  const workspaceId = workspaces.find((w) => w.slug === account.workspaceSlug)?.workspaceId ?? "";
  const { mailboxes } = toolJson(
    await client.callTool({
      name: "listMailboxes",
      arguments: { workspaceId },
    }),
    z.object({ mailboxes: z.array(z.object({ mailboxId: z.string() })) }),
  );
  const mailboxId = mailboxes[0]?.mailboxId ?? "";
  const { emails } = toolJson(
    await client.callTool({
      name: "searchMail",
      arguments: { workspaceId, query: "Rebrand kickoff", mailboxId },
    }),
    z.object({
      emails: z.array(z.object({ id: z.string(), threadId: z.string(), subject: z.string() })),
    }),
  );
  const kickoff = emails.find((e) => e.subject === "Rebrand kickoff");
  expect(kickoff).toBeDefined();

  const summary = await client.callTool({
    name: "summarizeThread",
    arguments: {
      workspaceId,
      mailboxId,
      id: kickoff?.id,
      threadId: kickoff?.threadId,
    },
  });
  expect(summary.isError).toBeFalsy();

  const { workflows } = toolJson(
    await client.callTool({
      name: "listWorkflows",
      arguments: { workspaceId },
    }),
    z.object({
      workflows: z.array(
        z.object({
          name: z.string(),
          graph: z.object({
            nodes: z.array(
              z.looseObject({ step: z.string(), params: z.record(z.string(), z.unknown()) }),
            ),
          }),
        }),
      ),
    }),
  );
  const ask = workflows
    .find((w) => w.name === "Triage with the decision model")
    ?.graph.nodes.find((n) => n.step === "ai.ask");
  expect(ask).toBeDefined();
  const preview = await client.callTool({
    name: "previewDecision",
    arguments: { workspaceId, mailboxId, node: ask, limit: 10 },
  });
  expect(preview.isError).toBeFalsy();
  await client.close();
});
