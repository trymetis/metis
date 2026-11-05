import "server-only";
import { decisionEnabled } from "@/config/runtime";
import { getInstanceConfig } from "@/config/runtime";
import type { WorkspaceRole } from "@/types/workspace";

import { requestManualRun } from "./discovery";
import { endpointUrl, ensureWebhookEndpoints } from "./inbound/endpoints";
import {
  type DispatchDecision,
  type DispatchView,
  findUnconfirmedDispatch,
  inspectDispatch,
  resolveDispatch,
  type SendResolution,
} from "./reconcile";
import { type RunResume, resumeCheckedRun } from "./resume";
import type { DecisionReceipt, RunInput, RunSummaryLine, StepResolution } from "./runtime";
import type {
  GraphEdge,
  RunStatus,
  StepStatus,
  WorkflowDefinitionInput,
  WorkflowGraph,
  WorkflowKind,
  WorkflowSourceState,
} from "./schema";
import { workflowDefinitionInputSchema } from "./schema";
import { type ResourceKind, stepDef } from "./steps";
import {
  cancelRun,
  decideWait,
  type DefinitionRow,
  type EndpointRow,
  endpointsOf,
  getCursors,
  getWait,
  listDefinitions,
  listMemberIdentities,
  listOpenApprovals,
  listRevisions,
  listRuns,
  listTriggers,
  listTriggersOf,
  loadDefinition,
  loadRunDetail,
  loadRunScope,
  type ResourceLinks,
  type RunCancelResult,
  reviseDefinition,
  saveDefinition,
  setDefinitionEnabled,
  softDeleteDefinition,
  type TriggerRow,
} from "./store";
import { firstError, graphResources, validateGraph } from "./validation";

export interface WorkspaceScope {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  person: { email: string; name: string };
  mailboxes: { mailboxId: string; linkId: string; email: string; aiEnabled: boolean }[];
  calendars: {
    accountId: string;
    linkId: string;
    email: string;
    name: string;
    slug: string;
    aiEnabled: boolean;
  }[];
  drives: {
    driveId: string;
    linkId: string;
    email: string;
    name: string;
    slug: string;
    aiEnabled: boolean;
  }[];
}

