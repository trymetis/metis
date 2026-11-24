"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { Input } from "@metis/ui/components/input";
import { Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { type Binding, expr, literal, type Scope } from "@/workflow/expr";
import {
  type Assignment,
  type Category,
  FIELD_TYPE_LABELS,
  type FieldDecl,
  type FieldType,
  type HeaderRule,
  type SwitchCase,
} from "@/workflow/fields";
import type { GraphShape } from "@/workflow/schema";
import { T } from "@/workflow/values";

import { ExpressionInput, ExpressionToggle, TemplateInput } from "./binding-editor";
import { FormSelect } from "./form-select";
import { nextKey } from "./json";

function Rows({
  children,
  onAdd,
  addLabel,
}: {
  children: ReactNode;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <Button variant="outline" size="sm" className="border-dashed" onClick={onAdd}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

function Row({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <div className="flex items-start gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
        <Button variant="ghost" size="icon-sm" aria-label={removeLabel} onClick={onRemove}>
          <X />
        </Button>
      </div>
    </div>
  );
}

const NO_SUGGESTIONS: readonly string[] = [];

function replaceAt<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((entry, i) => (i === index ? next : entry));
}

export function FieldsEditor({
  value,
  onChange,
  types,
  addLabel = "Field",
}: {
  value: FieldDecl[];
  onChange: (next: FieldDecl[]) => void;
  types: readonly FieldType[];
  addLabel?: string;
}) {
  const options = types.map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type] }));
  return (
    <Rows
      addLabel={addLabel}
      onAdd={() =>
        onChange([
          ...value,
          {
            name: nextKey(
              "field",
              value.map((f) => f.name),
            ),
            type: types[0] ?? "text",
          },
        ])
      }
    >
      {value.map((field, index) => (
        <Row
          // oxlint-disable-next-line react/no-array-index-key -- a field's name is what the user is editing, so rows are positional
          key={index}
          removeLabel={`Remove ${field.name}`}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <div className="flex gap-1.5">
            <Input
              aria-label="Name"
              value={field.name}
              onChange={(e) =>
                onChange(replaceAt(value, index, { ...field, name: e.target.value }))
              }
              placeholder="name"
              className="font-mono text-[12px]"
            />
            <FormSelect
              label="Type"
              className="w-36 shrink-0"
              value={field.type}
              onValueChange={(type) => onChange(replaceAt(value, index, { ...field, type }))}
              options={options}
            />
          </div>
          <Input
            aria-label="Description"
            value={field.description ?? ""}
            onChange={(e) =>
              onChange(
                replaceAt(value, index, { ...field, description: e.target.value || undefined }),
              )
            }
            placeholder="Description (optional)"
            className="text-[13px]"
          />
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Checkbox
              checked={!!field.required}
              onCheckedChange={(on) =>
                onChange(replaceAt(value, index, { ...field, required: on || undefined }))
              }
            />
            Required
          </label>
        </Row>
      ))}
    </Rows>
  );
}

function AssignmentValue({
  binding,
  onChange,
  scope,
  graph,
}: {
  binding: Binding;
  onChange: (next: Binding) => void;
  scope: Scope;
  graph: GraphShape;
}) {
  const isExpr = binding.kind === "expr";
  const text =
    binding.kind === "template"
      ? binding.text
      : binding.kind === "literal" && typeof binding.value === "string"
        ? binding.value
        : "";
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        {isExpr ? (
          <ExpressionInput
            label="Value"
            value={binding.cel}
            onChange={(cel) => onChange(expr(cel))}
            type={T.json}
            scope={scope}
            graph={graph}
            placeholder="item.subject"
          />
        ) : (
          <TemplateInput
            label="Value"
            value={text}
            onChange={(next) =>
              onChange(next.includes("{{") ? { kind: "template", text: next } : literal(next))
            }
            multiline={false}
            scope={scope}
            graph={graph}
          />
        )}
      </div>
      <ExpressionToggle on={isExpr} onToggle={(on) => onChange(on ? expr(text) : literal(""))} />
    </div>
  );
}

export function AssignmentsEditor({
  value,
  onChange,
  scope,
  graph,
  names,
  addLabel = "Value",
}: {
  value: Assignment[];
  onChange: (next: Assignment[]) => void;
  scope: Scope;
  graph: GraphShape;
  names?: readonly string[];
  addLabel?: string;
}) {
  const free = names?.filter((name) => !value.some((entry) => entry.name === name)) ?? [];
  return (
    <Rows
      addLabel={addLabel}
      onAdd={() =>
        onChange([
          ...value,
          {
            name:
              free[0] ??
              nextKey(
                "value",
                value.map((entry) => entry.name),
              ),
            value: literal(""),
          },
        ])
      }
    >
      {value.map((entry, index) => (
        <Row
          // oxlint-disable-next-line react/no-array-index-key -- the name is what the user is editing, so rows are positional
          key={index}
          removeLabel={`Remove ${entry.name}`}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          {names ? (
            <FormSelect
              label="Name"
              value={entry.name}
              onValueChange={(name) => onChange(replaceAt(value, index, { ...entry, name }))}
              options={[...new Set([entry.name, ...names])].map((name) => ({
                value: name,
                label: name,
              }))}
            />
          ) : (
            <Input
              aria-label="Name"
              value={entry.name}
              onChange={(e) =>
                onChange(replaceAt(value, index, { ...entry, name: e.target.value }))
              }
              placeholder="name"
              className="font-mono text-[12px]"
            />
          )}
          <AssignmentValue
            binding={entry.value}
            onChange={(next) => onChange(replaceAt(value, index, { ...entry, value: next }))}
            scope={scope}
            graph={graph}
          />
        </Row>
      ))}
    </Rows>
  );
}

