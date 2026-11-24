import "server-only";
import { listEventValues, listFileValues, findFolderPath, listMail, readMail } from "@/ops/values";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";
import { isMailFolder } from "@/types/mail";

import {
  authorizeCalendar,
  authorizeDrive,
  authorizeMailbox,
  resolvePrincipal,
} from "./authorization";
import { executeRun, type TraceStep } from "./executor";
import { checkGraph, type WorkspaceScope } from "./index";
import type { RunInput } from "./runtime";
import type { GraphNode, RunStatus, StepStatus, WorkflowGraph } from "./schema";
import { stepDef } from "./steps";
import { type DefinitionRow, listStepRuns, loadRunScope, runEvent } from "./store";

const SAMPLE_WINDOW = 15;

export interface TestRunItem {
  nodeId: string;
  itemKey: string;
  status: StepStatus;
  title: string | null;
  subtitle: string | null;
  outputs: string[];
  detail: string | null;
  error: string | null;
  input: unknown;
  result: unknown;
}

export interface TestRunResult {
  status: RunStatus;
  error: string | null;
  event: unknown;
  steps: { nodeId: string; status: StepStatus; count: number; detail: string | null }[];
  items: TestRunItem[];
}

export interface TestSample {
  id: string;
  title: string;
  subtitle: string;
  at: string | null;
}

function draftDefinition(scope: WorkspaceScope, id = "test-run"): DefinitionRow {
  const now = new Date();
  return {
    id,
    kind: "user",
    workspaceId: scope.workspaceId,
    principalUserId: scope.userId,
    mailboxId: null,
    originLinkId: null,
    name: "Test run",
    targetKey: null,
    enabled: true,
    disabledReason: null,
    samples: null,
    revision: 0,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function literal(node: GraphNode, name: string): string {
  const bound = node.params[name];
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
}

function mailFolderOf(node: GraphNode) {
  if (node.step === "trigger.mail.sent") return "sent" as const;
  if (node.step === "trigger.mail.starred") return "starred" as const;
  const folder = literal(node, "folder") || "inbox";
  return isMailFolder(folder) ? folder : "inbox";
}

async function principalFor(scope: WorkspaceScope) {
  const definition = draftDefinition(scope);
  const principal = await resolvePrincipal(definition);
  if (!principal.ok) throw new Error(principal.reason);
  return { definition, principal: principal.value };
}

export async function listTestSamples(
  scope: WorkspaceScope,
  graph: WorkflowGraph,
  triggerNodeId: string,
): Promise<TestSample[] | string> {
  const node = graph.nodes.find((n) => n.id === triggerNodeId);
  const source = node ? stepDef(node.step)?.trigger : null;
  if (!node || !source) return "Pick a trigger to test from";
  if (source.kind !== "feed") return [];
  const { definition, principal } = await principalFor(scope);
  try {
    if (source.resource === "mailbox") {
      const mailboxId = literal(node, "mailbox");
      if (!scope.mailboxes.some((m) => m.mailboxId === mailboxId))
        return "That mailbox is not in this workspace";
      const box = await authorizeMailbox({ definition, principal, mailboxId });
      if (!box.ok) return box.reason;
      const mails = await listMail(
        { mailboxId, email: box.value.email, adapter: box.value.adapter },
        mailFolderOf(node),
        SAMPLE_WINDOW,
      );
      return mails.map((mail) => ({
        id: mail.id,
        title: mail.subject || "(no subject)",
        subtitle: mail.fromName || mail.from,
        at: mail.date ?? null,
      }));
    }
    if (source.resource === "calendar") {
      const accountId = literal(node, "calendar");
      if (!scope.calendars.some((c) => c.accountId === accountId))
        return "That calendar is not in this workspace";
      const account = await authorizeCalendar({ principal, accountId });
      if (!account.ok) return account.reason;
      const now = Date.now();
      const events = await listEventValues(account.value, {
        from: new Date(now - 7 * 86_400_000),
        to: new Date(now + 14 * 86_400_000),
        calendarId: literal(node, "calendarId") || undefined,
        limit: SAMPLE_WINDOW,
      });
      return events.map((event) => ({
        id: `${event.calendarId}\u0000${event.id}`,
        title: event.title || "(no title)",
        subtitle: event.organizer,
        at: event.start,
      }));
    }
    const driveId = literal(node, "drive");
    if (!scope.drives.some((d) => d.driveId === driveId))
      return "That drive is not in this workspace";
    const drive = await authorizeDrive({ principal, driveId });
    if (!drive.ok) return drive.reason;
    const folderId = await findFolderPath(drive.value, literal(node, "folder"));
    const files = await listFileValues(drive.value, folderId, SAMPLE_WINDOW);
    return files
      .filter((file) => file.kind !== "folder")
      .map((file) => ({
        id: file.id,
        title: file.name,
        subtitle: file.mimeType,
        at: file.modifiedAt ?? null,
      }));
  } catch (err) {
    return err instanceof Error ? err.message : "Could not read samples";
  }
}

async function sampleEvent(
  scope: WorkspaceScope,
  node: GraphNode,
  sampleId: string,
): Promise<unknown> {
  const source = stepDef(node.step)?.trigger;
  const { definition, principal } = await principalFor(scope);
  if (source?.kind !== "feed") return null;
  if (source.resource === "mailbox") {
    const mailboxId = literal(node, "mailbox");
    const box = await authorizeMailbox({ definition, principal, mailboxId });
    if (!box.ok) throw new Error(box.reason);
    return readMail({ mailboxId, email: box.value.email, adapter: box.value.adapter }, sampleId);
  }
  if (source.resource === "calendar") {
    const [calendarId = "", eventId = ""] = sampleId.split("\u0000");
    const account = await authorizeCalendar({ principal, accountId: literal(node, "calendar") });
    if (!account.ok) throw new Error(account.reason);
    const now = Date.now();
    const events = await listEventValues(account.value, {
      from: new Date(now - 30 * 86_400_000),
      to: new Date(now + 90 * 86_400_000),
      calendarId,
      limit: 500,
    });
    const event = events.find((e) => e.id === eventId);
    if (!event) throw new Error("That event is no longer in the calendar");
    return node.step === "trigger.calendar.rsvp"
      ? {
          event,
          attendee: event.attendees[0] ?? { email: "", name: "", response: "accepted" },
          previous: "needsAction",
        }
      : event;
  }
  const drive = await authorizeDrive({ principal, driveId: literal(node, "drive") });
  if (!drive.ok) throw new Error(drive.reason);
  const files = await listFileValues(
    drive.value,
    await findFolderPath(drive.value, literal(node, "folder")),
    500,
  );
  const file = files.find((f) => f.id === sampleId);
  if (!file) throw new Error("That file is no longer in the folder");
  return file;
}

function syntheticEvent(
  scope: WorkspaceScope,
  node: GraphNode,
  inputs: Record<string, unknown>,
): unknown {
  const now = new Date().toISOString();
  switch (stepDef(node.step)?.trigger?.kind) {
    case "time":
    case "once":
      return { firedAt: now, scheduledFor: now, missed: 0 };
    case "manual":
      return { inputs, requestedBy: scope.person, requestedAt: now };
    case "call":
      return { inputs, parentRunId: "test" };
    case "inbound":
      return { body: inputs, headers: {}, receivedAt: now };
    default:
      return inputs;
  }
}

function title(value: unknown): { title: string | null; subtitle: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { title: null, subtitle: null };
  const own = Object.fromEntries(Object.entries(value));
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const found = own[key];
      if (typeof found === "string" && found) return found;
    }
    return null;
  };
  return {
    title: pick("subject", "title", "name"),
    subtitle: pick("fromName", "from", "organizer", "mimeType"),
  };
}

