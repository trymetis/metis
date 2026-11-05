import "server-only";
import { ORPCError } from "@orpc/server";

import { acknowledgePreflightRun, latestPreflightRun } from "@/dashboard/preflight";
import {
  dashboardAudit,
  dashboardAutomation,
  dashboardConnections,
  dashboardMcp,
  dashboardOverview,
  dashboardPeople,
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
import {
  configDiff,
  configForm,
  configHistory,
  resetConfigSection,
  revertConfig,
  saveConfigSections,
} from "@/dashboard/system-config";
import { rollbackRelease, startUpgrade, updatesEnabled, updatesStatus } from "@/dashboard/updates";

import { ownerSession } from "../middlewares/owner-session";
import { requireTotp } from "../require-totp";
import {
  auditPageInputSchema,
  dashboardAuditOutputSchema,
  dashboardAutomationOutputSchema,
  dashboardConfigDiffInputSchema,
  dashboardConfigDiffOutputSchema,
  dashboardConfigFormInputSchema,
  dashboardConfigFormOutputSchema,
  dashboardConfigResetInputSchema,
  dashboardConfigResetOutputSchema,
  dashboardConfigHistoryOutputSchema,
  dashboardConfigRevertInputSchema,
  dashboardConfigSaveOutputSchema,
  dashboardConfigUpdateInputSchema,
  dashboardConnectionsOutputSchema,
  dashboardMcpOutputSchema,
  dashboardOverviewOutputSchema,
  dashboardPeopleOutputSchema,
  dashboardPreflightAcknowledgeInputSchema,
  dashboardPreflightOutputSchema,
  dashboardRollbackInputSchema,
  dashboardStatsOutputSchema,
  dashboardSystemCacheOutputSchema,
  dashboardSystemCheckInputSchema,
  dashboardSystemCheckOutputSchema,
  dashboardSystemDatabaseOutputSchema,
  dashboardSystemInstanceOutputSchema,
  dashboardSystemLlmOutputSchema,
  dashboardSystemMailOutputSchema,
  dashboardSystemOverviewOutputSchema,
  dashboardSystemPhishingOutputSchema,
  dashboardSystemProviderInputSchema,
  dashboardSystemProviderOutputSchema,
  dashboardSystemRunnerOutputSchema,
  dashboardUpdatesEnabledOutputSchema,
  dashboardUpdatesOutputSchema,
  dashboardUpgradeInputSchema,
  dashboardUpgradeSchema,
  dashboardUsageInputSchema,
  dashboardUsageOutputSchema,
  dashboardWorkspacesOutputSchema,
} from "../schema";

export const dashboardRouter = {
  stats: ownerSession.output(dashboardStatsOutputSchema).handler(async () => dashboardStats()),

  usage: ownerSession
    .input(dashboardUsageInputSchema)
    .output(dashboardUsageOutputSchema)
    .handler(async ({ input }) => dashboardUsage(input.range)),

  overview: ownerSession
    .output(dashboardOverviewOutputSchema)
    .handler(async () => dashboardOverview()),

  connections: ownerSession
    .output(dashboardConnectionsOutputSchema)
    .handler(async () => dashboardConnections()),

  people: ownerSession.output(dashboardPeopleOutputSchema).handler(async () => dashboardPeople()),

  workspaces: ownerSession
    .output(dashboardWorkspacesOutputSchema)
    .handler(async () => dashboardWorkspaces()),

  automation: ownerSession
    .output(dashboardAutomationOutputSchema)
    .handler(async () => dashboardAutomation()),

  mcp: ownerSession.output(dashboardMcpOutputSchema).handler(async () => dashboardMcp()),

  audit: ownerSession
    .input(auditPageInputSchema)
    .output(dashboardAuditOutputSchema)
    .handler(async ({ input }) => dashboardAudit(input)),

  system: {
    overview: ownerSession
      .output(dashboardSystemOverviewOutputSchema)
      .handler(async () => systemOverview()),

    instance: ownerSession
      .output(dashboardSystemInstanceOutputSchema)
      .handler(async () => systemInstance()),

    llm: ownerSession.output(dashboardSystemLlmOutputSchema).handler(async () => systemLlm()),

    phishing: ownerSession
      .output(dashboardSystemPhishingOutputSchema)
      .handler(async () => systemPhishing()),

    mail: ownerSession.output(dashboardSystemMailOutputSchema).handler(async () => systemMail()),

    cache: ownerSession.output(dashboardSystemCacheOutputSchema).handler(async () => systemCache()),

    runner: ownerSession
      .output(dashboardSystemRunnerOutputSchema)
      .handler(async () => systemRunner()),

    database: ownerSession
      .output(dashboardSystemDatabaseOutputSchema)
      .handler(async () => systemDatabase()),

    provider: ownerSession
      .input(dashboardSystemProviderInputSchema)
      .output(dashboardSystemProviderOutputSchema)
      .handler(async ({ input }) => systemProvider(input.provider)),

    check: ownerSession
      .input(dashboardSystemCheckInputSchema)
      .output(dashboardSystemCheckOutputSchema)
      .handler(async ({ input }) => runSystemCheck(input)),

    form: ownerSession
      .input(dashboardConfigFormInputSchema)
      .output(dashboardConfigFormOutputSchema)
      .handler(async ({ input }) => configForm(input.section)),

    update: ownerSession
      .input(dashboardConfigUpdateInputSchema)
      .output(dashboardConfigSaveOutputSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-config",
          message: "Enter your authenticator code to change the configuration",
        });
        return saveConfigSections(input, context.appUser.userId);
      }),

    history: ownerSession
      .output(dashboardConfigHistoryOutputSchema)
      .handler(async () => configHistory()),

    diff: ownerSession
      .input(dashboardConfigDiffInputSchema)
      .output(dashboardConfigDiffOutputSchema)
      .handler(async ({ input }) => configDiff(input.from, input.to)),

    revert: ownerSession
      .input(dashboardConfigRevertInputSchema)
      .output(dashboardConfigSaveOutputSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-config",
          message: "Enter your authenticator code to restore that version",
        });
        return revertConfig(input, context.appUser.userId);
      }),

    reset: ownerSession
      .input(dashboardConfigResetInputSchema)
      .output(dashboardConfigResetOutputSchema)
      .handler(async ({ input, context }) => {
        if (input.code !== undefined) {
          await requireTotp({
            userId: context.appUser.userId,
            code: input.code,
            headers: context.headers,
            scope: "instance-config",
            message: "Enter your authenticator code to reset this section",
          });
        }
        return resetConfigSection(
          {
            section: input.section,
            expectedVersion: input.expectedVersion,
            apply: input.code !== undefined,
            force: input.force,
          },
          context.appUser.userId,
        );
      }),

    preflight: ownerSession
      .output(dashboardPreflightOutputSchema)
      .handler(async () => latestPreflightRun()),

    acknowledgePreflight: ownerSession
      .input(dashboardPreflightAcknowledgeInputSchema)
      .output(dashboardPreflightOutputSchema)
      .handler(async ({ input, context }) =>
        acknowledgePreflightRun(input.id, context.appUser.userId),
      ),

    updatesEnabled: ownerSession
      .output(dashboardUpdatesEnabledOutputSchema)
      .handler(async () => ({ enabled: updatesEnabled() })),

    updates: ownerSession.output(dashboardUpdatesOutputSchema).handler(async () => updatesStatus()),

    upgrade: ownerSession
      .input(dashboardUpgradeInputSchema)
      .output(dashboardUpgradeSchema)
      .handler(async ({ input, context }) => {
        if (!updatesEnabled()) throw new ORPCError("NOT_FOUND");
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-update",
          message: "Enter your authenticator code to upgrade",
        });
        return startUpgrade(input.version, context.appUser.userId);
      }),

    rollback: ownerSession
      .input(dashboardRollbackInputSchema)
      .output(dashboardUpgradeSchema)
      .handler(async ({ input, context }) => {
        if (!updatesEnabled()) throw new ORPCError("NOT_FOUND");
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-update",
          message: "Enter your authenticator code to undo the upgrade",
        });
        return rollbackRelease(context.appUser.userId);
      }),
  },
};
