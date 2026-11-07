import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, type Executor } from "@/db";
import {
  user,
  workflow,
  workflowBlob,
  workflowCursor,
  workflowEndpoint,
  workflowEvent,
  workflowResource,
  workflowRevision,
  workflowRun,
  workflowStepRun,
  workflowTick,
  workflowTrigger,
  workflowWait,
  workspaceMember,
} from "@/db/schema";
import { keysOf } from "@/lib/guards";
import { recordOf } from "@/lib/records";
import type { DraftPayload } from "@/types/mail";

import { nextCronAt } from "./cron";
import type {
  FeedCursor,
  RunInput,
  RunSummaryLine,
  StepReceipt,
  StepResolution,
  StepRunOutput,
  WaitState,
} from "./runtime";
import {
  BARRIER_ITEM_KEY,
  type EndpointKind,
  type GraphNode,
  type RunStatus,
  type StepStatus,
  type WaitKind,
  type WorkflowGraph,
  type WorkflowKind,
} from "./schema";
import { stepDef } from "./steps";
import type { ResourceKind } from "./steps/types";
import { graphResources } from "./validation";

export type DefinitionRow = typeof workflow.$inferSelect;
export type TriggerRow = typeof workflowTrigger.$inferSelect;
export type RunRow = typeof workflowRun.$inferSelect;
export type StepRunRow = typeof workflowStepRun.$inferSelect;
export type WaitRow = typeof workflowWait.$inferSelect;
export type EndpointRow = typeof workflowEndpoint.$inferSelect;

export const TICK_ID = "singleton";

export interface LoadedDefinition {
  definition: DefinitionRow;
  revisionId: string;
  graph: WorkflowGraph;
}

export type ResourceLinks = Record<ResourceKind, Record<string, string | null>>;

export const NO_LINKS: ResourceLinks = { mailbox: {}, calendar: {}, drive: {}, addressbook: {} };

export interface SaveDefinitionInput {
  id?: string;
  kind: WorkflowKind;
  workspaceId?: string | null;
  principalUserId?: string | null;
  mailboxId?: string | null;
  originLinkId?: string | null;
  name: string;
  targetKey?: string | null;
  enabled: boolean;
  graph: WorkflowGraph;
  sortOrder?: number;
  links?: ResourceLinks;
}

function literalParam(node: GraphNode, name: string): string {
  const bound = node.params[name];
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
}

interface TriggerSeed {
  nextDueAt: Date | null;
  baselineAt: Date | null;
  cron: string | null;
  timezone: string;
}

function triggerSeed(node: GraphNode, now: Date): TriggerSeed | null {
  const source = stepDef(node.step)?.trigger;
  if (!source) return null;
  if (source.kind === "time") {
    const cron = literalParam(node, "cron");
    const timezone = literalParam(node, "timezone") || "Etc/UTC";
    return { cron, timezone, nextDueAt: nextCronAt(cron, timezone, now), baselineAt: null };
  }
  if (source.kind === "once") {
    const at = literalParam(node, "at");
    const due = at ? new Date(at) : null;
    return {
      cron: null,
      timezone: "Etc/UTC",
      nextDueAt: due && !Number.isNaN(due.getTime()) ? due : null,
      baselineAt: null,
    };
  }
  if (source.kind === "feed") {
    return { cron: null, timezone: "Etc/UTC", nextDueAt: now, baselineAt: now };
  }
  return { cron: null, timezone: "Etc/UTC", nextDueAt: null, baselineAt: null };
}

function resourceRows(
  graph: WorkflowGraph,
  workflowId: string,
  revisionId: string,
  links: ResourceLinks,
) {
  return graphResources(graph).map((resource) => ({
    id: crypto.randomUUID(),
    workflowId,
    revisionId,
    nodeId: resource.nodeId,
    kind: resource.kind,
    mailboxId: resource.kind === "mailbox" ? resource.id : null,
    calendarId: resource.kind === "calendar" ? resource.id : null,
    driveId: resource.kind === "drive" ? resource.id : null,
    addressBookId: resource.kind === "addressbook" ? resource.id : null,
    mailboxWorkspaceId: resource.kind === "mailbox" ? (links.mailbox[resource.id] ?? null) : null,
    calendarWorkspaceId:
      resource.kind === "calendar" ? (links.calendar[resource.id] ?? null) : null,
    driveWorkspaceId: resource.kind === "drive" ? (links.drive[resource.id] ?? null) : null,
    addressBookWorkspaceId:
      resource.kind === "addressbook" ? (links.addressbook[resource.id] ?? null) : null,
  }));
}

function triggerParamsChanged(prior: TriggerRow, seed: TriggerSeed): boolean {
  return prior.cron !== seed.cron || prior.timezone !== seed.timezone;
}

async function writeRevision(
  tx: Executor,
  opts: {
    workflowId: string;
    revision: number;
    graph: WorkflowGraph;
    links: ResourceLinks;
    previous: WorkflowGraph | null;
    now: Date;
    authorUserId: string | null;
  },
): Promise<string> {
  const revisionId = crypto.randomUUID();
  await tx.insert(workflowRevision).values({
    id: revisionId,
    workflowId: opts.workflowId,
    revision: opts.revision,
    graph: opts.graph,
    createdAt: opts.now,
    createdByUserId: opts.authorUserId,
  });

  const rows = resourceRows(opts.graph, opts.workflowId, revisionId, opts.links);
  if (rows.length > 0) await tx.insert(workflowResource).values(rows);

  const existing = await tx
    .select()
    .from(workflowTrigger)
    .where(eq(workflowTrigger.workflowId, opts.workflowId));
  const byNode = new Map(existing.map((row) => [row.nodeId, row]));
  const previousNodes = new Map((opts.previous?.nodes ?? []).map((node) => [node.id, node]));
  const keep = new Set<string>();

  /* oxlint-disable eslint/no-await-in-loop -- per-trigger updates share the transaction's single connection, which runs statements one at a time */
  for (const node of opts.graph.nodes) {
    const seed = triggerSeed(node, opts.now);
    if (!seed) continue;
    keep.add(node.id);
    const prior = byNode.get(node.id);
    const source = stepDef(node.step)?.trigger;
    const feed = source?.kind === "feed";
    const before = previousNodes.get(node.id);
    const feedChanged =
      feed && JSON.stringify(before?.params ?? null) !== JSON.stringify(node.params);
    if (prior && prior.kind === node.step) {
      const rescheduled =
        source?.kind === "once" || (source?.kind === "time" && triggerParamsChanged(prior, seed));
      const rebaseline = feed && (!prior.armed || feedChanged);
      await tx
        .update(workflowTrigger)
        .set({
          revisionId,
          cron: seed.cron,
          timezone: seed.timezone,
          armed: true,
          nextDueAt: rescheduled || rebaseline || !prior.armed ? seed.nextDueAt : prior.nextDueAt,
          baselineAt: rebaseline ? seed.baselineAt : prior.baselineAt,
          lastError: rebaseline ? null : prior.lastError,
          updatedAt: opts.now,
        })
        .where(eq(workflowTrigger.id, prior.id));
      if (rebaseline) await tx.delete(workflowCursor).where(eq(workflowCursor.triggerId, prior.id));
      continue;
    }
    if (prior) {
      await tx
        .update(workflowTrigger)
        .set({
          revisionId,
          kind: node.step,
          cron: seed.cron,
          timezone: seed.timezone,
          armed: true,
          nextDueAt: seed.nextDueAt,
          baselineAt: seed.baselineAt,
          lastError: null,
          updatedAt: opts.now,
        })
        .where(eq(workflowTrigger.id, prior.id));
      await tx.delete(workflowCursor).where(eq(workflowCursor.triggerId, prior.id));
      continue;
    }
    await tx.insert(workflowTrigger).values({
      id: crypto.randomUUID(),
      workflowId: opts.workflowId,
      revisionId,
      nodeId: node.id,
      kind: node.step,
      cron: seed.cron,
      timezone: seed.timezone,
      armed: true,
      nextDueAt: seed.nextDueAt,
      baselineAt: seed.baselineAt,
      createdAt: opts.now,
      updatedAt: opts.now,
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */

  const stale = existing.filter((row) => !keep.has(row.nodeId));
  if (stale.length > 0) {
    const ids = stale.map((row) => row.id);
    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: opts.now })
      .where(inArray(workflowTrigger.id, ids));
    await tx.delete(workflowCursor).where(inArray(workflowCursor.triggerId, ids));
  }

  return revisionId;
}

async function cancelOpenRuns(tx: Executor, workflowId: string, now: Date): Promise<void> {
  const cancelled = await tx
    .update(workflowRun)
    .set({ status: "cancelled", finishedAt: now })
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        inArray(workflowRun.status, ["pending", "waiting"]),
      ),
    )
    .returning({ id: workflowRun.id });
  if (cancelled.length === 0) return;
  const ids = cancelled.map((row) => row.id);
  await tx
    .update(workflowWait)
    .set({ status: "cancelled" })
    .where(and(inArray(workflowWait.runId, ids), eq(workflowWait.status, "open")));
  await tx
    .update(workflowStepRun)
    .set({ status: "skipped", error: "Cancelled while waiting", wakeAt: null })
    .where(and(inArray(workflowStepRun.runId, ids), eq(workflowStepRun.status, "waiting")));
}

