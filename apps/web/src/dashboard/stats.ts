import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  min,
  or,
  sql,
  sum,
} from "drizzle-orm";

import { listInstanceAuditEvents } from "@/audit";
import { isOwnerEmail } from "@/auth/owner";
import { config } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import { CONNECTION_PROVIDERS } from "@/connections/types";
import { db } from "@/db";
import {
  aiUsage,
  calendar,
  calendarWorkspace,
  connection,
  drive,
  driveWorkspace,
  mailbox,
  mailboxWorkspace,
  mcpClient,
  oauthClient,
  signupInvite,
  user,
  workflow,
  workflowStepRun,
  workflowRun,
  workflowTrigger,
  workspace,
  workspaceInvite,
  workspaceMember,
} from "@/db/schema";
import { isMcpToolEnabled, mcpToolsFor } from "@/mcp/tools";
import type {
  AuditPageInput,
  DashboardAudit,
  DashboardAutomation,
  DashboardConnections,
  DashboardMcp,
  DashboardOverview,
  DashboardPeople,
  DashboardRunner,
  DashboardRunnerStatus,
  DashboardStats,
  DashboardUsage,
  DashboardUsageDay,
  DashboardUsageRange,
  DashboardWorkspaces,
} from "@/server/schema";
import { tickState } from "@/workflow/store";

const RANGE_DAYS: Record<DashboardUsageRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const RECENT_CALLS = 20;

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function utcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const dayBucket = sql<string>`strftime('%Y-%m-%d', ${aiUsage.createdAt} / 1000, 'unixepoch')`;

export async function dashboardStats(): Promise<DashboardStats> {
  const [[users], [workspaces], [mailboxes], [calendars], [drives]] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(workspace),
    db.select({ n: count() }).from(mailbox),
    db.select({ n: count() }).from(calendar),
    db.select({ n: count() }).from(drive),
  ]);

  return {
    users: users?.n ?? 0,
    workspaces: workspaces?.n ?? 0,
    mailboxes: mailboxes?.n ?? 0,
    calendars: calendars?.n ?? 0,
    drives: drives?.n ?? 0,
  };
}

function emptyDays(since: Date, days: number): DashboardUsageDay[] {
  const start = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  return Array.from({ length: days }, (_, i) => ({
    date: utcDayKey(new Date(start + i * 86_400_000)),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  }));
}

export async function dashboardUsage(range: DashboardUsageRange): Promise<DashboardUsage> {
  const days = RANGE_DAYS[range];
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  const window = gte(aiUsage.createdAt, since);

  const [totals, byFeature, byModel, daily, recent] = await Promise.all([
    db
      .select({
        calls: count(),
        inputTokens: sum(aiUsage.inputTokens),
        outputTokens: sum(aiUsage.outputTokens),
        totalTokens: sum(aiUsage.totalTokens),
        cacheReadTokens: sum(aiUsage.cacheReadTokens),
        cacheWriteTokens: sum(aiUsage.cacheWriteTokens),
        reasoningTokens: sum(aiUsage.reasoningTokens),
      })
      .from(aiUsage)
      .where(window),
    db
      .select({
        feature: aiUsage.feature,
        calls: count(),
        inputTokens: sum(aiUsage.inputTokens),
        outputTokens: sum(aiUsage.outputTokens),
        totalTokens: sum(aiUsage.totalTokens),
      })
      .from(aiUsage)
      .where(window)
      .groupBy(aiUsage.feature)
      .orderBy(desc(sum(aiUsage.totalTokens))),
    db
      .select({
        model: aiUsage.model,
        provider: aiUsage.provider,
        calls: count(),
        inputTokens: sum(aiUsage.inputTokens),
        outputTokens: sum(aiUsage.outputTokens),
        totalTokens: sum(aiUsage.totalTokens),
      })
      .from(aiUsage)
      .where(window)
      .groupBy(aiUsage.model, aiUsage.provider)
      .orderBy(desc(sum(aiUsage.totalTokens))),
    db
      .select({
        day: dayBucket,
        inputTokens: sum(aiUsage.inputTokens),
        outputTokens: sum(aiUsage.outputTokens),
        totalTokens: sum(aiUsage.totalTokens),
      })
      .from(aiUsage)
      .where(window)
      .groupBy(dayBucket)
      .orderBy(dayBucket),
    db
      .select({
        id: aiUsage.id,
        createdAt: aiUsage.createdAt,
        feature: aiUsage.feature,
        provider: aiUsage.provider,
        model: aiUsage.model,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        totalTokens: aiUsage.totalTokens,
        steps: aiUsage.steps,
        finishReason: aiUsage.finishReason,
      })
      .from(aiUsage)
      .where(and(window))
      .orderBy(desc(aiUsage.createdAt))
      .limit(RECENT_CALLS),
  ]);

  const buckets = new Map(emptyDays(since, days).map((d) => [d.date, d]));
  for (const row of daily) {
    const bucket = buckets.get(row.day);
    if (!bucket) continue;
    bucket.inputTokens = n(row.inputTokens);
    bucket.outputTokens = n(row.outputTokens);
    bucket.totalTokens = n(row.totalTokens);
  }

  const t = totals[0];

  return {
    totals: {
      calls: t?.calls ?? 0,
      inputTokens: n(t?.inputTokens),
      outputTokens: n(t?.outputTokens),
      totalTokens: n(t?.totalTokens),
      cacheReadTokens: n(t?.cacheReadTokens),
      cacheWriteTokens: n(t?.cacheWriteTokens),
      reasoningTokens: n(t?.reasoningTokens),
    },
    byFeature: byFeature.map((row) => ({
      feature: row.feature,
      calls: row.calls,
      inputTokens: n(row.inputTokens),
      outputTokens: n(row.outputTokens),
      totalTokens: n(row.totalTokens),
    })),
    byModel: byModel.map((row) => ({
      model: row.model,
      provider: row.provider,
      calls: row.calls,
      inputTokens: n(row.inputTokens),
      outputTokens: n(row.outputTokens),
      totalTokens: n(row.totalTokens),
    })),
    daily: [...buckets.values()],
    recent: recent.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      feature: row.feature,
      provider: row.provider,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      steps: row.steps,
      finishReason: row.finishReason,
    })),
  };
}

