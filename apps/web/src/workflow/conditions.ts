import type { ValueType } from "./values";

export type RuleKind = "text" | "number" | "boolean" | "date" | "list";

export const RULE_OPS = {
  text: [
    "contains",
    "notContains",
    "is",
    "isNot",
    "startsWith",
    "endsWith",
    "matches",
    "isEmpty",
    "isNotEmpty",
  ],
  number: ["eq", "ne", "gt", "ge", "lt", "le"],
  boolean: ["isTrue", "isFalse"],
  date: ["before", "after"],
  list: ["has", "hasNot", "isEmpty", "isNotEmpty"],
} as const;

export type RuleOp = (typeof RULE_OPS)[RuleKind][number];

export const RULE_OP_LABELS: Record<RuleOp, string> = {
  contains: "contains",
  notContains: "does not contain",
  is: "is",
  isNot: "is not",
  startsWith: "starts with",
  endsWith: "ends with",
  matches: "matches pattern",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  eq: "=",
  ne: "≠",
  gt: ">",
  ge: "≥",
  lt: "<",
  le: "≤",
  isTrue: "is yes",
  isFalse: "is no",
  before: "is before",
  after: "is after",
  has: "includes",
  hasNot: "does not include",
};

export const VALUELESS_OPS = new Set<RuleOp>(["isEmpty", "isNotEmpty", "isTrue", "isFalse"]);

export interface Rule {
  type: "rule";
  path: string;
  op: RuleOp;
  value: string;
}

export interface RuleGroup {
  type: "group";
  logic: "all" | "any";
  rules: (Rule | RuleGroup)[];
}

export function ruleKind(type: ValueType): RuleKind | null {
  switch (type.kind) {
    case "text":
      return "text";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "list":
      return type.of.kind === "text" ? "list" : null;
    default:
      return null;
  }
}

