import type { InvitePreview } from "@/server/schema";
import { USER_ROLE_LABELS } from "@/types/instance-role";

export function inviteHeading(preview: InvitePreview): string {
  if (preview.workspaceName) {
    return `Join ${preview.workspaceName} as ${preview.workspaceRole === "admin" ? "an admin" : "a member"}`;
  }
  return "Create your account";
}

export function inviteDetail(preview: InvitePreview): string {
  const from = preview.inviterName ? `${preview.inviterName} invited you` : "You were invited";
  const role = preview.instanceRole
    ? ` You'll also be an instance ${USER_ROLE_LABELS[preview.instanceRole].toLowerCase()}, with access to the owner dashboard.`
    : "";
  return preview.workspaceName
    ? `${from} to ${preview.workspaceName} on Metis Suite.${role}`
    : `${from} to Metis Suite.${role}`;
}