export interface WorkflowEndpointView {
  triggerNodeId: string;
  endpointId: string;
  url: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  kind: WorkflowKind;
  enabled: boolean;
  disabledReason: string | null;
  revision: number;
  graph: WorkflowGraph;
  mailboxIds: string[];
  calendarIds: string[];
  driveIds: string[];
  callable: boolean;
  sources: WorkflowSourceState[];
  endpoints: WorkflowEndpointView[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  dueAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  error: string | null;
  upgraded: boolean;
  steps: RunSummaryLine[];
}

export interface WorkflowRunPerson {
  name: string;
  email: string;
}

export interface WorkflowRunItem {
  id: string;
  itemKey: string;
  status: StepStatus;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  detail: string | null;
  error: string | null;
  operation: string | null;
  title: string | null;
  subtitle: string | null;
  inputs: { port: number; state: string; count: number }[] | null;
  decision: DecisionReceipt | null;
  outputs: string[] | null;
  input: unknown;
  output: unknown;
  wakeAt: string | null;
  resolvable: boolean;
  resolution: {
    outcome: StepResolution["outcome"];
    reason: StepResolution["reason"];
    note: string | null;
    resolvedAt: string;
    resolvedBy: WorkflowRunPerson | null;
  } | null;
}

export interface WorkflowRunWait {
  id: string;
  nodeId: string;
  kind: string;
  status: string;
  wakeAt: string | null;
  deadlineAt: string | null;
  request: string | null;
  approvers: WorkflowRunPerson[];
  decision: string | null;
  decidedBy: WorkflowRunPerson | null;
  canDecide: boolean;
}

export interface WorkflowRunNode {
  nodeId: string;
  step: string;
  reached: boolean;
  lines: { status: StepStatus; count: number; detail: string | null }[];
  items: WorkflowRunItem[];
  outputs: { handle: GraphEdge["sourceHandle"]; carried: boolean | null }[];
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  revision: number;
  revisionCreatedAt: string;
  currentRevision: number | null;
  principal: WorkflowRunPerson | null;
  trigger: {
    nodeId: string;
    step: string | null;
    source: RunInput["source"];
    scheduledFor: string;
    firedFor: string | null;
    missed: number;
    requestedBy: WorkflowRunPerson | null;
    event: unknown;
  };
  output: unknown;
  graph: WorkflowGraph;
  nodes: WorkflowRunNode[];
  waits: WorkflowRunWait[];
}

export interface PendingApproval {
  id: string;
  runId: string;
  workflowId: string;
  workflowName: string;
  request: string;
  createdAt: string;
  deadlineAt: string | null;
}

function triggerNodes(graph: WorkflowGraph) {
  return graph.nodes.filter((node) => stepDef(node.step)?.trigger);
}

function literal(params: WorkflowGraph["nodes"][number]["params"], name: string): string | null {
  const bound = params[name];
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : null;
}

async function sourceStates(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  triggers: TriggerRow[],
  endpoints: EndpointRow[],
): Promise<WorkflowSourceState[]> {
  const byNode = new Map(triggers.map((t) => [t.nodeId, t]));
  const feeds = triggerNodes(graph).filter((node) => stepDef(node.step)?.trigger?.kind === "feed");
  return Promise.all(
    feeds.map(async (node) => {
      const row = byNode.get(node.id);
      const cursors = row ? await getCursors(row.id) : new Map();
      return {
        triggerNodeId: node.id,
        resource:
          literal(node.params, "mailbox") ??
          literal(node.params, "calendar") ??
          literal(node.params, "drive"),
        paused: !definition.enabled || !row?.armed,
        baselined: [...cursors.values()].some((cursor) => cursor.baselined),
        lastScanAt: row?.lastRunAt?.toISOString() ?? null,
        error: row?.lastError ?? null,
        push: endpoints.some(
          (endpoint) => endpoint.triggerId === row?.id && endpoint.kind !== "webhook",
        ),
      };
    }),
  );
}

function resourceIds(graph: WorkflowGraph, kind: ResourceKind): string[] {
  return [
    ...new Set(
      graphResources(graph)
        .filter((r) => r.kind === kind)
        .map((r) => r.id),
    ),
  ];
}

async function toSummary(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  triggers: TriggerRow[],
  endpoints: EndpointRow[],
): Promise<WorkflowSummary> {
  const byTrigger = new Map(triggers.map((t) => [t.id, t.nodeId]));
  return {
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    enabled: definition.enabled,
    disabledReason: definition.disabledReason,
    revision: definition.revision,
    graph,
    mailboxIds: resourceIds(graph, "mailbox"),
    calendarIds: resourceIds(graph, "calendar"),
    driveIds: resourceIds(graph, "drive"),
    callable: graph.nodes.some((node) => node.step === "trigger.call"),
    sources: await sourceStates(definition, graph, triggers, endpoints),
    endpoints: endpoints
      .filter((endpoint) => endpoint.kind === "webhook")
      .map((endpoint) => ({
        triggerNodeId: byTrigger.get(endpoint.triggerId) ?? "",
        endpointId: endpoint.id,
        url: endpointUrl(endpoint.id),
        lastSeenAt: endpoint.lastSeenAt?.toISOString() ?? null,
        lastError: endpoint.lastError,
      })),
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
  };
}

async function summarize(
  definition: DefinitionRow,
  graph: WorkflowGraph,
): Promise<WorkflowSummary> {
  const [triggers, endpoints] = await Promise.all([
    listTriggers(definition.id),
    endpointsOf([definition.id]),
  ]);
  return toSummary(definition, graph, triggers, endpoints);
}

function links(scope: WorkspaceScope): ResourceLinks {
  return {
    mailbox: Object.fromEntries(scope.mailboxes.map((m) => [m.mailboxId, m.linkId])),
    calendar: Object.fromEntries(scope.calendars.map((c) => [c.accountId, c.linkId])),
    drive: Object.fromEntries(scope.drives.map((d) => [d.driveId, d.linkId])),
  };
}

export function parseWorkflowInput(raw: unknown): WorkflowDefinitionInput | string {
  const parsed = workflowDefinitionInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue
      ? `${issue.path.join(".") || "workflow"}: ${issue.message}`
      : "This workflow is incomplete.";
  }
  return parsed.data;
}