async function rearmTriggers(tx: Executor, workflowId: string, now: Date): Promise<void> {
  const triggers = await tx
    .select()
    .from(workflowTrigger)
    .where(and(eq(workflowTrigger.workflowId, workflowId), eq(workflowTrigger.armed, true)));
  /* oxlint-disable eslint/no-await-in-loop -- each trigger gets its own next time; statements share the transaction's single connection */
  for (const trigger of triggers) {
    const source = stepDef(trigger.kind)?.trigger;
    if (source?.kind === "time" && trigger.cron) {
      await tx
        .update(workflowTrigger)
        .set({ nextDueAt: nextCronAt(trigger.cron, trigger.timezone, now), updatedAt: now })
        .where(eq(workflowTrigger.id, trigger.id));
    }
    if (source?.kind === "feed") {
      await tx
        .update(workflowTrigger)
        .set({ baselineAt: now, nextDueAt: now, lastError: null, updatedAt: now })
        .where(eq(workflowTrigger.id, trigger.id));
      await tx.delete(workflowCursor).where(eq(workflowCursor.triggerId, trigger.id));
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

export async function saveDefinition(input: SaveDefinitionInput): Promise<LoadedDefinition> {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();

  const revisionId = await db.transaction(async (tx) => {
    await tx.insert(workflow).values({
      id,
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      principalUserId: input.principalUserId ?? null,
      mailboxId: input.mailboxId ?? null,
      originLinkId: input.originLinkId ?? null,
      name: input.name,
      targetKey: input.targetKey ?? null,
      enabled: input.enabled,
      revision: 1,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
    return writeRevision(tx, {
      workflowId: id,
      revision: 1,
      graph: input.graph,
      links: input.links ?? NO_LINKS,
      previous: null,
      now,
      authorUserId: input.principalUserId ?? null,
    });
  });

  const [row] = await db.select().from(workflow).where(eq(workflow.id, id));
  if (!row) throw new Error("workflow disappeared after insert");
  return { definition: row, revisionId, graph: input.graph };
}

export async function reviseDefinition(opts: {
  workflowId: string;
  name: string;
  enabled: boolean;
  graph: WorkflowGraph;
  links?: ResourceLinks;
  authorUserId?: string | null;
}): Promise<LoadedDefinition | null> {
  const now = new Date();

  const revisionId = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ definition: workflow, graph: workflowRevision.graph })
      .from(workflow)
      .leftJoin(
        workflowRevision,
        and(
          eq(workflowRevision.workflowId, workflow.id),
          eq(workflowRevision.revision, workflow.revision),
        ),
      )
      .where(eq(workflow.id, opts.workflowId));
    if (!current || current.definition.deletedAt) return null;

    const revision = current.definition.revision + 1;
    const id = await writeRevision(tx, {
      workflowId: opts.workflowId,
      revision,
      graph: opts.graph,
      links: opts.links ?? NO_LINKS,
      previous: current.graph,
      now,
      authorUserId: opts.authorUserId ?? null,
    });
    if (!current.definition.enabled && opts.enabled) {
      await rearmTriggers(tx, opts.workflowId, now);
    } else if (!opts.enabled && current.definition.kind === "user") {
      await cancelOpenRuns(tx, opts.workflowId, now);
    }
    await tx
      .update(workflow)
      .set({
        name: opts.name,
        enabled: opts.enabled,
        disabledReason: null,
        revision,
        updatedAt: now,
      })
      .where(eq(workflow.id, opts.workflowId));
    return id;
  });

  if (!revisionId) return null;
  const [row] = await db.select().from(workflow).where(eq(workflow.id, opts.workflowId));
  if (!row) return null;
  return { definition: row, revisionId, graph: opts.graph };
}

function currentRevisionJoin() {
  return and(
    eq(workflowRevision.workflowId, workflow.id),
    eq(workflowRevision.revision, workflow.revision),
  );
}

export async function loadDefinition(workflowId: string): Promise<LoadedDefinition | null> {
  const [row] = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(eq(workflow.id, workflowId))
    .limit(1);
  if (!row) return null;
  return { definition: row.definition, revisionId: row.revision.id, graph: row.revision.graph };
}

export async function loadRevision(
  revisionId: string,
): Promise<{ definition: DefinitionRow; graph: WorkflowGraph; revision: number } | null> {
  const [row] = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflowRevision)
    .innerJoin(workflow, eq(workflow.id, workflowRevision.workflowId))
    .where(eq(workflowRevision.id, revisionId))
    .limit(1);
  if (!row) return null;
  return { definition: row.definition, graph: row.revision.graph, revision: row.revision.revision };
}

export async function listRevisions(
  workflowId: string,
  limit: number,
): Promise<
  {
    id: string;
    revision: number;
    createdAt: Date;
    createdByUserId: string | null;
    graph: WorkflowGraph;
  }[]
> {
  return db
    .select({
      id: workflowRevision.id,
      revision: workflowRevision.revision,
      createdAt: workflowRevision.createdAt,
      createdByUserId: workflowRevision.createdByUserId,
      graph: workflowRevision.graph,
    })
    .from(workflowRevision)
    .where(eq(workflowRevision.workflowId, workflowId))
    .orderBy(desc(workflowRevision.revision))
    .limit(limit);
}

export async function listDefinitions(opts: {
  workspaceId?: string;
  mailboxIds?: string[];
  kind?: WorkflowKind;
  includeDeleted?: boolean;
}): Promise<LoadedDefinition[]> {
  const where = opts.includeDeleted ? [] : [isNull(workflow.deletedAt)];
  if (opts.workspaceId) where.push(eq(workflow.workspaceId, opts.workspaceId));
  if (opts.kind) where.push(eq(workflow.kind, opts.kind));
  if (opts.mailboxIds) {
    if (opts.mailboxIds.length === 0) return [];
    where.push(inArray(workflow.mailboxId, opts.mailboxIds));
  }

  const rows = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(workflow.sortOrder), asc(workflow.createdAt));

  return rows.map((row) => ({
    definition: row.definition,
    revisionId: row.revision.id,
    graph: row.revision.graph,
  }));
}

export async function setDefinitionEnabled(workflowId: string, enabled: boolean): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(workflow)
      .set({ enabled, disabledReason: null, updatedAt: now })
      .where(
        and(
          eq(workflow.id, workflowId),
          isNull(workflow.deletedAt),
          eq(workflow.enabled, !enabled),
        ),
      )
      .returning({ id: workflow.id, kind: workflow.kind });
    if (updated.length === 0) {
      const [row] = await tx
        .select({ id: workflow.id })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)));
      return !!row;
    }
    if (enabled) await rearmTriggers(tx, workflowId, now);
    else if (updated[0]?.kind === "user") await cancelOpenRuns(tx, workflowId, now);
    return true;
  });
}

export async function softDeleteDefinition(workflowId: string): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(workflow)
      .set({ deletedAt: now, enabled: false, updatedAt: now })
      .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)))
      .returning({ id: workflow.id });
    if (updated.length === 0) return false;
    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: now })
      .where(eq(workflowTrigger.workflowId, workflowId));
    await cancelOpenRuns(tx, workflowId, now);
    await clearWorkflowOutputs(tx, workflowId);
    await tx.delete(workflowBlob).where(eq(workflowBlob.workflowId, workflowId));
    await tx
      .delete(workflowEndpoint)
      .where(
        and(eq(workflowEndpoint.workflowId, workflowId), eq(workflowEndpoint.kind, "webhook")),
      );
    return true;
  });
}

async function clearWorkflowOutputs(tx: Executor, workflowId: string): Promise<void> {
  await tx
    .update(workflowStepRun)
    .set({ output: null, input: null, state: null })
    .where(
      and(
        inArray(
          workflowStepRun.runId,
          tx
            .select({ id: workflowRun.id })
            .from(workflowRun)
            .where(eq(workflowRun.workflowId, workflowId)),
        ),
        ne(workflowStepRun.itemKey, BARRIER_ITEM_KEY),
      ),
    );
}

export async function upsertSystemDefinition(opts: {
  id: string;
  name: string;
  graph: WorkflowGraph;
}): Promise<LoadedDefinition> {
  const existing = await loadDefinition(opts.id);
  if (existing) {
    if (JSON.stringify(existing.graph) === JSON.stringify(opts.graph)) return existing;
    const revised = await reviseDefinition({
      workflowId: opts.id,
      name: opts.name,
      enabled: true,
      graph: opts.graph,
    });
    if (revised) return revised;
  }
  return saveDefinition({
    id: opts.id,
    kind: "system",
    name: opts.name,
    enabled: true,
    graph: opts.graph,
  });
}

export async function findLiveTarget(opts: {
  mailboxId: string;
  kind: WorkflowKind;
  targetKey: string;
}): Promise<DefinitionRow | null> {
  const [row] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.mailboxId, opts.mailboxId),
        eq(workflow.kind, opts.kind),
        eq(workflow.targetKey, opts.targetKey),
        isNull(workflow.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTriggers(workflowId: string): Promise<TriggerRow[]> {
  return db.select().from(workflowTrigger).where(eq(workflowTrigger.workflowId, workflowId));
}

export async function listTriggersOf(workflowIds: string[]): Promise<TriggerRow[]> {
  if (workflowIds.length === 0) return [];
  return db.select().from(workflowTrigger).where(inArray(workflowTrigger.workflowId, workflowIds));
}

export interface DueTrigger {
  trigger: TriggerRow;
  definition: DefinitionRow;
  graph: WorkflowGraph;
}

export async function dueTriggers(now: Date, limit: number): Promise<DueTrigger[]> {
  const rows = await db
    .select({ trigger: workflowTrigger, definition: workflow, revision: workflowRevision })
    .from(workflowTrigger)
    .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(
      and(
        eq(workflowTrigger.armed, true),
        eq(workflow.enabled, true),
        isNull(workflow.deletedAt),
        lte(workflowTrigger.nextDueAt, now),
      ),
    )
    .orderBy(asc(workflowTrigger.nextDueAt))
    .limit(limit);
  return rows.map((row) => ({
    trigger: row.trigger,
    definition: row.definition,
    graph: row.revision.graph,
  }));
}

export async function armedTriggersOfKind(opts: {
  kinds: string[];
  workspaceId?: string | null;
}): Promise<DueTrigger[]> {
  if (opts.kinds.length === 0) return [];
  const rows = await db
    .select({ trigger: workflowTrigger, definition: workflow, revision: workflowRevision })
    .from(workflowTrigger)
    .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(
      and(
        inArray(workflowTrigger.kind, opts.kinds),
        eq(workflowTrigger.armed, true),
        eq(workflow.enabled, true),
        isNull(workflow.deletedAt),
        opts.workspaceId ? eq(workflow.workspaceId, opts.workspaceId) : undefined,
      ),
    );
  return rows.map((row) => ({
    trigger: row.trigger,
    definition: row.definition,
    graph: row.revision.graph,
  }));
}

export async function triggerById(triggerId: string): Promise<DueTrigger | null> {
  const [row] = await db
    .select({ trigger: workflowTrigger, definition: workflow, revision: workflowRevision })
    .from(workflowTrigger)
    .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(eq(workflowTrigger.id, triggerId))
    .limit(1);
  return row
    ? { trigger: row.trigger, definition: row.definition, graph: row.revision.graph }
    : null;
}

export async function wakeTrigger(triggerId: string, at: Date): Promise<void> {
  await db
    .update(workflowTrigger)
    .set({ nextDueAt: at, updatedAt: at })
    .where(and(eq(workflowTrigger.id, triggerId), eq(workflowTrigger.armed, true)));
}

export type TriggerPatch = {
  nextDueAt?: Date | null;
  baselineAt?: Date | null;
  armed?: boolean;
  lastRunAt?: Date | null;
  lastError?: string | null;
};

export async function updateTrigger(
  triggerId: string,
  patch: TriggerPatch,
  claimToken?: string,
): Promise<boolean> {
  const rows = await db
    .update(workflowTrigger)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(workflowTrigger.id, triggerId),
        claimToken ? eq(workflowTrigger.claimToken, claimToken) : undefined,
      ),
    )
    .returning({ id: workflowTrigger.id });
  return rows.length > 0;
}

export async function claimTrigger(
  triggerId: string,
  token: string,
  now: Date,
  staleMs: number,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - staleMs);
  const rows = await db
    .update(workflowTrigger)
    .set({ claimedAt: now, claimToken: token })
    .where(
      and(
        eq(workflowTrigger.id, triggerId),
        or(isNull(workflowTrigger.claimedAt), lt(workflowTrigger.claimedAt, staleBefore)),
      ),
    )
    .returning({ id: workflowTrigger.id });
  return rows.length > 0;
}

