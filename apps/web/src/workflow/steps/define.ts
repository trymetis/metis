import { type Binding, expr, literal, template } from "../expr";
import type { GraphNode } from "../schema";
import { T, type ValueType } from "../values";
import type { CardLine, ParamOption, ParamSpec, StepDef, StepOutput } from "./types";

type Extra = Partial<Omit<ParamSpec, "kind" | "label" | "type">>;

function spec(
  kind: ParamSpec["kind"],
  label: string,
  type: ValueType,
  extra: Extra = {},
): ParamSpec {
  return { kind, label, type, ...extra };
}

export const p = {
  text: (label: string, extra?: Extra) => spec("text", label, T.text, { bindable: true, ...extra }),
  longtext: (label: string, extra?: Extra) =>
    spec("longtext", label, T.text, { bindable: true, ...extra }),
  expr: (label: string, type: ValueType, extra?: Extra) =>
    spec("expr", label, type, { bindable: true, ...extra }),
  condition: (label: string, extra?: Extra) =>
    spec("condition", label, T.boolean, { bindable: true, ...extra }),
  number: (label: string, extra?: Extra) =>
    spec("number", label, T.number, { bindable: true, ...extra }),
  boolean: (label: string, extra?: Extra) =>
    spec("boolean", label, T.boolean, { bindable: true, ...extra }),
  select: (label: string, options: readonly ParamOption[], extra?: Extra) =>
    spec("select", label, T.text, { options, ...extra }),
  mailbox: (label = "Mailbox", extra?: Extra) => spec("mailbox", label, T.text, extra),
  calendar: (label = "Calendar", extra?: Extra) => spec("calendar", label, T.text, extra),
  drive: (label = "Drive", extra?: Extra) => spec("drive", label, T.text, extra),
  addressbook: (label = "Address book", extra?: Extra) => spec("addressbook", label, T.text, extra),
  mailFolder: (label = "Folder", extra?: Extra) =>
    spec("mailFolder", label, T.text, { default: literal("inbox"), ...extra }),
  driveFolder: (label = "Folder", extra?: Extra) =>
    spec("driveFolder", label, T.text, { bindable: true, ...extra }),
  label: (label = "Label", extra?: Extra) => spec("label", label, T.text, extra),
  emails: (label: string, extra?: Extra) =>
    spec("emails", label, T.list(T.text), { bindable: true, ...extra }),
  cron: (label = "Schedule", extra?: Extra) => spec("cron", label, T.text, extra),
  timezone: (label = "Time zone", extra?: Extra) => spec("timezone", label, T.text, extra),
  datetime: (label: string, extra?: Extra) =>
    spec("datetime", label, T.date, { bindable: true, ...extra }),
  members: (label: string, extra?: Extra) => spec("members", label, T.list(T.text), extra),
  workflow: (label = "Workflow", extra?: Extra) => spec("workflow", label, T.text, extra),
  fields: (label: string, extra?: Extra) => spec("fields", label, T.json, extra),
  assignments: (label: string, extra?: Extra) => spec("assignments", label, T.json, extra),
  cases: (label: string, extra?: Extra) => spec("cases", label, T.json, extra),
  questions: (label: string, extra?: Extra) => spec("questions", label, T.json, extra),
  categories: (label: string, extra?: Extra) => spec("categories", label, T.json, extra),
  strings: (label: string, extra?: Extra) => spec("strings", label, T.list(T.text), extra),
  headers: (label: string, extra?: Extra) => spec("headers", label, T.json, extra),
} as const;

export const ITEM = expr("item");

export const AMOUNT_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
] as const satisfies readonly ParamOption[];

export const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function step<const K extends string>(def: StepDef & { key: K }): StepDef & { key: K } {
  return def;
}

export function binding(node: GraphNode, name: string): Binding | undefined {
  return node.params[name];
}

export function literalOf(node: GraphNode, name: string): unknown {
  const bound = node.params[name];
  return bound?.kind === "literal" ? bound.value : undefined;
}

export function literalString(node: GraphNode, name: string): string {
  const value = literalOf(node, name);
  return typeof value === "string" ? value : "";
}

export function show(bound: Binding | undefined): string {
  if (!bound) return "";
  if (bound.kind === "literal") {
    const value = bound.value;
    if (value == null) return "";
    if (Array.isArray(value)) return value.map(String).join(", ");
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  if (bound.kind === "template") return bound.text;
  return `= ${bound.cel}`;
}

export function line(text: string, tone?: CardLine["tone"]): CardLine {
  return tone ? { text, tone } : { text };
}

export function shown(node: GraphNode, name: string, prefix: string): CardLine | null {
  const text = show(node.params[name]);
  if (!text) return null;
  return { text: `${prefix} ${text}`, mono: node.params[name]?.kind === "expr" };
}

export function missing(node: GraphNode, names: readonly string[], def: StepDef): string[] {
  return names.flatMap((name) => {
    const bound = node.params[name];
    const empty =
      !bound ||
      (bound.kind === "literal" &&
        (bound.value === "" ||
          bound.value == null ||
          (Array.isArray(bound.value) && bound.value.length === 0))) ||
      (bound.kind === "template" && !bound.text.trim()) ||
      (bound.kind === "expr" && !bound.cel.trim());
    return empty ? [`Fill in ${def.params[name]?.label.toLowerCase() ?? name}`] : [];
  });
}

export const OUTPUT_ERROR_HANDLE: StepOutput = { id: "error", label: "Error" };

export const PASS = (): "input" => "input";

export { expr, literal, template };