export async function dashboardOverview(): Promise<DashboardOverview> {
  const now = new Date();
  const since = new Date(Date.now() - 6 * 86_400_000);
  const [[quarantined], [pending], [overdue], [failed], daily] = await Promise.all([
    db.select({ n: count() }).from(connection).where(isNotNull(connection.quarantinedAt)),
    db.select({ n: count() }).from(workflowRun).where(eq(workflowRun.status, "pending")),
    db
      .select({ n: count() })
      .from(workflowRun)
      .where(and(eq(workflowRun.status, "pending"), lt(workflowRun.dueAt, now))),
    db
      .select({ n: count() })
      .from(workflowRun)
      .where(inArray(workflowRun.status, ["failed", "blocked"])),
    db
      .select({ day: dayBucket, totalTokens: sum(aiUsage.totalTokens) })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(dayBucket)
      .orderBy(dayBucket),
  ]);

  const buckets = new Map(
    emptyDays(since, 7).map((d) => [d.date, { date: d.date, totalTokens: 0 }]),
  );
  for (const row of daily) {
    const bucket = buckets.get(row.day);
    if (bucket) bucket.totalTokens = n(row.totalTokens);
  }

  return {
    quarantinedConnections: quarantined?.n ?? 0,
    scheduledPending: pending?.n ?? 0,
    scheduledOverdue: overdue?.n ?? 0,
    scheduledFailed: failed?.n ?? 0,
    tokens7d: [...buckets.values()],
  };
}

const QUARANTINED_LIST_LIMIT = 20;