export async function releaseTrigger(triggerId: string, token: string): Promise<void> {
  await db
    .update(workflowTrigger)
    .set({ claimedAt: null, claimToken: null })
    .where(and(eq(workflowTrigger.id, triggerId), eq(workflowTrigger.claimToken, token)));
}

export async function getCursors(triggerId: string): Promise<Map<string, FeedCursor>> {
  const rows = await db
    .select()
    .from(workflowCursor)
    .where(eq(workflowCursor.triggerId, triggerId));
  return new Map(rows.map((row) => [row.scope, row.cursor]));
}

export async function putCursor(
  triggerId: string,
  token: string,
  cursor: FeedCursor,
): Promise<boolean> {
  const owned = await db
    .select({ id: workflowTrigger.id })
    .from(workflowTrigger)
    .where(and(eq(workflowTrigger.id, triggerId), eq(workflowTrigger.claimToken, token)))
    .limit(1);
  if (owned.length === 0) return false;
  const now = new Date();
  await db
    .insert(workflowCursor)
    .values({ id: crypto.randomUUID(), triggerId, scope: cursor.scope, cursor, updatedAt: now })
    .onConflictDoUpdate({
      target: [workflowCursor.triggerId, workflowCursor.scope],
      set: { cursor, updatedAt: now },
    });
  return true;
}

export interface OpenEvent {
  workflowId: string;
  triggerId: string;
  revisionId: string;
  key: string;
  scheduledFor: Date;
  kind: WorkflowKind;
  workspaceId: string | null;
  principalUserId: string | null;
  input: RunInput;
  payload?: unknown;
  dueAt: Date;
  triggerPatch?: TriggerPatch;
  withoutRun?: string;
  limit?: { mode: "debounce" | "throttle"; key: string; seconds: number };
  parentRunId?: string;
}

export async function openEvent(opts: OpenEvent): Promise<string | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    let skipped = opts.withoutRun ?? null;
    let dueAt = opts.dueAt;
    if (!skipped && opts.limit) {
      const since = new Date(now.getTime() - opts.limit.seconds * 1000);
      if (opts.limit.mode === "throttle") {
        const [recent] = await tx
          .select({ id: workflowRun.id })
          .from(workflowRun)
          .where(
            and(
              eq(workflowRun.workflowId, opts.workflowId),
              eq(workflowRun.limitKey, opts.limit.key),
              gt(workflowRun.createdAt, since),
            ),
          )
          .limit(1);
        if (recent) skipped = "throttled: a run for the same key started recently";
      } else {
        await tx
          .update(workflowRun)
          .set({
            status: "cancelled",
            finishedAt: now,
            error: "Replaced by a later event (debounce)",
          })
          .where(
            and(
              eq(workflowRun.workflowId, opts.workflowId),
              eq(workflowRun.limitKey, opts.limit.key),
              eq(workflowRun.status, "pending"),
              eq(workflowRun.attempts, 0),
            ),
          );
        dueAt = new Date(Math.max(opts.dueAt.getTime(), now.getTime() + opts.limit.seconds * 1000));
      }
    }

    const eventId = crypto.randomUUID();
    const inserted = await tx
      .insert(workflowEvent)
      .values({
        id: eventId,
        workflowId: opts.workflowId,
        triggerId: opts.triggerId,
        key: opts.key,
        scheduledFor: opts.scheduledFor,
        payload: opts.payload ?? null,
        skippedReason: skipped,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [workflowEvent.triggerId, workflowEvent.key] })
      .returning({ id: workflowEvent.id });

    if (opts.triggerPatch) {
      await tx
        .update(workflowTrigger)
        .set({ ...opts.triggerPatch, updatedAt: now })
        .where(eq(workflowTrigger.id, opts.triggerId));
    }
    if (inserted.length === 0 || skipped) return null;

    const runId = crypto.randomUUID();
    await tx.insert(workflowRun).values({
      id: runId,
      workflowId: opts.workflowId,
      revisionId: opts.revisionId,
      eventId,
      kind: opts.kind,
      workspaceId: opts.workspaceId,
      principalUserId: opts.principalUserId,
      parentRunId: opts.parentRunId ?? null,
      limitKey: opts.limit?.key ?? null,
      input: opts.input,
      status: "pending",
      dueAt,
      attempts: 0,
      createdAt: now,
    });
    return runId;
  });
}

const CLAIM_SLICES: readonly (readonly WorkflowKind[])[] = [
  ["scheduled-send", "snooze"],
  ["user"],
  ["system"],
];

let claimRotation = 0;

const capOf = sql`(select json_extract(${workflowRevision.graph}, '$.settings.concurrency') from ${workflowRevision} where ${workflowRevision.id} = ${workflowRun.revisionId})`;

async function claimSlice(opts: {
  now: Date;
  limit: number;
  owner: string;
  leaseMs: number;
  kinds?: readonly WorkflowKind[];
}): Promise<RunRow[]> {
  if (opts.limit <= 0) return [];
  const { now, owner, leaseMs } = opts;
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const running = alias(workflowRun, "running_run");
  const busy = db
    .select({ count: sql<number>`count(*)` })
    .from(running)
    .where(
      and(
        eq(running.workflowId, workflowRun.workflowId),
        eq(running.status, "running"),
        gte(running.leaseExpiresAt, now),
      ),
    );

  const candidates = db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        or(
          and(inArray(workflowRun.status, ["pending", "waiting"]), lte(workflowRun.dueAt, now)),
          and(eq(workflowRun.status, "running"), lt(workflowRun.leaseExpiresAt, now)),
        ),
        opts.kinds ? inArray(workflowRun.kind, [...opts.kinds]) : undefined,
        sql`(${capOf} is null or ${busy} < ${capOf})`,
      ),
    )
    .orderBy(asc(workflowRun.dueAt))
    .limit(opts.limit);

  return db
    .update(workflowRun)
    .set({
      status: "running",
      leaseOwner: owner,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: leaseUntil,
      attempts: sql`${workflowRun.attempts} + 1`,
      startedAt: sql`coalesce(${workflowRun.startedAt}, ${now.getTime()})`,
    })
    .where(inArray(workflowRun.id, candidates))
    .returning();
}

export async function claimRuns(opts: {
  now: Date;
  limit: number;
  owner: string;
  leaseMs: number;
}): Promise<RunRow[]> {
  const claimed: RunRow[] = [];
  const share = Math.max(1, Math.floor(opts.limit / CLAIM_SLICES.length));
  const offset = claimRotation % CLAIM_SLICES.length;
  claimRotation += 1;
  const order = [...CLAIM_SLICES.slice(offset), ...CLAIM_SLICES.slice(0, offset)];

  for (const kinds of order) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each slice's limit depends on how many runs the earlier slices claimed
    const rows = await claimSlice({
      ...opts,
      limit: Math.min(share, opts.limit - claimed.length),
      kinds,
    });
    claimed.push(...rows);
  }
  claimed.push(...(await claimSlice({ ...opts, limit: opts.limit - claimed.length })));
  return enforceCaps(claimed);
}

async function enforceCaps(claimed: RunRow[]): Promise<RunRow[]> {
  const workflowIds = [...new Set(claimed.map((run) => run.workflowId))];
  if (workflowIds.length === 0) return claimed;
  const caps = await db
    .select({ id: workflowRun.id, cap: capOf })
    .from(workflowRun)
    .where(
      inArray(
        workflowRun.id,
        claimed.map((run) => run.id),
      ),
    );
  const capById = new Map(
    caps.map((row) => [row.id, typeof row.cap === "number" ? row.cap : null]),
  );
  const counts = new Map<string, number>();
  const kept: RunRow[] = [];
  const released: RunRow[] = [];
  for (const run of claimed) {
    const cap = capById.get(run.id) ?? null;
    if (cap === null) {
      kept.push(run);
      continue;
    }
    const seen = (counts.get(run.workflowId) ?? 0) + 1;
    counts.set(run.workflowId, seen);
    if (seen > cap) released.push(run);
    else kept.push(run);
  }
  await Promise.all(released.map((run) => releaseRun(run)));
  return kept;
}

export async function claimRun(opts: {
  runId: string;
  now: Date;
  owner: string;
  leaseMs: number;
}): Promise<RunRow | null> {
  const rows = await db
    .update(workflowRun)
    .set({
      status: "running",
      leaseOwner: opts.owner,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: new Date(opts.now.getTime() + opts.leaseMs),
      attempts: sql`${workflowRun.attempts} + 1`,
      startedAt: sql`coalesce(${workflowRun.startedAt}, ${opts.now.getTime()})`,
    })
    .where(
      and(
        eq(workflowRun.id, opts.runId),
        or(
          eq(workflowRun.status, "pending"),
          and(eq(workflowRun.status, "running"), lt(workflowRun.leaseExpiresAt, opts.now)),
        ),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function heartbeatRun(runId: string, token: string, until: Date): Promise<boolean> {
  const rows = await db
    .update(workflowRun)
    .set({ leaseExpiresAt: until })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.leaseToken, token)))
    .returning({ id: workflowRun.id });
  return rows.length > 0;
}

export const RESUMABLE_RUN_STATUSES = [
  "failed",
  "partial",
  "blocked",
] as const satisfies readonly RunStatus[];

