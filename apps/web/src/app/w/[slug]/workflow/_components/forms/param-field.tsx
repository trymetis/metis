"use client";

import { Input } from "@metis/ui/components/input";
import { Slider } from "@metis/ui/components/slider";
import { Switch } from "@metis/ui/components/switch";
import { format } from "date-fns";
import { useId, useState } from "react";

import { MAIL_FOLDERS } from "@/types/mail";
import { type Binding, expr, inferType, literal, type Scope, template } from "@/workflow/expr";
import {
  AI_FIELD_TYPES,
  FIELD_TYPES,
  parseAssignments,
  parseCases,
  parseCategories,
  parseFieldDecls,
  parseHeaderRules,
  parseStrings,
} from "@/workflow/fields";
import type { GraphNode, GraphShape } from "@/workflow/schema";
import { type ParamSpec, stepDef } from "@/workflow/steps";
import { hiddenParam } from "@/workflow/validation";
import { fieldsOf } from "@/workflow/values";

import { useEditorEnv } from "../editor-context";
import { useLabelOptions } from "../label-options";
import { ExpressionInput, ExpressionToggle, ParamRow, TemplateInput } from "./binding-editor";
import { ConditionBuilder } from "./condition-builder";
import { FormSelect } from "./form-select";
import { jsonOf } from "./json";
import {
  AssignmentsEditor,
  CasesEditor,
  CategoriesEditor,
  FieldsEditor,
  HeadersEditor,
  MembersEditor,
  StringsEditor,
} from "./list-editors";
import { QuestionsEditor } from "./questions-editor";
import { ScheduleEditor, TimezoneSelect } from "./schedule-editor";

const ANY = "__any";

type Change = (next: Binding | undefined) => void;

function literalString(bound: Binding | undefined): string {
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
}

function textOf(bound: Binding | undefined): string {
  if (bound?.kind === "template") return bound.text;
  if (bound?.kind === "literal" && bound.value != null) {
    return typeof bound.value === "string" || typeof bound.value === "number"
      ? String(bound.value)
      : "";
  }
  return "";
}

function textBinding(text: string): Binding | undefined {
  if (!text) return undefined;
  return text.includes("{{") ? template(text) : literal(text);
}

function localDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd'T'HH:mm");
}

function EmailsInput({ id, value, onChange }: { id: string; value: unknown; onChange: Change }) {
  const [draft, setDraft] = useState(() => (Array.isArray(value) ? value.join(", ") : ""));
  return (
    <Input
      id={id}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const list = e.target.value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        onChange(list.length > 0 ? literal(list) : undefined);
      }}
      placeholder="ada@example.com, team@example.com"
      className="text-[13px]"
    />
  );
}

const AI_FIELD_STEPS = new Set(["ai.generate", "ai.extract", "ai.agent"]);

function ResourceSelect({
  id,
  spec,
  bound,
  onChange,
  entries,
  anyLabel,
}: {
  id: string;
  spec: ParamSpec;
  bound: Binding | undefined;
  onChange: Change;
  entries: readonly { id: string; name: string }[];
  anyLabel: string;
}) {
  const value = literalString(bound);
  const options = [
    ...(spec.required ? [] : [{ value: ANY, label: anyLabel }]),
    ...entries.map((entry) => ({ value: entry.id, label: entry.name })),
    ...(value && !entries.some((entry) => entry.id === value)
      ? [{ value, label: "Not in this workspace" }]
      : []),
  ];
  return (
    <FormSelect
      id={id}
      label={spec.label}
      value={value || (spec.required ? "" : ANY)}
      onValueChange={(next) => onChange(next === ANY ? undefined : literal(next))}
      options={options}
    />
  );
}

