import "server-only";
import { z } from "zod";

import { formatAuditEvent } from "@/audit/format";
import type { ConnectionProvider } from "@/connections/types";
import { latestPreflightRun } from "@/dashboard/preflight";
import {
  dashboardAudit,
  dashboardAutomation,
  dashboardConnections,
  dashboardMcp,
  dashboardOverview,
  dashboardAccounts,
  dashboardStats,
  dashboardUsage,
  dashboardWorkspaces,
} from "@/dashboard/stats";
import {
  systemCache,
  systemDatabase,
  systemInstance,
  systemLlm,
  systemMail,
  systemOverview,
  systemPhishing,
  systemProvider,
  systemRunner,
} from "@/dashboard/system";
import { runSystemCheck } from "@/dashboard/system-checks";
import { listInstanceUsers } from "@/dashboard/users";
import {
  auditEventSchema,
  dashboardAuditOutputSchema,
  dashboardAutomationOutputSchema,
  dashboardConnectionsOutputSchema,
  dashboardMcpOutputSchema,
  dashboardOverviewOutputSchema,
  dashboardAccountsOutputSchema,
  dashboardPreflightOutputSchema,
  dashboardStatsOutputSchema,
  dashboardSystemCacheOutputSchema,
  dashboardSystemCheckOutputSchema,
  dashboardSystemDatabaseOutputSchema,
  dashboardSystemInstanceOutputSchema,
  dashboardSystemLlmOutputSchema,
  dashboardSystemMailOutputSchema,
  dashboardSystemOverviewOutputSchema,
  dashboardSystemPhishingOutputSchema,
  dashboardSystemProviderOutputSchema,
  dashboardSystemRunnerOutputSchema,
  type DashboardSystemCheckInput,
  dashboardUsageOutputSchema,
  type DashboardUsageRange,
  type DashboardUsersInput,
  dashboardUsersOutputSchema,
  dashboardWorkspacesOutputSchema,
} from "@/server/schema";

import type { Output } from "./output";

export const instanceStatsOutput = dashboardStatsOutputSchema;
export const instanceUsageOutput = dashboardUsageOutputSchema;
export const instanceOverviewOutput = dashboardOverviewOutputSchema;
export const instanceConnectionsOutput = dashboardConnectionsOutputSchema;
export const instancePeopleOutput = dashboardAccountsOutputSchema;
export const instanceUsersOutput = dashboardUsersOutputSchema;
export const instanceWorkspacesOutput = dashboardWorkspacesOutputSchema;
export const instanceAutomationOutput = dashboardAutomationOutputSchema;
export const instanceMcpClientsOutput = dashboardMcpOutputSchema;
export const instanceAuditLogOutput = dashboardAuditOutputSchema.extend({
  events: z.array(
    auditEventSchema.omit({ ip: true, userAgent: true }).extend({ sentence: z.string() }),
  ),
});
export const systemCheckOutput = dashboardSystemCheckOutputSchema;
export const preflightWarningsOutput = dashboardPreflightOutputSchema;

export const instanceStats = (): Promise<Output<typeof instanceStatsOutput>> => dashboardStats();
export const instanceUsage = (
  range: DashboardUsageRange,
): Promise<Output<typeof instanceUsageOutput>> => dashboardUsage(range);
export const instanceOverview = (): Promise<Output<typeof instanceOverviewOutput>> =>
  dashboardOverview();
export const instanceConnections = (): Promise<Output<typeof instanceConnectionsOutput>> =>
  dashboardConnections();
export const instancePeople = (): Promise<Output<typeof instancePeopleOutput>> =>
  dashboardAccounts();
export async function instanceUsers(
  filter: DashboardUsersInput,
): Promise<Output<typeof instanceUsersOutput>> {
  return { users: await listInstanceUsers(filter) };
}
export const instanceWorkspaces = (): Promise<Output<typeof instanceWorkspacesOutput>> =>
  dashboardWorkspaces();
export const instanceAutomation = (): Promise<Output<typeof instanceAutomationOutput>> =>
  dashboardAutomation();
export const instanceMcpClients = (): Promise<Output<typeof instanceMcpClientsOutput>> =>
  dashboardMcp();
export const instanceAuditLog = async (
  cursor?: string,
): Promise<Output<typeof instanceAuditLogOutput>> => {
  const page = await dashboardAudit({ cursor });
  return {
    ...page,
    events: page.events.map(({ ip: _, userAgent: __, ...event }) => ({
      ...event,
      sentence: formatAuditEvent({ ...event, ip: null, userAgent: null }),
    })),
  };
};

function isSecretSummary(value: object): value is { set: boolean; hint: string | null } {
  const keys = Object.keys(value);
  return keys.length === 2 && "set" in value && "hint" in value && typeof value.set === "boolean";
}

function withoutSecretHints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecretHints);
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  if (isSecretSummary(value)) return { set: value.set, hint: null };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, withoutSecretHints(item)]),
  );
}

function view<T extends z.ZodType>(schema: T, value: unknown): Output<T> {
  return schema.parse(withoutSecretHints(value));
}

export const systemOverviewOutput = dashboardSystemOverviewOutputSchema;
export const systemInstanceOutput = dashboardSystemInstanceOutputSchema;
export const systemLlmOutput = dashboardSystemLlmOutputSchema;
export const systemPhishingOutput = dashboardSystemPhishingOutputSchema;
export const systemMailOutput = dashboardSystemMailOutputSchema;
export const systemCacheOutput = dashboardSystemCacheOutputSchema;
export const systemRunnerOutput = dashboardSystemRunnerOutputSchema;
export const systemDatabaseOutput = dashboardSystemDatabaseOutputSchema;
export const systemProviderOutput = dashboardSystemProviderOutputSchema;

export const systemOverviewView = async () => view(systemOverviewOutput, await systemOverview());
export const systemInstanceView = async () => view(systemInstanceOutput, await systemInstance());
export const systemLlmView = () => view(systemLlmOutput, systemLlm());
export const systemPhishingView = () => view(systemPhishingOutput, systemPhishing());
export const systemMailView = () => view(systemMailOutput, systemMail());
export const systemCacheView = () => view(systemCacheOutput, systemCache());
export const systemRunnerView = async () => view(systemRunnerOutput, await systemRunner());
export const systemDatabaseView = () => view(systemDatabaseOutput, systemDatabase());
export const systemProviderView = async (provider: ConnectionProvider) =>
  view(systemProviderOutput, await systemProvider(provider));
export const systemCheck = (
  input: DashboardSystemCheckInput,
): Promise<Output<typeof systemCheckOutput>> => runSystemCheck(input);
export const preflightWarningsView = (): Promise<Output<typeof preflightWarningsOutput>> =>
  latestPreflightRun();
