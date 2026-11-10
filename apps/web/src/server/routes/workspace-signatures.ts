import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor } from "@/audit";
import {
  canEditWorkspaceSignatures,
  deleteSignature,
  getMailFooter,
  listSignatures,
  saveSignature,
  setMailFooter,
  WORKSPACE_SIGNATURES_ADMIN_ONLY,
} from "@/mail/signatures";
import type { WorkspaceRole } from "@/types/workspace";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  deleteWorkspaceSignatureInputSchema,
  listWorkspaceSignaturesOutputSchema,
  mailFooterSchema,
  saveSignatureOutputSchema,
  saveWorkspaceSignatureInputSchema,
  setMailFooterInputSchema,
  successSchema,
  workspaceScopeSchema,
} from "../schema";

function requireAdmin(workspaceRole: WorkspaceRole) {
  if (!canEditWorkspaceSignatures({ workspaceRole })) {
    throw new ORPCError("FORBIDDEN", { message: WORKSPACE_SIGNATURES_ADMIN_ONLY });
  }
}

export const workspaceSignaturesRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceSignaturesOutputSchema)
    .handler(async ({ context }) => {
      const workspaceId = context.appUser.workspaceId;
      const [signatures, footer] = await Promise.all([
        listSignatures({ scope: "workspace", workspaceId }),
        getMailFooter(workspaceId),
      ]);
      return {
        signatures,
        footer,
        canEdit: canEditWorkspaceSignatures(context.appUser),
      };
    }),

  save: workspaceSession(saveWorkspaceSignatureInputSchema)
    .output(saveSignatureOutputSchema)
    .handler(async ({ input, context }) => {
      requireAdmin(context.appUser.workspaceRole);
      const signature = await saveSignature(
        { scope: "workspace", workspaceId: context.appUser.workspaceId },
        input.signature,
      );
      if (!signature) throw new ORPCError("NOT_FOUND", { message: "That signature is gone" });
      return { signature };
    }),

  delete: workspaceSession(deleteWorkspaceSignatureInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      requireAdmin(context.appUser.workspaceRole);
      const deleted = await deleteSignature(
        { scope: "workspace", workspaceId: context.appUser.workspaceId },
        input.id,
      );
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: "That signature is gone" });
      return { success: true as const };
    }),

  setFooter: workspaceSession(setMailFooterInputSchema)
    .output(mailFooterSchema)
    .handler(async ({ input, context }) => {
      requireAdmin(context.appUser.workspaceRole);
      return setMailFooter(
        context.appUser.workspaceId,
        { html: input.html, enabled: input.enabled },
        appActor(context.appUser, context.headers),
      );
    }),
};
