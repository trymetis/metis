"use client";

import { rpc } from "@/lib/orpc";

import { ConfigForm } from "./config-form";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Note, Sections, ToneBadge } from "./system-ui";

const load = rpc.dashboard.system.llm.queryOptions();

export function LlmView() {
  const [llm, reload] = useSystemResource(load);
  if (!llm) return <Loading />;

  const enabled = llm.driver !== "disabled";
  const decision = llm.decision;
  const decisionEnabled = decision.driver !== "disabled";
  const anySwitchOn = decision.classifier || decision.summaryGate || decision.workflowNode;

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "llm" }}
        hint="Lists the provider's models with the configured key, and confirms every configured model is offered. With a decision model configured, does the same against its provider."
      />

      <ConfigForm
        config={llm.config}
        onSaved={reload}
        cards={{
          llm: {
            hint: "Which API the agents, smart replies, labels and summaries call, and the model each feature is routed to.",
            badge: <ToneBadge tone={enabled ? "ok" : "off"}>{enabled ? "On" : "Off"}</ToneBadge>,
            children: (
              <>
                {llm.structuredOutputs === false && (
                  <Note>
                    Without structured outputs the schemas go into the prompt, so summaries need a
                    context window of about 8k tokens or more.
                  </Note>
                )}
                {!enabled && (
                  <Note>Agents, smart replies, labels, summaries and MCP are unavailable.</Note>
                )}
              </>
            ),
          },
          decision: {
            hint: "Answers typed questions with probabilities instead of text. Each feature has its own switch.",
            badge: (
              <ToneBadge tone={decisionEnabled ? (anySwitchOn ? "ok" : "neutral") : "off"}>
                {decisionEnabled ? (anySwitchOn ? "On" : "Configured") : "Off"}
              </ToneBadge>
            ),
            children: decisionEnabled && !anySwitchOn && (
              <Note>A driver alone turns nothing on. Turn on at least one feature switch.</Note>
            ),
          },
        }}
      />
    </Sections>
  );
}
