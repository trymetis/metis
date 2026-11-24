"use client";

import { Input } from "@metis/ui/components/input";
import { Switch } from "@metis/ui/components/switch";
import { Textarea } from "@metis/ui/components/textarea";
import { useId, useState } from "react";

import { type FieldDecl, FIELD_TYPE_LABELS, parseFieldDecls } from "@/workflow/fields";
import type { GraphNode } from "@/workflow/schema";
import type { Json } from "@/workflow/values";

import { ParamRow } from "./forms/binding-editor";
import { jsonOf } from "./forms/json";

export type InputValues = Record<string, Json>;

export function triggerInputs(node: GraphNode | undefined): FieldDecl[] {
  if (!node) return [];
  const bound = node.params.inputs ?? node.params.body;
  return bound?.kind === "literal" ? parseFieldDecls(bound.value) : [];
}

function JsonInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Json | undefined;
  onChange: (next: Json | undefined) => void;
}) {
  const [draft, setDraft] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 1),
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Textarea
        id={id}
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(jsonOf(JSON.parse(draft)));
            setError(null);
          } catch {
            setError("Write valid JSON");
          }
        }}
        className="min-h-16 font-mono text-[12px]"
      />
      {error && <p className="text-[11px] text-destructive-text">{error}</p>}
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDecl;
  value: Json | undefined;
  onChange: (next: Json | undefined) => void;
}) {
  const id = useId();
  let control;
  switch (field.type) {
    case "text":
      control = (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-[13px]"
        />
      );
      break;
    case "number":
      control = (
        <Input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="text-[13px]"
        />
      );
      break;
    case "boolean":
      control = <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} />;
      break;
    case "date":
      control = (
        <Input
          id={id}
          type="datetime-local"
          onChange={(e) => {
            const date = new Date(e.target.value);
            onChange(Number.isNaN(date.getTime()) ? undefined : date.toISOString());
          }}
          className="text-[13px]"
        />
      );
      break;
    default:
      control = <JsonInput id={id} value={value} onChange={onChange} />;
  }
  return (
    <ParamRow
      label={`${field.name} · ${FIELD_TYPE_LABELS[field.type]}`}
      htmlFor={id}
      required={field.required}
      help={field.description}
    >
      {control}
    </ParamRow>
  );
}

export function InputsForm({
  fields,
  value,
  onChange,
}: {
  fields: readonly FieldDecl[];
  value: InputValues;
  onChange: (next: InputValues) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={value[field.name]}
          onChange={(next) => {
            const copy = { ...value };
            if (next === undefined) delete copy[field.name];
            else copy[field.name] = next;
            onChange(copy);
          }}
        />
      ))}
    </div>
  );
}
