import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor } from "@/audit";
import { listSignupInvites, revokeSignupInvite, sendSignupInvite } from "@/auth/signup";

import { appSession } from "../middlewares/app-session";
import {
  createSignupInviteInputSchema,
  createSignupInviteOutputSchema,
  listSignupInvitesOutputSchema,
  okSchema,
  revokeSignupInviteInputSchema,
} from "../schema";

export const signupInvitesRouter = {
  list: appSession.output(listSignupInvitesOutputSchema).handler(async ({ context }) => {
    const rows = await listSignupInvites(context.appUser.userId);
    return {
      invites: rows.map((row) => ({
        id: row.id,
        email: row.email,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }),

  create: appSession
    .input(createSignupInviteInputSchema)
    .output(createSignupInviteOutputSchema)
    .handler(async ({ input, context }) => {
      const sent = await sendSignupInvite({
        email: input.email,
        inviter: {
          userId: context.appUser.userId,
          name: context.appUser.user.name,
        },
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in sent) {
        throw new ORPCError("BAD_REQUEST", { message: sent.error });
      }

      return {
        invite: {
          id: sent.invite.id,
          email: sent.invite.email,
          expiresAt: sent.invite.expiresAt.toISOString(),
          acceptedAt: null,
          createdAt: sent.invite.createdAt.toISOString(),
        },
      };
    }),

  revoke: appSession
    .input(revokeSignupInviteInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await revokeSignupInvite({
        inviteId: input.inviteId,
        invitedBy: context.appUser.userId,
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      return { ok: true as const };
    }),
};