function ValueEditor({
  id,
  node,
  spec,
  bound,
  onChange,
}: {
  id: string;
  node: GraphNode;
  spec: ParamSpec;
  bound: Binding | undefined;
  onChange: Change;
}) {
  const { directory, workflows, workflowId } = useEditorEnv();
  const labels = useLabelOptions();
  const value = bound?.kind === "literal" ? bound.value : undefined;

  switch (spec.kind) {
    case "number":
      if (spec.min === 0 && spec.max === 1) {
        return (
          <Slider
            id={id}
            aria-label={spec.label}
            min={0}
            max={100}
            step={1}
            value={[Math.round((typeof value === "number" ? value : 0) * 100)]}
            onValueChange={(next) => {
              const raw = Array.isArray(next) ? next[0] : next;
              if (typeof raw === "number") onChange(literal(raw / 100));
            }}
          />
        );
      }
      return (
        <Input
          id={id}
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.max !== undefined && spec.max <= 1 ? 0.05 : 1}
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : literal(Number(e.target.value)))
          }
          className="text-[13px]"
        />
      );
    case "boolean":
      return (
        <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(literal(on))} />
      );
    case "select":
      return (
        <FormSelect
          id={id}
          label={spec.label}
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => onChange(literal(next))}
          options={spec.options ?? []}
        />
      );
    case "mailFolder": {
      const options =
        spec.options ??
        MAIL_FOLDERS.map((folder) => ({
          value: folder,
          label: folder[0]?.toUpperCase() + folder.slice(1),
        }));
      return (
        <FormSelect
          id={id}
          label={spec.label}
          value={typeof value === "string" ? value : "inbox"}
          onValueChange={(next) => onChange(literal(next))}
          options={options}
        />
      );
    }
    case "label":
      return (
        <FormSelect
          id={id}
          label={spec.label}
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => onChange(literal(next))}
          options={labels}
        />
      );
    case "mailbox":
      return (
        <ResourceSelect
          id={id}
          spec={spec}
          bound={bound}
          onChange={onChange}
          entries={directory.mailboxes}
          anyLabel="Any mailbox"
        />
      );
    case "calendar":
      return (
        <ResourceSelect
          id={id}
          spec={spec}
          bound={bound}
          onChange={onChange}
          entries={directory.calendars}
          anyLabel="Any calendar"
        />
      );
    case "drive":
      return (
        <ResourceSelect
          id={id}
          spec={spec}
          bound={bound}
          onChange={onChange}
          entries={directory.drives}
          anyLabel="Any drive"
        />
      );
    case "workflow": {
      const others = workflows.filter((w) => w.id !== workflowId);
      const current = typeof value === "string" ? value : "";
      return (
        <FormSelect
          id={id}
          label={spec.label}
          value={current || (spec.required ? "" : ANY)}
          onValueChange={(next) => onChange(next === ANY ? undefined : literal(next))}
          options={[
            ...(spec.required ? [] : [{ value: ANY, label: "Any workflow" }]),
            ...others.map((w) => ({
              value: w.id,
              label: w.callable ? w.name : `${w.name} (not callable)`,
            })),
          ]}
        />
      );
    }
    case "emails":
      return <EmailsInput id={id} value={value} onChange={onChange} />;
    case "datetime":
      return (
        <Input
          id={id}
          type="datetime-local"
          value={typeof value === "string" ? localDateTime(value) : ""}
          onChange={(e) => {
            const date = new Date(e.target.value);
            onChange(Number.isNaN(date.getTime()) ? undefined : literal(date.toISOString()));
          }}
          className="text-[13px]"
        />
      );
    case "timezone":
      return (
        <TimezoneSelect
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(zone) => onChange(literal(zone))}
        />
      );
    case "cron":
      return (
        <ScheduleEditor
          cron={typeof value === "string" ? value : "0 9 * * 1-5"}
          timezone={literalString(node.params.timezone)}
          onChange={(cron) => onChange(literal(cron))}
        />
      );
    default:
      return null;
  }
}

const EXPRESSION_KINDS = new Set(["expr", "condition"]);
const TEXT_KINDS = new Set(["text", "longtext", "driveFolder"]);
const STRUCTURED_KINDS = new Set([
  "fields",
  "assignments",
  "cases",
  "questions",
  "categories",
  "strings",
  "headers",
  "members",
]);