export async function dashboardConnections(): Promise<DashboardConnections> {
  const [totals, byProvider, mailboxesByProvider, calendarsByProvider, drivesByProvider, rows] =
    await Promise.all([
      db
        .select({
          total: count(),
          quarantined: count(connection.quarantinedAt),
        })
        .from(connection),
      db
        .select({ provider: connection.provider, n: count() })
        .from(connection)
        .groupBy(connection.provider),
      db
        .select({ provider: connection.provider, n: count() })
        .from(mailbox)
        .innerJoin(connection, eq(mailbox.connectionId, connection.id))
        .groupBy(connection.provider),
      db
        .select({ provider: connection.provider, n: count() })
        .from(calendar)
        .innerJoin(connection, eq(calendar.connectionId, connection.id))
        .groupBy(connection.provider),
      db
        .select({ provider: connection.provider, n: count() })
        .from(drive)
        .innerJoin(connection, eq(drive.connectionId, connection.id))
        .groupBy(connection.provider),
      db
        .select({
          id: connection.id,
          email: connection.email,
          provider: connection.provider,
          quarantinedAt: connection.quarantinedAt,
        })
        .from(connection)
        .where(isNotNull(connection.quarantinedAt))
        .orderBy(desc(connection.quarantinedAt))
        .limit(QUARANTINED_LIST_LIMIT),
    ]);

  const connectionCounts = new Map(byProvider.map((r) => [r.provider, r.n]));
  const mailboxCounts = new Map(mailboxesByProvider.map((r) => [r.provider, r.n]));
  const calendarCounts = new Map(calendarsByProvider.map((r) => [r.provider, r.n]));
  const driveCounts = new Map(drivesByProvider.map((r) => [r.provider, r.n]));

  return {
    total: totals[0]?.total ?? 0,
    quarantined: totals[0]?.quarantined ?? 0,
    byProvider: CONNECTION_PROVIDERS.filter(
      (provider) =>
        (connectionCounts.get(provider) ?? 0) > 0 ||
        (mailboxCounts.get(provider) ?? 0) > 0 ||
        (calendarCounts.get(provider) ?? 0) > 0 ||
        (driveCounts.get(provider) ?? 0) > 0,
    ).map((provider) => ({
      provider,
      connections: connectionCounts.get(provider) ?? 0,
      mailboxes: mailboxCounts.get(provider) ?? 0,
      calendars: calendarCounts.get(provider) ?? 0,
      drives: driveCounts.get(provider) ?? 0,
    })),
    quarantinedList: rows.map((row) => ({
      id: row.id,
      email: row.email,
      provider: row.provider,
      quarantinedAt: (row.quarantinedAt ?? new Date()).toISOString(),
    })),
  };
}

const RECENT_USERS = 10;

export async function dashboardPeople(): Promise<DashboardPeople> {
  const now = new Date();

  const [[users], [withTwoFactor], [signupPending], [invitePending], recent] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(user).where(eq(user.twoFactorEnabled, true)),
    db
      .select({ n: count() })
      .from(signupInvite)
      .where(and(sql`${signupInvite.acceptedAt} is null`, gte(signupInvite.expiresAt, now))),
    db
      .select({ n: count() })
      .from(workspaceInvite)
      .where(and(sql`${workspaceInvite.acceptedAt} is null`, gte(workspaceInvite.expiresAt, now))),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(RECENT_USERS),
  ]);

  return {
    users: users?.n ?? 0,
    withTwoFactor: withTwoFactor?.n ?? 0,
    pendingSignupInvites: signupPending?.n ?? 0,
    pendingWorkspaceInvites: invitePending?.n ?? 0,
    recentUsers: recent.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      twoFactorEnabled: row.twoFactorEnabled ?? false,
    })),
  };
}

const WORKSPACE_LIST_LIMIT = 50;