async function callableWorkflows(
  scope: WorkspaceScope,
): Promise<{ id: string; callable: boolean }[]> {
  const rows = await listDefinitions({ workspaceId: scope.workspaceId, kind: "user" });
  return rows.map((row) => ({
    id: row.definition.id,
    callable: row.graph.nodes.some((node) => node.step === "trigger.call"),
  }));
}

export async function checkGraph(
  graph: WorkflowGraph,
  scope: WorkspaceScope,
): Promise<string | null> {
  return firstError(
    validateGraph(graph, {
      kind: "user",
      allowedResources: {
        mailbox: scope.mailboxes.map((m) => m.mailboxId),
        calendar: scope.calendars.map((c) => c.accountId),
        drive: scope.drives.map((d) => d.driveId),
      },
      aiResources: {
        mailbox: scope.mailboxes.filter((m) => m.aiEnabled).map((m) => m.mailboxId),
        calendar: scope.calendars.filter((c) => c.aiEnabled).map((c) => c.accountId),
        drive: scope.drives.filter((d) => d.aiEnabled).map((d) => d.driveId),
      },
      allowDecisionSteps: decisionEnabled("workflowNode"),
      workflows: await callableWorkflows(scope),
    }),
  );
}

function accessible(scope: WorkspaceScope): Record<ResourceKind, Set<string>> {
  return {
    mailbox: new Set(scope.mailboxes.map((m) => m.mailboxId)),
    calendar: new Set(scope.calendars.map((c) => c.accountId)),
    drive: new Set(scope.drives.map((d) => d.driveId)),
  };
}

function canSee(
  scope: WorkspaceScope,
  principalUserId: string | null,
  graph: WorkflowGraph,
): boolean {
  if (principalUserId === scope.userId) return true;
  const allowed = accessible(scope);
  return graphResources(graph).every((resource) => allowed[resource.kind].has(resource.id));
}

export async function listWorkspaceWorkflows(scope: WorkspaceScope): Promise<WorkflowSummary[]> {
  const rows = await listDefinitions({ workspaceId: scope.workspaceId, kind: "user" });
  const visible = rows.filter((row) => canSee(scope, row.definition.principalUserId, row.graph));
  const ids = visible.map((row) => row.definition.id);
  const [triggers, endpoints] = await Promise.all([listTriggersOf(ids), endpointsOf(ids)]);
  return Promise.all(
    visible.map((row) =>
      toSummary(
        row.definition,
        row.graph,
        triggers.filter((t) => t.workflowId === row.definition.id),
        endpoints.filter((e) => e.workflowId === row.definition.id),
      ),
    ),
  );
}

async function ownWorkflow(scope: WorkspaceScope, workflowId: string) {
  const loaded = await loadDefinition(workflowId);
  if (!loaded) return null;
  const { definition } = loaded;
  if (
    definition.kind !== "user" ||
    definition.workspaceId !== scope.workspaceId ||
    definition.deletedAt ||
    !canSee(scope, definition.principalUserId, loaded.graph)
  ) {
    return null;
  }
  return loaded;
}

export async function getWorkspaceWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
): Promise<WorkflowSummary | null> {
  const loaded = await ownWorkflow(scope, workflowId);
  return loaded ? summarize(loaded.definition, loaded.graph) : null;
}

