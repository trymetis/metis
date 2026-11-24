"use client";

import { Button } from "@metis/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@metis/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@metis/ui/components/popover";
import { Textarea } from "@metis/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { Braces, SquareFunction } from "lucide-react";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";

import { type Binding, checkBinding, expr, type Scope } from "@/workflow/expr";
import type { GraphShape } from "@/workflow/schema";
import { typeLabel, type ValueType } from "@/workflow/values";

import { scopeGroups } from "./scope-paths";

export function PathPicker({
  scope,
  graph,
  onPick,
  label = "Insert a value from an earlier step",
}: {
  scope: Scope;
  graph: GraphShape;
  onPick: (path: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => scopeGroups(scope, graph), [scope, graph]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={label} className="shrink-0" />
              }
            />
          }
        >
          <Braces />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search values" />
          <CommandList className="max-h-72">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.paths.map((entry) => (
                  <CommandItem
                    key={entry.path}
                    value={`${group.heading} ${entry.path}`}
                    onSelect={() => {
                      onPick(entry.path);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-mono text-[12px]">{entry.path}</span>
                    <span className="shrink-0 text-[11px] text-faint">{entry.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function insertAt(element: HTMLTextAreaElement | null, current: string, text: string): string {
  if (!element) return `${current}${text}`;
  const start = element.selectionStart ?? current.length;
  const end = element.selectionEnd ?? current.length;
  return `${current.slice(0, start)}${text}${current.slice(end)}`;
}

export function BindingCheck({
  binding,
  type,
  scope,
}: {
  binding: Binding;
  type: ValueType;
  scope: Scope;
}) {
  const empty =
    (binding.kind === "expr" && !binding.cel.trim()) ||
    (binding.kind === "template" && !binding.text.trim()) ||
    binding.kind === "literal";
  const checked = useMemo(
    () => (empty ? null : checkBinding(binding, type, scope)),
    [binding, type, scope, empty],
  );
  if (!checked) return null;
  return checked.ok ? (
    <p className="text-[11px] text-faint">Gives {typeLabel(checked.type).toLowerCase()}</p>
  ) : (
    <p role="alert" className="text-[11px] text-destructive-text">
      {checked.error}
    </p>
  );
}

export function ExpressionInput({
  id,
  value,
  onChange,
  type,
  scope,
  graph,
  placeholder,
  label,
}: {
  id?: string;
  value: string;
  onChange: (cel: string) => void;
  type: ValueType;
  scope: Scope;
  graph: GraphShape;
  placeholder?: string;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1">
        <Textarea
          id={id}
          ref={ref}
          aria-label={label}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? 'item.subject.contains("invoice")'}
          className="min-h-9 resize-y py-1.5 font-mono text-[12px]"
          rows={1}
        />
        <PathPicker
          scope={scope}
          graph={graph}
          onPick={(path) => onChange(insertAt(ref.current, value, path))}
        />
      </div>
      <BindingCheck binding={expr(value)} type={type} scope={scope} />
    </div>
  );
}

export function TemplateInput({
  id,
  value,
  onChange,
  multiline,
  scope,
  graph,
  placeholder,
  label,
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  multiline: boolean;
  scope: Scope;
  graph: GraphShape;
  placeholder?: string;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const templated = value.includes("{{");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1">
        <Textarea
          id={id}
          ref={ref}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={multiline ? 4 : 1}
          className={cn("resize-y py-1.5 text-[13px]", multiline ? "min-h-24" : "min-h-9")}
        />
        <PathPicker
          scope={scope}
          graph={graph}
          onPick={(path) => onChange(insertAt(ref.current, value, `{{ ${path} }}`))}
        />
      </div>
      {templated && (
        <BindingCheck
          binding={{ kind: "template", text: value }}
          type={{ kind: "text" }}
          scope={scope}
        />
      )}
    </div>
  );
}

export function ExpressionToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const label = on ? "Use a fixed value" : "Use an expression";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={on ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={on}
            onClick={() => onToggle(!on)}
          />
        }
      >
        <SquareFunction />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ParamRow({
  label,
  htmlFor,
  required,
  help,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  help?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <label
          id={labelId}
          htmlFor={htmlFor}
          className="flex-1 font-medium text-[13px] text-foreground"
        >
          {label}
          {required && <span className="text-destructive-text"> *</span>}
        </label>
        {action}
      </div>
      {children}
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}
