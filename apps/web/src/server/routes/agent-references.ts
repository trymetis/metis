import "server-only";
import { ORPCError } from "@orpc/server";

import {
  resolveReferences,
  suggestReferences,
  workspaceReferenceScope,
} from "@/ai/reference-directory";
import { WORKSPACE_REFERENCE_TYPES } from "@/ai/references";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";
import { getWorkspacePolicy } from "@/workspace";
import { workspaceAllowsAi } from "@/workspace/policy";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  resolveReferencesInputSchema,
  resolveReferencesOutputSchema,
  suggestReferencesInputSchema,
  suggestReferencesOutputSchema,
} from "../schema";

async function requireWorkspaceAi(workspaceId: string) {
  const policy = await getWorkspacePolicy(workspaceId);
  if (!policy) {
    throw new ORPCError("NOT_FOUND", { message: "Unknown workspace" });
  }
  if (!workspaceAllowsAi(policy)) {
    throw new ORPCError("FORBIDDEN", {
      message: "AI is turned off for this workspace",
    });
  }
}

export const agentReferencesRouter = {
  suggest: workspaceSession(suggestReferencesInputSchema)
    .output(suggestReferencesOutputSchema)
    .handler(async ({ input, context }) => {
      await requireWorkspaceAi(context.appUser.workspaceId);
      const rl = await rateLimit(context.appUser.userId, RATE_LIMITS.agentReferenceSuggest);
      if (!rl.ok) {
        throw new RateLimitedError(rl);
      }

      const scope = await workspaceReferenceScope(context.appUser, WORKSPACE_REFERENCE_TYPES);
      const groups = await suggestReferences(scope, input.query, input.limit);
      return { groups };
    }),

  resolve: workspaceSession(resolveReferencesInputSchema)
    .output(resolveReferencesOutputSchema)
    .handler(async ({ input, context }) => {
      await requireWorkspaceAi(context.appUser.workspaceId);
      if (input.refs.length === 0) return { references: [] };

      const scope = await workspaceReferenceScope(context.appUser, WORKSPACE_REFERENCE_TYPES);
      const { resolved } = await resolveReferences(scope, input.refs, {
        hydrate: true,
      });

      return {
        references: resolved.map(({ type, id, label, detail }) => ({
          type,
          id,
          label,
          detail,
        })),
      };
    }),
};
