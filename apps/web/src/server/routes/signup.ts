import "server-only";
import { ORPCError } from "@orpc/server";

import { isOwnerEmail } from "@/auth/owner";
import { getAuth } from "@/auth/server";
import { verifySetupCode } from "@/auth/setup-code";
import { ownerSignup } from "@/auth/signup";
import { config } from "@/config";
import { previewInvite, signUpFromInvite } from "@/invites";
import { clientIp } from "@/services/client-ip";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS, type RateLimitRule } from "@/services/rate-limits";

import { base } from "../middlewares/base";
import {
  firstSignupInputSchema,
  firstSignupOutputSchema,
  inviteSignupInputSchema,
  inviteSignupOutputSchema,
  invitePreviewOutputSchema,
  inviteTokenInputSchema,
} from "../schema";

async function limit(headers: Headers, rule: RateLimitRule): Promise<void> {
  const result = await rateLimit(clientIp(headers) ?? "unknown", rule);
  if (!result.ok) {
    throw new RateLimitedError(result);
  }
}

export const signupRouter = {
  first: base
    .input(firstSignupInputSchema)
    .output(firstSignupOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, RATE_LIMITS.signupFirst);

      if (!config.app.setupCode) {
        console.warn(
          "[setup] signup.first called but METIS_SETUP_CODE is unset — no account can be created until it is",
        );
        throw new ORPCError("FORBIDDEN", {
          message: "Setup isn't available on this instance",
        });
      }

      if (!verifySetupCode(input.setupCode)) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "That setup code isn't valid",
        });
      }

      if (!isOwnerEmail(input.email)) {
        throw new ORPCError("FORBIDDEN", {
          message: "This instance only allows its configured owner email",
        });
      }

      const result = await ownerSignup({
        name: input.name,
        email: input.email,
        password: input.password,
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }

      return { email: input.email, workspaceSlug: result.workspaceSlug };
    }),

  invitePreview: base
    .input(inviteTokenInputSchema)
    .output(invitePreviewOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, RATE_LIMITS.signupInvitePreview);

      const session = await getAuth().api.getSession({ headers: context.headers });
      const result = await previewInvite(
        input.token,
        session ? { email: session.user.email } : null,
      );
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      return result;
    }),

  invite: base
    .input(inviteSignupInputSchema)
    .output(inviteSignupOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, RATE_LIMITS.signupInvite);

      const result = await signUpFromInvite({
        token: input.token,
        name: input.name,
        password: input.password,
        headers: context.headers,
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }

      return { email: result.email, workspaceSlug: result.workspaceSlug };
    }),
};
