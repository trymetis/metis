import { inviteToken } from "@metis/e2e/lib/console-mail";
import { sentInviteLink } from "@metis/e2e/lib/invites";

import { HARNESS } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { withTotp } from "./config";

export interface EmailedInvite {
  id: string;
  link: string;
  token: string;
}

export async function emailedInvite(
  rpc: Rpc,
  email: string,
  send: () => Promise<{ id: string }>,
): Promise<EmailedInvite> {
  let id = "";
  const link = await sentInviteLink(HARNESS, email, async () => {
    ({ id } = await send());
  });
  return { id, link, token: inviteToken(link) };
}

export function inviteToWorkspace(
  rpc: Rpc,
  workspaceSlug: string,
  email: string,
  role: "member" | "admin" = "member",
): Promise<EmailedInvite> {
  return emailedInvite(rpc, email, () =>
    rpc<{ id: string }>("workspaces.createInvite", { workspaceSlug, email, role }),
  );
}

export function inviteAccount(
  rpc: Rpc,
  email: string,
  instanceRole: "admin" | "observer" | null = null,
): Promise<EmailedInvite> {
  return emailedInvite(rpc, email, async () => {
    const { invite } = await withTotp((code) =>
      rpc<{ invite: { id: string } }>("dashboard.invites.create", {
        email,
        instanceRole,
        ...(instanceRole ? { code } : {}),
      }),
    );
    return invite;
  });
}