export function isResumableStatus(status: RunStatus): boolean {
  return (RESUMABLE_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

export const RESUMABLE_KINDS = [
  "user",
  "scheduled-send",
] as const satisfies readonly WorkflowKind[];

export function isResumableKind(kind: WorkflowKind): boolean {
  return (RESUMABLE_KINDS as readonly WorkflowKind[]).includes(kind);
}

export async function settleRun(opts: {
  runId: string;
  token: string;
  status: RunStatus;
  error?: string | null;
  summary?: RunSummaryLine[];
  retryAt?: Date | null;
  wakeAt?: Date | null;
  restoreAttempt?: boolean;
  output?: unknown;
  clearOutputs: boolean;
  definition?: "enable" | "retire";
  blocked?: boolean;
}): Promise<boolean> {
  const now = new Date();
  const retry = opts.retryAt ?? null;
  const blockedAt = opts.blocked ? now : null;
  const waiting = opts.status === "waiting" && !retry;
  const owned = and(eq(workflowRun.id, opts.runId), eq(workflowRun.leaseToken, opts.token));
  const released = { leaseOwner: null, leaseToken: null, leaseExpiresAt: null };
  return db.transaction(async (tx) => {
    let rows = await tx
      .update(workflowRun)
      .set(
        retry
          ? {
              status: "pending",
              dueAt: retry,
              ...released,
              blockedAt,
              error: opts.error ?? null,
              summary: opts.summary,
              ...(opts.restoreAttempt
                ? { attempts: sql`max(${workflowRun.attempts} - 1, 0)` }
                : {}),
            }
          : waiting
            ? {
                status: "waiting",
                dueAt: opts.wakeAt ?? new Date(now.getTime() + 86_400_000),
                ...released,
                attempts: 0,
                blockedAt: null,
                error: null,
                summary: opts.summary,
              }
            : {
                status: opts.status,
                finishedAt: now,
                ...released,
                blockedAt,
                error: opts.error ?? null,
                summary: opts.summary,
                output: opts.output ?? null,
              },
      )
      .where(retry || waiting ? and(owned, ne(workflowRun.status, "cancelled")) : owned)
      .returning({
        id: workflowRun.id,
        workflowId: workflowRun.workflowId,
        parentRunId: workflowRun.parentRunId,
      });
    const requeued = (!!retry || waiting) && rows.length > 0;
    if ((retry || waiting) && !requeued) {
      rows = await tx
        .update(workflowRun)
        .set({ finishedAt: now, ...released, error: opts.error ?? null, summary: opts.summary })
        .where(and(owned, eq(workflowRun.status, "cancelled")))
        .returning({
          id: workflowRun.id,
          workflowId: workflowRun.workflowId,
          parentRunId: workflowRun.parentRunId,
        });
    }
    const [owner] = rows;
    if (!owner) return false;
    if (!requeued && opts.clearOutputs) await clearRunOutputs(tx, opts.runId);
    if (!requeued && owner.parentRunId) {
      await tx
        .update(workflowRun)
        .set({ status: "pending", dueAt: now })
        .where(and(eq(workflowRun.id, owner.parentRunId), eq(workflowRun.status, "waiting")));
    }
    if (opts.definition && !requeued) {
      await tx
        .update(workflow)
        .set(
          opts.definition === "enable"
            ? { enabled: true, updatedAt: now }
            : { deletedAt: now, enabled: false, updatedAt: now },
        )
        .where(and(eq(workflow.id, owner.workflowId), isNull(workflow.deletedAt)));
      if (opts.definition === "retire") {
        await tx
          .update(workflowTrigger)
          .set({ armed: false, nextDueAt: null, updatedAt: now })
          .where(eq(workflowTrigger.workflowId, owner.workflowId));
      }
    }
    return true;
  });
}

export async function releaseRun(run: RunRow): Promise<boolean> {
  if (!run.leaseToken) return false;
  const owned = and(eq(workflowRun.id, run.id), eq(workflowRun.leaseToken, run.leaseToken));
  const rows = await db
    .update(workflowRun)
    .set({
      status: "pending",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      attempts: sql`max(${workflowRun.attempts} - 1, 0)`,
    })
    .where(and(owned, ne(workflowRun.status, "cancelled")))
    .returning({ id: workflowRun.id });
  if (rows.length > 0) return true;
  const now = new Date();
  return db.transaction(async (tx) => {
    const stopped = await tx
      .update(workflowRun)
      .set({ finishedAt: now, leaseOwner: null, leaseToken: null, leaseExpiresAt: null })
      .where(and(owned, eq(workflowRun.status, "cancelled")))
      .returning({ id: workflowRun.id });
    if (stopped.length === 0) return false;
    await clearRunOutputs(tx, run.id);
    return true;
  });
}

async function clearRunOutputs(tx: Executor, runId: string): Promise<void> {
  await tx
    .update(workflowStepRun)
    .set({ output: null, input: null, state: null })
    .where(and(eq(workflowStepRun.runId, runId), ne(workflowStepRun.itemKey, BARRIER_ITEM_KEY)));
  await tx.delete(workflowBlob).where(eq(workflowBlob.runId, runId));
}

async function countStepRuns(tx: Executor, runId: string, statuses: StepStatus[]): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(workflowStepRun)
    .where(and(eq(workflowStepRun.runId, runId), inArray(workflowStepRun.status, statuses)));
  return row?.n ?? 0;
}

async function closeCancelledSteps(
  tx: Executor,
  runId: string,
  revisionId: string,
  now: Date,
): Promise<void> {
  const [revision] = await tx
    .select({ graph: workflowRevision.graph })
    .from(workflowRevision)
    .where(eq(workflowRevision.id, revisionId))
    .limit(1);
  const effectful = (revision?.graph.nodes ?? [])
    .filter((node) => {
      const effect = stepDef(node.step)?.effect;
      return effect === "write" || effect === "dispatch";
    })
    .map((node) => node.id);

  await tx
    .update(workflowStepRun)
    .set({
      status: "unknown",
      error:
        "The run was cancelled while this step was in progress, and its outcome was never confirmed",
      finishedAt: now,
    })
    .where(
      and(
        eq(workflowStepRun.runId, runId),
        or(
          eq(workflowStepRun.status, "dispatching"),
          and(eq(workflowStepRun.status, "running"), inArray(workflowStepRun.nodeId, effectful)),
        ),
      ),
    );
  await tx
    .update(workflowStepRun)
    .set({ status: "failed", error: "Stopped when the run was cancelled", finishedAt: now })
    .where(and(eq(workflowStepRun.runId, runId), eq(workflowStepRun.status, "running")));
  await tx
    .update(workflowStepRun)
    .set({ status: "skipped", error: "Cancelled while waiting", wakeAt: null, finishedAt: now })
    .where(and(eq(workflowStepRun.runId, runId), eq(workflowStepRun.status, "waiting")));
  await tx
    .update(workflowWait)
    .set({ status: "cancelled" })
    .where(and(eq(workflowWait.runId, runId), eq(workflowWait.status, "open")));
  await clearRunOutputs(tx, runId);
}

async function closeStrandedCancel(tx: Executor, runId: string, leaseToken: string, now: Date) {
  const closed = await tx
    .update(workflowRun)
    .set({ finishedAt: now, leaseOwner: null, leaseToken: null, leaseExpiresAt: null })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.leaseToken, leaseToken),
        eq(workflowRun.status, "cancelled"),
      ),
    )
    .returning({ revisionId: workflowRun.revisionId });
  const [run] = closed;
  if (!run) return false;
  await closeCancelledSteps(tx, runId, run.revisionId, now);
  return true;
}

export async function closeStrandedCancels(now: Date): Promise<number> {
  const stranded = await db
    .select({ id: workflowRun.id, leaseToken: workflowRun.leaseToken })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.status, "cancelled"),
        isNotNull(workflowRun.leaseToken),
        lt(workflowRun.leaseExpiresAt, now),
      ),
    )
    .limit(50);
  let closed = 0;
  for (const row of stranded) {
    const token = row.leaseToken;
    if (!token) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- each close is its own write transaction; SQLite takes one writer at a time
    if (await db.transaction((tx) => closeStrandedCancel(tx, row.id, token, now))) closed += 1;
  }
  return closed;
}

export type RunCancelResult =
  | { state: "cancelled"; unresolved: number }
  | { state: "stopping"; inFlight: number }
  | { state: "finished"; status: RunStatus };

export async function cancelRun(runId: string): Promise<RunCancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const queued = await tx
      .update(workflowRun)
      .set({ status: "cancelled", finishedAt: now })
      .where(and(eq(workflowRun.id, runId), inArray(workflowRun.status, ["pending", "waiting"])))
      .returning({ revisionId: workflowRun.revisionId });
    const [idle] = queued;
    if (idle) {
      await closeCancelledSteps(tx, runId, idle.revisionId, now);
      return {
        state: "cancelled",
        unresolved: await countStepRuns(tx, runId, ["dispatching", "unknown"]),
      };
    }

    const active = await tx
      .update(workflowRun)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(workflowRun.id, runId),
          or(
            eq(workflowRun.status, "running"),
            and(eq(workflowRun.status, "cancelled"), isNotNull(workflowRun.leaseToken)),
          ),
        ),
      )
      .returning({
        revisionId: workflowRun.revisionId,
        leaseToken: workflowRun.leaseToken,
        leaseExpiresAt: workflowRun.leaseExpiresAt,
      });
    const [held] = active;
    if (held) {
      const abandoned =
        !held.leaseToken || !held.leaseExpiresAt || held.leaseExpiresAt.getTime() < now.getTime();
      if (!abandoned) {
        return {
          state: "stopping",
          inFlight: await countStepRuns(tx, runId, ["running", "dispatching"]),
        };
      }
      if (held.leaseToken) await closeStrandedCancel(tx, runId, held.leaseToken, now);
      else {
        await tx.update(workflowRun).set({ finishedAt: now }).where(eq(workflowRun.id, runId));
        await closeCancelledSteps(tx, runId, held.revisionId, now);
      }
      return {
        state: "cancelled",
        unresolved: await countStepRuns(tx, runId, ["dispatching", "unknown"]),
      };
    }

    const [row] = await tx
      .select({ status: workflowRun.status })
      .from(workflowRun)
      .where(eq(workflowRun.id, runId))
      .limit(1);
    return { state: "finished", status: row?.status ?? "cancelled" };
  });
}

export type ResumeRefusal =
  | "in-progress"
  | "completed"
  | "cancelled"
  | "unsupported"
  | "deleted"
  | "disabled"
  | "expired"
  | "upgraded"
  | "ambiguous-send"
  | "send-closed"
  | "outputs-missing"
  | "payload-missing"
  | "nothing-to-retry";

export type RunResumeResult =
  | { state: "resumed"; retrying: number; kept: number }
  | { state: "refused"; reason: ResumeRefusal; status: RunStatus };

const RETRYABLE_STEP_STATUSES = new Set<StepStatus>(["failed", "blocked", "pending", "running"]);

function carriesOn(output: StepRunOutput | null, handle: string): boolean {
  return (output?.emits ?? []).some((emit) => emit.handle === handle);
}

