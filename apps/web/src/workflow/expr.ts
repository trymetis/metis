import { Environment } from "@marcbachmann/cel-js";
import { z } from "zod";

import { isRecord } from "@/lib/guards";

import {
  emptyValue,
  fieldsOf,
  isAssignable,
  isRecordKind,
  type Json,
  RECORD_FIELDS,
  RECORD_KINDS,
  type RecordKind,
  T,
  typeLabel,
  type ValueType,
  valueSchema,
} from "./values";

export const MAX_EXPR_LENGTH = 2000;
export const MAX_TEMPLATE_LENGTH = 20_000;

export const bindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.json() }),
  z.object({ kind: z.literal("template"), text: z.string().max(MAX_TEMPLATE_LENGTH) }),
  z.object({ kind: z.literal("expr"), cel: z.string().max(MAX_EXPR_LENGTH) }),
]);

export type Binding = z.infer<typeof bindingSchema>;

export function literal(value: Json): Binding {
  return { kind: "literal", value };
}

export function template(text: string): Binding {
  return { kind: "template", text };
}

export function expr(cel: string): Binding {
  return { kind: "expr", cel };
}

export interface Scope {
  trigger: ValueType;
  item: ValueType | null;
  steps: Record<string, ValueType>;
}

export interface EvalValues {
  trigger: unknown;
  item: unknown;
  steps: Record<string, unknown>;
  now: Date;
  run: { id: string; workflowId: string; workflow: string; startedAt: string };
  error: string;
  timezone: string;
}

const RECORD_TYPE_NAMES: Record<RecordKind, string> = {
  mail: "Mail",
  attachment: "Attachment",
  thread: "Thread",
  draft: "Draft",
  event: "Event",
  attendee: "Attendee",
  file: "File",
  folder: "Folder",
  person: "Person",
  contact: "Contact",
  blob: "Blob",
  answer: "Answer",
};

const TIMESTAMP = "google.protobuf.Timestamp";
const RUN_FIELDS: Record<string, ValueType> = {
  id: T.text,
  workflowId: T.text,
  workflow: T.text,
  startedAt: T.date,
};

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const objectTypes = new Map<string, Record<string, ValueType>>();

function objectTypeName(fields: Record<string, ValueType>): string {
  const name = `Fields_${hash(JSON.stringify(fields))}`;
  objectTypes.set(name, fields);
  return name;
}

type CelClass = new (fields: Record<string, unknown>) => object;

const classes = new Map<string, CelClass>();

function classFor(name: string): CelClass {
  const known = classes.get(name);
  if (known) return known;
  const created = {
    // oxlint-disable-next-line typescript/no-extraneous-class -- CEL matches a value to its declared type by constructor, so every type needs its own class
    [name]: class {
      constructor(fields: Record<string, unknown>) {
        Object.assign(this, fields);
      }
    },
  }[name];
  if (!created) throw new Error(`could not create a class for ${name}`);
  classes.set(name, created);
  return created;
}

function celTypeOf(
  type: ValueType,
  register: (name: string, fields: Record<string, ValueType>) => void,
): string {
  switch (type.kind) {
    case "text":
      return "string";
    case "number":
      return "double";
    case "integer":
      return "int";
    case "boolean":
      return "bool";
    case "date":
      return TIMESTAMP;
    case "json":
      return "dyn";
    case "list":
      return `list<${celTypeOf(type.of, register)}>`;
    case "object": {
      const name = objectTypeName(type.fields);
      register(name, type.fields);
      return name;
    }
    default:
      return RECORD_TYPE_NAMES[type.kind];
  }
}

function celToValueType(name: string | undefined): ValueType {
  if (!name) return T.json;
  const trimmed = name.trim();
  switch (trimmed) {
    case "string":
      return T.text;
    case "double":
      return T.number;
    case "int":
    case "uint":
      return T.integer;
    case "bool":
      return T.boolean;
    case TIMESTAMP:
      return T.date;
    default:
      break;
  }
  const list = /^list<(.+)>$/.exec(trimmed);
  if (list) return T.list(celToValueType(list[1]));
  const record = RECORD_KINDS.find((kind) => RECORD_TYPE_NAMES[kind] === trimmed);
  if (record) return { kind: record };
  const object = objectTypes.get(trimmed);
  if (object) return T.object(object);
  return T.json;
}

function isoDate(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function clockTime(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(value);
  } catch {
    return value.toISOString().slice(11, 16);
  }
}

