import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor } from "@/audit";
import { acknowledgePreflightRun, latestPreflightRun } from "@/dashboard/preflight";
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
import {
  configDiff,
  configForm,
  configHistory,
  resetConfigSection,
  revertConfig,
  saveConfigSections,
} from "@/dashboard/system-config";
import { rollbackRelease, startUpgrade, updatesEnabled, updatesStatus } from "@/dashboard/updates";
import { banUser, listInstanceUsers, removeUser, setUserRole, unbanUser } from "@/dashboard/users";
import { createInvite, listAccountInvites, revokeAccountInvite } from "@/invites";

import { dashboardOperator, dashboardSession } from "../middlewares/dashboard-session";
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
  dashboardMeOutputSchema,
  dashboardInviteInputSchema,
  dashboardInviteOutputSchema,
  dashboardBanUserInputSchema,
  dashboardInvitesInputSchema,
  dashboardInvitesOutputSchema,
  dashboardUserActionInputSchema,
  dashboardUsersInputSchema,
  dashboardRevokeInviteInputSchema,
  dashboardSetRoleInputSchema,
  dashboardUsersOutputSchema,
  okSchema,
  dashboardOverviewOutputSchema,
  dashboardAccountsOutputSchema,
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
  me: dashboardSession
    .output(dashboardMeOutputSchema)
    .handler(async ({ context }) => ({ role: context.instanceRole })),

  users: {
    list: dashboardSession
      .input(dashboardUsersInputSchema)
      .output(dashboardUsersOutputSchema)
      .handler(async ({ input }) => ({ users: await listInstanceUsers(input) })),

    setRole: dashboardOperator
      .input(dashboardSetRoleInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-users",
          message: "Enter your authenticator code to change this role",
        });
        const result = await setUserRole({
          actor: { userId: context.appUser.userId, role: context.instanceRole },
          userId: input.userId,
          role: input.role,
          by: appActor(context.appUser, context.headers),
        });
        if ("error" in result) refused(result);
        return { ok: true as const };
      }),

    ban: dashboardOperator
      .input(dashboardBanUserInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-users",
          message: "Enter your authenticator code to ban this user",
        });
        const result = await banUser({
          actor: { userId: context.appUser.userId, role: context.instanceRole },
          userId: input.userId,
          reason: input.reason || null,
          duration: input.duration,
          by: appActor(context.appUser, context.headers),
        });
        if ("error" in result) refused(result);
        return { ok: true as const };
      }),

    unban: dashboardOperator
      .input(dashboardUserActionInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-users",
          message: "Enter your authenticator code to unban this user",
        });
        const result = await unbanUser({
          actor: { userId: context.appUser.userId, role: context.instanceRole },
          userId: input.userId,
          by: appActor(context.appUser, context.headers),
        });
        if ("error" in result) refused(result);
        return { ok: true as const };
      }),

    remove: dashboardOperator
      .input(dashboardUserActionInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "instance-users",
          message: "Enter your authenticator code to remove this user",
        });
        const result = await removeUser({
          actor: { userId: context.appUser.userId, role: context.instanceRole },
          userId: input.userId,
          by: appActor(context.appUser, context.headers),
        });
        if ("error" in result) refused(result);
        return { ok: true as const };
      }),
  },

  invites: {
    list: dashboardSession
      .input(dashboardInvitesInputSchema)
      .output(dashboardInvitesOutputSchema)
      .handler(async ({ input, context }) => {
        const invites = await listAccountInvites(context.instanceRole, input);
        if ("error" in invites) refused(invites);
        return { invites };
      }),

    create: dashboardOperator
      .input(dashboardInviteInputSchema)
      .output(dashboardInviteOutputSchema)
      .handler(async ({ input, context }) => {
        if (input.instanceRole) {
          await requireTotp({
            userId: context.appUser.userId,
            code: input.code,
            headers: context.headers,
            scope: "instance-users",
            message: "Enter your authenticator code to invite someone with an instance role",
          });
        }
        const result = await createInvite({
          email: input.email,
          workspace: null,
          instanceRole: input.instanceRole,
          inviter: {
            userId: context.appUser.userId,
            name: context.appUser.user.name,
            email: context.appUser.user.email,
          },
          by: appActor(context.appUser, context.headers),
          linkOnFailure: true,
        });
        if ("error" in result) refused(result);
        return {
          invite: {
            id: result.invite.id,
            email: result.invite.email,
            instanceRole: result.invite.instanceRole,
            invitedBy: context.appUser.user.email,
            expiresAt: result.invite.expiresAt.toISOString(),
            expired: false,
            createdAt: result.invite.createdAt.toISOString(),
          },
          link: result.link,
        };
      }),

    revoke: dashboardOperator
      .input(dashboardRevokeInviteInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        const result = await revokeAccountInvite({
          inviteId: input.inviteId,
          actor: { userId: context.appUser.userId, email: context.appUser.user.email },
          by: appActor(context.appUser, context.headers),
        });
        if ("error" in result) refused(result);
        return { ok: true as const };
      }),
  },

  stats: dashboardSession.output(dashboardStatsOutputSchema).handler(async () => dashboardStats()),

  usage: dashboardSession
    .input(dashboardUsageInputSchema)
    .output(dashboardUsageOutputSchema)
    .handler(async ({ input }) => dashboardUsage(input.range)),

  overview: dashboardSession
    .output(dashboardOverviewOutputSchema)
    .handler(async () => dashboardOverview()),

  connections: dashboardSession
    .output(dashboardConnectionsOutputSchema)
    .handler(async () => dashboardConnections()),

  accounts: dashboardSession
    .output(dashboardAccountsOutputSchema)
    .handler(async () => dashboardAccounts()),

  workspaces: dashboardSession
    .output(dashboardWorkspacesOutputSchema)
    .handler(async () => dashboardWorkspaces()),

  automation: dashboardSession
    .output(dashboardAutomationOutputSchema)
    .handler(async () => dashboardAutomation()),

  mcp: dashboardSession.output(dashboardMcpOutputSchema).handler(async () => dashboardMcp()),

  audit: dashboardSession
    .input(auditPageInputSchema)
    .output(dashboardAuditOutputSchema)
    .handler(async ({ input }) => dashboardAudit(input)),

  system: {
    overview: dashboardSession
      .output(dashboardSystemOverviewOutputSchema)
      .handler(async () => systemOverview()),

    instance: dashboardSession
      .output(dashboardSystemInstanceOutputSchema)
      .handler(async () => systemInstance()),

    llm: dashboardSession.output(dashboardSystemLlmOutputSchema).handler(async () => systemLlm()),

    phishing: dashboardSession
      .output(dashboardSystemPhishingOutputSchema)
      .handler(async () => systemPhishing()),

    mail: dashboardSession
      .output(dashboardSystemMailOutputSchema)
      .handler(async () => systemMail()),

    cache: dashboardSession
      .output(dashboardSystemCacheOutputSchema)
      .handler(async () => systemCache()),

    runner: dashboardSession
      .output(dashboardSystemRunnerOutputSchema)
      .handler(async () => systemRunner()),

    database: dashboardSession
      .output(dashboardSystemDatabaseOutputSchema)
      .handler(async () => systemDatabase()),

    provider: dashboardSession
      .input(dashboardSystemProviderInputSchema)
      .output(dashboardSystemProviderOutputSchema)
      .handler(async ({ input }) => systemProvider(input.provider)),

    check: dashboardOperator
      .input(dashboardSystemCheckInputSchema)
      .output(dashboardSystemCheckOutputSchema)
      .handler(async ({ input }) => runSystemCheck(input)),

    form: dashboardSession
      .input(dashboardConfigFormInputSchema)
      .output(dashboardConfigFormOutputSchema)
      .handler(async ({ input }) => configForm(input.section)),

    update: dashboardOperator
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

    history: dashboardSession
      .output(dashboardConfigHistoryOutputSchema)
      .handler(async () => configHistory()),

    diff: dashboardSession
      .input(dashboardConfigDiffInputSchema)
      .output(dashboardConfigDiffOutputSchema)
      .handler(async ({ input }) => configDiff(input.from, input.to)),

    revert: dashboardOperator
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

    reset: dashboardOperator
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

    preflight: dashboardSession
      .output(dashboardPreflightOutputSchema)
      .handler(async () => latestPreflightRun()),

    acknowledgePreflight: dashboardOperator
      .input(dashboardPreflightAcknowledgeInputSchema)
      .output(dashboardPreflightOutputSchema)
      .handler(async ({ input, context }) =>
        acknowledgePreflightRun(input.id, context.appUser.userId),
      ),

    updatesEnabled: dashboardSession
      .output(dashboardUpdatesEnabledOutputSchema)
      .handler(async () => ({ enabled: updatesEnabled() })),

    updates: dashboardSession
      .output(dashboardUpdatesOutputSchema)
      .handler(async () => updatesStatus()),

    upgrade: dashboardOperator
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

    rollback: dashboardOperator
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

function refused(result: { error: string; forbidden?: true }): never {
  throw new ORPCError(result.forbidden ? "FORBIDDEN" : "BAD_REQUEST", { message: result.error });
}
