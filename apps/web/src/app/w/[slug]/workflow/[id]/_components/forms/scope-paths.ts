import type { Scope } from "@/workflow/expr";
import type { GraphShape } from "@/workflow/schema";
import { nodeTitle } from "@/workflow/steps";
import { fieldsOf, typeLabel, type ValueType } from "@/workflow/values";

export interface ScopePath {
  path: string;
  type: ValueType;
  label: string;
}

export interface ScopeGroup {
  heading: string;
  paths: ScopePath[];
}

function expand(root: string, type: ValueType, depth: number): ScopePath[] {
  const own: ScopePath = { path: root, type, label: typeLabel(type) };
  const fields = fieldsOf(type);
  if (!fields || depth <= 0) return [own];
  return [
    own,
    ...Object.entries(fields).flatMap(([name, field]) => {
      const fieldPath = `${root}.${name}`;
      const nested = field.kind === "object" ? expand(fieldPath, field, depth - 1) : [];
      return nested.length > 0
        ? nested
        : [{ path: fieldPath, type: field, label: typeLabel(field) }];
    }),
  ];
}

export function scopeGroups(scope: Scope, graph: GraphShape): ScopeGroup[] {
  const groups: ScopeGroup[] = [];
  if (scope.item) groups.push({ heading: "This item", paths: expand("item", scope.item, 2) });
  groups.push({ heading: "Trigger", paths: expand("trigger", scope.trigger, 2) });
  for (const [id, type] of Object.entries(scope.steps)) {
    const node = graph.nodes.find((n) => n.id === id);
    groups.push({ heading: node ? nodeTitle(node) : id, paths: expand(`steps.${id}`, type, 2) });
  }
  groups.push({
    heading: "Run",
    paths: [
      { path: "now", type: { kind: "date" }, label: "Date" },
      { path: "run.workflow", type: { kind: "text" }, label: "Text" },
      { path: "run.startedAt", type: { kind: "date" }, label: "Date" },
      { path: "run.id", type: { kind: "text" }, label: "Text" },
    ],
  });
  return groups;
}