export async function createUserWorkflow(
  scope: WorkspaceScope,
  raw: unknown,
): Promise<WorkflowSummary | string> {
  const parsed = parseWorkflowInput(raw);
  if (typeof parsed === "string") return parsed;
  const invalid = await checkGraph(parsed.graph, scope);
  if (invalid) return invalid;
  const saved = await saveDefinition({
    kind: "user",
    workspaceId: scope.workspaceId,
    principalUserId: scope.userId,
    name: parsed.name,
    enabled: parsed.enabled,
    graph: parsed.graph,
    links: links(scope),
  });
  await ensureWebhookEndpoints(saved.definition.id);
  return summarize(saved.definition, saved.graph);
}

export async function updateUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
  raw: unknown,
): Promise<WorkflowSummary | string> {
  const existing = await ownWorkflow(scope, workflowId);
  if (!existing) return `No workflow "${workflowId}" in this workspace`;
  const parsed = parseWorkflowInput(raw);
  if (typeof parsed === "string") return parsed;
  const invalid = await checkGraph(parsed.graph, scope);
  if (invalid) return invalid;
  const revised = await reviseDefinition({
    workflowId,
    name: parsed.name,
    enabled: parsed.enabled,
    graph: parsed.graph,
    links: links(scope),
  });
  if (!revised) return `No workflow "${workflowId}" in this workspace`;
  await ensureWebhookEndpoints(workflowId);
  return summarize(revised.definition, revised.graph);
}

export async function toggleUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
  enabled: boolean,
): Promise<boolean> {
  const existing = await ownWorkflow(scope, workflowId);
  if (!existing) return false;
  if (enabled) {
    const invalid = await checkGraph(existing.graph, scope);
    if (invalid) return false;
  }
  return setDefinitionEnabled(workflowId, enabled);
}

export async function deleteUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
): Promise<boolean> {
  const existing = await ownWorkflow(scope, workflowId);
  if (!existing) return false;
  return softDeleteDefinition(workflowId);
}

export async function listWorkflowRevisions(
  scope: WorkspaceScope,
  workflowId: string,
  limit: number,
) {
  const existing = await ownWorkflow(scope, workflowId);
  if (!existing) return null;
  const rows = await listRevisions(workflowId, limit);
  return rows.map((row) => ({
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    graph: row.graph,
  }));
}

export async function requestWorkflowRun(
  scope: WorkspaceScope,
  workflowId: string,
  inputs?: Record<string, unknown>,
): Promise<{ runId: string } | string> {
  const loaded = await ownWorkflow(scope, workflowId);
  const missing = `No workflow "${workflowId}" in this workspace`;
  if (!loaded) return missing;
  if (!loaded.definition.enabled) return "Turn this workflow on before running it";
  const triggers = (await listTriggers(workflowId)).filter((t) => t.armed);
  const manual =
    triggers.find((t) => t.kind === "trigger.manual") ??
    triggers.find((t) => t.kind === "trigger.schedule");
  if (!manual) return "Add a Run by hand or a schedule trigger before running this workflow";
  const runId = await requestManualRun({
    definition: loaded.definition,
    revisionId: loaded.revisionId,
    trigger: manual,
    graph: loaded.graph,
    requestedByUserId: scope.userId,
    requestedBy: scope.person,
    inputs,
  });
  if (!runId) return "That run is already queued";
  return { runId };
}

const ADDRESS = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;

function maskAddresses(text: string | null | undefined, visible: Set<string>): string | null {
  if (!text) return null;
  return text.replace(ADDRESS, (address) =>
    visible.has(address.toLowerCase()) ? address : "[hidden address]",
  );
}

