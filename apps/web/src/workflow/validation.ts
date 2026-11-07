import { validTimezone } from "./cron";
import {
  type Binding,
  type BindingCheck,
  checkBinding,
  inferType,
  type Scope,
  templateExpressions,
} from "./expr";
import { parseAssignments } from "./fields";
import {
  type GraphNode,
  type GraphShape,
  mergeInputIndex,
  type WorkflowGraph,
  type WorkflowKind,
} from "./schema";
import { emitsFor, nodeOutputs, type ResourceKind, type StepDef, stepDef } from "./steps";
import { missing } from "./steps/define";
import { sameType, T, type ValueType } from "./values";

export interface GraphError {
  nodeId?: string;
  message: string;
}

export interface NodeTypes {
  input: ValueType | null;
  output: ValueType;
  scope: Scope;
}

export interface GraphAnalysis {
  order: string[];
  types: Map<string, NodeTypes>;
  triggers: string[];
  loops: Map<string, string>;
  errors: GraphError[];
}

export interface ValidGraph {
  ok: true;
  order: string[];
  types: Map<string, NodeTypes>;
  loops: Map<string, string>;
}

export type GraphValidation = ValidGraph | { ok: false; errors: GraphError[] };

export interface ValidateOptions {
  kind: WorkflowKind;
  allowedResources?: Record<ResourceKind, readonly string[]>;
  aiResources?: Record<ResourceKind, readonly string[]>;
  allowDecisionSteps?: boolean;
  workflows?: readonly { id: string; callable: boolean }[];
}

const RESOURCE_NOUN: Record<ResourceKind, string> = {
  mailbox: "mailbox",
  calendar: "calendar",
  drive: "drive",
  addressbook: "address book",
};

const RESOURCE_PARAM: Record<string, ResourceKind> = {
  mailbox: "mailbox",
  calendar: "calendar",
  drive: "drive",
  addressbook: "addressbook",
};

export function nodeResources(node: GraphNode): { kind: ResourceKind; id: string }[] {
  const def = stepDef(node.step);
  if (!def) return [];
  return Object.entries(def.params).flatMap(([name, spec]) => {
    const kind = RESOURCE_PARAM[spec.kind];
    const bound = node.params[name];
    if (!kind || bound?.kind !== "literal" || typeof bound.value !== "string" || !bound.value) {
      return [];
    }
    return [{ kind, id: bound.value }];
  });
}

export function graphResources(
  graph: GraphShape,
): { kind: ResourceKind; id: string; nodeId: string }[] {
  return graph.nodes.flatMap((node) =>
    nodeResources(node).map((resource) => ({ ...resource, nodeId: node.id })),
  );
}

export function graphResourceIds(graph: GraphShape, kind: ResourceKind): string[] {
  return [
    ...new Set(
      graphResources(graph)
        .filter((r) => r.kind === kind)
        .map((r) => r.id),
    ),
  ];
}

function topologicalOrder(graph: GraphShape): string[] | null {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const queue = graph.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}

function bindingText(bound: Binding | undefined): string {
  if (!bound) return "";
  if (bound.kind === "expr") return bound.cel;
  if (bound.kind === "template") return templateExpressions(bound.text).join(" ");
  return "";
}

function intersect(sets: Set<string>[]): Set<string> {
  const [first, ...rest] = sets;
  if (!first) return new Set();
  return new Set([...first].filter((id) => rest.every((set) => set.has(id))));
}