export async function dashboardWorkspaces(): Promise<DashboardWorkspaces> {
  const [workspaces, members, mailboxLinks, calendarLinks, driveLinks] = await Promise.all([
    db
      .select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        aiPolicy: workspace.aiPolicy,
        createdAt: workspace.createdAt,
      })
      .from(workspace)
      .orderBy(desc(workspace.createdAt))
      .limit(WORKSPACE_LIST_LIMIT),
    db
      .select({ workspaceId: workspaceMember.workspaceId, n: count() })
      .from(workspaceMember)
      .groupBy(workspaceMember.workspaceId),
    db
      .select({ workspaceId: mailboxWorkspace.workspaceId, n: count() })
      .from(mailboxWorkspace)
      .groupBy(mailboxWorkspace.workspaceId),
    db
      .select({ workspaceId: calendarWorkspace.workspaceId, n: count() })
      .from(calendarWorkspace)
      .groupBy(calendarWorkspace.workspaceId),
    db
      .select({ workspaceId: driveWorkspace.workspaceId, n: count() })
      .from(driveWorkspace)
      .groupBy(driveWorkspace.workspaceId),
  ]);

  const memberCounts = new Map(members.map((r) => [r.workspaceId, r.n]));
  const mailboxCounts = new Map(mailboxLinks.map((r) => [r.workspaceId, r.n]));
  const calendarCounts = new Map(calendarLinks.map((r) => [r.workspaceId, r.n]));
  const driveCounts = new Map(driveLinks.map((r) => [r.workspaceId, r.n]));

  const shared = members.filter((r) => r.n > 1).length;

  return {
    total: members.length,
    shared,
    personal: members.length - shared,
    list: workspaces.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      aiPolicy: row.aiPolicy,
      members: memberCounts.get(row.id) ?? 0,
      mailboxes: mailboxCounts.get(row.id) ?? 0,
      calendars: calendarCounts.get(row.id) ?? 0,
      drives: driveCounts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

const RECENT_RUNS = 10;

function runnerStatus(opts: {
  now: Date;
  lastTickAt: Date | null;
  lastSuccessAt: Date | null;
  lateMs: number;
  lagMs: number;
  backlog: number;
}): DashboardRunnerStatus {
  const { now, lastTickAt, lastSuccessAt, lateMs } = opts;
  if (!lastSuccessAt) return lastTickAt ? "failing" : "never";
  if (lastTickAt && lastTickAt > lastSuccessAt) return "failing";
  if (now.getTime() - lastSuccessAt.getTime() > lateMs) return "delayed";
  if (opts.lagMs > lateMs) return "delayed";
  return opts.backlog > 0 ? "busy" : "idle";
}

export async function dashboardRunner(now: Date, weekAgo: Date): Promise<DashboardRunner> {
  const runner = getInstanceConfig().workflowRunner;
  const live = and(
    eq(workflow.enabled, true),
    isNull(workflow.deletedAt),
    eq(workflowTrigger.armed, true),
  );

  const [tick, [due], [triggerErrors], [backlog], [held], [blocked], [unknown]] = await Promise.all(
    [
      tickState(),
      db
        .select({ n: count(), oldest: min(workflowTrigger.nextDueAt) })
        .from(workflowTrigger)
        .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
        .where(and(live, lte(workflowTrigger.nextDueAt, now))),
      db
        .select({ n: count() })
        .from(workflowTrigger)
        .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
        .where(and(live, isNotNull(workflowTrigger.lastError))),
      db
        .select({ n: count(), oldest: min(workflowRun.dueAt) })
        .from(workflowRun)
        .where(and(eq(workflowRun.status, "pending"), lte(workflowRun.dueAt, now))),
      db
        .select({ n: count() })
        .from(workflowRun)
        .where(
          and(
            eq(workflowRun.status, "pending"),
            isNotNull(workflowRun.error),
            isNull(workflowRun.blockedAt),
          ),
        ),
      db
        .select({ n: count() })
        .from(workflowRun)
        .where(
          or(
            and(eq(workflowRun.status, "blocked"), gte(workflowRun.finishedAt, weekAgo)),
            and(eq(workflowRun.status, "pending"), isNotNull(workflowRun.blockedAt)),
          ),
        ),
      db
        .select({ n: count() })
        .from(workflowStepRun)
        .where(and(eq(workflowStepRun.status, "unknown"), isNull(workflowStepRun.resolvedAt))),
    ],
  );

  const ageOf = (at: Date | null | undefined) =>
    at ? Math.max(0, now.getTime() - at.getTime()) : null;
  const discoveryLagMs = ageOf(due?.oldest);
  const backlogAgeMs = ageOf(backlog?.oldest);
  const lastTickAt = tick?.lastTickAt ?? null;
  const lastSuccessAt = tick?.lastSuccessAt ?? null;

  return {
    driver: runner.driver,
    cadenceSec: runner.cadenceSec,
    tickBudgetMs: runner.tickBudgetMs,
    status: runnerStatus({
      now,
      lastTickAt,
      lastSuccessAt,
      lateMs: 2 * runner.cadenceSec * 1000 + runner.tickBudgetMs,
      lagMs: Math.max(discoveryLagMs ?? 0, backlogAgeMs ?? 0),
      backlog: backlog?.n ?? 0,
    }),
    lastTickAt: lastTickAt?.toISOString() ?? null,
    lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
    lastDiscoveryAt: tick?.lastDiscoveryAt?.toISOString() ?? null,
    nextCheckAt: tick?.nextCheckAt?.toISOString() ?? null,
    lastError: tick?.lastError ?? null,
    dueTriggers: due?.n ?? 0,
    discoveryLagMs,
    triggerErrors: triggerErrors?.n ?? 0,
    backlog: backlog?.n ?? 0,
    backlogAgeMs,
    held: held?.n ?? 0,
    blocked: blocked?.n ?? 0,
    unknown: unknown?.n ?? 0,
  };
}

export async function dashboardAutomation(): Promise<DashboardAutomation> {
  const now = new Date();
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    runner,
    [workflowTotals],
    [runs24h],
    [runs7d],
    [failures7d],
    runsByStatus,
    pendingByKind,
    recentRuns,
  ] = await Promise.all([
    dashboardRunner(now, weekAgo),
    db
      .select({
        total: count(),
        enabled: count(sql`case when ${workflow.enabled} then 1 end`),
      })
      .from(workflow)
      .where(and(eq(workflow.kind, "user"), isNull(workflow.deletedAt))),
    db.select({ n: count() }).from(workflowRun).where(gte(workflowRun.createdAt, dayAgo)),
    db.select({ n: count() }).from(workflowRun).where(gte(workflowRun.createdAt, weekAgo)),
    db
      .select({ n: count() })
      .from(workflowRun)
      .where(
        and(
          gte(workflowRun.createdAt, weekAgo),
          inArray(workflowRun.status, ["failed", "partial", "blocked"]),
        ),
      ),
    db
      .select({ status: workflowRun.status, n: count() })
      .from(workflowRun)
      .groupBy(workflowRun.status),
    db
      .select({ kind: workflowRun.kind, n: count() })
      .from(workflowRun)
      .where(eq(workflowRun.status, "pending"))
      .groupBy(workflowRun.kind),
    db
      .select({
        id: workflowRun.id,
        workflowName: workflow.name,
        kind: workflowRun.kind,
        status: workflowRun.status,
        error: workflowRun.error,
        createdAt: workflowRun.createdAt,
      })
      .from(workflowRun)
      .innerJoin(workflow, eq(workflowRun.workflowId, workflow.id))
      .orderBy(desc(workflowRun.createdAt))
      .limit(RECENT_RUNS),
  ]);

  const statusCounts = new Map(runsByStatus.map((r) => [r.status, r.n]));
  const kindCounts = new Map(pendingByKind.map((r) => [r.kind, r.n]));

  return {
    runner,
    workflows: {
      total: workflowTotals?.total ?? 0,
      enabled: workflowTotals?.enabled ?? 0,
      runs24h: runs24h?.n ?? 0,
      runs7d: runs7d?.n ?? 0,
      failures7d: failures7d?.n ?? 0,
    },
    scheduled: {
      pending: statusCounts.get("pending") ?? 0,
      completed: statusCounts.get("completed") ?? 0,
      failed: statusCounts.get("failed") ?? 0,
      pendingSnoozes: kindCounts.get("snooze") ?? 0,
      pendingSends: kindCounts.get("scheduled-send") ?? 0,
    },
    recentRuns: recentRuns.map((row) => ({
      id: row.id,
      workflowName: row.workflowName,
      kind: row.kind,
      status: row.status,
      error: row.error,
      ranAt: row.createdAt.toISOString(),
    })),
  };
}