export async function resumeRun(
  runId: string,
  now: Date,
  windowMs: number,
): Promise<RunResumeResult | null> {
  const [row] = await db
    .select({
      status: workflowRun.status,
      kind: workflowRun.kind,
      workflowId: workflowRun.workflowId,
      finishedAt: workflowRun.finishedAt,
      leaseToken: workflowRun.leaseToken,
      upgraded: workflowRun.upgraded,
      enabled: workflow.enabled,
      deletedAt: workflow.deletedAt,
      graph: workflowRevision.graph,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return null;
  const refuse = (reason: ResumeRefusal): RunResumeResult => ({
    state: "refused",
    reason,
    status: row.status,
  });

  if (row.upgraded) return refuse("upgraded");
  if (!isResumableKind(row.kind)) return refuse("unsupported");
  if (row.status === "completed") return refuse("completed");
  if (row.status === "cancelled") return refuse("cancelled");
  if (!isResumableStatus(row.status) || !row.finishedAt || row.leaseToken)
    return refuse("in-progress");
  if (row.deletedAt) return refuse("deleted");
  if (row.kind === "user" && !row.enabled) return refuse("disabled");
  if (row.finishedAt.getTime() < now.getTime() - windowMs) return refuse("expired");

  const stepRuns = await db
    .select({
      nodeId: workflowStepRun.nodeId,
      itemKey: workflowStepRun.itemKey,
      status: workflowStepRun.status,
      output: workflowStepRun.output,
      resolution: workflowStepRun.resolution,
    })
    .from(workflowStepRun)
    .where(eq(workflowStepRun.runId, runId));

  const steps = new Map(row.graph.nodes.map((n) => [n.id, n.step]));
  const isDispatch = (nodeId: string) => {
    const key = steps.get(nodeId);
    return !!key && stepDef(key)?.effect === "dispatch";
  };
  const unsettled = stepRuns.filter(
    (s) => (s.status === "dispatching" || s.status === "unknown") && isDispatch(s.nodeId),
  );
  if (unsettled.some((s) => !s.resolution)) return refuse("ambiguous-send");
  if (unsettled.length > 0) return refuse("send-closed");

  const feeding = new Set(row.graph.edges.map((edge) => edge.source));
  const missingOutputs = stepRuns.some(
    (s) =>
      s.status === "completed" &&
      s.itemKey !== BARRIER_ITEM_KEY &&
      s.output === null &&
      feeding.has(s.nodeId),
  );
  if (missingOutputs) return refuse("outputs-missing");

  const scheduled = row.graph.nodes
    .filter((node) => node.step === "mail.sendScheduled")
    .map((node) => node.id);
  const sent = stepRuns.some((s) => s.status === "completed" && scheduled.includes(s.nodeId));
  if (scheduled.length > 0 && !sent) {
    const [payload] = await db
      .select({ id: workflowBlob.id })
      .from(workflowBlob)
      .where(and(eq(workflowBlob.workflowId, row.workflowId), eq(workflowBlob.kind, "draft")))
      .limit(1);
    if (!payload) return refuse("payload-missing");
  }

  const started = new Set(stepRuns.map((s) => s.nodeId));
  const unstarted = new Set(
    row.graph.edges
      .filter(
        (edge) =>
          !started.has(edge.target) &&
          stepRuns.some(
            (s) =>
              s.nodeId === edge.source &&
              s.status === "completed" &&
              s.resolution?.outcome === "verified" &&
              carriesOn(s.output, edge.sourceHandle),
          ),
      )
      .map((edge) => edge.target),
  );
  const retrying =
    stepRuns.filter((s) => RETRYABLE_STEP_STATUSES.has(s.status)).length + unstarted.size;
  if (retrying === 0 && stepRuns.length > 0) return refuse("nothing-to-retry");
  const kept = stepRuns.filter(
    (s) => s.status === "completed" && s.itemKey !== BARRIER_ITEM_KEY,
  ).length;

  const claimed = await db
    .update(workflowRun)
    .set({
      status: "pending",
      dueAt: now,
      finishedAt: null,
      blockedAt: null,
      error: null,
      attempts: 0,
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.status, row.status),
        eq(workflowRun.finishedAt, row.finishedAt),
        isNull(workflowRun.leaseToken),
      ),
    )
    .returning({ id: workflowRun.id });
  if (claimed.length === 0) return refuse("in-progress");
  return { state: "resumed", retrying, kept };
}

export async function runIsCancelled(runId: string): Promise<boolean> {
  const [row] = await db
    .select({
      status: workflowRun.status,
      deletedAt: workflow.deletedAt,
      kind: workflow.kind,
      enabled: workflow.enabled,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return true;
  return (
    row.status === "cancelled" || row.deletedAt !== null || (row.kind === "user" && !row.enabled)
  );
}

export async function sendReceipted(runId: string): Promise<boolean> {
  const rows = await db
    .select({ receipt: workflowStepRun.receipt })
    .from(workflowStepRun)
    .where(and(eq(workflowStepRun.runId, runId), eq(workflowStepRun.status, "completed")));
  return rows.some((row) => row.receipt?.operation === "send");
}

export async function stepUnresolvedFor(workflowId: string, nodeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowStepRun.id })
    .from(workflowStepRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        eq(workflowStepRun.nodeId, nodeId),
        inArray(workflowStepRun.status, ["running", "dispatching", "unknown"]),
      ),
    )
    .limit(1);
  return !!row;
}

