import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor } from "@/audit";
import { acceptInvite, declineInvite } from "@/invites";

import { appSession } from "../middlewares/app-session";
import { acceptInviteOutputSchema, inviteTokenInputSchema, okSchema } from "../schema";

export const invitesRouter = {
  accept: appSession
    .input(inviteTokenInputSchema)
    .output(acceptInviteOutputSchema)
    .handler(async ({ input, context }) => {
      const result = await acceptInvite({
        token: input.token,
        user: {
          id: context.appUser.userId,
          email: context.appUser.user.email,
          name: context.appUser.user.name,
        },
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      return result;
    }),

  decline: appSession
    .input(inviteTokenInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await declineInvite({
        token: input.token,
        user: { email: context.appUser.user.email },
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      return result;
    }),
};