function baseEnvironment(): Environment {
  const env = new Environment({
    enableOptionalTypes: true,
    homogeneousAggregateLiterals: false,
    limits: { maxAstNodes: 2000, maxDepth: 40, maxListElements: 500, maxMapEntries: 200 },
  });
  const pending = new Map<string, Record<string, ValueType>>();
  const queue = (name: string, fields: Record<string, ValueType>) => pending.set(name, fields);
  for (const kind of RECORD_KINDS) {
    const name = RECORD_TYPE_NAMES[kind];
    env.registerType(name, {
      ctor: classFor(name),
      fields: Object.fromEntries(
        Object.entries(RECORD_FIELDS[kind]).map(([field, type]) => [field, celTypeOf(type, queue)]),
      ),
    });
  }
  env
    .registerFunction(`string(${TIMESTAMP}): string`, (value: Date) => value.toISOString())
    .registerFunction(`date(${TIMESTAMP}, string): string`, (value: Date, zone: string) =>
      isoDate(value, zone),
    )
    .registerFunction(`time(${TIMESTAMP}, string): string`, (value: Date, zone: string) =>
      clockTime(value, zone),
    )
    .registerFunction(`date(${TIMESTAMP}): string`, (value: Date) => isoDate(value, activeZone))
    .registerFunction(`time(${TIMESTAMP}): string`, (value: Date) => clockTime(value, activeZone))
    .registerFunction("domain(string): string", (address: string) =>
      (address.split("@").pop() ?? "").replace(/>$/, "").trim().toLowerCase(),
    )
    .registerFunction("lower(string): string", (value: string) => value.toLowerCase())
    .registerFunction("upper(string): string", (value: string) => value.toUpperCase())
    .registerFunction(
      "joined(list<string>, string): string",
      (items: string[], separator: string) => items.join(separator),
    );
  return env;
}

let base: Environment | null = null;
const envCache = new Map<string, Environment>();
const ENV_CACHE_LIMIT = 300;

function scopeEnvironment(scope: Scope): Environment {
  const signature = JSON.stringify(scope);
  const cached = envCache.get(signature);
  if (cached) return cached;
  base ??= baseEnvironment();
  const env = base.clone();
  const registered = new Set<string>();
  const register = (name: string, fields: Record<string, ValueType>) => {
    if (registered.has(name)) return;
    registered.add(name);
    const celFields = Object.fromEntries(
      Object.entries(fields).map(([field, type]) => [field, celTypeOf(type, register)]),
    );
    env.registerType(name, { ctor: classFor(name), fields: celFields });
  };
  env.registerVariable("trigger", celTypeOf(scope.trigger, register));
  env.registerVariable("item", scope.item ? celTypeOf(scope.item, register) : "dyn");
  env.registerVariable("steps", celTypeOf(T.object(scope.steps), register));
  env.registerVariable("run", celTypeOf(T.object(RUN_FIELDS), register));
  env.registerVariable("now", TIMESTAMP);
  env.registerVariable("error", "string");
  if (envCache.size >= ENV_CACHE_LIMIT) envCache.clear();
  envCache.set(signature, env);
  return env;
}

function firstLine(message: string): string {
  return message.split("\n")[0]?.trim() ?? message;
}

export function toCel(value: unknown, type: ValueType): unknown {
  switch (type.kind) {
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return value == null ? "" : JSON.stringify(value);
    case "number":
      return typeof value === "number" ? value : Number(value ?? 0) || 0;
    case "integer":
      return BigInt(Math.trunc(typeof value === "number" ? value : Number(value ?? 0) || 0));
    case "boolean":
      return value === true;
    case "date": {
      const date = value instanceof Date ? value : new Date(typeof value === "string" ? value : 0);
      return Number.isNaN(date.getTime()) ? new Date(0) : date;
    }
    case "json":
      return value ?? null;
    case "list":
      return Array.isArray(value) ? value.map((entry) => toCel(entry, type.of)) : [];
    default: {
      const fields = fieldsOf(type) ?? {};
      const source = isRecord(value) ? value : {};
      const name =
        type.kind === "object" ? objectTypeName(type.fields) : RECORD_TYPE_NAMES[type.kind];
      const Cls = classFor(name);
      return new Cls(
        Object.fromEntries(
          Object.entries(fields).map(([field, fieldType]) => [
            field,
            toCel(source[field] ?? emptyValue(fieldType), fieldType),
          ]),
        ),
      );
    }
  }
}

