import { beforeAll, describe, expect, test } from "vitest";

import { CHECK_CLIENTS } from "../../lib/mcp-clients";
import { type JsonSchema, type ListedTool, McpSession, memberToken, session } from "../support/mcp";

const SENSITIVE = [
  "createWorkspace",
  "attachResource",
  "createSignupInvite",
  "revokeSignupInvite",
  "runSystemCheck",
  "deleteEmails",
  "sendEmail",
  "deleteDraft",
  "deleteLabel",
  "scheduleEmail",
  "cancelScheduled",
  "retryScheduled",
  "unsubscribe",
  "createWorkflow",
  "updateWorkflow",
  "toggleWorkflow",
  "deleteWorkflow",
  "applyWorkflows",
  "cancelWorkflowRun",
  "resumeWorkflowRun",
  "createEvent",
  "updateEvent",
  "deleteEvent",
  "respondToEvent",
  "createFolder",
  "renameFile",
  "moveFile",
  "deleteFile",
  "revokeInvite",
  "removeMember",
  "setWorkspaceTheme",
].toSorted();

const FOREIGN_WORKSPACE = "00000000-0000-0000-0000-000000000000";
const PATTERN_CANDIDATES = ["out", "q1", "o1", "l1", "in", "x"];

function isOwnerOnly(name: string): boolean {
  return (
    name.startsWith("getInstance") ||
    name.startsWith("getSystem") ||
    name === "runSystemCheck" ||
    name === "getPreflightWarnings"
  );
}

function sample(schema: JsonSchema): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants?.length) {
    return sample(variants.find((v) => v.type !== "null") ?? variants[0] ?? {});
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type) {
    case "string": {
      if (schema.format === "email") return "nobody@discard.demo.trymetis.email";
      if (schema.format === "date-time") return "2030-01-01T00:00:00.000Z";
      if (schema.format === "uri") return "https://example.org/";
      if (schema.pattern) {
        const pattern = new RegExp(schema.pattern);
        return PATTERN_CANDIDATES.find((v) => pattern.test(v)) ?? "x";
      }
      return "x".repeat(Math.max(1, schema.minLength ?? 1));
    }
    case "number":
    case "integer":
      return (
        schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 1)
      );
    case "boolean":
      return false;
    case "array":
      return Array.from({ length: Math.max(1, schema.minItems ?? 0) }, () =>
        sample(schema.items ?? {}),
      );
    case "object":
      return sampleObject(schema);
    default:
      return "x";
  }
}

function sampleObject(schema: JsonSchema): Record<string, unknown> {
  return Object.fromEntries(
    (schema.required ?? []).map((key) => [key, sample(schema.properties?.[key] ?? {})]),
  );
}

function validArgs(tool: ListedTool): Record<string, unknown> {
  return sampleObject(tool.inputSchema);
}

function shares<T>(items: T[], count: number): T[][] {
  const buckets: T[][] = Array.from({ length: count }, () => []);
  for (const [index, item] of items.entries()) {
    buckets[index % count]?.push(item);
  }
  return buckets;
}

let allTools: ListedTool[] = [];
let defaultNames: string[] = [];
let memberNames: string[] = [];

beforeAll(async () => {
  const all = await session(CHECK_CLIENTS[0]);
  allTools = await all.tools();
  await all.close();
  const defaults = await session("defaults");
  defaultNames = (await defaults.tools()).map((t) => t.name);
  await defaults.close();
  const member = await McpSession.open(await memberToken());
  memberNames = (await member.tools()).map((t) => t.name);
  await member.close();
});

describe("which tools a client sees", () => {
  test("the sensitive tools are exactly the ones a default client does not list", () => {
    const hidden = allTools
      .map((t) => t.name)
      .filter((name) => !defaultNames.includes(name))
      .toSorted();
    expect(hidden).toEqual(SENSITIVE);
  });

  test("a non-owner lists every tool except the owner-only ones", () => {
    const names = allTools.map((t) => t.name);
    const ownerOnly = names.filter(isOwnerOnly);
    expect(ownerOnly.length).toBeGreaterThan(0);
    expect(memberNames.toSorted()).toEqual(names.filter((name) => !isOwnerOnly(name)).toSorted());
  });

  test("calling a tool the client does not list is an error", async () => {
    const defaults = await session("defaults");
    const sent = await defaults.call("sendEmail", {});
    await defaults.close();
    expect(sent.isError).toBe(true);
    expect(sent.text).toContain("sendEmail");

    const member = await McpSession.open(await memberToken());
    const stats = await member.call("getInstanceStats", {});
    await member.close();
    expect(stats.isError).toBe(true);
    expect(stats.text).toContain("getInstanceStats");
  });
});

describe.concurrent("every tool", () => {
  for (const [index, name] of CHECK_CLIENTS.entries()) {
    test(
      `arguments are validated and a foreign workspace is refused (${name})`,
      async () => {
        const mine = shares(allTools, CHECK_CLIENTS.length)[index] ?? [];
        const s = await session(name);
        const failures: string[] = [];
        try {
          for (const tool of mine) {
            if ((tool.inputSchema.required ?? []).length > 0) {
              const empty = await s.call(tool.name, {});
              if (!empty.isError || !empty.text.includes("validation failed")) {
                failures.push(
                  `${tool.name}: empty arguments were accepted: ${empty.text.slice(0, 200)}`,
                );
              }
            }
            if (tool.inputSchema.properties?.workspaceId) {
              const args = {
                ...validArgs(tool),
                workspaceId: FOREIGN_WORKSPACE,
              };
              const refused = await s.call(tool.name, args);
              const error = refused.json.error;
              if (
                refused.isError ||
                typeof error !== "string" ||
                !error.includes("not a workspace this client can reach")
              ) {
                failures.push(
                  `${tool.name}: a foreign workspace was not refused: ${refused.text.slice(0, 200)}`,
                );
              }
            }
          }
        } finally {
          await s.close();
        }
        expect(failures).toEqual([]);
      },
      15 * 60_000,
    );
  }
});