export async function dashboardMcp(): Promise<DashboardMcp> {
  const rows = await db
    .select({
      clientId: mcpClient.clientId,
      label: mcpClient.label,
      preset: mcpClient.preset,
      enabled: mcpClient.enabled,
      capabilities: mcpClient.capabilities,
      createdAt: mcpClient.createdAt,
      lastUsedAt: mcpClient.lastUsedAt,
      hiddenWorkspaceIds: mcpClient.hiddenWorkspaceIds,
      email: user.email,
      clientDiscoveryId: oauthClient.clientDiscoveryId,
    })
    .from(mcpClient)
    .leftJoin(user, eq(mcpClient.userId, user.id))
    .leftJoin(oauthClient, eq(mcpClient.clientId, oauthClient.clientId))
    .orderBy(desc(mcpClient.createdAt));

  const clients = rows.map((row) => {
    const tools = mcpToolsFor({ isOwner: isOwnerEmail(row.email) });
    return {
      clientId: row.clientId,
      label: row.label,
      preset: row.preset,
      enabled: row.enabled,
      cimd: row.clientDiscoveryId === "cimd",
      hiddenWorkspaces: row.hiddenWorkspaceIds.length,
      toolsEnabled: tools.filter((tool) => isMcpToolEnabled(row.capabilities.tools, tool.key))
        .length,
      toolsTotal: tools.length,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    };
  });

  return {
    total: clients.length,
    enabled: clients.filter((c) => c.enabled).length,
    cimd: clients.filter((c) => c.cimd).length,
    clients,
  };
}

export async function dashboardAudit(page: AuditPageInput = {}): Promise<DashboardAudit> {
  return {
    retentionDays: config.audit.retentionDays,
    ...(await listInstanceAuditEvents(page)),
  };
}