export function fromCel(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(fromCel);
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), fromCel(v)]));
  }
  if (value && typeof value === "object") {
    if ("hasValue" in value && typeof value.hasValue === "function") {
      return value.hasValue() && "value" in value ? fromCel(value.value) : null;
    }
    if ("seconds" in value && typeof value.seconds === "bigint") return Number(value.seconds);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromCel(v)]));
  }
  return value;
}

export function stringify(value: unknown): string {
  const plain = fromCel(value);
  if (plain == null) return "";
  if (typeof plain === "string") return plain;
  if (typeof plain === "number" || typeof plain === "boolean") return String(plain);
  if (Array.isArray(plain) && plain.every((entry) => typeof entry !== "object")) {
    return plain.join(", ");
  }
  return JSON.stringify(plain);
}

const TEMPLATE_PART = /\{\{([\s\S]+?)\}\}/g;

export function templateExpressions(text: string): string[] {
  return [...text.matchAll(TEMPLATE_PART)].map((match) => (match[1] ?? "").trim());
}

export type BindingCheck = { ok: true; type: ValueType } | { ok: false; error: string };

export function inferType(cel: string, scope: Scope): BindingCheck {
  if (!cel.trim()) return { ok: false, error: "Write an expression" };
  try {
    const result = scopeEnvironment(scope).check(cel);
    if (!result.valid) {
      return { ok: false, error: firstLine(result.error?.message ?? "Invalid expression") };
    }
    return { ok: true, type: celToValueType(result.type) };
  } catch (err) {
    return { ok: false, error: firstLine(err instanceof Error ? err.message : String(err)) };
  }
}

export function checkBinding(binding: Binding, expected: ValueType, scope: Scope): BindingCheck {
  if (binding.kind === "literal") {
    const parsed = valueSchema(expected).safeParse(binding.value);
    return parsed.success
      ? { ok: true, type: expected }
      : { ok: false, error: `Expected ${typeLabel(expected).toLowerCase()}` };
  }
  if (binding.kind === "template") {
    if (!isAssignable(T.text, expected)) {
      return { ok: false, error: `Expected ${typeLabel(expected).toLowerCase()}, not text` };
    }
    for (const part of templateExpressions(binding.text)) {
      const checked = inferType(part, scope);
      if (!checked.ok) return checked;
    }
    return { ok: true, type: T.text };
  }
  const checked = inferType(binding.cel, scope);
  if (!checked.ok) return checked;
  if (!isAssignable(checked.type, expected)) {
    return {
      ok: false,
      error: `This gives ${typeLabel(checked.type).toLowerCase()}, but ${typeLabel(expected).toLowerCase()} is needed`,
    };
  }
  return checked;
}

function celContext(values: EvalValues, scope: Scope): Record<string, unknown> {
  return {
    trigger: toCel(values.trigger, scope.trigger),
    item: scope.item ? toCel(values.item, scope.item) : (values.item ?? null),
    steps: toCel(values.steps, T.object(scope.steps)),
    run: toCel(values.run, T.object(RUN_FIELDS)),
    now: values.now,
    error: values.error,
  };
}

export class ExpressionError extends Error {}

let activeZone = "Etc/UTC";

function evaluateCel(
  cel: string,
  context: Record<string, unknown>,
  scope: Scope,
  zone: string,
): unknown {
  const outer = activeZone;
  activeZone = zone;
  try {
    return scopeEnvironment(scope).evaluate(cel, context);
  } catch (err) {
    throw new ExpressionError(firstLine(err instanceof Error ? err.message : String(err)));
  } finally {
    activeZone = outer;
  }
}

function coerce(value: unknown, expected: ValueType): unknown {
  const plain = fromCel(value);
  if (expected.kind === "text") return stringify(plain);
  if (expected.kind === "number" || expected.kind === "integer") {
    return typeof plain === "number" ? plain : Number(plain);
  }
  return plain;
}

export function evaluateBinding(
  binding: Binding,
  expected: ValueType,
  values: EvalValues,
  scope: Scope,
): unknown {
  if (binding.kind === "literal") return binding.value;
  const context = celContext(values, scope);
  if (binding.kind === "template") {
    return binding.text.replace(TEMPLATE_PART, (_match, part: string) =>
      stringify(evaluateCel(part.trim(), context, scope, values.timezone)),
    );
  }
  return coerce(evaluateCel(binding.cel, context, scope, values.timezone), expected);
}

export function evaluateExpression(cel: string, values: EvalValues, scope: Scope): unknown {
  return fromCel(evaluateCel(cel, celContext(values, scope), scope, values.timezone));
}

export function isRecordValueType(type: ValueType): boolean {
  return isRecordKind(type.kind);
}
