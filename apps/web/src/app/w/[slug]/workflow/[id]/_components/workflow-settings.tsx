"use client";

import { Input } from "@metis/ui/components/input";

import {
  type GraphSettings,
  LIMIT_MODES,
  type LimitMode,
  MAX_CONCURRENCY,
} from "@/workflow/schema";
import { isTriggerStep } from "@/workflow/steps";
import { T } from "@/workflow/values";

import { useDiagnostics, useEditorEnv } from "./editor-context";
import { useEditor, useEditorStore } from "./editor-store";
import { ExpressionInput, ParamRow } from "./forms/binding-editor";
import { FormSelect } from "./forms/form-select";
import { TimezoneSelect } from "./forms/schedule-editor";

const NONE = "none";

const LIMIT_LABELS: Record<LimitMode | typeof NONE, string> = {
  none: "Run for every event",
  debounce: "Wait for a quiet spell, then run once",
  throttle: "Run at most once per period",
};

const LIMIT_CHOICES: readonly (LimitMode | typeof NONE)[] = [NONE, ...LIMIT_MODES];

const EMPTY_SCOPE = { trigger: T.json, item: T.json, steps: {} };

export function WorkflowSettings() {
  const store = useEditorStore();
  const graph = useEditor((s) => s.graph);
  const { types } = useDiagnostics();
  const { workflow } = useEditorEnv();
  const settings = graph.settings;
  const set = (next: GraphSettings) => store.getState().setSettings(next);
  const trigger = graph.nodes.find((n) => isTriggerStep(n.step));
  const triggerScope = (trigger && types.get(trigger.id)?.scope) ?? EMPTY_SCOPE;

  return (
    <section aria-label="Workflow settings" className="flex flex-col gap-4">
      <h3 className="font-medium text-[13px]">Workflow settings</h3>
      {workflow?.disabledReason && (
        <p className="text-[12px] text-brand-text">Turned off: {workflow.disabledReason}</p>
      )}
      <ParamRow
        label="Runs at the same time"
        htmlFor="workflow-concurrency"
        help="Leave empty for no limit. Extra runs wait their turn."
      >
        <Input
          id="workflow-concurrency"
          type="number"
          min={1}
          max={MAX_CONCURRENCY}
          value={settings.concurrency ?? ""}
          onChange={(e) => {
            const value = Number(e.target.value);
            const rest = { ...settings };
            delete rest.concurrency;
            set(
              e.target.value === "" || !Number.isFinite(value)
                ? rest
                : {
                    ...rest,
                    concurrency: Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(value))),
                  },
            );
          }}
          className="text-[13px]"
        />
      </ParamRow>
      <ParamRow label="Rate limit" htmlFor="workflow-limit">
        <FormSelect
          id="workflow-limit"
          label="Rate limit"
          value={settings.limit?.mode ?? NONE}
          onValueChange={(mode) => {
            const current = settings.limit;
            const rest = { ...settings };
            delete rest.limit;
            if (mode === NONE) set(rest);
            else
              set({
                ...rest,
                limit: { mode, key: current?.key ?? '"all"', seconds: current?.seconds ?? 3600 },
              });
          }}
          options={LIMIT_CHOICES.map((value) => ({ value, label: LIMIT_LABELS[value] }))}
        />
      </ParamRow>
      {settings.limit && (
        <>
          <ParamRow
            label="Per"
            htmlFor="workflow-limit-key"
            help='An expression over the trigger event; events with the same value share the limit, such as trigger.threadId, or "all".'
          >
            <ExpressionInput
              id="workflow-limit-key"
              label="Per"
              value={settings.limit.key}
              onChange={(key) =>
                settings.limit && set({ ...settings, limit: { ...settings.limit, key } })
              }
              type={T.text}
              scope={triggerScope}
              graph={graph}
              placeholder="trigger.threadId"
            />
          </ParamRow>
          <ParamRow label="Period in minutes" htmlFor="workflow-limit-minutes">
            <Input
              id="workflow-limit-minutes"
              type="number"
              min={1}
              max={7 * 24 * 60}
              value={Math.round(settings.limit.seconds / 60)}
              onChange={(e) => {
                const minutes = Math.max(
                  1,
                  Math.min(7 * 24 * 60, Math.round(Number(e.target.value) || 1)),
                );
                if (settings.limit)
                  set({ ...settings, limit: { ...settings.limit, seconds: minutes * 60 } });
              }}
              className="text-[13px]"
            />
          </ParamRow>
        </>
      )}
      <ParamRow
        label="Time zone"
        htmlFor="workflow-timezone"
        help="Used by date() and time() in expressions when no zone is given, and by Create an event, Find free time and the Agent step."
      >
        <TimezoneSelect
          id="workflow-timezone"
          value={settings.timezone ?? ""}
          onChange={(timezone) => set({ ...settings, timezone })}
        />
      </ParamRow>
    </section>
  );
}
