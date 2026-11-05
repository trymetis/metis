import "server-only";
import { ORPCError } from "@orpc/server";

import { verifySetupCode } from "@/auth/setup-code";
import { firstUserSignup, inviteSignup, previewSignupInvite } from "@/auth/signup";
import { config } from "@/config";
import { clientIp } from "@/services/client-ip";
import { rateLimit } from "@/services/rate-limit";

import { base } from "../middlewares/base";
import {
  firstSignupInputSchema,
  firstSignupOutputSchema,
  inviteSignupInputSchema,
  inviteSignupOutputSchema,
  signupInvitePreviewOutputSchema,
  signupInviteTokenInputSchema,
} from "../schema";

async function limit(headers: Headers, scope: string, limitPerHour: number): Promise<void> {
  const result = await rateLimit(clientIp(headers) ?? "unknown", {
    scope,
    limit: limitPerHour,
    windowSec: 60 * 60,
  });
  if (!result.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many requests. Please slow down.",
      data: { retryAfterSec: Math.ceil(result.resetMs / 1000) },
    });
  }
}

export const signupRouter = {
  first: base
    .input(firstSignupInputSchema)
    .output(firstSignupOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, "signup-first", 10);

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

      const pinnedEmail = config.app.ownerEmail;
      if (pinnedEmail && pinnedEmail !== input.email) {
        throw new ORPCError("FORBIDDEN", {
          message: "This instance only allows its configured owner email",
        });
      }

      const result = await firstUserSignup({
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
    .input(signupInviteTokenInputSchema)
    .output(signupInvitePreviewOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, "signup-invite-preview", 30);

      const result = await previewSignupInvite(input.token);
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }

      return { email: result.email };
    }),

  invite: base
    .input(inviteSignupInputSchema)
    .output(inviteSignupOutputSchema)
    .handler(async ({ input, context }) => {
      await limit(context.headers, "signup-invite", 10);

      const result = await inviteSignup({
        token: input.token,
        name: input.name,
        password: input.password,
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }

      return { email: result.email, workspaceSlug: result.workspaceSlug };
    }),
};