function resourcesOf(value: unknown, depth = 0): { kind: ResourceKind; id: string }[] {
  if (depth > 3 || !value || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.slice(0, 20).flatMap((entry) => resourcesOf(entry, depth + 1));
  const own = Object.fromEntries(Object.entries(value));
  const found: { kind: ResourceKind; id: string }[] = [];
  if (typeof own.mailboxId === "string" && own.mailboxId)
    found.push({ kind: "mailbox", id: own.mailboxId });
  if (typeof own.driveId === "string" && own.driveId)
    found.push({ kind: "drive", id: own.driveId });
  if (typeof own.accountId === "string" && own.accountId && typeof own.calendarId === "string") {
    found.push({ kind: "calendar", id: own.accountId });
  }
  return found;
}

function visibleAddresses(scope: WorkspaceScope): Set<string> {
  return new Set(
    [
      ...scope.mailboxes.map((m) => m.email),
      ...scope.calendars.map((c) => c.email),
      ...scope.drives.map((d) => d.email),
    ].map((email) => email.toLowerCase()),
  );
}

export async function getWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunDetail | null> {
  const row = await loadRunDetail(runId);
  if (!row) return null;
  const { run, graph } = row;
  if (
    run.kind !== "user" ||
    run.workspaceId !== scope.workspaceId ||
    !canSee(scope, row.workflowPrincipalUserId, graph)
  ) {
    return null;
  }

  const allowed = accessible(scope);
  const visible = visibleAddresses(scope);
  const mask = (text: string | null | undefined) => maskAddresses(text, visible);
  const hidden = (value: unknown) => resourcesOf(value).some((r) => !allowed[r.kind].has(r.id));

  const requester = run.input.requestedByUserId ?? null;
  const approverIds = row.waits
    .flatMap((wait) => [...(wait.approvers ?? []), wait.decidedByUserId ?? ""])
    .filter(Boolean);
  const people = await listMemberIdentities(
    scope.workspaceId,
    [
      row.workflowPrincipalUserId,
      requester,
      ...approverIds,
      ...row.stepRuns.map((stepRun) => stepRun.resolvedByUserId),
    ].filter((id): id is string => !!id),
  );

  const person = (id: string | null | undefined) => (id ? (people.get(id) ?? null) : null);

  const validation = validateGraph(graph, { kind: "user" });
  const order = validation.ok
    ? [
        ...validation.order,
        ...graph.nodes.map((n) => n.id).filter((id) => !validation.order.includes(id)),
      ]
    : graph.nodes.map((n) => n.id);
  const byNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const lines = run.summary ?? [];
  const showData = getInstanceConfig().workflowRunner.stepDataDays > 0;

  const nodes: WorkflowRunNode[] = order.flatMap((nodeId) => {
    const node = byNode.get(nodeId);
    if (!node) return [];
    const dispatchStep = stepDef(node.step)?.effect === "dispatch";
    const items = row.stepRuns
      .filter((stepRun) => stepRun.nodeId === nodeId)
      .map((stepRun): WorkflowRunItem => {
        const conceal = hidden(stepRun.input) || hidden(stepRun.output?.emits?.[0]?.value);
        const stored = stepRun.output;
        return {
          id: stepRun.id,
          itemKey: stepRun.itemKey,
          status: stepRun.status,
          attempts: stepRun.attempts,
          startedAt: stepRun.startedAt?.toISOString() ?? null,
          finishedAt: stepRun.finishedAt?.toISOString() ?? null,
          detail: conceal || typeof stored?.detail !== "string" ? null : mask(stored.detail),
          error: conceal ? null : mask(stepRun.error),
          operation: stepRun.receipt?.operation ?? null,
          title: conceal
            ? null
            : (stepRun.receipt?.item?.title ?? stepRun.receipt?.message?.subject ?? null),
          subtitle: conceal
            ? null
            : (stepRun.receipt?.item?.subtitle ?? stepRun.receipt?.message?.from ?? null),
          decision: conceal ? null : (stepRun.receipt?.decision ?? null),
          outputs: conceal ? null : stepRun.outputHandles,
          inputs: stored?.inputs ?? null,
          input: conceal || !showData ? null : stepRun.input,
          output:
            conceal || !showData
              ? null
              : (stored?.emits?.map((emit) => ({ handle: emit.handle, value: emit.result })) ??
                null),
          wakeAt: stepRun.wakeAt?.toISOString() ?? null,
          resolvable:
            !conceal &&
            dispatchStep &&
            !stepRun.resolvedAt &&
            (stepRun.status === "unknown" || stepRun.status === "dispatching"),
          resolution:
            stepRun.resolution && stepRun.resolvedAt
              ? {
                  outcome: stepRun.resolution.outcome,
                  reason: stepRun.resolution.reason,
                  note: conceal ? null : mask(stepRun.resolution.note),
                  resolvedAt: stepRun.resolvedAt.toISOString(),
                  resolvedBy: person(stepRun.resolvedByUserId),
                }
              : null,
        };
      });
    const nodeLines = lines
      .filter((line) => line.nodeId === nodeId)
      .map((line) => ({ status: line.status, count: line.count, detail: mask(line.detail) }));
    const taken = new Set(
      row.stepRuns
        .filter((stepRun) => stepRun.nodeId === nodeId && stepRun.status === "completed")
        .flatMap((stepRun) => stepRun.outputHandles ?? []),
    );
    return [
      {
        nodeId,
        step: node.step,
        reached: nodeId === run.input.triggerNodeId || nodeLines.length > 0 || items.length > 0,
        lines: nodeLines,
        items,
        outputs: [
          ...new Set(
            graph.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.sourceHandle),
          ),
        ].map((handle) => ({
          handle,
          carried: items.some((item) => item.outputs === null) ? null : taken.has(handle),
        })),
      },
    ];
  });

  const stepOf = new Map(row.stepRuns.map((stepRun) => [stepRun.id, stepRun.nodeId]));
  const event = row.event ?? run.input.event;

  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: row.workflowName,
    status: run.status,
    dueAt: run.dueAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    attempts: run.attempts,
    error: mask(run.error),
    upgraded: run.upgraded,
    steps: lines.map((line) => ({ ...line, detail: mask(line.detail) ?? undefined })),
    revision: row.revision,
    revisionCreatedAt: row.revisionCreatedAt.toISOString(),
    currentRevision: row.deletedAt ? null : row.currentRevision,
    principal: person(row.workflowPrincipalUserId),
    trigger: {
      nodeId: run.input.triggerNodeId,
      step: byNode.get(run.input.triggerNodeId)?.step ?? null,
      source: run.input.source,
      scheduledFor: row.scheduledFor.toISOString(),
      firedFor: run.input.firedFor ?? null,
      missed: run.input.missed ?? 0,
      requestedBy: person(requester),
      event: hidden(event) || !showData ? null : event,
    },
    output: showData ? run.output : null,
    graph,
    nodes,
    waits: row.waits.map((wait) => ({
      id: wait.id,
      nodeId: stepOf.get(wait.stepRunId) ?? "",
      kind: wait.kind,
      status: wait.status,
      wakeAt: wait.wakeAt?.toISOString() ?? null,
      deadlineAt: wait.deadlineAt?.toISOString() ?? null,
      request: wait.request ? mask(wait.request) : null,
      approvers: (wait.approvers ?? []).flatMap((id) => {
        const found = person(id);
        return found ? [found] : [];
      }),
      decision: wait.decision,
      decidedBy: person(wait.decidedByUserId),
      canDecide:
        wait.kind === "approval" &&
        wait.status === "open" &&
        (wait.approvers ?? []).includes(scope.userId),
    })),
  };
}

