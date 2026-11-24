import "server-only";
import { Agent } from "@mastra/core/agent";

import { getLlm } from "@/services/llm";

export const summarizerAgent = new Agent({
  id: "summarizerAgent",
  name: "Metis Thread Summarizer",
  instructions:
    "You turn each email conversation into one summary card: a card for the one item it is about, such as a verification code, meeting, order, shipment, bill or reservation, or a Tldr with a factual text summary when no single item covers it. Be concrete, no greetings or filler. Per-request system messages tell you whether to build a fresh card or refine the current one. Reply only with json matching the requested schema.",
  model: () => getLlm().summary,
});
