"use client";

import { Checkbox } from "@metis/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metis/ui/components/input-group";
import { cn } from "@metis/ui/lib/utils";
import { ChevronRight, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { isSensitiveTool, type McpToolKey, type McpToolPrefs, type mcpToolsFor } from "@/mcp/tools";

type McpTool = ReturnType<typeof mcpToolsFor>[number];

const TIERS = [
  {
    sensitive: false,
    title: "Non-sensitive",
    detail: "Read and organize your mail, calendars, drives and contacts",
    icon: ShieldCheck,
  },
  {
    sensitive: true,
    title: "Sensitive",
    detail: "Send, delete, change events and files, run workflows, manage members",
    icon: ShieldAlert,
  },
] as const;

export function McpToolPicker({
  tools,
  value,
  onChange,
  disabled,
}: {
  tools: readonly McpTool[];
  value: McpToolPrefs;
  onChange: (patch: Partial<Record<McpToolKey, boolean>>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {TIERS.map((tier) => (
        <McpToolTier
          key={tier.title}
          tier={tier}
          tools={tools.filter((t) => isSensitiveTool(t.key) === tier.sensitive)}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function McpToolTier({
  tier,
  tools,
  value,
  onChange,
  disabled,
}: {
  tier: (typeof TIERS)[number];
  tools: readonly McpTool[];
  value: McpToolPrefs;
  onChange: (patch: Partial<Record<McpToolKey, boolean>>) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? tools.filter((t) =>
        [t.label, t.description, t.group].some((field) => field.toLowerCase().includes(needle)),
      )
    : tools;
  const groups = [...new Set(shown.map((t) => t.group))];
  const enabled = tools.filter((t) => value[t.key] === true).length;
  const all = enabled === tools.length;
  const Icon = tier.icon;

  if (tools.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-lg border",
        tier.sensitive ? "border-destructive/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          checked={all}
          indeterminate={enabled > 0 && !all}
          disabled={disabled}
          onCheckedChange={() => onChange(Object.fromEntries(tools.map((t) => [t.key, !all])))}
          aria-label={`Turn every ${tier.title.toLowerCase()} tool ${all ? "off" : "on"}`}
        />
        <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <Icon
            className={cn(
              "size-4 shrink-0",
              tier.sensitive ? "text-destructive-muted" : "text-faint",
            )}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[13px] font-medium",
                tier.sensitive ? "text-destructive-text" : "text-foreground",
              )}
            >
              {tier.title}
            </span>
            <span className="block text-[12px] text-faint">{tier.detail}</span>
          </span>
          <span className="shrink-0 font-mono text-[12px] text-faint tabular-nums">
            {enabled} / {tools.length}
          </span>
          <ChevronRight
            className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-4 border-t border-border px-3 py-3">
        <InputGroup>
          <InputGroupAddon>
            <Search className="size-3.5 text-faint" />
          </InputGroupAddon>
          <InputGroupInput
            className="text-[13px]"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tier.title.toLowerCase()} tools`}
            aria-label={`Search ${tier.title.toLowerCase()} tools`}
          />
        </InputGroup>
        {groups.length === 0 && (
          <p className="px-1.5 text-[12px] text-faint">
            No {tier.title.toLowerCase()} tool matches &ldquo;{query.trim()}
            &rdquo;
          </p>
        )}
        {groups.map((group) => (
          <section key={group}>
            <h4 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              {group}
            </h4>
            <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {shown
                .filter((t) => t.group === group)
                .map((tool) => (
                  <label
                    key={tool.key}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-hover"
                  >
                    <Checkbox
                      checked={value[tool.key] === true}
                      disabled={disabled}
                      onCheckedChange={(checked) => onChange({ [tool.key]: checked })}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-foreground">{tool.label}</span>
                      <span className="mt-0.5 block text-[12px] text-faint">
                        {tool.description}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </section>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