export type WorkflowRunCancellation = RunCancelResult & { message: string };

const needsReview = (n: number) =>
  n > 0 ? ` ${n} step(s) from an earlier attempt have an unconfirmed outcome and need review.` : "";

function describeCancel(result: RunCancelResult): string {
  if (result.state === "cancelled") {
    return `Cancelled — no further steps of this run will start.${needsReview(result.unresolved)}`;
  }
  if (result.state === "stopping") {
    return result.inFlight > 0
      ? `Cancellation recorded — the run stops before its next step. ${result.inFlight} step(s) already in progress cannot be called back and may still complete; anything already sent or changed at the provider is not undone.`
      : "Cancellation recorded — the run stops before its next step. Anything it already did at the provider is not undone.";
  }
  if (result.status === "cancelled") return "This run was already cancelled.";
  return `This run already finished (${result.status}) — there is nothing left to cancel.`;
}

async function ownRun(scope: WorkspaceScope, runId: string) {
  const row = await loadRunScope(runId);
  if (
    row?.kind !== "user" ||
    row.workspaceId !== scope.workspaceId ||
    !canSee(scope, row.principalUserId, row.graph)
  ) {
    return null;
  }
  return row;
}

export async function cancelWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunCancellation | null> {
  if (!(await ownRun(scope, runId))) return null;
  const result = await cancelRun(runId);
  return { ...result, message: describeCancel(result) };
}