export function CasesEditor({
  value,
  onChange,
  scope,
  graph,
}: {
  value: SwitchCase[];
  onChange: (next: SwitchCase[]) => void;
  scope: Scope;
  graph: GraphShape;
}) {
  return (
    <Rows
      addLabel="Case"
      onAdd={() => {
        const id = nextKey(
          "c",
          value.map((entry) => entry.id),
        );
        onChange([...value, { id, name: `Case ${value.length + 1}`, when: "" }]);
      }}
    >
      {value.map((entry, index) => (
        <Row
          key={entry.id}
          removeLabel={`Remove ${entry.name}`}
          onRemove={() => onChange(value.filter((c) => c.id !== entry.id))}
        >
          <Input
            aria-label="Case name"
            value={entry.name}
            maxLength={40}
            onChange={(e) => onChange(replaceAt(value, index, { ...entry, name: e.target.value }))}
            className="text-[13px]"
          />
          <ExpressionInput
            label={`When ${entry.name}`}
            value={entry.when}
            onChange={(when) => onChange(replaceAt(value, index, { ...entry, when }))}
            type={T.boolean}
            scope={scope}
            graph={graph}
          />
        </Row>
      ))}
    </Rows>
  );
}

export function CategoriesEditor({
  value,
  onChange,
}: {
  value: Category[];
  onChange: (next: Category[]) => void;
}) {
  return (
    <Rows
      addLabel="Category"
      onAdd={() =>
        onChange([
          ...value,
          {
            id: nextKey(
              "cat",
              value.map((entry) => entry.id),
            ),
            name: "",
          },
        ])
      }
    >
      {value.map((entry, index) => (
        <Row
          key={entry.id}
          removeLabel={`Remove ${entry.name || "category"}`}
          onRemove={() => onChange(value.filter((c) => c.id !== entry.id))}
        >
          <Input
            aria-label="Category"
            value={entry.name}
            maxLength={40}
            placeholder="Category"
            onChange={(e) => onChange(replaceAt(value, index, { ...entry, name: e.target.value }))}
            className="text-[13px]"
          />
          <Input
            aria-label="When it applies"
            value={entry.description ?? ""}
            placeholder="When it applies (optional)"
            onChange={(e) =>
              onChange(
                replaceAt(value, index, { ...entry, description: e.target.value || undefined }),
              )
            }
            className="text-[13px]"
          />
        </Row>
      ))}
    </Rows>
  );
}

export function HeadersEditor({
  value,
  onChange,
}: {
  value: HeaderRule[];
  onChange: (next: HeaderRule[]) => void;
}) {
  return (
    <Rows addLabel="Header" onAdd={() => onChange([...value, { name: "", value: "" }])}>
      {value.map((entry, index) => (
        <Row
          // oxlint-disable-next-line react/no-array-index-key -- header rows are positional
          key={index}
          removeLabel={`Remove ${entry.name || "header"}`}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        >
          <Input
            aria-label="Header name"
            value={entry.name}
            placeholder="X-Source"
            onChange={(e) => onChange(replaceAt(value, index, { ...entry, name: e.target.value }))}
            className="font-mono text-[12px]"
          />
          <Input
            aria-label="Required value"
            value={entry.value}
            placeholder="Required value"
            onChange={(e) => onChange(replaceAt(value, index, { ...entry, value: e.target.value }))}
            className="text-[13px]"
          />
        </Row>
      ))}
    </Rows>
  );
}

export function StringsEditor({
  value,
  onChange,
  suggestions = NO_SUGGESTIONS,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (entry: string) => {
    const clean = entry.trim();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setDraft("");
  };
  const offered = suggestions.filter((entry) => !value.includes(entry));
  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((entry) => (
            <li
              key={entry}
              className="flex items-center gap-0.5 rounded-md bg-muted py-0.5 pr-0.5 pl-2 font-mono text-[12px]"
            >
              {entry}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${entry}`}
                onClick={() => onChange(value.filter((v) => v !== entry))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label={placeholder ?? "Add an entry"}
        value={draft}
        placeholder={placeholder ?? "Add an entry and press Enter"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        className="text-[13px]"
      />
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {offered.map((entry) => (
            <Button
              key={entry}
              variant="outline"
              size="xs"
              className="border-dashed font-mono"
              onClick={() => add(entry)}
            >
              <Plus /> {entry}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MembersEditor({
  value,
  onChange,
  members,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  members: readonly { userId: string; name: string; email: string }[];
}) {
  return (
    <ul className="flex flex-col gap-1">
      {members.map((member) => (
        <li key={member.userId}>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox
              checked={value.includes(member.userId)}
              onCheckedChange={(on) =>
                onChange(
                  on ? [...value, member.userId] : value.filter((id) => id !== member.userId),
                )
              }
            />
            <span className="min-w-0 truncate">
              {member.name || member.email}
              {member.name && <span className="text-faint"> · {member.email}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