export function analyzeGraph(graph: GraphShape): GraphAnalysis {
  const errors: GraphError[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const types = new Map<string, NodeTypes>();
  const triggers = graph.nodes.filter((n) => stepDef(n.step)?.trigger).map((n) => n.id);

  const ids = graph.nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) errors.push({ message: "Two steps share an id" });

  const incomingEdges = new Map<string, WorkflowGraph["edges"]>();
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      errors.push({ message: "A connection points at a step that no longer exists" });
      continue;
    }
    incomingEdges.set(edge.target, [...(incomingEdges.get(edge.target) ?? []), edge]);
    if (!nodeOutputs(source, graph).some((output) => output.id === edge.sourceHandle)) {
      errors.push({
        nodeId: source.id,
        message: "A connection leaves from an output this step no longer has",
      });
    }
    if (stepDef(target.step)?.trigger) {
      errors.push({ nodeId: target.id, message: "Nothing can connect into a trigger" });
    }
  }

  const order = topologicalOrder(graph);
  if (!order) {
    errors.push({ message: "Steps are connected in a loop; remove one connection" });
    return { order: graph.nodes.map((n) => n.id), types, triggers, loops: new Map(), errors };
  }

  const loops = pairLoops(graph);
  for (const node of graph.nodes) {
    if (node.step === "flow.endLoop" && !loops.has(node.id)) {
      errors.push({ nodeId: node.id, message: "End loop needs exactly one Loop before it" });
    }
  }

  const reachedBy = new Map<string, Set<string>>();
  const available = new Map<string, Set<string>>();
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const def = stepDef(node.step);
    if (!def) {
      errors.push({ nodeId: id, message: "This step no longer exists; remove it" });
      continue;
    }
    const inbound = incomingEdges.get(id) ?? [];
    const sources = inbound.map((edge) => edge.source);
    const reached = new Set<string>(def.trigger ? [id] : []);
    for (const source of sources) for (const t of reachedBy.get(source) ?? []) reached.add(t);
    reachedBy.set(id, reached);

    let input: ValueType | null = null;
    if (!def.trigger) {
      const arriving = inbound.flatMap((edge) => {
        const source = byId.get(edge.source);
        const sourceTypes = types.get(edge.source);
        if (!source || !sourceTypes) return [];
        return [
          emitsFor(source, edge.sourceHandle) === "input"
            ? (sourceTypes.input ?? sourceTypes.output)
            : sourceTypes.output,
        ];
      });
      const [first] = arriving;
      input = first ?? null;
      if (first && arriving.some((type) => !sameType(type, first))) {
        errors.push({
          nodeId: id,
          message: "Everything coming into this step must be the same kind of item",
        });
        input = T.json;
      }
    }

    const lineage = intersect(
      sources.map((source) => {
        const sourceNode = byId.get(source);
        const sourceDef = sourceNode ? stepDef(sourceNode.step) : null;
        if (!sourceDef || sourceDef.trigger) return new Set<string>();
        if (sourceDef.merge === "aggregate") return new Set([source]);
        if (sourceDef.merge === "collect") {
          const opened = loops.get(source);
          const outer = opened ? available.get(opened) : undefined;
          return new Set([...(outer ?? []), source]);
        }
        return new Set([...(available.get(source) ?? []), source]);
      }),
    );
    available.set(id, lineage);

    const triggerTypes = [...reached].flatMap((t) => {
      const own = types.get(t);
      return own ? [own.output] : [];
    });
    const [firstTrigger] = triggerTypes;
    const triggerType =
      firstTrigger && triggerTypes.every((type) => sameType(type, firstTrigger))
        ? firstTrigger
        : T.json;

    const scope: Scope = def.trigger
      ? { trigger: T.json, item: null, steps: {} }
      : {
          trigger: triggerType,
          item: input,
          steps: Object.fromEntries(
            [...lineage].flatMap((stepId) => {
              const own = types.get(stepId);
              return own ? [[stepId, own.output]] : [];
            }),
          ),
        };

    const infer = (param: string): BindingCheck | null => {
      const bound = node.params[param];
      if (bound?.kind !== "expr") return null;
      return inferType(bound.cel, scope);
    };
    let output: ValueType;
    try {
      output = def.output({ node, input, scope, infer });
    } catch {
      output = T.json;
    }
    const finalScope = def.trigger ? { trigger: output, item: output, steps: {} } : scope;
    types.set(id, { input, output, scope: finalScope });
  }

  return { order, types, triggers, loops, errors };
}

function pairLoops(graph: GraphShape): Map<string, string> {
  const stepOf = new Map(graph.nodes.map((n) => [n.id, n.step]));
  const above = new Map(graph.nodes.map((n) => [n.id, ancestorsOf(graph, n.id)]));
  const pairs = new Map<string, string>();
  for (const end of graph.nodes.filter((n) => n.step === "flow.endLoop")) {
    const ancestors = above.get(end.id) ?? new Set<string>();
    const matched = [...ancestors].filter((loopId) => {
      if (stepOf.get(loopId) !== "flow.loop") return false;
      const between = [...ancestors].filter((id) => above.get(id)?.has(loopId));
      const opened = between.filter((id) => stepOf.get(id) === "flow.loop").length;
      const closed = between.filter((id) => stepOf.get(id) === "flow.endLoop").length;
      return opened === closed;
    });
    const [only] = matched;
    if (only && matched.length === 1) pairs.set(end.id, only);
  }
  return pairs;
}