const PATH = /^(?:item|trigger|steps\.[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function quote(value: string): string {
  return JSON.stringify(value);
}

function ruleCel(rule: Rule): string {
  const { path, value } = rule;
  const lowered = quote(value.toLowerCase());
  switch (rule.op) {
    case "contains":
      return `lower(${path}).contains(${lowered})`;
    case "notContains":
      return `!lower(${path}).contains(${lowered})`;
    case "is":
      return `lower(${path}) == ${lowered}`;
    case "isNot":
      return `lower(${path}) != ${lowered}`;
    case "startsWith":
      return `lower(${path}).startsWith(${lowered})`;
    case "endsWith":
      return `lower(${path}).endsWith(${lowered})`;
    case "matches":
      return `${path}.matches(${quote(value)})`;
    case "isEmpty":
      return `size(${path}) == 0`;
    case "isNotEmpty":
      return `size(${path}) != 0`;
    case "eq":
      return `${path} == ${Number(value) || 0}`;
    case "ne":
      return `${path} != ${Number(value) || 0}`;
    case "gt":
      return `${path} > ${Number(value) || 0}`;
    case "ge":
      return `${path} >= ${Number(value) || 0}`;
    case "lt":
      return `${path} < ${Number(value) || 0}`;
    case "le":
      return `${path} <= ${Number(value) || 0}`;
    case "isTrue":
      return `${path} == true`;
    case "isFalse":
      return `${path} == false`;
    case "before":
      return `${path} < timestamp(${quote(value)})`;
    case "after":
      return `${path} > timestamp(${quote(value)})`;
    case "has":
      return `${quote(value)} in ${path}`;
    case "hasNot":
      return `!(${quote(value)} in ${path})`;
  }
}

export function groupCel(group: RuleGroup): string {
  const parts = group.rules.map((rule) =>
    rule.type === "group" ? `(${groupCel(rule)})` : ruleCel(rule),
  );
  if (parts.length === 0) return "true";
  return parts.join(group.logic === "all" ? " && " : " || ");
}

function splitTop(text: string, separator: "&&" | "||"): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0 && text.startsWith(` ${separator} `, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length + 2;
      i += separator.length + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0 || inString) return null;
  parts.push(text.slice(start));
  return parts;
}

function unquote(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

const LEAF_PATTERNS: { re: RegExp; op: RuleOp; value: (m: RegExpMatchArray) => string | null }[] = [
  {
    re: /^lower\((.+)\)\.contains\(("(?:[^"\\]|\\.)*")\)$/,
    op: "contains",
    value: (m) => unquote(m[2] ?? ""),
  },
  {
    re: /^!lower\((.+)\)\.contains\(("(?:[^"\\]|\\.)*")\)$/,
    op: "notContains",
    value: (m) => unquote(m[2] ?? ""),
  },
  { re: /^lower\((.+)\) == ("(?:[^"\\]|\\.)*")$/, op: "is", value: (m) => unquote(m[2] ?? "") },
  { re: /^lower\((.+)\) != ("(?:[^"\\]|\\.)*")$/, op: "isNot", value: (m) => unquote(m[2] ?? "") },
  {
    re: /^lower\((.+)\)\.startsWith\(("(?:[^"\\]|\\.)*")\)$/,
    op: "startsWith",
    value: (m) => unquote(m[2] ?? ""),
  },
  {
    re: /^lower\((.+)\)\.endsWith\(("(?:[^"\\]|\\.)*")\)$/,
    op: "endsWith",
    value: (m) => unquote(m[2] ?? ""),
  },
  {
    re: /^(.+)\.matches\(("(?:[^"\\]|\\.)*")\)$/,
    op: "matches",
    value: (m) => unquote(m[2] ?? ""),
  },
  { re: /^size\((.+)\) == 0$/, op: "isEmpty", value: () => "" },
  { re: /^size\((.+)\) != 0$/, op: "isNotEmpty", value: () => "" },
  { re: /^(.+) == true$/, op: "isTrue", value: () => "" },
  { re: /^(.+) == false$/, op: "isFalse", value: () => "" },
  {
    re: /^(.+) < timestamp\(("(?:[^"\\]|\\.)*")\)$/,
    op: "before",
    value: (m) => unquote(m[2] ?? ""),
  },
  {
    re: /^(.+) > timestamp\(("(?:[^"\\]|\\.)*")\)$/,
    op: "after",
    value: (m) => unquote(m[2] ?? ""),
  },
  { re: /^!\(("(?:[^"\\]|\\.)*") in (.+)\)$/, op: "hasNot", value: (m) => unquote(m[1] ?? "") },
  { re: /^("(?:[^"\\]|\\.)*") in (.+)$/, op: "has", value: (m) => unquote(m[1] ?? "") },
  { re: /^(.+) == (-?\d+(?:\.\d+)?)$/, op: "eq", value: (m) => m[2] ?? null },
  { re: /^(.+) != (-?\d+(?:\.\d+)?)$/, op: "ne", value: (m) => m[2] ?? null },
  { re: /^(.+) >= (-?\d+(?:\.\d+)?)$/, op: "ge", value: (m) => m[2] ?? null },
  { re: /^(.+) <= (-?\d+(?:\.\d+)?)$/, op: "le", value: (m) => m[2] ?? null },
  { re: /^(.+) > (-?\d+(?:\.\d+)?)$/, op: "gt", value: (m) => m[2] ?? null },
  { re: /^(.+) < (-?\d+(?:\.\d+)?)$/, op: "lt", value: (m) => m[2] ?? null },
];

function parseLeaf(text: string): Rule | null {
  for (const pattern of LEAF_PATTERNS) {
    const match = text.match(pattern.re);
    if (!match) continue;
    const pathFirst = pattern.op !== "has" && pattern.op !== "hasNot";
    const path = (pathFirst ? match[1] : match[2]) ?? "";
    const value = pattern.value(match);
    if (!PATH.test(path) || value === null) continue;
    return { type: "rule", path, op: pattern.op, value };
  }
  return null;
}

function parseGroup(text: string, depth: number): RuleGroup | null {
  if (depth > 4) return null;
  const trimmed = text.trim();
  for (const [separator, logic] of [
    ["||", "any"],
    ["&&", "all"],
  ] as const) {
    const parts = splitTop(trimmed, separator);
    if (!parts) return null;
    if (parts.length < 2) continue;
    const rules: (Rule | RuleGroup)[] = [];
    for (const part of parts) {
      const inner = part.trim();
      if (inner.startsWith("(") && inner.endsWith(")") && splitTop(inner.slice(1, -1), "&&")) {
        const nested = parseGroup(inner.slice(1, -1), depth + 1);
        if (!nested) return null;
        rules.push(nested);
        continue;
      }
      const leaf = parseLeaf(inner);
      if (!leaf) return null;
      rules.push(leaf);
    }
    return { type: "group", logic, rules };
  }
  if (trimmed === "true") return { type: "group", logic: "all", rules: [] };
  const leaf = parseLeaf(trimmed);
  return leaf ? { type: "group", logic: "all", rules: [leaf] } : null;
}

export function parseCondition(cel: string): RuleGroup | null {
  if (!cel.trim()) return { type: "group", logic: "all", rules: [] };
  return parseGroup(cel, 0);
}
