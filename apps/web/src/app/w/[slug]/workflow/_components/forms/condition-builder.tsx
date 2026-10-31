"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { cn } from "@metis/ui/lib/utils";
import { FolderPlus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  groupCel,
  parseCondition,
  type Rule,
  type RuleGroup,
  type RuleKind,
  RULE_OP_LABELS,
  RULE_OPS,
  type RuleOp,
  ruleKind,
  VALUELESS_OPS,
} from "@/workflow/conditions";
import type { Scope } from "@/workflow/expr";
import type { GraphShape } from "@/workflow/schema";
import type { ValueType } from "@/workflow/values";

import { BindingCheck, ExpressionInput } from "./binding-editor";
import { FormSelect } from "./form-select";
import { scopeGroups } from "./scope-paths";

interface FieldOption {
  value: string;
  label: string;
  kind: RuleKind;
}

const MAX_DEPTH = 2;

function emptyRule(fields: FieldOption[]): Rule | null {
  const first = fields[0];
  if (!first) return null;
  return { type: "rule", path: first.value, op: RULE_OPS[first.kind][0], value: "" };
}

function RuleRow({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: Rule;
  fields: FieldOption[];
  onChange: (next: Rule) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.value === rule.path);
  const kind = field?.kind ?? "text";
  const ops = RULE_OPS[kind];
  const options = field ? fields : [{ value: rule.path, label: rule.path, kind }, ...fields];
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-1.5">
        <FormSelect
          label="Field"
          className="flex-1"
          value={rule.path}
          onValueChange={(path) => {
            const next = fields.find((f) => f.value === path)?.kind ?? "text";
            const op: RuleOp = (RULE_OPS[next] as readonly RuleOp[]).includes(rule.op)
              ? rule.op
              : RULE_OPS[next][0];
            onChange({ ...rule, path, op });
          }}
          options={options}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={onRemove}>
          <X />
        </Button>
      </div>
      <div className="flex gap-1.5">
        <FormSelect
          label="Comparison"
          className={VALUELESS_OPS.has(rule.op) ? "flex-1" : "w-40 shrink-0"}
          value={rule.op}
          onValueChange={(op) => onChange({ ...rule, op })}
          options={ops.map((op) => ({ value: op, label: RULE_OP_LABELS[op] }))}
        />
        {!VALUELESS_OPS.has(rule.op) && (
          <Input
            aria-label="Value"
            className="text-[13px]"
            type={kind === "number" ? "number" : kind === "date" ? "datetime-local" : "text"}
            value={kind === "date" ? rule.value.slice(0, 16) : rule.value}
            onChange={(e) => {
              const raw = e.target.value;
              const value = kind === "date" && raw ? new Date(raw).toISOString() : raw;
              onChange({ ...rule, value });
            }}
            placeholder={rule.op === "matches" ? "pattern" : "value"}
          />
        )}
      </div>
      {rule.op === "matches" && toPattern(rule.value) === null && (
        <p role="alert" className="text-[11px] text-destructive-text">
          Not a valid pattern.
        </p>
      )}
    </div>
  );
}

function toPattern(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

function GroupEditor({
  group,
  fields,
  depth,
  onChange,
  onRemove,
}: {
  group: RuleGroup;
  fields: FieldOption[];
  depth: number;
  onChange: (next: RuleGroup) => void;
  onRemove?: () => void;
}) {
  const replace = (index: number, next: Rule | RuleGroup) =>
    onChange({ ...group, rules: group.rules.map((rule, i) => (i === index ? next : rule)) });
  const drop = (index: number) =>
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) });
  const fresh = emptyRule(fields);
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border p-2",
        depth > 0 && "bg-panel",
      )}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-muted-foreground">Match</span>
        <FormSelect
          label="Match"
          className="w-20"
          value={group.logic}
          onValueChange={(logic) => onChange({ ...group, logic })}
          options={[
            { value: "all", label: "all" },
            { value: "any", label: "any" },
          ]}
        />
        <span className="flex-1 text-muted-foreground">of these</span>
        {onRemove && (
          <Button variant="ghost" size="icon-sm" aria-label="Remove group" onClick={onRemove}>
            <X />
          </Button>
        )}
      </div>
      {group.rules.map((rule, index) =>
        rule.type === "group" ? (
          <GroupEditor
            // oxlint-disable-next-line react/no-array-index-key -- conditions are positional
            key={index}
            group={rule}
            fields={fields}
            depth={depth + 1}
            onChange={(next) => replace(index, next)}
            onRemove={() => drop(index)}
          />
        ) : (
          <RuleRow
            // oxlint-disable-next-line react/no-array-index-key -- conditions are positional
            key={index}
            rule={rule}
            fields={fields}
            onChange={(next) => replace(index, next)}
            onRemove={() => drop(index)}
          />
        ),
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-dashed"
          disabled={!fresh}
          onClick={() => fresh && onChange({ ...group, rules: [...group.rules, fresh] })}
        >
          <Plus /> Condition
        </Button>
        {depth < MAX_DEPTH && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-dashed"
            disabled={!fresh}
            onClick={() =>
              fresh &&
              onChange({
                ...group,
                rules: [...group.rules, { type: "group", logic: "any", rules: [fresh] }],
              })
            }
          >
            <FolderPlus /> Group
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConditionBuilder({
  id,
  label,
  cel,
  onChange,
  type,
  scope,
  graph,
  placeholder,
}: {
  id?: string;
  label: string;
  cel: string;
  onChange: (cel: string) => void;
  type: ValueType;
  scope: Scope;
  graph: GraphShape;
  placeholder?: string;
}) {
  const [group, setGroup] = useState<RuleGroup | null>(() => parseCondition(cel));
  const [asExpression, setAsExpression] = useState(group === null);
  const fields = useMemo(
    () =>
      scopeGroups(scope, graph).flatMap((section) =>
        section.paths.flatMap((entry): FieldOption[] => {
          const kind = ruleKind(entry.type);
          return kind && entry.path !== "now" && !entry.path.startsWith("run.")
            ? [{ value: entry.path, label: `${section.heading} · ${entry.path}`, kind }]
            : [];
        }),
      ),
    [scope, graph],
  );

  if (asExpression || !group) {
    const parsed = parseCondition(cel);
    return (
      <div className="flex flex-col gap-1">
        <ExpressionInput
          id={id}
          label={label}
          value={cel}
          onChange={onChange}
          type={type}
          scope={scope}
          graph={graph}
          placeholder={placeholder}
        />
        {parsed ? (
          <Button
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => {
              setGroup(parsed);
              setAsExpression(false);
            }}
          >
            Edit as conditions
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            This expression can't be shown as conditions; edit it as text.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <GroupEditor
        group={group}
        fields={fields}
        depth={0}
        onChange={(next) => {
          setGroup(next);
          onChange(next.rules.length === 0 ? "" : groupCel(next));
        }}
      />
      {group.rules.length > 0 && (
        <BindingCheck binding={{ kind: "expr", cel }} type={type} scope={scope} />
      )}
      <Button
        variant="ghost"
        size="xs"
        className="self-start"
        onClick={() => setAsExpression(true)}
      >
        Edit as expression
      </Button>
    </div>
  );
}