function ancestorsOf(graph: GraphShape, nodeId: string): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }
  const seen = new Set<string>();
  const stack = [...(incoming.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    stack.push(...(incoming.get(id) ?? []));
  }
  return seen;
}

function checkParams(node: GraphNode, def: StepDef, scope: Scope, opts: ValidateOptions): string[] {
  const problems: string[] = [];
  const required = Object.entries(def.params)
    .filter(([name, spec]) => spec.required && !hiddenParam(node, def, name))
    .map(([name]) => name);
  problems.push(...missing(node, required, def));

  for (const [name, bound] of Object.entries(node.params)) {
    const spec = def.params[name];
    if (!spec) {
      problems.push(`Remove the unknown setting "${name}"`);
      continue;
    }
    if (hiddenParam(node, def, name)) continue;
    if (bound.kind !== "literal" && !spec.bindable) {
      problems.push(`${spec.label} cannot use an expression`);
      continue;
    }
    if (bound.kind === "literal" && (bound.value === "" || bound.value == null)) continue;
    if (bound.kind === "template" && !bound.text.trim()) continue;
    if (bound.kind === "expr" && !bound.cel.trim()) continue;
    if (
      spec.kind === "fields" ||
      spec.kind === "assignments" ||
      spec.kind === "cases" ||
      spec.kind === "questions" ||
      spec.kind === "categories" ||
      spec.kind === "headers"
    ) {
      if (spec.kind === "assignments" && bound.kind === "literal") {
        for (const entry of parseAssignments(bound.value)) {
          if (entry.value.kind === "literal") continue;
          const checked = checkBinding(entry.value, T.json, scope);
          if (!checked.ok) problems.push(`${entry.name}: ${checked.error}`);
        }
      }
      continue;
    }
    const checked = checkBinding(bound, spec.type, scope);
    if (!checked.ok) problems.push(`${spec.label}: ${checked.error}`);
    if (
      spec.kind === "timezone" &&
      bound.kind === "literal" &&
      typeof bound.value === "string" &&
      !validTimezone(bound.value)
    ) {
      problems.push("Pick a valid time zone");
    }
    if (
      spec.kind === "workflow" &&
      bound.kind === "literal" &&
      typeof bound.value === "string" &&
      opts.workflows
    ) {
      const target = opts.workflows.find((w) => w.id === bound.value);
      if (!target) problems.push("That workflow is gone; pick another");
      else if (node.step === "flow.call" && !target.callable) {
        problems.push("That workflow needs a When called trigger");
      }
    }
  }
  return problems;
}

function hiddenParam(node: GraphNode, def: StepDef, name: string): boolean {
  const when = def.params[name]?.visibleWhen;
  if (!when) return false;
  const bound = node.params[when.param] ?? def.params[when.param]?.default;
  const value = bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
  return !when.equals.includes(value);
}

export { hiddenParam };