export async function inspectWorkspaceDispatch(
  scope: WorkspaceScope,
  runId: string,
  stepRunId: string,
): Promise<DispatchView | null> {
  if (!(await ownRun(scope, runId))) return null;
  const target = await findUnconfirmedDispatch(runId, stepRunId);
  if (!target) return { state: "none" };
  if (target.stepRun.resolvedAt) return { state: "none" };
  const status = target.stepRun.status;
  if (status !== "unknown" && status !== "dispatching") return { state: "none" };
  return inspectDispatch(target);
}

export async function resolveWorkspaceDispatch(opts: {
  scope: WorkspaceScope;
  runId: string;
  stepRunId: string;
  decision: DispatchDecision;
}): Promise<SendResolution | null> {
  if (!(await ownRun(opts.scope, opts.runId))) return null;
  const target = await findUnconfirmedDispatch(opts.runId, opts.stepRunId);
  if (!target) return null;
  return resolveDispatch({ target, userId: opts.scope.userId, decision: opts.decision });
}

export type WorkflowRunResume = RunResume;

export async function resumeWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunResume | null> {
  if (!(await ownRun(scope, runId))) return null;
  return resumeCheckedRun(runId);
}

export async function listWorkspaceRuns(opts: {
  scope: WorkspaceScope;
  workflowId?: string;
  limit: number;
}): Promise<WorkflowRunSummary[]> {
  const rows = await listRuns({
    workspaceId: opts.scope.workspaceId,
    workflowId: opts.workflowId,
    kind: "user",
    limit: opts.limit,
  });
  const visible = visibleAddresses(opts.scope);
  return rows
    .filter((row) => canSee(opts.scope, row.principalUserId, row.graph))
    .map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflowName,
      status: row.status,
      dueAt: row.dueAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      attempts: row.attempts,
      error: maskAddresses(row.error, visible),
      upgraded: row.upgraded,
      steps: (row.summary ?? []).map((line) => ({
        ...line,
        detail: maskAddresses(line.detail, visible) ?? undefined,
      })),
    }));
}

export async function listPendingApprovals(scope: WorkspaceScope): Promise<PendingApproval[]> {
  const rows = await listOpenApprovals({ workspaceId: scope.workspaceId, userId: scope.userId });
  const visible = visibleAddresses(scope);
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    workflowId: row.workflowId,
    workflowName: row.workflowName,
    request: maskAddresses(row.request, visible) ?? "",
    createdAt: row.createdAt.toISOString(),
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
  }));
}

export async function decideApproval(
  scope: WorkspaceScope,
  opts: { waitId: string; decision: "approved" | "denied"; note: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const wait = await getWait(opts.waitId);
  if (!wait || wait.workspaceId !== scope.workspaceId || wait.kind !== "approval") {
    return { ok: false, message: "That request is gone" };
  }
  if (!(wait.approvers ?? []).includes(scope.userId)) {
    return { ok: false, message: "You are not one of the people asked to approve this" };
  }
  if (wait.status !== "open")
    return { ok: false, message: "Someone already answered this request" };
  const decided = await decideWait({
    waitId: opts.waitId,
    userId: scope.userId,
    decision: opts.decision,
    note: opts.note,
    now: new Date(),
  });
  return decided ? { ok: true } : { ok: false, message: "Someone already answered this request" };
}

export { canSee as canSeeWorkflow };
