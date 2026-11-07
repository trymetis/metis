import "server-only";
import { ORPCError } from "@orpc/server";

import { acceptInvite } from "@/workspace";

import { appSession } from "../middlewares/app-session";
import { acceptInviteInputSchema, acceptInviteOutputSchema } from "../schema";

export const invitesRouter = {
  accept: appSession
    .input(acceptInviteInputSchema)
    .output(acceptInviteOutputSchema)
    .handler(async ({ input, context }) => {
      const result = await acceptInvite({
        token: input.token,
        userId: context.appUser.userId,
        email: context.appUser.user.email,
      });

      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }

      return result;
    }),
};