export function validateGraph(graph: WorkflowGraph, opts: ValidateOptions): GraphValidation {
  const analysis = analyzeGraph(graph);
  const errors = [...analysis.errors];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = (id: string) => graph.edges.filter((e) => e.target === id).map((e) => e.source);
  const outgoing = (id: string) => graph.edges.filter((e) => e.source === id).map((e) => e.target);

  if (analysis.triggers.length === 0)
    errors.push({ message: "Add a trigger to start this workflow" });

  const beforeSend = graph.nodes.filter((n) => n.step === "trigger.mail.beforeSend");
  if (beforeSend.length > 0 && analysis.triggers.length > 1) {
    errors.push({
      nodeId: beforeSend[0]?.id,
      message: "A Before mail is sent trigger must be the workflow's only trigger",
    });
  }

  const reachable = new Set<string>();
  const queue = [...analysis.triggers];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    queue.push(...outgoing(id));
  }

  for (const node of graph.nodes) {
    const def = stepDef(node.step);
    if (!def) continue;
    const scopeOk =
      def.scope === undefined ||
      def.scope === "any" ||
      (def.scope === "builtin" && opts.kind !== "user") ||
      (def.scope === "system" && opts.kind === "system");
    if (!scopeOk)
      errors.push({ nodeId: node.id, message: `${def.label} is only used by built-in workflows` });

    if (!reachable.has(node.id)) {
      errors.push({ nodeId: node.id, message: "Connect this step to a trigger" });
    }
    const inbound = graph.edges.filter((e) => e.target === node.id);
    if (!def.trigger) {
      if (def.merge === "append" || def.merge === "join") {
        const ports = inbound.map((e) => mergeInputIndex(e.targetHandle));
        if (ports.some((port) => port < 0))
          errors.push({ nodeId: node.id, message: "Connect each branch to its own input" });
        if (new Set(ports).size !== ports.length)
          errors.push({ nodeId: node.id, message: "Two branches share an input" });
        if (inbound.length < 2)
          errors.push({ nodeId: node.id, message: "Connect at least two branches" });
      } else if (inbound.length > 1) {
        errors.push({
          nodeId: node.id,
          message: "Only Merge and Wait for all take more than one connection; add one",
        });
      } else if (inbound.some((e) => e.targetHandle && e.targetHandle !== "in")) {
        errors.push({ nodeId: node.id, message: "This step has a single input" });
      }
    }
    if (node.skip && !(def.effect === "write" || def.effect === "dispatch")) {
      errors.push({
        nodeId: node.id,
        message: "Only a step that changes something can be skipped",
      });
    }
    if (beforeSend.length > 0 && !def.trigger && !def.beforeSend) {
      errors.push({ nodeId: node.id, message: `${def.label} cannot run before a message is sent` });
    }
    if (def.trigger && def.trigger.kind === "beforeSend" && opts.kind !== "user") {
      errors.push({ nodeId: node.id, message: "Only workspace workflows run before mail is sent" });
    }

    const nodeTypes = analysis.types.get(node.id);
    if (!nodeTypes) continue;
    for (const problem of checkParams(node, def, nodeTypes.scope, opts)) {
      errors.push({ nodeId: node.id, message: problem });
    }

    if (opts.allowedResources) {
      for (const resource of nodeResources(node)) {
        if (!opts.allowedResources[resource.kind].includes(resource.id)) {
          errors.push({
            nodeId: node.id,
            message: `That ${RESOURCE_NOUN[resource.kind]} is not in this workspace`,
          });
        }
      }
    }

    const ancestors = ancestorsOf(graph, node.id);
    if (def.ai && opts.aiResources) {
      const feeding = [node.id, ...ancestors].flatMap((id) => {
        const other = byId.get(id);
        return other ? nodeResources(other) : [];
      });
      if (feeding.some((resource) => !opts.aiResources?.[resource.kind].includes(resource.id))) {
        errors.push({
          nodeId: node.id,
          message: "Turn AI on for every mailbox, calendar, drive and address book this step reads",
        });
      }
    }

    if (def.effect === "dispatch") {
      const aiAncestors = [...ancestors].filter((id) => {
        const other = byId.get(id);
        return other ? !!stepDef(other.step)?.ai : false;
      });
      for (const [name, spec] of Object.entries(def.params)) {
        if (!spec.target) continue;
        const text = bindingText(node.params[name]);
        if (!text) continue;
        const inputFromAi =
          /\bitem\b/.test(text) &&
          incoming(node.id).some((id) => {
            const source = byId.get(id);
            return source ? !!stepDef(source.step)?.ai : false;
          });
        const usesAi =
          inputFromAi || aiAncestors.some((id) => new RegExp(`\\bsteps\\.${id}\\b`).test(text));
        if (!usesAi) continue;
        const approved = [...ancestors].some((id) => {
          const other = byId.get(id);
          if (other?.step !== "flow.approval") return false;
          const above = ancestorsOf(graph, id);
          return aiAncestors.some((ai) => above.has(ai));
        });
        if (!approved) {
          errors.push({
            nodeId: node.id,
            message: `${spec.label} comes from AI; add an Ask for approval step before this one`,
          });
        }
      }
    }

    for (const problem of def.check?.({
      graph,
      workflowKind: opts.kind,
      node,
      scope: nodeTypes.scope,
      input: nodeTypes.input,
      allowedResources: opts.allowedResources,
      aiResources: opts.aiResources,
      allowDecisionSteps: opts.allowDecisionSteps,
      workflows: opts.workflows,
      incoming,
      outgoing,
      ancestors: (id) => [...ancestorsOf(graph, id)].flatMap((a) => byId.get(a) ?? []),
    }) ?? []) {
      errors.push({ nodeId: node.id, message: problem });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, order: analysis.order, types: analysis.types, loops: analysis.loops };
}

export function firstError(validation: GraphValidation): string | null {
  if (validation.ok) return null;
  return validation.errors[0]?.message ?? "This workflow is not valid";
}
