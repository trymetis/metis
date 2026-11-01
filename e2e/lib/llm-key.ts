import { createHash } from "node:crypto";

import { z } from "zod";

const VOLATILE_ATTRIBUTES = /\b(sent-at|time-zone|modified)=(\\*)"[^"\\]*\2"/g;
const VOLATILE_FIELDS = /(\\*)"(modifiedAt|requestedAt)\1": ?\1"[^"\\]*\1"/g;
const RUN_TIME = /\bRun time: [0-9T:.+\-Z]+/g;

export function normalizeLlmRequest(body: unknown): string {
  return JSON.stringify(body)
    .replace(VOLATILE_ATTRIBUTES, '$1=$2"$2"')
    .replace(VOLATILE_FIELDS, '$1"$2$1":$1"$1"')
    .replace(RUN_TIME, "Run time: ");
}

export function llmKey(path: string, body: unknown): string {
  return createHash("sha256")
    .update(path)
    .update("\n")
    .update(normalizeLlmRequest(body))
    .digest("hex")
    .slice(0, 32);
}

export const llmResponseSchema = z.object({
  status: z.number(),
  contentType: z.string(),
  body: z.string(),
});
export type LlmResponse = z.infer<typeof llmResponseSchema>;

export const llmSeedsSchema = z.record(
  z.string(),
  z.object({
    path: z.string(),
    request: z.unknown(),
    response: llmResponseSchema,
  }),
);
export type LlmSeeds = z.infer<typeof llmSeedsSchema>;