export function ParamField({
  node,
  name,
  spec,
  scope,
  graph,
  onChange,
}: {
  node: GraphNode;
  name: string;
  spec: ParamSpec;
  scope: Scope;
  graph: GraphShape;
  onChange: Change;
}) {
  const id = useId();
  const { directory, workflows } = useEditorEnv();
  const bound = node.params[name] ?? spec.default;
  const literalValue = bound?.kind === "literal" ? bound.value : undefined;

  if (spec.kind === "condition") {
    return (
      <ParamRow label={spec.label} htmlFor={id} required={spec.required} help={spec.help}>
        <ConditionBuilder
          id={id}
          label={spec.label}
          cel={bound?.kind === "expr" ? bound.cel : ""}
          onChange={(cel) => onChange(cel.trim() ? expr(cel) : undefined)}
          type={spec.type}
          scope={scope}
          graph={graph}
          placeholder={spec.placeholder ?? 'item.from.endsWith("@example.com")'}
        />
      </ParamRow>
    );
  }

  if (EXPRESSION_KINDS.has(spec.kind)) {
    return (
      <ParamRow label={spec.label} htmlFor={id} required={spec.required} help={spec.help}>
        <ExpressionInput
          id={id}
          label={spec.label}
          value={bound?.kind === "expr" ? bound.cel : ""}
          onChange={(cel) => onChange(cel.trim() ? expr(cel) : undefined)}
          type={spec.type}
          scope={scope}
          graph={graph}
          placeholder={spec.placeholder ?? "item"}
        />
      </ParamRow>
    );
  }

  if (TEXT_KINDS.has(spec.kind)) {
    return (
      <ParamRow label={spec.label} htmlFor={id} required={spec.required} help={spec.help}>
        <TemplateInput
          id={id}
          label={spec.label}
          value={textOf(bound)}
          onChange={(text) => onChange(textBinding(text))}
          multiline={spec.kind === "longtext"}
          scope={scope}
          graph={graph}
          placeholder={spec.placeholder ?? (spec.kind === "driveFolder" ? "/Invoices" : undefined)}
        />
      </ParamRow>
    );
  }

  if (STRUCTURED_KINDS.has(spec.kind)) {
    let editor = null;
    switch (spec.kind) {
      case "fields":
        editor = (
          <FieldsEditor
            value={parseFieldDecls(literalValue)}
            onChange={(next) => onChange(literal(jsonOf(next)))}
            types={AI_FIELD_STEPS.has(node.step) ? AI_FIELD_TYPES : FIELD_TYPES}
          />
        );
        break;
      case "assignments": {
        const target =
          node.step === "flow.call"
            ? workflows.find((w) => w.id === literalString(node.params.workflow))
            : undefined;
        editor = (
          <AssignmentsEditor
            value={parseAssignments(literalValue)}
            onChange={(next) => onChange(literal(jsonOf(next)))}
            scope={scope}
            graph={graph}
            names={target?.inputs}
          />
        );
        break;
      }
      case "cases":
        editor = (
          <CasesEditor
            value={parseCases(literalValue)}
            onChange={(next) => onChange(literal(jsonOf(next)))}
            scope={scope}
            graph={graph}
          />
        );
        break;
      case "categories":
        editor = (
          <CategoriesEditor
            value={parseCategories(literalValue)}
            onChange={(next) => onChange(literal(jsonOf(next)))}
          />
        );
        break;
      case "headers":
        editor = (
          <HeadersEditor
            value={parseHeaderRules(literalValue)}
            onChange={(next) => onChange(literal(jsonOf(next)))}
          />
        );
        break;
      case "members":
        editor = (
          <MembersEditor
            value={parseStrings(literalValue)}
            onChange={(next) => onChange(next.length > 0 ? literal(next) : undefined)}
            members={directory.members}
          />
        );
        break;
      case "questions":
        editor = <QuestionsEditor node={node} onChange={onChange} />;
        break;
      case "strings": {
        const subject =
          node.step === "ai.ask" && node.params.subject?.kind === "expr"
            ? inferType(node.params.subject.cel, scope)
            : null;
        const fields = subject?.ok ? fieldsOf(subject.type) : null;
        editor = (
          <StringsEditor
            value={parseStrings(literalValue)}
            onChange={(next) => onChange(literal(next))}
            suggestions={fields ? Object.keys(fields) : []}
            placeholder={name === "ips" ? "203.0.113.0/24" : undefined}
          />
        );
        break;
      }
    }
    return (
      <ParamRow label={spec.label} required={spec.required} help={spec.help}>
        {editor}
      </ParamRow>
    );
  }

  const isExpr = bound?.kind === "expr";
  const toggle = spec.bindable ? (
    <ExpressionToggle on={isExpr} onToggle={(on) => onChange(on ? expr("") : spec.default)} />
  ) : null;

  const percent =
    spec.kind === "number" && spec.min === 0 && spec.max === 1 && literalValue !== undefined
      ? ` ${Math.round((typeof literalValue === "number" ? literalValue : 0) * 100)}%`
      : "";

  return (
    <ParamRow
      label={`${spec.label}${percent}`}
      htmlFor={id}
      required={spec.required}
      help={spec.help}
      action={toggle}
    >
      {isExpr ? (
        <ExpressionInput
          id={id}
          label={spec.label}
          value={bound.cel}
          onChange={(cel) => onChange(expr(cel))}
          type={spec.type}
          scope={scope}
          graph={graph}
          placeholder={spec.placeholder}
        />
      ) : (
        <ValueEditor id={id} node={node} spec={spec} bound={bound} onChange={onChange} />
      )}
    </ParamRow>
  );
}

export function visibleParams(node: GraphNode): [string, ParamSpec][] {
  const def = stepDef(node.step);
  if (!def) return [];
  return Object.entries(def.params).filter(([name]) => !hiddenParam(node, def, name));
}
