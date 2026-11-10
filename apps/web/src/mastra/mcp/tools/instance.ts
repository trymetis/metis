import "server-only";
import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { ToolRefusal, withToolErrors } from "@/mastra/toolkit/resolve";
import * as instance from "@/ops/instance";
import {
  auditCursorInputSchema,
  connectionProviderSchema,
  dashboardSystemProviderInputSchema,
  dashboardUsageInputSchema,
  systemDriverSchema,
  dashboardUsersInputSchema,
} from "@/server/schema";
import { type DashboardRequirement, meetsRequirement } from "@/types/instance-role";

import { mcpAccountFromCall } from "../context";

function requireInstance(
  requestContext: RequestContext | undefined,
  requirement: DashboardRequirement,
): void {
  const role = mcpAccountFromCall(requestContext).instanceRole;
  if (!role) {
    throw new ToolRefusal(
      "Only the instance owner, instance admins and observers can read instance stats.",
    );
  }
  if (!meetsRequirement(role, requirement)) {
    throw new ToolRefusal("Observers can only read the instance, not run checks.");
  }
}

const OWNER_NOTE =
  "Instance-wide and for the instance owner, admins and observers only: it covers every user and workspace on this Metis Suite server, not one workspace.";

export const getInstanceStats = createTool({
  id: "getInstanceStats",
  description: `Count the users, workspaces, mailboxes, calendars, drives and address books on this Metis Suite server. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceStats();
    }),
});

export const getInstanceUsage = createTool({
  id: "getInstanceUsage",
  description: `Read AI usage on this server over a time range — calls, tokens and cost by feature, model and day, plus recent calls. ${OWNER_NOTE}`,
  inputSchema: dashboardUsageInputSchema,
  execute: async ({ range }, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceUsage(range);
    }),
});

export const getInstanceOverview = createTool({
  id: "getInstanceOverview",
  description: `Read the server's health at a glance — unavailable accounts, pending and overdue work, recent failures and daily activity. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceOverview();
    }),
});

export const getInstanceConnections = createTool({
  id: "getInstanceConnections",
  description: `Read the connected accounts on this server by provider and resource, including unavailable ones. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceConnections();
    }),
});

export const getInstancePeople = createTool({
  id: "getInstancePeople",
  description: `Read the accounts on this server — user counts, two-factor adoption, banned accounts, pending invites and recent sign-ups. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instancePeople();
    }),
});

export const getInstanceUsers = createTool({
  id: "getInstanceUsers",
  description: `List the accounts on this server with their role (owner, admin, observer or user), whether and until when each is banned, when it was created, its last sign-in, whether two-factor is on and how many workspaces it owns. Filter by a name or email search, role, status (active or banned) and two-factor. Read-only: changing roles, banning and removing users happen in the dashboard. Pending account invites are listed by listSignupInvites. ${OWNER_NOTE}`,
  inputSchema: dashboardUsersInputSchema,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceUsers(input);
    }),
});

export const getInstanceWorkspaces = createTool({
  id: "getInstanceWorkspaces",
  description: `Read every workspace on this server with its members and attached mailboxes, calendars, drives and address books. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceWorkspaces();
    }),
});

export const getInstanceAutomation = createTool({
  id: "getInstanceAutomation",
  description: `Read the workflow runner's state on this server — run outcomes, pending snoozes and scheduled sends, and recent runs. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceAutomation();
    }),
});

export const getInstanceMcpClients = createTool({
  id: "getInstanceMcpClients",
  description: `List every MCP client registered on this server, with its status and how many tools it has on. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceMcpClients();
    }),
});

export const getInstanceAuditLog = createTool({
  id: "getInstanceAuditLog",
  description: `Read the audit log, newest first, 50 events per page: two-factor disables, MCP client approvals, disconnected accounts, role changes, removed members, invites and deleted workspaces and accounts. Pass nextCursor back as cursor for the next page. ${OWNER_NOTE}`,
  inputSchema: auditCursorInputSchema,
  execute: async ({ cursor }, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.instanceAuditLog(cursor);
    }),
});

const CONFIG_NOTE = `${OWNER_NOTE} Secrets are reported only as set or not set.`;

export const getSystemOverview = createTool({
  id: "getSystemOverview",
  description: `Read how this server is configured at a glance — each driver (LLM, phishing detection, mail, cache, workflow runner, database) with its state, each connection provider with its entries and connection counts, and the sign-up mode. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemOverviewView();
    }),
});

export const getSystemInstance = createTool({
  id: "getSystemInstance",
  description: `Read the server's instance settings — app URL, cookies, sign-up mode, owner, setup code state, legal links and drive relay limits. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemInstanceView();
    }),
});

export const getSystemLlm = createTool({
  id: "getSystemLlm",
  description: `Read the server's LLM and decision-model configuration — driver, endpoint, models and which decision features are on. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemLlmView();
    }),
});

export const getSystemPhishing = createTool({
  id: "getSystemPhishing",
  description: `Read the server's phishing-detection configuration. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemPhishingView();
    }),
});

export const getSystemMail = createTool({
  id: "getSystemMail",
  description: `Read the server's transactional mail configuration — driver, sender addresses and SMTP settings. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemMailView();
    }),
});

export const getSystemCache = createTool({
  id: "getSystemCache",
  description: `Read the server's cache driver configuration. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemCacheView();
    }),
});

export const getSystemRunner = createTool({
  id: "getSystemRunner",
  description: `Read the workflow runner's configuration and health — driver, cadence, batch size, concurrency and its latest tick status. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemRunnerView();
    }),
});

export const getSystemDatabase = createTool({
  id: "getSystemDatabase",
  description: `Read the server's database configuration — driver and the app and agent-memory database addresses. ${CONFIG_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemDatabaseView();
    }),
});

export const getSystemProvider = createTool({
  id: "getSystemProvider",
  description: `Read one connection provider's configuration — whether it is configured, its OAuth client or server entries, the env vars that set it, and its connection counts. ${CONFIG_NOTE}`,
  inputSchema: dashboardSystemProviderInputSchema,
  execute: async ({ provider }, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.systemProviderView(provider);
    }),
});

export const runSystemCheck = createTool({
  id: "runSystemCheck",
  description: `Run a live health check against one driver (LLM, phishing, mail, cache, runner, database) or every server entry of one connection provider, and report each result with its latency. It connects to those services now. ${OWNER_NOTE}`,
  inputSchema: z.object({
    driver: systemDriverSchema
      .optional()
      .describe("The driver to check; pass this or provider, not both"),
    provider: connectionProviderSchema
      .optional()
      .describe("The connection provider whose entries to check"),
  }),
  execute: async ({ driver, provider }, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "operate");
      if (driver && !provider) {
        return instance.systemCheck({ kind: "driver", driver });
      }
      if (provider && !driver) {
        return instance.systemCheck({ kind: "provider", provider });
      }
      return { error: "Pass exactly one of driver or provider." };
    }),
});

export const getPreflightWarnings = createTool({
  id: "getPreflightWarnings",
  description: `Read the warnings the last deploy's preflight run reported — environment values that differ from the stored configuration, servers that failed their probe, LLM and decision-model problems, seeding warnings and newly quarantined connections — with when it ran, the configuration version it checked and whether the owner acknowledged them. When currentVersion differs from the run's configVersion, the configuration changed after the run and some warnings may no longer apply. ${OWNER_NOTE}`,
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      requireInstance(requestContext, "read");
      return instance.preflightWarningsView();
    }),
});
