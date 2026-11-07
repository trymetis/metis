import type { Binding, BindingCheck, Scope } from "../expr";
import type { GraphNode, GraphShape, WorkflowKind } from "../schema";
import type { ValueType } from "../values";

export const STEP_CATEGORIES = [
  "trigger",
  "mail",
  "calendar",
  "drive",
  "contacts",
  "logic",
  "flow",
  "ai",
  "system",
] as const;
export type StepCategory = (typeof STEP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<StepCategory, string> = {
  trigger: "Triggers",
  mail: "Mail",
  calendar: "Calendar",
  drive: "Drive",
  contacts: "Contacts",
  logic: "Logic",
  flow: "Waits and flow",
  ai: "AI",
  system: "Maintenance",
};

export const RESOURCE_KINDS = ["mailbox", "calendar", "drive", "addressbook"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type Effect = "read" | "write" | "dispatch";

export type ParamKind =
  | "text"
  | "longtext"
  | "expr"
  | "condition"
  | "number"
  | "boolean"
  | "select"
  | "mailbox"
  | "calendar"
  | "drive"
  | "addressbook"
  | "mailFolder"
  | "driveFolder"
  | "label"
  | "emails"
  | "cron"
  | "timezone"
  | "datetime"
  | "members"
  | "workflow"
  | "fields"
  | "assignments"
  | "cases"
  | "questions"
  | "categories"
  | "strings"
  | "headers";

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamSpec {
  kind: ParamKind;
  label: string;
  type: ValueType;
  required?: boolean;
  default?: Binding;
  options?: readonly ParamOption[];
  help?: string;
  placeholder?: string;
  bindable?: boolean;
  visibleWhen?: { param: string; equals: readonly string[] };
  min?: number;
  max?: number;
  target?: boolean;
}

export interface StepOutput {
  id: string;
  label?: string;
}

export type TriggerSource =
  | { kind: "manual" }
  | { kind: "time" }
  | { kind: "once" }
  | { kind: "feed"; resource: ResourceKind }
  | { kind: "app" }
  | { kind: "inbound" }
  | { kind: "beforeSend" }
  | { kind: "call" };

export interface CardLine {
  text: string;
  tone?: "muted" | "warn";
  mono?: boolean;
}

export type CardEntry = CardLine | string | false | null | undefined;

export interface CardContext {
  graph: GraphShape;
  mailboxEmail(mailboxId: string): string | null;
  calendarName(accountId: string): string | null;
  driveName(driveId: string): string | null;
  addressBookName(addressBookId: string): string | null;
  labelName(key: string): string;
  workflowName(workflowId: string): string | null;
  memberName(userId: string): string | null;
}

export interface TypeContext {
  node: GraphNode;
  input: ValueType | null;
  scope: Scope;
  infer: (param: string) => BindingCheck | null;
}

export interface CheckContext {
  graph: GraphShape;
  workflowKind: WorkflowKind;
  node: GraphNode;
  scope: Scope;
  input: ValueType | null;
  allowedResources?: Record<ResourceKind, readonly string[]>;
  aiResources?: Record<ResourceKind, readonly string[]>;
  allowDecisionSteps?: boolean;
  workflows?: readonly { id: string; callable: boolean }[];
  incoming(nodeId: string): string[];
  outgoing(nodeId: string): string[];
  ancestors(nodeId: string): GraphNode[];
}

export interface StepDef {
  key: string;
  label: string;
  category: StepCategory;
  description: string;
  params: Record<string, ParamSpec>;
  trigger?: TriggerSource;
  output(ctx: TypeContext): ValueType;
  outputs?(node: GraphNode, graph: GraphShape): StepOutput[];
  emits?(handle: string): "result" | "input";
  many?: boolean;
  merge?: "append" | "join" | "aggregate" | "collect";
  effect: Effect;
  ai?: boolean;
  beforeSend?: boolean;
  scope?: "any" | "builtin" | "system";
  check?(ctx: CheckContext): string[];
  card?(node: GraphNode, ctx: CardContext): CardEntry[];
}

export const SINGLE_OUTPUT: StepOutput[] = [{ id: "out" }];
