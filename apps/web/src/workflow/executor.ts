import "server-only";
import { recordAiUsage } from "@/ai/usage";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { readMail } from "@/ops/values";

import type { BackgroundPrincipal } from "./authorization";
import {
  authorizeCalendar,
  authorizeAddressBook,
  authorizeConnected,
  authorizeDrive,
  authorizeMailbox,
  authorizeMailboxAccess,
  authorizeResourceAi,
  resolvePrincipal,
} from "./authorization";
import { errorCode } from "./diagnostics";
import { type EvalValues, evaluateBinding, evaluateExpression, type Scope } from "./expr";
import { graphTimezone } from "./graph";
import { runnerFor } from "./run";
import {
  BlockedError,
  type BlobRef,
  type ExecutionMode,
  type Params,
  record,
  type StepCtx,
  type StepResult,
} from "./run/types";
import type { Emit, Item, RunInput, RunSummaryLine, StepReceipt, StepRunOutput } from "./runtime";
import {
  BARRIER_ITEM_KEY,
  type GraphNode,
  mergeInputIndex,
  type RunStatus,
  type StepStatus,
  type WorkflowGraph,
} from "./schema";
import { emitsFor, type ResourceKind, type StepDef, stepDef } from "./steps";
import {
  beginStepRun,
  closeWait,
  type DefinitionRow,
  finishStepRun,
  getBytesBlob,
  getDraftBlob,
  getRun,
  loadDefinition,
  listMemberIdentities,
  noteStepState,
  listTriggers,
  openEvent,
  openWait,
  putBytesBlob,
  reclaimStepRun,
  reconcileStepRun,
  runForEventKey,
  type StepRunRow,
  waitForStepRun,
} from "./store";
import { firstError, hiddenParam, validateGraph } from "./validation";
import { identityOf, T } from "./values";

export interface TraceStep {
  nodeId: string;
  itemKey: string;
  input: unknown;
  status: StepStatus;
  outputs: { handle: string; count: number }[];
  result?: unknown;
  detail?: string;
  error?: string;
}

export interface ExecuteOptions {
  runId: string | null;
  leaseToken?: string;
  definition: DefinitionRow;
  graph: WorkflowGraph;
  principal: BackgroundPrincipal;
  input: RunInput;
  now: Date;
  mode?: ExecutionMode;
  signal?: AbortSignal;
  deadline?: number;
  reserveMs?: number;
  stepRuns?: StepRunRow[];
  isCancelled?: () => Promise<boolean>;
  heartbeat?: () => Promise<boolean>;
  trace?: (step: TraceStep) => void;
}

export interface ExecutionOutcome {
  status: RunStatus;
  summary: RunSummaryLine[];
  error?: string;
  retryable: boolean;
  leaseLost: boolean;
  interrupted: boolean;
  blocked: boolean;
  wakeAt: Date | null;
  output?: unknown;
  values: unknown[];
}

