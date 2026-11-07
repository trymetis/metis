import { customAlphabet } from "nanoid";

import { type Binding, expr, literal, template } from "./expr";
import {
  DEFAULT_TARGET_HANDLE,
  edgeId,
  GRAPH_VERSION,
  type GraphEdge,
  type GraphNode,
  isHandle,
  mergeInputHandle,
  type WorkflowGraph,
} from "./schema";
import { type ResourceKind, stepDef } from "./steps";

export interface GraphResource {
  id: string;
  label: string;
}

export interface GraphResources {
  mailbox: GraphResource[];
  calendar: GraphResource[];
  drive: GraphResource[];
  addressbook: GraphResource[];
  timezone?: string;
}

export const NO_RESOURCES: GraphResources = {
  mailbox: [],
  calendar: [],
  drive: [],
  addressbook: [],
};

export const CARD_WIDTH = 256;
const COLUMN_GAP = 96;
const ROW_GAP = 40;
const ESTIMATED_HEIGHT = 120;

type Point = { x: number; y: number };
const ORIGIN: Point = { x: 0, y: 0 };

export function layoutGraph(
  graph: WorkflowGraph,
  heightOf: (nodeId: string) => number = () => ESTIMATED_HEIGHT,
): WorkflowGraph {
  const ids = graph.nodes.map((n) => n.id);
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of graph.edges) {
    if (!parents.has(edge.target) || !children.has(edge.source)) continue;
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }

  const layer = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const up = parents.get(id) ?? [];
    const depth = up.length === 0 ? 0 : Math.max(...up.map((p) => depthOf(p, seen))) + 1;
    layer.set(id, depth);
    return depth;
  };
  for (const id of ids) depthOf(id, new Set());

  const columns: string[][] = [];
  for (const id of ids) {
    const index = layer.get(id) ?? 0;
    (columns[index] ??= []).push(id);
  }

  const y = new Map<string, number>();
  const order = new Map(ids.map((id, index) => [id, index]));
  const positions = new Map<string, Point>();
  const rank = (id: string) => {
    const up = (parents.get(id) ?? []).map((p) => y.get(p) ?? 0);
    return up.length > 0 ? up.reduce((a, b) => a + b, 0) / up.length : (order.get(id) ?? 0);
  };
  columns.forEach((column, index) => {
    const sorted = column.toSorted(
      (a, b) => rank(a) - rank(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
    const heights = sorted.map(heightOf);
    const total = heights.reduce((a, b) => a + b, 0) + ROW_GAP * (sorted.length - 1);
    let top = -total / 2;
    sorted.forEach((id, row) => {
      const height = heights[row] ?? ESTIMATED_HEIGHT;
      y.set(id, top + height / 2);
      positions.set(id, { x: index * (CARD_WIDTH + COLUMN_GAP), y: Math.round(top) });
      top += height + ROW_GAP;
    });
  });

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

const nodeSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

export function newNodeId(): string {
  return `s${nodeSuffix()}`;
}

const RESOURCE_PARAMS: Record<string, ResourceKind> = {
  mailbox: "mailbox",
  calendar: "calendar",
  drive: "drive",
  addressbook: "addressbook",
};

export function newNode(
  step: string,
  position: Point,
  resources: GraphResources = NO_RESOURCES,
  params: Record<string, Binding> = {},
): GraphNode {
  const def = stepDef(step);
  const defaults: Record<string, Binding> = {};
  for (const [name, spec] of Object.entries(def?.params ?? {})) {
    if (spec.default) defaults[name] = spec.default;
    const kind = RESOURCE_PARAMS[spec.kind];
    if (kind && spec.required) {
      const first = resources[kind][0];
      if (first) defaults[name] = literal(first.id);
    }
    if (spec.kind === "timezone" && resources.timezone)
      defaults[name] = literal(resources.timezone);
  }
  return { id: newNodeId(), step, position, params: { ...defaults, ...params } };
}

export function graphEdge(
  source: string,
  target: string,
  sourceHandle = "out",
  targetHandle: string = DEFAULT_TARGET_HANDLE,
): GraphEdge {
  return {
    id: edgeId(source, sourceHandle, target, targetHandle),
    source,
    sourceHandle,
    target,
    ...(targetHandle !== DEFAULT_TARGET_HANDLE ? { targetHandle } : {}),
  };
}

function graphOf(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { version: GRAPH_VERSION, nodes, edges, settings: {} };
}

function chain(nodes: GraphNode[], handles: Record<number, string> = {}): GraphEdge[] {
  return nodes.slice(1).flatMap((node, index) => {
    const source = nodes[index];
    return source ? [graphEdge(source.id, node.id, handles[index] ?? "out")] : [];
  });
}

type Builder = (r: GraphResources) => WorkflowGraph;

const labelSender: Builder = (r) => {
  const nodes = [
    newNode("trigger.mail.received", ORIGIN, r),
    newNode("logic.if", ORIGIN, r, { condition: expr('item.from.contains("")') }),
    newNode("mail.label", ORIGIN, r),
  ];
  return graphOf(nodes, chain(nodes, { 1: "yes" }));
};

const saveInvoices: Builder = (r) => {
  const nodes = [
    newNode("trigger.mail.received", ORIGIN, r, {
      filter: expr('item.subject.lowerAscii().contains("invoice") && item.hasAttachments'),
    }),
    newNode("logic.split", ORIGIN, r, { list: expr("item.attachments") }),
    newNode("logic.filter", ORIGIN, r, {
      condition: expr('item.name.lowerAscii().endsWith(".pdf")'),
    }),
    newNode("mail.saveAttachment", ORIGIN, r, { folder: template("Invoices") }),
  ];
  return graphOf(nodes, chain(nodes));
};

const addInvitations: Builder = (r) => {
  const nodes = [
    newNode("trigger.mail.received", ORIGIN, r, { filter: expr("item.hasAttachments") }),
    newNode("logic.split", ORIGIN, r, { list: expr("item.attachments") }),
    newNode("logic.filter", ORIGIN, r, {
      condition: expr('item.name.lowerAscii().endsWith(".ics")'),
    }),
    newNode("calendar.importIcs", ORIGIN, r),
  ];
  return graphOf(nodes, chain(nodes));
};

const approvedReply: Builder = (r) => {
  const nodes = [
    newNode("trigger.mail.received", ORIGIN, r),
    newNode("ai.generate", ORIGIN, r, {
      prompt: template(
        "Write a short, friendly reply to this message from {{ item.fromName }}:\n\n{{ item.body }}",
      ),
    }),
    newNode("flow.approval", ORIGIN, r, {
      message: template("Send this reply?\n\n{{ item.text }}"),
    }),
  ];
  const reply = newNode("mail.reply", ORIGIN, r, {
    message: expr("trigger"),
    body: template("{{ item.text }}"),
  });
  return graphOf(
    [...nodes, reply],
    [...chain(nodes), graphEdge(nodes[2]?.id ?? "", reply.id, "approved")],
  );
};

const followUp: Builder = (r) => {
  const sent = newNode("trigger.mail.sent", ORIGIN, r);
  const wait = newNode("flow.waitFor", ORIGIN, r, { event: literal("reply") });
  const draft = newNode("mail.draft", ORIGIN, r, {
    to: expr("trigger.to"),
    subject: template("Re: {{ trigger.subject }}"),
    body: template("Just following up on my message below."),
  });
  return graphOf(
    [sent, wait, draft],
    [graphEdge(sent.id, wait.id), graphEdge(wait.id, draft.id, "timeout")],
  );
};

const dailyBrief: Builder = (r) => {
  const nodes = [
    newNode("trigger.schedule", ORIGIN, r, { cron: literal("0 8 * * 1-5") }),
    newNode("calendar.list", ORIGIN, r, { to: expr('now + duration("24h")') }),
    newNode("logic.aggregate", ORIGIN, r),
    newNode("ai.summarize", ORIGIN, r, { source: expr("item.items") }),
    newNode("mail.send", ORIGIN, r, {
      to: expr(`["${r.mailbox[0]?.label ?? ""}"]`),
      subject: template("Today's meetings"),
      body: template("{{ item.summary }}"),
    }),
  ];
  return graphOf(nodes, chain(nodes));
};

const meetingPrep: Builder = (r) => {
  const nodes = [
    newNode("trigger.calendar.starting", ORIGIN, r, { minutes: literal(30) }),
    newNode("ai.agent", ORIGIN, r, {
      agent: literal("workspace"),
      task: template(
        'Find recent mail and files about the meeting "{{ item.title }}" with {{ joined(item.attendees.map(a, a.email), ", ") }} and list what I should know.',
      ),
    }),
    newNode("mail.send", ORIGIN, r, {
      to: expr(`["${r.mailbox[0]?.label ?? ""}"]`),
      subject: template("Prep: {{ trigger.title }}"),
      body: template("{{ item.text }}"),
    }),
  ];
  return graphOf(nodes, chain(nodes));
};

function mergeBuilder(step: "logic.merge" | "logic.join"): Builder {
  return (r) => {
    const trigger = newNode("trigger.schedule", ORIGIN, r);
    const left = newNode("mail.list", ORIGIN, r);
    const second = r.mailbox[1] ?? r.mailbox[0];
    const right = newNode("mail.list", ORIGIN, r, second ? { mailbox: literal(second.id) } : {});
    const merge = newNode(step, ORIGIN, r);
    const label = newNode("mail.label", ORIGIN, r);
    return graphOf(
      [trigger, left, right, merge, label],
      [
        graphEdge(trigger.id, left.id),
        graphEdge(trigger.id, right.id),
        graphEdge(left.id, merge.id, "out", mergeInputHandle(0)),
        graphEdge(right.id, merge.id, "out", mergeInputHandle(1)),
        graphEdge(merge.id, label.id),
      ],
    );
  };
}

const blank: Builder = (r) => graphOf([newNode("trigger.manual", ORIGIN, r)], []);

export const GRAPH_TEMPLATES = [
  "blank",
  "labelSender",
  "saveInvoices",
  "addInvitations",
  "approvedReply",
  "followUp",
  "dailyBrief",
  "meetingPrep",
  "append",
  "join",
] as const;
export type GraphTemplate = (typeof GRAPH_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<GraphTemplate, string> = {
  blank: "Start from a manual trigger",
  labelSender: "Label mail from a sender",
  saveInvoices: "Save invoice PDFs to a drive",
  addInvitations: "Add mailed invitations to a calendar",
  approvedReply: "Draft a reply with AI, send once approved",
  followUp: "Follow up when nobody replies",
  dailyBrief: "Morning brief of today's meetings",
  meetingPrep: "Meeting prep from mail and files",
  append: "Two mailboxes, one shared action",
  join: "Two mailboxes, act once both are read",
};

const BUILDERS: Record<GraphTemplate, Builder> = {
  blank,
  labelSender,
  saveInvoices,
  addInvitations,
  approvedReply,
  followUp,
  dailyBrief,
  meetingPrep,
  append: mergeBuilder("logic.merge"),
  join: mergeBuilder("logic.join"),
};

export function templateGraph(name: GraphTemplate, resources: GraphResources): WorkflowGraph {
  return layoutGraph(BUILDERS[name](resources));
}

export function graphTimezone(graph: WorkflowGraph, trigger: GraphNode | undefined): string {
  if (graph.settings.timezone) return graph.settings.timezone;
  const own = trigger?.params.timezone;
  return own?.kind === "literal" && typeof own.value === "string" && own.value
    ? own.value
    : "Etc/UTC";
}

export function flowHandle(handle: string | null | undefined): string {
  return handle && isHandle(handle) ? handle : "out";
}

export function targetsOf(graph: Pick<WorkflowGraph, "nodes" | "edges">, id: string): GraphNode[] {
  const ids = new Set(graph.edges.filter((e) => e.source === id).map((e) => e.target));
  return graph.nodes.filter((n) => ids.has(n.id));
}