function toItem(step: TraceStep): TestRunItem {
  return {
    nodeId: step.nodeId,
    itemKey: step.itemKey,
    status: step.status,
    ...title(step.input ?? step.result),
    outputs: step.outputs.filter((out) => out.count > 0).map((out) => out.handle),
    detail: step.detail ?? null,
    error: step.error ?? null,
    input: step.input ?? null,
    result: step.result ?? null,
  };
}

function descendants(graph: WorkflowGraph, nodeId: string): Set<string> {
  const found = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const edge of graph.edges) {
      if (edge.source !== id || found.has(edge.target)) continue;
      found.add(edge.target);
      queue.push(edge.target);
    }
  }
  return found;
}

export async function testRunGraph(args: {
  scope: WorkspaceScope;
  graph: WorkflowGraph;
  triggerNodeId: string;
  sampleId?: string;
  event?: unknown;
  inputs?: Record<string, unknown>;
  replayRunId?: string;
  fromNodeId?: string;
}): Promise<TestRunResult | string> {
  const { scope, graph } = args;
  await enforceRateLimit(scope.userId, RATE_LIMITS.workflowTestRun);

  const invalid = await checkGraph(graph, scope);
  if (invalid) return invalid;
  const trigger = graph.nodes.find((n) => n.id === args.triggerNodeId);
  if (!trigger || !stepDef(trigger.step)?.trigger) return "Pick a trigger to test from";

  let event: unknown;
  let replayed: Awaited<ReturnType<typeof listStepRuns>> = [];
  try {
    if (args.replayRunId) {
      const run = await loadRunScope(args.replayRunId);
      if (run?.kind !== "user" || run.workspaceId !== scope.workspaceId) return "That run is gone";
      event = await runEvent(args.replayRunId);
      if (event === null || event === undefined) {
        return "That run's data is no longer kept, so it cannot be replayed";
      }
      if (args.fromNodeId) {
        const skip = descendants(graph, args.fromNodeId);
        replayed = (await listStepRuns(args.replayRunId)).filter(
          (row) => !skip.has(row.nodeId) && row.status === "completed" && row.output !== null,
        );
      }
    } else if (args.event !== undefined) {
      event = args.event;
    } else if (args.sampleId) {
      event = await sampleEvent(scope, trigger, args.sampleId);
    } else {
      const source = stepDef(trigger.step)?.trigger?.kind;
      if (source === "feed") return "Pick a sample to test with";
      if (source === "beforeSend" || source === "app")
        return "Pin a sample event to test this trigger";
      event = syntheticEvent(scope, trigger, args.inputs ?? {});
    }
  } catch (err) {
    return err instanceof Error ? err.message : "Could not load that sample";
  }

  const definition = draftDefinition(scope);
  const principal = await resolvePrincipal(definition);
  if (!principal.ok) return principal.reason;

  const items: TestRunItem[] = [];
  const input: RunInput = {
    triggerNodeId: trigger.id,
    source: "manual",
    event,
    requestedByUserId: scope.userId,
  };
  const outcome = await executeRun({
    runId: null,
    mode: "test",
    definition,
    graph,
    principal: principal.value,
    input,
    now: new Date(),
    stepRuns: replayed,
    trace: (step) => items.push(toItem(step)),
  });

  return {
    status: outcome.status,
    error: outcome.error ?? null,
    event,
    steps: outcome.summary.map((line) => ({
      nodeId: line.nodeId,
      status: line.status,
      count: line.count,
      detail: line.detail ?? null,
    })),
    items,
  };
}