export async function hasInFlightRun(workflowId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        or(inArray(workflowRun.status, ["pending", "running"]), isNotNull(workflowRun.leaseToken)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function latestRun(workflowId: string): Promise<RunRow | null> {
  const [row] = await db
    .select()
    .from(workflowRun)
    .where(eq(workflowRun.workflowId, workflowId))
    .orderBy(desc(workflowRun.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const [row] = await db.select().from(workflowRun).where(eq(workflowRun.id, runId)).limit(1);
  return row ?? null;
}

export async function listStepRuns(runId: string): Promise<StepRunRow[]> {
  return db.select().from(workflowStepRun).where(eq(workflowStepRun.runId, runId));
}

function ownsRun(runId: string, leaseToken: string) {
  return sql`exists (select 1 from ${workflowRun} where ${workflowRun.id} = ${runId} and ${workflowRun.leaseToken} = ${leaseToken})`;
}

export async function beginStepRun(opts: {
  runId: string;
  leaseToken: string;
  nodeId: string;
  itemKey: string;
  branch?: string | null;
  status: StepStatus;
  input?: unknown;
}): Promise<StepRunRow | null> {
  const values: Partial<StepRunRow> = {
    id: crypto.randomUUID(),
    runId: opts.runId,
    nodeId: opts.nodeId,
    itemKey: opts.itemKey,
    branch: opts.branch ?? null,
    status: opts.status,
    input: opts.input ?? null,
    attempts: 1,
    startedAt: new Date(),
  };
  const columns = getTableColumns(workflowStepRun);
  const fields = recordOf(keysOf(columns), (key) => {
    const value = values[key];
    return (
      value === null || value === undefined ? sql`null` : sql`${sql.param(value, columns[key])}`
    ).as(key);
  });
  const rows = await db
    .insert(workflowStepRun)
    .select(
      db
        .select(fields)
        .from(workflowRun)
        .where(and(eq(workflowRun.id, opts.runId), eq(workflowRun.leaseToken, opts.leaseToken))),
    )
    .onConflictDoNothing({
      target: [workflowStepRun.runId, workflowStepRun.nodeId, workflowStepRun.itemKey],
    })
    .returning();
  return rows[0] ?? null;
}

export async function reclaimStepRun(opts: {
  id: string;
  runId: string;
  leaseToken: string;
  status: StepStatus;
  keepState?: boolean;
}): Promise<boolean> {
  const rows = await db
    .update(workflowStepRun)
    .set({
      status: opts.status,
      attempts: sql`${workflowStepRun.attempts} + 1`,
      error: null,
      output: null,
      receipt: null,
      ...(opts.keepState ? {} : { state: null, wakeAt: null }),
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(
      and(
        eq(workflowStepRun.id, opts.id),
        inArray(workflowStepRun.status, ["failed", "blocked", "running", "pending", "waiting"]),
        ownsRun(opts.runId, opts.leaseToken),
      ),
    )
    .returning({ id: workflowStepRun.id });
  return rows.length > 0;
}

export async function finishStepRun(opts: {
  id: string;
  runId: string;
  leaseToken: string;
  status: StepStatus;
  output?: StepRunOutput | null;
  outputHandles?: string[] | null;
  receipt?: StepReceipt | null;
  error?: string | null;
  state?: WaitState | null;
  wakeAt?: Date | null;
}): Promise<boolean> {
  const rows = await db
    .update(workflowStepRun)
    .set({
      status: opts.status,
      output: opts.output ?? null,
      outputHandles: opts.outputHandles ?? null,
      receipt: opts.receipt ?? null,
      error: opts.error ?? null,
      state: opts.state ?? null,
      wakeAt: opts.wakeAt ?? null,
      finishedAt: opts.status === "waiting" ? null : new Date(),
    })
    .where(and(eq(workflowStepRun.id, opts.id), ownsRun(opts.runId, opts.leaseToken)))
    .returning({ id: workflowStepRun.id });
  return rows.length > 0;
}

export async function reconcileStepRun(opts: {
  id: string;
  status: "completed" | "failed";
  receipt?: StepReceipt | null;
  error?: string | null;
}): Promise<boolean> {
  const rows = await db
    .update(workflowStepRun)
    .set({
      status: opts.status,
      receipt: opts.receipt ?? null,
      error: opts.error ?? null,
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(workflowStepRun.id, opts.id),
        eq(workflowStepRun.status, "unknown"),
        isNull(workflowStepRun.resolvedAt),
      ),
    )
    .returning({ id: workflowStepRun.id });
  return rows.length > 0;
}

export async function openWait(opts: {
  runId: string;
  leaseToken: string;
  stepRunId: string;
  workflowId: string;
  workspaceId: string | null;
  kind: WaitKind;
  wakeAt: Date | null;
  deadlineAt: Date | null;
  approvers?: string[] | null;
  request?: string | null;
  childRunId?: string | null;
}): Promise<WaitRow | null> {
  const owned = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(and(eq(workflowRun.id, opts.runId), eq(workflowRun.leaseToken, opts.leaseToken)))
    .limit(1);
  if (owned.length === 0) return null;
  const rows = await db
    .insert(workflowWait)
    .values({
      id: crypto.randomUUID(),
      runId: opts.runId,
      stepRunId: opts.stepRunId,
      workflowId: opts.workflowId,
      workspaceId: opts.workspaceId,
      kind: opts.kind,
      status: "open",
      wakeAt: opts.wakeAt,
      deadlineAt: opts.deadlineAt,
      approvers: opts.approvers ?? null,
      request: opts.request ?? null,
      childRunId: opts.childRunId ?? null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [workflowWait.stepRunId],
      set: { wakeAt: opts.wakeAt, deadlineAt: opts.deadlineAt },
    })
    .returning();
  return rows[0] ?? null;
}

export async function waitForStepRun(stepRunId: string): Promise<WaitRow | null> {
  const [row] = await db
    .select()
    .from(workflowWait)
    .where(eq(workflowWait.stepRunId, stepRunId))
    .limit(1);
  return row ?? null;
}

export async function closeWait(
  id: string,
  status: "resolved" | "expired" | "cancelled",
): Promise<void> {
  await db
    .update(workflowWait)
    .set({ status })
    .where(and(eq(workflowWait.id, id), eq(workflowWait.status, "open")));
}

export async function listRunWaits(runId: string): Promise<WaitRow[]> {
  return db.select().from(workflowWait).where(eq(workflowWait.runId, runId));
}

export async function listOpenApprovals(opts: {
  workspaceId: string;
  userId?: string;
}): Promise<(WaitRow & { workflowName: string })[]> {
  const rows = await db
    .select({ wait: workflowWait, workflowName: workflow.name })
    .from(workflowWait)
    .innerJoin(workflow, eq(workflow.id, workflowWait.workflowId))
    .where(
      and(
        eq(workflowWait.workspaceId, opts.workspaceId),
        eq(workflowWait.kind, "approval"),
        eq(workflowWait.status, "open"),
      ),
    )
    .orderBy(asc(workflowWait.createdAt))
    .limit(200);
  return rows
    .filter((row) => !opts.userId || (row.wait.approvers ?? []).includes(opts.userId))
    .map((row) => ({ ...row.wait, workflowName: row.workflowName }));
}

export async function decideWait(opts: {
  waitId: string;
  userId: string;
  decision: "approved" | "denied";
  note: string | null;
  now: Date;
}): Promise<WaitRow | null> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(workflowWait)
      .set({
        status: "resolved",
        decision: opts.decision,
        decidedByUserId: opts.userId,
        decidedAt: opts.now,
        note: opts.note,
      })
      .where(
        and(
          eq(workflowWait.id, opts.waitId),
          eq(workflowWait.status, "open"),
          eq(workflowWait.kind, "approval"),
          sql`exists (select 1 from json_each(${workflowWait.approvers}) where value = ${opts.userId})`,
        ),
      )
      .returning();
    const [decided] = rows;
    if (!decided) return null;
    await tx
      .update(workflowRun)
      .set({ status: "pending", dueAt: opts.now })
      .where(and(eq(workflowRun.id, decided.runId), eq(workflowRun.status, "waiting")));
    return decided;
  });
}

export async function getWait(waitId: string): Promise<WaitRow | null> {
  const [row] = await db.select().from(workflowWait).where(eq(workflowWait.id, waitId)).limit(1);
  return row ?? null;
}

export async function rescheduleWait(opts: { runId: string; at: Date }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const waits = await tx
      .update(workflowWait)
      .set({ wakeAt: opts.at, deadlineAt: opts.at })
      .where(
        and(
          eq(workflowWait.runId, opts.runId),
          eq(workflowWait.status, "open"),
          eq(workflowWait.kind, "time"),
        ),
      )
      .returning({ stepRunId: workflowWait.stepRunId });
    if (waits.length === 0) return false;
    await tx
      .update(workflowStepRun)
      .set({
        wakeAt: opts.at,
        state: sql`json_set(coalesce(${workflowStepRun.state}, '{}'), '$.until', ${opts.at.toISOString()})`,
      })
      .where(
        inArray(
          workflowStepRun.id,
          waits.map((w) => w.stepRunId),
        ),
      );
    const updated = await tx
      .update(workflowRun)
      .set({ dueAt: opts.at })
      .where(and(eq(workflowRun.id, opts.runId), eq(workflowRun.status, "waiting")))
      .returning({ id: workflowRun.id });
    return updated.length > 0;
  });
}

export async function resolveDispatchStepRun(opts: {
  id: string;
  runId: string;
  byUserId: string;
  now: Date;
  resolution: StepResolution;
  completion?: {
    receipt: StepReceipt & { providerMessageId: string };
    output: StepRunOutput;
    send?: { mailboxId: string; fingerprint: string; sentBetween: { from: Date; to: Date } };
  };
}): Promise<boolean> {
  const { resolution, completion } = opts;
  const unclaimed = !completion
    ? undefined
    : completion.send
      ? notExists(
          receiptHolder({
            mailboxId: completion.send.mailboxId,
            providerMessageId: completion.receipt.providerMessageId,
            fingerprint: completion.send.fingerprint,
            exceptStepRunId: opts.id,
            sentBetween: completion.send.sentBetween,
          }),
        )
      : completion.receipt.operation && CLAIMED_OPERATIONS.has(completion.receipt.operation)
        ? notExists(
            dispatchHolder({
              operation: completion.receipt.operation,
              resourceId: completion.receipt.resourceId ?? "",
              providerIds: [completion.receipt.providerMessageId],
              exceptStepRunId: opts.id,
            }),
          )
        : undefined;
  const settledRun = sql`exists (select 1 from ${workflowRun} where ${workflowRun.id} = ${opts.runId} and ${workflowRun.finishedAt} is not null and ${workflowRun.leaseToken} is null and ${workflowRun.status} not in ('pending', 'running', 'waiting'))`;
  const rows = await db
    .update(workflowStepRun)
    .set({
      resolution,
      resolvedByUserId: opts.byUserId,
      resolvedAt: opts.now,
      ...(completion
        ? {
            status: "completed" as const,
            receipt: completion.receipt,
            output: completion.output,
            error: null,
          }
        : {}),
    })
    .where(
      and(
        eq(workflowStepRun.id, opts.id),
        eq(workflowStepRun.runId, opts.runId),
        eq(workflowStepRun.status, resolution.previousStatus),
        isNull(workflowStepRun.resolvedAt),
        settledRun,
        unclaimed,
      ),
    )
    .returning({ id: workflowStepRun.id });
  return rows.length > 0;
}

export async function clearRetainedOutputs(runId: string): Promise<void> {
  await clearRunOutputs(db, runId);
}

export async function markResolutionFinished(stepRunId: string): Promise<void> {
  await db
    .update(workflowStepRun)
    .set({ resolution: sql`json_set(${workflowStepRun.resolution}, '$.finished', json('true'))` })
    .where(and(eq(workflowStepRun.id, stepRunId), isNotNull(workflowStepRun.resolution)));
}

export async function deferResolutionFinish(stepRunId: string, until: Date): Promise<void> {
  await db
    .update(workflowStepRun)
    .set({
      resolution: sql`json_set(${workflowStepRun.resolution}, '$.finishDeferredAt', ${until.getTime()})`,
    })
    .where(and(eq(workflowStepRun.id, stepRunId), isNotNull(workflowStepRun.resolution)));
}

export async function listUnfinishedResolutions(
  limit: number,
  now: Date,
): Promise<
  { workflowId: string; runId: string; stepRunId: string; outcome: StepResolution["outcome"] }[]
> {
  const rows = await db
    .select({
      workflowId: workflowRun.workflowId,
      runId: workflowRun.id,
      stepRunId: workflowStepRun.id,
      resolution: workflowStepRun.resolution,
    })
    .from(workflowStepRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
    .where(
      and(
        isNotNull(workflowStepRun.resolvedAt),
        sql`json_extract(${workflowStepRun.resolution}, '$.finished') is null`,
        sql`coalesce(json_extract(${workflowStepRun.resolution}, '$.finishDeferredAt'), 0) <= ${now.getTime()}`,
      ),
    )
    .orderBy(asc(workflowStepRun.resolvedAt))
    .limit(limit);
  return rows.flatMap((row) =>
    row.resolution
      ? [
          {
            workflowId: row.workflowId,
            runId: row.runId,
            stepRunId: row.stepRunId,
            outcome: row.resolution.outcome,
          },
        ]
      : [],
  );
}

interface ReceiptLookup {
  mailboxId: string;
  providerMessageId: string;
  fingerprint: string;
  exceptStepRunId: string;
  sentBetween: { from: Date; to: Date };
}

export type ReceiptConflict = "taken" | "unidentified";

function receiptHolder(opts: ReceiptLookup) {
  const holder = alias(workflowStepRun, "receipt_holder");
  const id = sql`json_extract(${holder.receipt}, '$.providerMessageId')`;
  const settled = sql`coalesce(json_extract(${holder.receipt}, '$.settledAt'), json_extract(${holder.receipt}, '$.dispatchedAt'))`;
  const fingerprint = sql`json_extract(${holder.receipt}, '$.fingerprint')`;
  return db
    .select({ providerMessageId: sql<string | null>`${id}` })
    .from(holder)
    .innerJoin(workflowRun, eq(workflowRun.id, holder.runId))
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .where(
      and(
        sql`(${workflow.mailboxId} = ${opts.mailboxId} or json_extract(${holder.receipt}, '$.resourceId') = ${opts.mailboxId})`,
        eq(holder.status, "completed"),
        ne(holder.id, opts.exceptStepRunId),
        sql`json_extract(${holder.receipt}, '$.operation') = 'send'`,
        or(
          sql`${id} = ${opts.providerMessageId}`,
          sql`(${id} is null and ${settled} between ${opts.sentBetween.from.toISOString()} and ${opts.sentBetween.to.toISOString()} and (${fingerprint} is null or ${fingerprint} = ${opts.fingerprint}))`,
        ),
      ),
    )
    .limit(1);
}

export const CLAIMED_OPERATIONS = new Set(["create-event", "upload", "create-contact"]);

function dispatchHolder(opts: {
  operation: string;
  resourceId: string;
  providerIds: string[];
  exceptStepRunId: string;
}) {
  const holder = alias(workflowStepRun, "dispatch_holder");
  const id = sql`json_extract(${holder.receipt}, '$.providerMessageId')`;
  return db
    .select({ providerMessageId: sql<string>`${id}` })
    .from(holder)
    .where(
      and(
        eq(holder.status, "completed"),
        ne(holder.id, opts.exceptStepRunId),
        sql`json_extract(${holder.receipt}, '$.operation') = ${opts.operation}`,
        sql`json_extract(${holder.receipt}, '$.resourceId') = ${opts.resourceId}`,
        inArray(id, opts.providerIds),
      ),
    );
}

export async function claimedDispatchIds(opts: {
  operation: string;
  resourceId: string;
  providerIds: string[];
  exceptStepRunId: string;
}): Promise<Set<string>> {
  if (opts.providerIds.length === 0) return new Set();
  const rows = await dispatchHolder(opts);
  return new Set(rows.map((row) => row.providerMessageId));
}

export async function sendReceiptConflict(opts: ReceiptLookup): Promise<ReceiptConflict | null> {
  const [row] = await receiptHolder(opts);
  if (!row) return null;
  return row.providerMessageId ? "taken" : "unidentified";
}

export interface SendStepRunRow {
  workflowId: string;
  runId: string;
  runSettled: boolean;
  stepRun: StepRunRow;
}

export async function listSendStepRuns(opts: {
  workflowIds: string[];
  nodeIds: string[];
}): Promise<SendStepRunRow[]> {
  if (opts.workflowIds.length === 0 || opts.nodeIds.length === 0) return [];
  return db
    .select({
      workflowId: workflowRun.workflowId,
      runId: workflowRun.id,
      runSettled:
        sql<boolean>`(${workflowRun.finishedAt} is not null and ${workflowRun.leaseToken} is null and ${workflowRun.status} not in ('pending', 'running', 'waiting'))`.mapWith(
          Boolean,
        ),
      stepRun: workflowStepRun,
    })
    .from(workflowStepRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
    .where(
      and(
        inArray(workflowRun.workflowId, opts.workflowIds),
        inArray(workflowStepRun.nodeId, opts.nodeIds),
      ),
    )
    .orderBy(desc(workflowRun.createdAt));
}

export async function loadDispatchStepRun(opts: {
  runId: string;
  stepRunId: string;
}): Promise<SendStepRunRow | null> {
  const [row] = await db
    .select({
      workflowId: workflowRun.workflowId,
      runId: workflowRun.id,
      runSettled:
        sql<boolean>`(${workflowRun.finishedAt} is not null and ${workflowRun.leaseToken} is null and ${workflowRun.status} not in ('pending', 'running', 'waiting'))`.mapWith(
          Boolean,
        ),
      stepRun: workflowStepRun,
    })
    .from(workflowStepRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
    .where(and(eq(workflowStepRun.id, opts.stepRunId), eq(workflowRun.id, opts.runId)))
    .limit(1);
  return row ?? null;
}

export async function putDraftBlob(workflowId: string, payload: DraftPayload): Promise<string> {
  const id = crypto.randomUUID();
  const rows = await db
    .insert(workflowBlob)
    .values({ id, workflowId, kind: "draft", payload, size: 0, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [workflowBlob.workflowId],
      targetWhere: sql`${workflowBlob.kind} = 'draft'`,
      set: { payload },
    })
    .returning({ id: workflowBlob.id });
  return rows[0]?.id ?? id;
}

export async function getDraftBlob(workflowId: string): Promise<DraftPayload | null> {
  const [row] = await db
    .select({ payload: workflowBlob.payload })
    .from(workflowBlob)
    .where(and(eq(workflowBlob.workflowId, workflowId), eq(workflowBlob.kind, "draft")))
    .limit(1);
  return row?.payload ?? null;
}

export async function dropDraftBlob(workflowId: string): Promise<void> {
  await db
    .delete(workflowBlob)
    .where(and(eq(workflowBlob.workflowId, workflowId), eq(workflowBlob.kind, "draft")));
}

export async function putBytesBlob(opts: {
  workflowId: string;
  runId: string | null;
  name: string;
  mimeType: string;
  data: Buffer;
}): Promise<{ id: string; name: string; mimeType: string; size: number }> {
  const id = crypto.randomUUID();
  await db.insert(workflowBlob).values({
    id,
    workflowId: opts.workflowId,
    runId: opts.runId,
    kind: "bytes",
    name: opts.name,
    mimeType: opts.mimeType,
    size: opts.data.byteLength,
    data: opts.data.toString("base64"),
    createdAt: new Date(),
  });
  return { id, name: opts.name, mimeType: opts.mimeType, size: opts.data.byteLength };
}

export async function getBytesBlob(
  id: string,
  workflowId: string,
): Promise<{ name: string; mimeType: string; data: Buffer } | null> {
  const [row] = await db
    .select()
    .from(workflowBlob)
    .where(
      and(
        eq(workflowBlob.id, id),
        eq(workflowBlob.workflowId, workflowId),
        eq(workflowBlob.kind, "bytes"),
      ),
    )
    .limit(1);
  if (!row?.data) return null;
  return {
    name: row.name ?? "file",
    mimeType: row.mimeType ?? "application/octet-stream",
    data: Buffer.from(row.data, "base64"),
  };
}

export async function endpointsOf(workflowIds: string[]): Promise<EndpointRow[]> {
  if (workflowIds.length === 0) return [];
  return db
    .select()
    .from(workflowEndpoint)
    .where(inArray(workflowEndpoint.workflowId, workflowIds));
}

export async function getEndpoint(id: string): Promise<EndpointRow | null> {
  const [row] = await db
    .select()
    .from(workflowEndpoint)
    .where(eq(workflowEndpoint.id, id))
    .limit(1);
  return row ?? null;
}

export async function upsertEndpoint(opts: {
  workflowId: string;
  triggerId: string;
  kind: EndpointKind;
  secret: string;
  externalId?: string | null;
  resourceId?: string | null;
  expiresAt?: Date | null;
}): Promise<EndpointRow> {
  const now = new Date();
  const rows = await db
    .insert(workflowEndpoint)
    .values({
      id: crypto.randomUUID(),
      workflowId: opts.workflowId,
      triggerId: opts.triggerId,
      kind: opts.kind,
      secret: opts.secret,
      externalId: opts.externalId ?? null,
      resourceId: opts.resourceId ?? null,
      expiresAt: opts.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowEndpoint.triggerId, workflowEndpoint.kind],
      set: {
        ...(opts.externalId !== undefined ? { externalId: opts.externalId } : {}),
        ...(opts.resourceId !== undefined ? { resourceId: opts.resourceId } : {}),
        ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();
  const [row] = rows;
  if (!row) throw new Error("endpoint upsert returned nothing");
  return row;
}

export async function rotateEndpointSecret(id: string, secret: string): Promise<void> {
  await db
    .update(workflowEndpoint)
    .set({ secret, updatedAt: new Date() })
    .where(eq(workflowEndpoint.id, id));
}

export async function touchEndpoint(
  id: string,
  patch: { lastError?: string | null },
): Promise<void> {
  const now = new Date();
  await db
    .update(workflowEndpoint)
    .set({ lastSeenAt: now, lastError: patch.lastError ?? null, updatedAt: now })
    .where(eq(workflowEndpoint.id, id));
}

export async function deleteEndpoint(id: string): Promise<void> {
  await db.delete(workflowEndpoint).where(eq(workflowEndpoint.id, id));
}

export async function strandedEndpoints(limit: number): Promise<EndpointRow[]> {
  const rows = await db
    .select({ endpoint: workflowEndpoint })
    .from(workflowEndpoint)
    .innerJoin(workflowTrigger, eq(workflowTrigger.id, workflowEndpoint.triggerId))
    .innerJoin(workflow, eq(workflow.id, workflowEndpoint.workflowId))
    .where(
      and(
        ne(workflowEndpoint.kind, "webhook"),
        or(
          eq(workflowTrigger.armed, false),
          eq(workflow.enabled, false),
          isNotNull(workflow.deletedAt),
        ),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.endpoint);
}

export async function expiringEndpoints(before: Date, limit: number): Promise<EndpointRow[]> {
  return db
    .select()
    .from(workflowEndpoint)
    .where(
      and(
        ne(workflowEndpoint.kind, "webhook"),
        or(isNull(workflowEndpoint.expiresAt), lt(workflowEndpoint.expiresAt, before)),
      ),
    )
    .limit(limit);
}

export async function claimDiscovery(opts: {
  now: Date;
  cadenceSec: number;
  owner: string;
  leaseMs: number;
}): Promise<string | null> {
  const { now, cadenceSec, owner, leaseMs } = opts;
  const token = crypto.randomUUID();
  await db
    .insert(workflowTick)
    .values({ id: TICK_ID, nextCheckAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [workflowTick.id] });
  const rows = await db
    .update(workflowTick)
    .set({
      leaseOwner: owner,
      leaseToken: token,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      nextCheckAt: new Date(now.getTime() + cadenceSec * 1000),
      lastDiscoveryAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowTick.id, TICK_ID),
        or(isNull(workflowTick.nextCheckAt), lte(workflowTick.nextCheckAt, now)),
        or(isNull(workflowTick.leaseExpiresAt), lt(workflowTick.leaseExpiresAt, now)),
      ),
    )
    .returning({ id: workflowTick.id });
  return rows.length > 0 ? token : null;
}

export async function releaseDiscovery(token: string, error?: string | null): Promise<void> {
  await db
    .update(workflowTick)
    .set({
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: error ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(workflowTick.id, TICK_ID), eq(workflowTick.leaseToken, token)));
}

export async function recordTick(at: Date, error: string | null): Promise<void> {
  await db
    .insert(workflowTick)
    .values({
      id: TICK_ID,
      lastTickAt: at,
      lastSuccessAt: error ? null : at,
      lastError: error,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [workflowTick.id],
      set: {
        lastTickAt: sql`max(coalesce(${workflowTick.lastTickAt}, 0), ${at.getTime()})`,
        ...(error
          ? {}
          : {
              lastSuccessAt: sql`max(coalesce(${workflowTick.lastSuccessAt}, 0), ${at.getTime()})`,
            }),
        lastError: sql`case when coalesce(${workflowTick.lastTickAt}, 0) <= ${at.getTime()} then ${error} else ${workflowTick.lastError} end`,
        updatedAt: sql`max(${workflowTick.updatedAt}, ${at.getTime()})`,
      },
    });
}

export async function tickState() {
  const [row] = await db.select().from(workflowTick).where(eq(workflowTick.id, TICK_ID)).limit(1);
  return row ?? null;
}

export async function pendingRunCount(now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(workflowRun)
    .where(and(inArray(workflowRun.status, ["pending", "waiting"]), lte(workflowRun.dueAt, now)));
  return row?.n ?? 0;
}

export interface RunHistoryRow {
  id: string;
  workflowId: string;
  workflowName: string;
  kind: WorkflowKind;
  status: RunStatus;
  dueAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempts: number;
  error: string | null;
  summary: RunSummaryLine[] | null;
  principalUserId: string | null;
  graph: WorkflowGraph;
  upgraded: boolean;
}

export async function listRuns(opts: {
  workspaceId?: string;
  workflowId?: string;
  kind?: WorkflowKind;
  limit: number;
}): Promise<RunHistoryRow[]> {
  const where = [];
  if (opts.workspaceId) where.push(eq(workflowRun.workspaceId, opts.workspaceId));
  if (opts.workflowId) where.push(eq(workflowRun.workflowId, opts.workflowId));
  if (opts.kind) where.push(eq(workflowRun.kind, opts.kind));
  return db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflow.name,
      kind: workflowRun.kind,
      status: workflowRun.status,
      dueAt: workflowRun.dueAt,
      startedAt: workflowRun.startedAt,
      finishedAt: workflowRun.finishedAt,
      attempts: workflowRun.attempts,
      error: workflowRun.error,
      summary: workflowRun.summary,
      principalUserId: workflow.principalUserId,
      graph: workflowRevision.graph,
      upgraded: workflowRun.upgraded,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(workflowRun.createdAt))
    .limit(opts.limit);
}

export interface RunDetailRow {
  run: RunRow;
  workflowName: string;
  workflowPrincipalUserId: string | null;
  currentRevision: number;
  deletedAt: Date | null;
  revision: number;
  revisionCreatedAt: Date;
  revisionAuthorUserId: string | null;
  graph: WorkflowGraph;
  scheduledFor: Date;
  event: unknown;
  stepRuns: StepRunRow[];
  waits: WaitRow[];
}

export async function loadRunScope(runId: string): Promise<{
  kind: WorkflowKind;
  status: RunStatus;
  workspaceId: string | null;
  principalUserId: string | null;
  graph: WorkflowGraph;
  definition: DefinitionRow;
} | null> {
  const [row] = await db
    .select({
      kind: workflowRun.kind,
      status: workflowRun.status,
      definition: workflow,
      workspaceId: workflowRun.workspaceId,
      principalUserId: workflow.principalUserId,
      graph: workflowRevision.graph,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  return row ?? null;
}

export async function loadRunDetail(runId: string): Promise<RunDetailRow | null> {
  const [row] = await db
    .select({
      run: workflowRun,
      workflowName: workflow.name,
      workflowPrincipalUserId: workflow.principalUserId,
      currentRevision: workflow.revision,
      deletedAt: workflow.deletedAt,
      revision: workflowRevision.revision,
      revisionCreatedAt: workflowRevision.createdAt,
      revisionAuthorUserId: workflowRevision.createdByUserId,
      graph: workflowRevision.graph,
      scheduledFor: workflowEvent.scheduledFor,
      event: workflowEvent.payload,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .innerJoin(workflowEvent, eq(workflowEvent.id, workflowRun.eventId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return null;
  const [stepRuns, waits] = await Promise.all([
    db
      .select()
      .from(workflowStepRun)
      .where(eq(workflowStepRun.runId, runId))
      .orderBy(asc(workflowStepRun.startedAt)),
    listRunWaits(runId),
  ]);
  return { ...row, stepRuns, waits };
}

export async function runEvent(runId: string): Promise<unknown> {
  const [row] = await db
    .select({ payload: workflowEvent.payload, input: workflowRun.input })
    .from(workflowRun)
    .innerJoin(workflowEvent, eq(workflowEvent.id, workflowRun.eventId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  return row?.input.event ?? row?.payload ?? null;
}

export async function listMemberIdentities(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, { name: string; email: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(
      and(eq(workspaceMember.workspaceId, workspaceId), inArray(workspaceMember.userId, userIds)),
    );
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}

export interface BuiltinListing {
  definition: DefinitionRow;
  graph: WorkflowGraph;
  wakeAt: Date | null;
  armed: boolean;
  run: RunRow | null;
  sent: boolean;
  waitAt: Date | null;
}

export async function listBuiltins(opts: {
  kind: WorkflowKind;
  mailboxIds: string[];
}): Promise<BuiltinListing[]> {
  if (opts.mailboxIds.length === 0) return [];
  const rows = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(workflowRevision, currentRevisionJoin())
    .where(
      and(
        eq(workflow.kind, opts.kind),
        inArray(workflow.mailboxId, opts.mailboxIds),
        isNull(workflow.deletedAt),
      ),
    )
    .orderBy(asc(workflow.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.definition.id);

  const [triggers, runs, sends, waits] = await Promise.all([
    db
      .select({
        workflowId: workflowTrigger.workflowId,
        nextDueAt: workflowTrigger.nextDueAt,
        armed: workflowTrigger.armed,
      })
      .from(workflowTrigger)
      .where(
        and(inArray(workflowTrigger.workflowId, ids), eq(workflowTrigger.kind, "trigger.once")),
      ),
    db
      .select()
      .from(workflowRun)
      .where(inArray(workflowRun.workflowId, ids))
      .orderBy(desc(workflowRun.createdAt)),
    db
      .select({ workflowId: workflowRun.workflowId })
      .from(workflowStepRun)
      .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
      .where(
        and(
          inArray(workflowRun.workflowId, ids),
          eq(workflowStepRun.status, "completed"),
          sql`json_extract(${workflowStepRun.receipt}, '$.operation') = 'send'`,
        ),
      ),
    db
      .select({ workflowId: workflowWait.workflowId, wakeAt: workflowWait.wakeAt })
      .from(workflowWait)
      .where(
        and(
          inArray(workflowWait.workflowId, ids),
          eq(workflowWait.status, "open"),
          eq(workflowWait.kind, "time"),
        ),
      ),
  ]);
  const latest = new Map<string, RunRow>();
  for (const run of runs) if (!latest.has(run.workflowId)) latest.set(run.workflowId, run);
  const sent = new Set(sends.map((row) => row.workflowId));
  const wake = new Map(triggers.map((t) => [t.workflowId, t]));
  const waitAt = new Map(waits.map((w) => [w.workflowId, w.wakeAt]));
  return rows.map((row) => ({
    definition: row.definition,
    graph: row.revision.graph,
    wakeAt: wake.get(row.definition.id)?.nextDueAt ?? null,
    armed: wake.get(row.definition.id)?.armed ?? false,
    run: latest.get(row.definition.id) ?? null,
    sent: sent.has(row.definition.id),
    waitAt: waitAt.get(row.definition.id) ?? null,
  }));
}

export async function pruneWorkflowData(opts: {
  now: Date;
  stepDataDays: number;
  historyDays: number;
}): Promise<{ cleared: number; deletedRuns: number; deletedEvents: number }> {
  const dataCutoff = new Date(opts.now.getTime() - opts.stepDataDays * 86_400_000);
  const historyCutoff = new Date(opts.now.getTime() - opts.historyDays * 86_400_000);
  const eventCutoff = new Date(opts.now.getTime() - 30 * 86_400_000);
  const settled = ["completed", "partial", "failed", "blocked", "cancelled"] as const;

  const stale = db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(and(inArray(workflowRun.status, [...settled]), lt(workflowRun.finishedAt, dataCutoff)));
  const cleared = await db
    .update(workflowStepRun)
    .set({ output: null, input: null, state: null })
    .where(
      and(
        inArray(workflowStepRun.runId, stale),
        ne(workflowStepRun.itemKey, BARRIER_ITEM_KEY),
        or(isNotNull(workflowStepRun.output), isNotNull(workflowStepRun.input)),
      ),
    )
    .returning({ id: workflowStepRun.id });
  await db
    .delete(workflowBlob)
    .where(and(eq(workflowBlob.kind, "bytes"), inArray(workflowBlob.runId, stale)));
  await db
    .update(workflowRun)
    .set({ output: null, input: sql`json_set(${workflowRun.input}, '$.event', null)` })
    .where(
      and(
        inArray(workflowRun.id, stale),
        or(
          isNotNull(workflowRun.output),
          sql`json_extract(${workflowRun.input}, '$.event') is not null`,
        ),
      ),
    );
  await db
    .update(workflowEvent)
    .set({ payload: null })
    .where(
      and(
        isNotNull(workflowEvent.payload),
        inArray(
          workflowEvent.id,
          db
            .select({ id: workflowRun.eventId })
            .from(workflowRun)
            .where(
              and(
                inArray(workflowRun.status, [...settled]),
                lt(workflowRun.finishedAt, dataCutoff),
              ),
            ),
        ),
      ),
    );

  const unresolved = db
    .select({ runId: workflowStepRun.runId })
    .from(workflowStepRun)
    .where(
      and(
        inArray(workflowStepRun.status, ["dispatching", "unknown"]),
        isNull(workflowStepRun.resolvedAt),
      ),
    );
  const doomed = await db
    .select({ eventId: workflowRun.eventId })
    .from(workflowRun)
    .where(
      and(
        inArray(workflowRun.status, [...settled]),
        lt(workflowRun.finishedAt, historyCutoff),
        sql`${workflowRun.id} not in ${unresolved}`,
      ),
    )
    .limit(5000);
  const doomedEvents = doomed.map((row) => row.eventId);
  if (doomedEvents.length > 0) {
    await db.delete(workflowEvent).where(inArray(workflowEvent.id, doomedEvents));
  }

  const orphaned = await db
    .delete(workflowEvent)
    .where(
      and(
        lt(workflowEvent.createdAt, eventCutoff),
        notExists(
          db
            .select({ id: workflowRun.id })
            .from(workflowRun)
            .where(eq(workflowRun.eventId, workflowEvent.id)),
        ),
      ),
    )
    .returning({ id: workflowEvent.id });

  return {
    cleared: cleared.length,
    deletedRuns: doomedEvents.length,
    deletedEvents: orphaned.length,
  };
}

export async function runForEventKey(triggerId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .innerJoin(workflowEvent, eq(workflowEvent.id, workflowRun.eventId))
    .where(and(eq(workflowEvent.triggerId, triggerId), eq(workflowEvent.key, key)))
    .limit(1);
  return row?.id ?? null;
}

export interface CancelResult {
  cancelled: boolean;
  reason?: string;
}

export async function cancelBuiltinWorkflow(workflowId: string): Promise<CancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [executing] = await tx
      .select({ id: workflowRun.id })
      .from(workflowRun)
      .where(and(eq(workflowRun.workflowId, workflowId), eq(workflowRun.status, "running")))
      .limit(1);
    if (executing) {
      return { cancelled: false, reason: "That is still being handled — try again in a moment" };
    }
    const [unresolved] = await tx
      .select({ id: workflowStepRun.id })
      .from(workflowStepRun)
      .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
      .where(
        and(
          eq(workflowRun.workflowId, workflowId),
          inArray(workflowStepRun.status, ["running", "dispatching", "unknown"]),
          isNull(workflowStepRun.resolvedAt),
        ),
      )
      .limit(1);
    if (unresolved) {
      return {
        cancelled: false,
        reason:
          "A step of this item has an unresolved outcome — check the message before cancelling",
      };
    }
    const [dispatched] = await tx
      .select({ id: workflowStepRun.id })
      .from(workflowStepRun)
      .innerJoin(workflowRun, eq(workflowRun.id, workflowStepRun.runId))
      .where(
        and(
          eq(workflowRun.workflowId, workflowId),
          eq(workflowStepRun.status, "completed"),
          sql`json_extract(${workflowStepRun.receipt}, '$.operation') = 'send'`,
        ),
      )
      .limit(1);
    if (dispatched) {
      return {
        cancelled: false,
        reason: "That has already started — it can no longer be called back",
      };
    }

    const updated = await tx
      .update(workflow)
      .set({ deletedAt: now, enabled: false, updatedAt: now })
      .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)))
      .returning({ id: workflow.id });
    if (updated.length === 0) return { cancelled: false, reason: "That item is already gone" };

    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: now })
      .where(eq(workflowTrigger.workflowId, workflowId));
    await cancelOpenRuns(tx, workflowId, now);
    await clearWorkflowOutputs(tx, workflowId);
    await tx.delete(workflowBlob).where(eq(workflowBlob.workflowId, workflowId));
    return { cancelled: true };
  });
}

export async function rescheduleOnce(opts: {
  workflowId: string;
  at: Date;
}): Promise<CancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const fired = await tx
      .select({ id: workflowRun.id })
      .from(workflowRun)
      .where(and(eq(workflowRun.workflowId, opts.workflowId), ne(workflowRun.status, "cancelled")))
      .limit(1);
    if (fired.length > 0) return { cancelled: false, reason: "That has already started" };
    const updated = await tx
      .update(workflowTrigger)
      .set({ armed: true, nextDueAt: opts.at, updatedAt: now })
      .where(
        and(
          eq(workflowTrigger.workflowId, opts.workflowId),
          eq(workflowTrigger.kind, "trigger.once"),
        ),
      )
      .returning({ id: workflowTrigger.id });
    return updated.length > 0
      ? { cancelled: true }
      : { cancelled: false, reason: "That item is gone" };
  });
}

export async function noteStepState(opts: {
  id: string;
  runId: string;
  leaseToken: string;
  state: WaitState;
}): Promise<boolean> {
  const rows = await db
    .update(workflowStepRun)
    .set({ state: opts.state })
    .where(and(eq(workflowStepRun.id, opts.id), ownsRun(opts.runId, opts.leaseToken)))
    .returning({ id: workflowStepRun.id });
  return rows.length > 0;
}

const MAX_SAMPLE_BYTES = 64 * 1024;

export async function pinSample(
  workflowId: string,
  triggerNodeId: string,
  event: unknown,
): Promise<boolean> {
  if (JSON.stringify(event ?? null).length > MAX_SAMPLE_BYTES) return false;
  const [row] = await db
    .select({ samples: workflow.samples })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1);
  if (!row) return false;
  await db
    .update(workflow)
    .set({ samples: { ...row.samples, [triggerNodeId]: event } })
    .where(eq(workflow.id, workflowId));
  return true;
}

export async function unpinSample(workflowId: string, triggerNodeId: string): Promise<void> {
  const [row] = await db
    .select({ samples: workflow.samples })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1);
  if (!row?.samples) return;
  const { [triggerNodeId]: _removed, ...rest } = row.samples;
  await db.update(workflow).set({ samples: rest }).where(eq(workflow.id, workflowId));
}