class LeaseLostError extends Error {}
class CancelledError extends Error {}
class AbortedError extends Error {}
class ReserveExhaustedError extends Error {
  constructor() {
    super("Not enough budget left to start this step safely");
  }
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new AbortedError("The tick ran out of budget during a provider call"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new AbortedError("The tick ran out of budget during a provider call"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

type BranchState = "settled" | "waiting" | "pending" | "blocked" | "failed";

const BRANCH_RANK: Record<BranchState, number> = {
  settled: 0,
  waiting: 1,
  pending: 2,
  blocked: 3,
  failed: 4,
};

function worse(a: BranchState, b: BranchState): BranchState {
  return BRANCH_RANK[a] >= BRANCH_RANK[b] ? a : b;
}

const BARRIER_STATUS: Record<BranchState, StepStatus> = {
  settled: "completed",
  waiting: "pending",
  pending: "pending",
  blocked: "blocked",
  failed: "failed",
};

interface BarrierInput {
  port: number;
  state: BranchState;
  count: number;
}

function describeHold(inputs: BarrierInput[], state: BranchState): string {
  const ports = inputs
    .filter((input) => input.state === state)
    .map((input) => input.port + 1)
    .join(", ");
  if (state === "pending" || state === "waiting") return `waiting for input ${ports} to finish`;
  if (state === "blocked") return `held: input ${ports} is blocked`;
  return `held: input ${ports} did not succeed`;
}

function resolveStatus(counts: Record<StepStatus, number>, interrupted: boolean): RunStatus {
  if (interrupted) return "pending";
  if (counts.waiting > 0) return "waiting";
  if (counts.failed > 0 || counts.unknown > 0) return counts.completed > 0 ? "partial" : "failed";
  if (counts.blocked > 0) return counts.completed > 0 ? "partial" : "blocked";
  return "completed";
}

function outKey(nodeId: string, handle: string): string {
  return `${nodeId}:${handle}`;
}

function itemTitle(value: unknown): { title: string; subtitle: string } | undefined {
  const own = record(value);
  const title = [own.subject, own.title, own.name].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (!title) return undefined;
  const subtitle = [own.fromName, own.from, own.organizer, own.mimeType].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return { title, subtitle: subtitle ?? "" };
}

function receiptFor(receipt: StepReceipt | undefined, value: unknown): StepReceipt | null {
  const item = itemTitle(value);
  const own = record(value);
  const message =
    typeof own.subject === "string" &&
    (typeof own.from === "string" || typeof own.fromName === "string")
      ? {
          subject: own.subject || "(no subject)",
          from:
            typeof own.fromName === "string" && own.fromName
              ? own.fromName
              : typeof own.from === "string"
                ? own.from
                : "",
        }
      : undefined;
  if (!receipt && !item) return null;
  return { ...(item ? { item } : {}), ...(message ? { message } : {}), ...receipt };
}

const RESOURCE_KEYS: Record<string, ResourceKind> = {
  mailboxId: "mailbox",
  driveId: "drive",
  addressBookId: "addressbook",
};

function resourcesTouched(def: StepDef, params: Params): { kind: ResourceKind; id: string }[] {
  const found = new Map<string, { kind: ResourceKind; id: string }>();
  for (const [name, spec] of Object.entries(def.params)) {
    const kind =
      spec.kind === "mailbox"
        ? "mailbox"
        : spec.kind === "calendar"
          ? "calendar"
          : spec.kind === "drive"
            ? "drive"
            : spec.kind === "addressbook"
              ? "addressbook"
              : null;
    const value = params[name];
    if (kind && typeof value === "string" && value)
      found.set(`${kind}:${value}`, { kind, id: value });
    const own = record(value);
    for (const [key, kindOf] of Object.entries(RESOURCE_KEYS)) {
      const id = own[key];
      if (typeof id === "string" && id) found.set(`${kindOf}:${id}`, { kind: kindOf, id });
    }
    if (typeof own.accountId === "string" && own.accountId && typeof own.calendarId === "string") {
      found.set(`calendar:${own.accountId}`, { kind: "calendar", id: own.accountId });
    }
  }
  return [...found.values()];
}

async function hydrate(
  value: unknown,
  load: (mailboxId: string, id: string) => Promise<unknown>,
  depth = 0,
): Promise<unknown> {
  if (depth > 2 || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const own = record(value);
  const marker = record(own.hydrate);
  if (
    marker.kind === "mail" &&
    typeof marker.mailboxId === "string" &&
    typeof marker.id === "string"
  ) {
    return load(marker.mailboxId, marker.id);
  }
  const entries = await Promise.all(
    Object.entries(own).map(
      async ([key, nested]) => [key, await hydrate(nested, load, depth + 1)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export async function executeRun(opts: ExecuteOptions): Promise<ExecutionOutcome> {
  const mode = opts.mode ?? "live";
  const summary: RunSummaryLine[] = [];
  const counts: Record<StepStatus, number> = {
    pending: 0,
    running: 0,
    waiting: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    dispatching: 0,
    unknown: 0,
  };
  const failure = (error: string): ExecutionOutcome => ({
    status: "failed",
    summary,
    error,
    retryable: false,
    leaseLost: false,
    interrupted: false,
    blocked: false,
    wakeAt: null,
    values: [],
  });

  const validation = validateGraph(opts.graph, { kind: opts.definition.kind });
  if (!validation.ok) return failure(firstError(validation) ?? "This workflow is no longer valid");

  const byId = new Map(opts.graph.nodes.map((n) => [n.id, n]));
  const trigger = byId.get(opts.input.triggerNodeId);
  if (!trigger) return failure("That trigger is no longer part of this workflow");

  const incoming = new Map<string, { source: string; handle: string; port: number }[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of opts.graph.edges) {
    incoming.set(edge.target, [
      ...(incoming.get(edge.target) ?? []),
      { source: edge.source, handle: edge.sourceHandle, port: mergeInputIndex(edge.targetHandle) },
    ]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const reachable = new Set<string>([trigger.id]);
  const queue = [trigger.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    for (const next of outgoing.get(id) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const persist = mode === "live" && !!opts.runId && !!opts.leaseToken;
  const fence = { runId: opts.runId ?? "", leaseToken: opts.leaseToken ?? "" };
  const prior = new Map(
    (opts.stepRuns ?? []).map((row) => [`${row.nodeId}\u0000${row.itemKey}`, row]),
  );
  const memoryBlobs = new Map<string, { name: string; mimeType: string; data: Buffer }>();
  const timezone = graphTimezone(opts.graph, trigger);

  const mailboxCache = new Map<string, Promise<Awaited<ReturnType<StepCtx["mailbox"]>>>>();
  const mailbox = (mailboxId: string) => {
    let cached = mailboxCache.get(mailboxId);
    if (!cached) {
      cached = authorizeMailbox({
        definition: opts.definition,
        principal: opts.principal,
        mailboxId,
      }).then((resolved) => {
        if (!resolved.ok) throw new BlockedError(resolved.reason);
        return {
          mailboxId: resolved.value.mailboxId,
          email: resolved.value.email,
          adapter: resolved.value.adapter,
          linkId: resolved.value.linkId,
        };
      });
      mailboxCache.set(mailboxId, cached);
      cached.catch(() => mailboxCache.delete(mailboxId));
    }
    return cached;
  };

  let event: unknown = opts.input.event;
  try {
    if (opts.input.source !== "inbound") {
      event = await hydrate(opts.input.event, async (mailboxId, id) =>
        readMail(await mailbox(mailboxId), id),
      );
    }
  } catch (err) {
    if (err instanceof BlockedError) {
      summary.push({
        nodeId: trigger.id,
        step: trigger.step,
        status: "blocked",
        count: 1,
        detail: err.message,
      });
      return { ...failure(err.message), status: "blocked", blocked: true, retryable: false };
    }
    return { ...failure(sanitizeError(err)), retryable: true };
  }

  const runValues = {
    id: opts.runId ?? "test",
    workflowId: opts.definition.id,
    workflow: opts.definition.name,
    startedAt: opts.now.toISOString(),
  };

  const outbox = new Map<string, Item[]>();
  const loopInputs = new Map<string, Item[]>();
  outbox.set(outKey(trigger.id, "out"), [{ key: "trigger", value: event, trail: {} }]);
  const branches = new Map<string, BranchState>([[trigger.id, "settled"]]);
  const emittedValues: unknown[] = [];
  let runOutput: unknown;
  let retryable = false;
  let interrupted = false;
  let halted = false;
  let runError: string | undefined;
  let wakeAt: Date | null = null;

  const tally = (node: GraphNode, status: StepStatus, count: number, detail?: string) => {
    counts[status] += count > 0 ? count : 1;
    summary.push({ nodeId: node.id, step: node.step, status, count, detail });
  };
  const leaseLost = (): ExecutionOutcome => ({
    status: "running",
    summary,
    error: "This run's lease moved to another worker",
    retryable: false,
    leaseLost: true,
    interrupted: true,
    blocked: counts.blocked > 0,
    wakeAt,
    values: emittedValues,
  });

  const scopeOf = (nodeId: string): Scope =>
    validation.types.get(nodeId)?.scope ?? { trigger: T.json, item: null, steps: {} };
  const valuesFor = (nodeId: string, item: Item): EvalValues => ({
    trigger: event,
    item: item.value,
    steps: Object.fromEntries(Object.keys(scopeOf(nodeId).steps).map((id) => [id, item.trail[id]])),
    now: opts.now,
    run: runValues,
    error: item.error ?? "",
    timezone,
  });

  const evaluateParams = (node: GraphNode, def: StepDef, item: Item): Params => {
    const params: Params = {};
    const scope = scopeOf(node.id);
    const values = valuesFor(node.id, item);
    for (const [name, spec] of Object.entries(def.params)) {
      if (hiddenParam(node, def, name)) continue;
      const bound = node.params[name] ?? spec.default;
      if (!bound) continue;
      if (bound.kind === "literal") {
        params[name] = bound.value;
        continue;
      }
      if (bound.kind === "template" && !bound.text) {
        params[name] = "";
        continue;
      }
      if (bound.kind === "expr" && !bound.cel.trim()) continue;
      params[name] = evaluateBinding(bound, spec.type, values, scope);
    }
    return params;
  };

  const settleBarrier = async (nodeId: string, inputs: BarrierInput[]): Promise<BranchState> => {
    const holding = inputs.reduce<BranchState>(
      (state, input) => worse(state, input.state),
      "settled",
    );
    if (!persist) return holding;
    const existing = prior.get(`${nodeId}\u0000${BARRIER_ITEM_KEY}`);
    if (existing?.status === "completed") return "settled";
    const id = existing
      ? (await reclaimStepRun({ ...fence, id: existing.id, status: "running" }))
        ? existing.id
        : null
      : (await beginStepRun({ ...fence, nodeId, itemKey: BARRIER_ITEM_KEY, status: "running" }))
          ?.id;
    if (!id) throw new LeaseLostError("lease lost");
    const saved = await finishStepRun({
      ...fence,
      id,
      status: BARRIER_STATUS[holding],
      output: { inputs },
      error: holding === "settled" ? null : describeHold(inputs, holding),
    });
    if (!saved) throw new LeaseLostError("lease lost");
    return holding;
  };

  /* oxlint-disable eslint/no-await-in-loop -- nodes run in topological order and each reads what earlier nodes emitted; each item's side effect is fenced and recorded before the next */
  for (const nodeId of validation.order) {
    if (!reachable.has(nodeId) || nodeId === trigger.id) continue;
    const node = byId.get(nodeId);
    const def = node ? stepDef(node.step) : null;
    if (!node || !def) continue;
    if (halted) break;
    if (opts.signal?.aborted) {
      retryable = true;
      interrupted = true;
      runError = "The tick ran out of time before this step";
      break;
    }

    const merge = def.merge;
    const sources = (incoming.get(nodeId) ?? []).toSorted((a, b) => a.port - b.port);
    const live = sources.filter((src) => reachable.has(src.source));
    const delivered = live.map((src) => outbox.get(outKey(src.source, src.handle)) ?? []);
    let items = delivered.flat();
    const upstream = live.reduce<BranchState>(
      (state, src) => worse(state, branches.get(src.source) ?? "settled"),
      "settled",
    );

    if (merge === "join" || merge === "aggregate" || merge === "collect") {
      const inputs = live.map((src) => ({
        port: Math.max(0, src.port),
        state: branches.get(src.source) ?? "settled",
        count: (outbox.get(outKey(src.source, src.handle)) ?? []).length,
      }));
      let barrier: BranchState;
      try {
        barrier = await settleBarrier(nodeId, inputs);
      } catch (err) {
        if (err instanceof LeaseLostError) return leaseLost();
        throw err;
      }
      if (barrier !== "settled") {
        summary.push({
          nodeId,
          step: node.step,
          status: BARRIER_STATUS[barrier],
          count: 0,
          detail: describeHold(inputs, barrier),
        });
        branches.set(nodeId, barrier);
        continue;
      }
    }

    if (merge === "collect") {
      const loopId = validation.loops.get(nodeId);
      const origins = loopId ? (loopInputs.get(loopId) ?? []) : [];
      const stray = items.filter((item) => item.loops?.at(-1)?.node !== loopId);
      if (!loopId || stray.length > 0) {
        const message = "End loop got an item that did not come through its Loop";
        tally(node, "failed", 1, message);
        runError ??= message;
        branches.set(nodeId, "failed");
        continue;
      }
      const out: Item[] = origins.map((origin) => {
        const results = items
          .filter((item) => item.loops?.at(-1)?.origin === origin.key)
          .map((item) => item.value);
        const value = { results, count: results.length };
        return {
          key: origin.key,
          value,
          trail: { ...origin.trail, [nodeId]: value },
          ...(origin.loops ? { loops: origin.loops } : {}),
        };
      });
      outbox.set(outKey(nodeId, "out"), out);
      if (out.length === 0) tally(node, "skipped", 0, "nothing reached its Loop");
      else tally(node, "completed", out.length, `${out.length} item(s) collected`);
      for (const item of out) {
        opts.trace?.({
          nodeId,
          itemKey: item.key,
          input: null,
          status: "completed",
          outputs: [{ handle: "out", count: 1 }],
          result: item.value,
        });
      }
      branches.set(nodeId, upstream);
      continue;
    }

    if (items.length === 0) {
      tally(
        node,
        "skipped",
        0,
        upstream === "settled" ? "nothing reached this step" : "an earlier step did not finish",
      );
      branches.set(nodeId, upstream);
      continue;
    }

    if (merge === "append" || merge === "join") {
      const seen = new Set<string>();
      const merged: Item[] = [];
      for (const item of items) {
        const identity = identityOf(item.value) ?? item.key;
        const key = `${nodeId}:${identity}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...item, key, trail: { ...item.trail, [nodeId]: item.value } });
      }
      outbox.set(outKey(nodeId, "out"), merged);
      const folded = items.length - merged.length;
      tally(
        node,
        "completed",
        merged.length,
        `${merged.length} item(s) from ${delivered.filter((d) => d.length > 0).length} of ${live.length} input(s)${folded > 0 ? `, ${folded} duplicate(s) folded` : ""}`,
      );
      for (const item of merged) {
        opts.trace?.({
          nodeId,
          itemKey: item.key,
          input: item.value,
          status: "completed",
          outputs: [{ handle: "out", count: 1 }],
          result: item.value,
        });
      }
      branches.set(nodeId, upstream);
      continue;
    }

    if (merge === "aggregate") {
      const groups = new Map<string, unknown[]>();
      try {
        for (const item of items) {
          const bound = node.params.key;
          const key =
            bound && bound.kind === "expr" && bound.cel.trim()
              ? String(evaluateBinding(bound, T.text, valuesFor(nodeId, item), scopeOf(nodeId)))
              : "all";
          groups.set(key, [...(groups.get(key) ?? []), item.value]);
        }
      } catch (err) {
        const message = sanitizeError(err);
        tally(node, "failed", 1, message);
        runError ??= message;
        branches.set(nodeId, "failed");
        continue;
      }
      items = [...groups.entries()].map(([key, values]) => ({
        key: `${nodeId}:${key}`,
        value: { key, count: values.length, items: values },
        trail: {},
      }));
      const out = items.map((item) => ({ ...item, trail: { [nodeId]: item.value } }));
      outbox.set(outKey(nodeId, "out"), out);
      tally(node, "completed", out.length, `${out.length} group(s)`);
      for (const item of out) {
        opts.trace?.({
          nodeId,
          itemKey: item.key,
          input: null,
          status: "completed",
          outputs: [{ handle: "out", count: 1 }],
          result: item.value,
        });
      }
      branches.set(nodeId, upstream);
      continue;
    }

    if (node.step === "flow.loop") loopInputs.set(nodeId, items);

    if (node.skip) {
      outbox.set(
        outKey(nodeId, "out"),
        items.map((item) => ({ ...item, trail: { ...item.trail, [nodeId]: item.value } })),
      );
      tally(node, "skipped", items.length, "this step is skipped in the editor");
      for (const item of items) {
        opts.trace?.({
          nodeId,
          itemKey: item.key,
          input: item.value,
          status: "skipped",
          outputs: [{ handle: "out", count: 1 }],
          detail: "skipped in the editor",
        });
      }
      branches.set(nodeId, upstream);
      continue;
    }

    if (opts.isCancelled && (await opts.isCancelled())) {
      return {
        status: "cancelled",
        summary,
        retryable: false,
        leaseLost: false,
        interrupted: false,
        blocked: counts.blocked > 0,
        wakeAt: null,
        values: emittedValues,
      };
    }

    const runner = runnerFor(node.step);
    const effectful = def.effect === "write" || def.effect === "dispatch";
    const dispatch = def.effect === "dispatch";
    let ok = 0;
    let failedHere = 0;
    let waitingHere = 0;
    const details = new Set<string>();
    let own: BranchState = "settled";

    const emitItems = (item: Item, emits: Emit[]) => {
      for (const emitted of emits) {
        const key = outKey(nodeId, emitted.handle);
        const next: Item = {
          key: emitted.key,
          value: emitted.value,
          trail: { ...item.trail, [nodeId]: emitted.result },
          ...(emitted.handle === "error" && item.error ? { error: item.error } : {}),
          ...(node.step === "flow.loop"
            ? { loops: [...(item.loops ?? []), { node: nodeId, origin: item.key }] }
            : item.loops
              ? { loops: item.loops }
              : {}),
        };
        outbox.set(key, [...(outbox.get(key) ?? []), next]);
        emittedValues.push(emitted.value);
        if (node.step === "flow.return") runOutput = emitted.result;
      }
    };

    try {
      for (const item of items) {
        if (opts.signal?.aborted) {
          retryable = true;
          interrupted = true;
          own = worse(own, "pending");
          runError = "The tick ran out of time before this step";
          break;
        }
        if (opts.heartbeat && !(await opts.heartbeat())) throw new LeaseLostError("lease lost");

        const itemKey = item.key;
        const existing = prior.get(`${nodeId}\u0000${itemKey}`);
        let stepRunId: string | null = null;
        let state: Record<string, unknown> | null = null;

        if (existing?.status === "completed") {
          const stored = existing.output;
          const emits = stored?.emits ?? [];
          emitItems(item, emits);
          ok += 1;
          if (stored?.detail) details.add(stored.detail);
          continue;
        }
        if (persist && (existing?.status === "dispatching" || existing?.status === "unknown")) {
          const marked = await finishStepRun({
            ...fence,
            id: existing.id,
            status: "unknown",
            error:
              existing.error ??
              "A previous attempt dispatched this step without a conclusive result",
            receipt: existing.receipt,
          });
          if (!marked) throw new LeaseLostError("lease lost");
          tally(node, "unknown", 1, "needs review");
          failedHere += 1;
          own = worse(own, "failed");
          continue;
        }
        if (persist) {
          if (existing) {
            const waiting = existing.status === "waiting";
            const reclaimed = await reclaimStepRun({
              ...fence,
              id: existing.id,
              status: dispatch ? "dispatching" : "running",
              keepState: waiting,
            });
            if (!reclaimed) throw new LeaseLostError("lease lost");
            stepRunId = existing.id;
            state = waiting ? existing.state : null;
          } else {
            const started = await beginStepRun({
              ...fence,
              nodeId,
              itemKey,
              branch: Object.keys(item.trail).at(-1) ?? null,
              status: dispatch ? "dispatching" : "running",
              input: item.value,
            });
            if (!started) throw new LeaseLostError("lease lost");
            stepRunId = started.id;
          }
        }

        const wait = stepRunId ? await waitForStepRun(stepRunId) : null;
        if (wait?.decidedByUserId && opts.principal.workspaceId) {
          const people = await listMemberIdentities(opts.principal.workspaceId, [
            wait.decidedByUserId,
          ]);
          const person = people.get(wait.decidedByUserId);
          state = {
            ...state,
            decidedByEmail: person?.email ?? "",
            decidedByName: person?.name ?? "",
          };
        }

        let params: Params = {};
        let result: StepResult;
        let pending: Promise<StepResult> | null = null;
        try {
          if (!runner) throw new Error("This step cannot run");
          params = evaluateParams(node, def, item);
          const ctx: StepCtx = {
            mode,
            now: opts.now,
            runId: opts.runId,
            stepRunId,
            signal: opts.signal,
            deadline: opts.deadline,
            principal: opts.principal,
            definition: opts.definition,
            graph: opts.graph,
            node,
            trigger: event,
            state,
            wait,
            timezone,
            mailbox,
            async calendar(accountId) {
              const resolved = await authorizeCalendar({ principal: opts.principal, accountId });
              if (!resolved.ok) throw new BlockedError(resolved.reason);
              return resolved.value;
            },
            async drive(driveId) {
              const resolved = await authorizeDrive({ principal: opts.principal, driveId });
              if (!resolved.ok) throw new BlockedError(resolved.reason);
              return resolved.value;
            },
            async addressBook(addressBookId) {
              const resolved = await authorizeAddressBook({
                principal: opts.principal,
                addressBookId,
              });
              if (!resolved.ok) throw new BlockedError(resolved.reason);
              return resolved.value;
            },
            async requireAi(resources) {
              for (const resource of resources) {
                const allowed = await authorizeResourceAi({
                  principal: opts.principal,
                  ...resource,
                });
                if (!allowed.ok) throw new BlockedError(allowed.reason);
              }
            },
            async putBlob(name, mimeType, data): Promise<BlobRef> {
              if (!persist) {
                const id = `test-${crypto.randomUUID()}`;
                memoryBlobs.set(id, { name, mimeType, data });
                return { id, name, mimeType, size: data.byteLength };
              }
              return putBytesBlob({
                workflowId: opts.definition.id,
                runId: opts.runId,
                name,
                mimeType,
                data,
              });
            },
            async getBlob(id) {
              const memory = memoryBlobs.get(id);
              if (memory) return memory;
              const stored = await getBytesBlob(id, opts.definition.id);
              if (!stored) throw new Error("That file's contents are no longer kept");
              return stored;
            },
            draftPayload: () => getDraftBlob(opts.definition.id),
            evaluate: (binding, expected) =>
              evaluateBinding(binding, expected, valuesFor(nodeId, item), scopeOf(nodeId)),
            evaluateCel: (cel) => evaluateExpression(cel, valuesFor(nodeId, item), scopeOf(nodeId)),
            startChild: (child) => startChild(opts, stepRunId, child),
            childRuns: (ids) => childRuns(ids),
            usage(entry) {
              if (!opts.principal.userId) return;
              recordAiUsage({
                userId: opts.principal.userId,
                workspaceId: opts.principal.workspaceId,
                feature: entry.feature,
                provider: entry.provider || undefined,
                model: entry.model,
                usage: entry.usage,
                runId: opts.runId ?? undefined,
              });
            },
          };

          if (effectful && mode !== "live" && mode !== "policy") {
            result = runner.preview
              ? await runner.preview(ctx, params, item)
              : {
                  kind: "emit",
                  emits: [{ result: item.value }],
                  detail: `would ${def.label.toLowerCase()}`,
                };
          } else {
            if (effectful && mode === "live") {
              if (
                opts.deadline !== undefined &&
                opts.deadline - Date.now() < (opts.reserveMs ?? 0)
              ) {
                throw new ReserveExhaustedError();
              }
              if (opts.isCancelled && (await opts.isCancelled())) throw new CancelledError();
              const principal = await resolvePrincipal(opts.definition);
              if (!principal.ok) throw new BlockedError(principal.reason);
              for (const resource of resourcesTouched(def, params)) {
                const access =
                  resource.kind === "mailbox"
                    ? await authorizeMailboxAccess({
                        definition: opts.definition,
                        principal: principal.value,
                        mailboxId: resource.id,
                      })
                    : await authorizeConnected({
                        principal: principal.value,
                        kind: resource.kind,
                        id: resource.id,
                      });
                if (!access.ok) throw new BlockedError(access.reason);
              }
            }
            if (dispatch && stepRunId && runner.expect) {
              const noted = await noteStepState({
                ...fence,
                id: stepRunId,
                state: { ...state, expected: runner.expect(params) },
              });
              if (!noted) throw new LeaseLostError("lease lost");
            }
            pending = runner.run(ctx, params, item);
            result = await withAbort(pending, opts.signal);
          }
        } catch (err) {
          if (err instanceof LeaseLostError) throw err;
          if (err instanceof CancelledError) {
            if (stepRunId) {
              const marked = await finishStepRun({
                ...fence,
                id: stepRunId,
                status: "skipped",
                error: "Cancelled before this step started",
              });
              if (!marked) return leaseLost();
            }
            tally(node, "skipped", 1, "cancelled before it started");
            return {
              status: "cancelled",
              summary,
              retryable: false,
              leaseLost: false,
              interrupted: false,
              blocked: counts.blocked > 0,
              wakeAt: null,
              values: emittedValues,
            };
          }
          if (err instanceof ReserveExhaustedError) {
            if (stepRunId)
              await finishStepRun({
                ...fence,
                id: stepRunId,
                status: "failed",
                error: err.message,
              });
            retryable = true;
            interrupted = true;
            runError ??= err.message;
            own = worse(own, "pending");
            break;
          }
          if (err instanceof AbortedError) {
            const status: StepStatus = effectful ? "unknown" : "failed";
            if (stepRunId)
              await finishStepRun({ ...fence, id: stepRunId, status, error: err.message });
            if (effectful && stepRunId && pending) reconcileLater(pending, stepRunId);
            tally(node, status, 1, err.message);
            failedHere += 1;
            runError ??= err.message;
            own = worse(own, "failed");
            if (effectful) halted = true;
            else {
              retryable = true;
              interrupted = true;
            }
            break;
          }
          const blocked = err instanceof BlockedError;
          const message = blocked ? err.message : sanitizeError(err);
          const handled =
            !blocked && !dispatch && (node.onError === "continue" || node.onError === "branch");
          if (handled) {
            const emits: Emit[] = [
              {
                handle: node.onError === "branch" ? "error" : "out",
                key: item.key,
                value: item.value,
                result: item.value,
              },
            ];
            if (stepRunId) {
              const saved = await finishStepRun({
                ...fence,
                id: stepRunId,
                status: "completed",
                output: { emits, detail: `error handled: ${message}` },
                outputHandles: [emits[0]?.handle ?? "out"],
                error: message,
                receipt: receiptFor(undefined, item.value),
              });
              if (!saved) return leaseLost();
            }
            emitItems({ ...item, error: message }, emits);
            ok += 1;
            details.add(`error handled: ${message}`);
            opts.trace?.({
              nodeId,
              itemKey,
              input: item.value,
              status: "completed",
              outputs: [{ handle: emits[0]?.handle ?? "out", count: 1 }],
              error: message,
            });
            continue;
          }
          const status: StepStatus = blocked ? "blocked" : dispatch ? "unknown" : "failed";
          if (stepRunId) {
            await finishStepRun({
              ...fence,
              id: stepRunId,
              status,
              error: message,
              receipt: receiptFor(undefined, item.value),
            });
          }
          tally(node, status, 1, message);
          opts.trace?.({ nodeId, itemKey, input: item.value, status, outputs: [], error: message });
          failedHere += 1;
          runError ??= message;
          own = worse(own, blocked ? "blocked" : "failed");
          if (!blocked && !dispatch) retryable = true;
          continue;
        }

        if (result.kind === "wait") {
          if (stepRunId) {
            const saved = await finishStepRun({
              ...fence,
              id: stepRunId,
              status: "waiting",
              state: result.state,
              wakeAt: result.until,
              output: { detail: result.detail },
              receipt: receiptFor(undefined, item.value),
            });
            if (!saved) return leaseLost();
            const opened = await openWait({
              ...fence,
              stepRunId,
              workflowId: opts.definition.id,
              workspaceId: opts.definition.workspaceId,
              kind: result.waitKind,
              wakeAt: result.until,
              deadlineAt: result.deadline,
              approvers: result.approvers ?? null,
              request: result.request ?? null,
              childRunId: result.childRunIds?.[0] ?? null,
            });
            if (!opened) return leaseLost();
          }
          const due = result.until ?? result.deadline;
          if (due && (!wakeAt || due.getTime() < wakeAt.getTime())) wakeAt = due;
          waitingHere += 1;
          details.add(result.detail);
          own = worse(own, "waiting");
          opts.trace?.({
            nodeId,
            itemKey,
            input: item.value,
            status: "waiting",
            outputs: [],
            detail: result.detail,
          });
          continue;
        }

        if (wait && wait.status === "open") await closeWait(wait.id, "resolved");
        const emits: Emit[] = result.emits.map((emission, index) => {
          const handle = emission.handle ?? "out";
          const value = emitsFor(node, handle) === "input" ? item.value : emission.result;
          const key = emission.key
            ? `${nodeId}:${emission.key}`
            : result.emits.length > 1 && index > 0
              ? `${item.key}#${index}`
              : item.key;
          return { handle, key, value, result: emission.result };
        });
        if (stepRunId) {
          const output: StepRunOutput = { emits, detail: result.detail };
          const saved = await finishStepRun({
            ...fence,
            id: stepRunId,
            status: "completed",
            output,
            outputHandles: [...new Set(emits.map((e) => e.handle))],
            receipt: receiptFor(result.receipt, item.value),
          });
          if (!saved) throw new LeaseLostError("lease lost");
        }
        emitItems(item, emits);
        ok += 1;
        if (result.detail) details.add(result.detail);
        opts.trace?.({
          nodeId,
          itemKey,
          input: item.value,
          status: "completed",
          outputs: [...new Set(emits.map((e) => e.handle))].map((handle) => ({
            handle,
            count: emits.filter((e) => e.handle === handle).length,
          })),
          result: emits[0]?.result,
          detail: result.detail,
        });
      }
    } catch (err) {
      if (err instanceof LeaseLostError) return leaseLost();
      throw err;
    }

    branches.set(nodeId, worse(own, upstream));
    if (ok > 0)
      tally(
        node,
        "completed",
        ok,
        details.size > 0 ? [...details].slice(0, 3).join(", ") : undefined,
      );
    if (waitingHere > 0) tally(node, "waiting", waitingHere, [...details].at(-1));
    if (ok === 0 && failedHere === 0 && waitingHere === 0) tally(node, "skipped", 0);
  }
  /* oxlint-enable eslint/no-await-in-loop */

  return {
    status: resolveStatus(counts, interrupted),
    summary,
    error: runError,
    retryable,
    leaseLost: false,
    interrupted,
    blocked: counts.blocked > 0,
    wakeAt,
    output: runOutput,
    values: emittedValues,
  };
}

function reconcileLater(pending: Promise<StepResult>, stepRunId: string): void {
  pending
    .then(async (late) => {
      const receipt = late.kind === "emit" ? late.receipt : undefined;
      const settled = await reconcileStepRun({
        id: stepRunId,
        status: "completed",
        receipt: receipt ?? null,
      });
      if (!settled) {
        console.warn(
          `[workflow] late result for step run ${stepRunId} ignored: it was already resolved or changed`,
        );
      }
    })
    .catch(async (err: unknown) => {
      const settled = await reconcileStepRun({
        id: stepRunId,
        status: "failed",
        error: sanitizeError(err),
      });
      if (!settled) {
        console.warn(
          `[workflow] late failure for step run ${stepRunId} ignored: it was already resolved or changed`,
        );
      }
    })
    .catch((err: unknown) => {
      console.error(
        `[workflow] late reconciliation failed for step run ${stepRunId} code=${errorCode(err)}`,
      );
    });
}

async function startChild(
  opts: ExecuteOptions,
  stepRunId: string | null,
  child: { workflowId: string; inputs: Record<string, unknown>; key: string },
): Promise<string> {
  if (!opts.runId || !stepRunId) throw new Error("A called workflow only runs in a live run");
  const callee = await loadDefinition(child.workflowId);
  if (
    !callee ||
    callee.definition.deletedAt ||
    callee.definition.kind !== "user" ||
    callee.definition.workspaceId !== opts.definition.workspaceId
  ) {
    throw new Error("That workflow is gone");
  }
  if (!callee.definition.enabled) throw new BlockedError("The called workflow is turned off");
  const node = callee.graph.nodes.find((n) => n.step === "trigger.call");
  if (!node) throw new Error("That workflow has no When called trigger");
  const trigger = (await listTriggers(child.workflowId)).find(
    (t) => t.nodeId === node.id && t.armed,
  );
  if (!trigger) throw new Error("That workflow's When called trigger is not armed");
  const key = `call:${stepRunId}:${child.key}`;
  const event = { inputs: child.inputs, parentRunId: opts.runId };
  const runId = await openEvent({
    workflowId: callee.definition.id,
    triggerId: trigger.id,
    revisionId: callee.revisionId,
    key,
    scheduledFor: new Date(),
    kind: "user",
    workspaceId: callee.definition.workspaceId,
    principalUserId: callee.definition.principalUserId,
    input: {
      triggerNodeId: node.id,
      source: "call",
      event,
      parentRunId: opts.runId,
      parentStepRunId: stepRunId,
    },
    payload: event,
    dueAt: new Date(),
    parentRunId: opts.runId,
  });
  if (runId) return runId;
  const existing = await runForEventKey(trigger.id, key);
  if (!existing) throw new Error("Could not start the called workflow");
  return existing;
}

async function childRuns(ids: string[]) {
  const runs = await Promise.all(ids.map((id) => getRun(id)));
  return runs.flatMap((run) =>
    run ? [{ runId: run.id, status: run.status, output: run.output, error: run.error }] : [],
  );
}
