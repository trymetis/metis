import "server-only";
import type {
  ProcessInputStepArgs,
  ProcessInputStepResult,
  Processor,
} from "@mastra/core/processors";

export const MAX_WORK_STEPS = 20;
export const MAX_SEARCH_CALLS = 5;
export const MAX_TOTAL_STEPS = 25;

const SEARCH_TOOL = "search_tools";
const RETRY: string = "retry";

type Step = ProcessInputStepArgs["steps"][number];

const toolCalls = (step: Step) => step.content.filter((part) => part.type === "tool-call");

const searchCalls = (step: Step) =>
  toolCalls(step).filter((call) => call.toolName === SEARCH_TOOL).length;

const isSearchOnly = (step: Step) => {
  const calls = toolCalls(step);
  return calls.length > 0 && searchCalls(step) === calls.length;
};

function budget(steps: Step[]) {
  const counted = steps.filter((step) => step.finishReason !== RETRY);
  return {
    total: counted.length,
    work: counted.filter((step) => !isSearchOnly(step)).length,
    searches: counted.reduce((sum, step) => sum + searchCalls(step), 0),
  };
}

export function chatStopWhen({ steps }: { steps: Step[] }): boolean {
  const { total, work } = budget(steps);
  return work >= MAX_WORK_STEPS || total >= MAX_TOTAL_STEPS;
}

export const finalAnswerStep = {
  id: "final-answer-step",
  processInputStep({
    steps,
    messageList,
  }: ProcessInputStepArgs): ProcessInputStepResult | undefined {
    const { total, work } = budget(steps);
    if (work < MAX_WORK_STEPS - 1 && total < MAX_TOTAL_STEPS - 1) return undefined;
    messageList.addSystem(
      "This is your final step for this message. Do not call any more tools. Answer the user now from what you have already found: say what you did, what you found, and what is still left to do.",
    );
    return { toolChoice: "none" };
  },
} satisfies Processor<"final-answer-step">;

export const searchBudget = {
  id: "search-budget",
  processInputStep({
    steps,
    tools,
    messageList,
  }: ProcessInputStepArgs): ProcessInputStepResult | undefined {
    if (!tools?.[SEARCH_TOOL] || budget(steps).searches < MAX_SEARCH_CALLS) return undefined;
    messageList.addSystem(
      `You have used all ${MAX_SEARCH_CALLS} tool searches for this message, so search_tools is gone until the next message. Work with the tools already loaded, or tell the user what you cannot do.`,
    );
    const { [SEARCH_TOOL]: _search, ...rest } = tools;
    return { tools: rest };
  },
} satisfies Processor<"search-budget">;
