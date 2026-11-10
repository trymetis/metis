import { MCP_TOOL_MANIFEST } from "@/mcp/tools";
import type { AuditEvent } from "@/server/schema";
import { type AuditAction, type AuditResourceKind, AUDIT_RESOURCE_NOUNS } from "@/types/audit";

const TOOL_LABELS = new Map<string, string>(
  MCP_TOOL_MANIFEST.map((tool) => [tool.key, tool.label]),
);

const ROLE_PHRASES: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

const INSTANCE_ROLE_PHRASES: Record<string, string> = {
  admin: "an instance admin",
  observer: "an instance observer",
};

function bundle(detail: Record<string, unknown>, workspace: string | null | undefined): string {
  const role = text(detail.role);
  const instanceRole = text(detail.instanceRole);
  const parts = [
    workspace ? ` to ${workspace}` : "",
    role ? ` as ${ROLE_PHRASES[role] ?? role}` : "",
    instanceRole ? ` as ${INSTANCE_ROLE_PHRASES[instanceRole] ?? instanceRole}` : "",
  ];
  return parts.join("");
}

function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function toolNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((key) => (typeof key === "string" ? [TOOL_LABELS.get(key) ?? key] : []))
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function formatAuditEvent(event: AuditEvent): string {
  const actor = event.actorName || event.actorEmail || "A deleted account";
  const person = event.targetName || event.targetLabel || "a deleted account";
  const target = event.targetLabel ?? "";
  const kind = event.resourceKind ? AUDIT_RESOURCE_NOUNS[event.resourceKind] : "resource";
  const workspace = event.workspaceName;
  const { detail } = event;
  const tools = toolNames(detail.tools ?? detail.sensitiveTools);

  switch (event.action) {
    case "account.deleted": {
      const deleted = typeof detail.workspacesDeleted === "number" ? detail.workspacesDeleted : 0;
      const along =
        deleted > 0 ? ` and ${deleted} ${deleted === 1 ? "workspace" : "workspaces"} with it` : "";
      return `${actor} deleted their account${along}`;
    }
    case "two_factor.disabled":
      return `${actor} turned off two-factor authentication`;
    case "sign_in_alerts.disabled":
      return `${actor} turned off sign-in alerts`;
    case "mcp_client.created":
      return `${actor} added the MCP client ${target}`;
    case "mcp_client.approved":
      return `${actor} approved the MCP client ${target}${tools.length > 0 ? ` with sensitive tools ${list(tools)}` : ""}`;
    case "mcp_client.enabled":
      return `${actor} re-enabled the MCP client ${target}`;
    case "mcp_client.sensitive_tools_enabled":
      return `${actor} turned on sensitive tools for ${target}${tools.length > 0 ? `: ${list(tools)}` : ""}`;
    case "connection.deleted":
      return `${actor} disconnected ${target}`;
    case "resource.deleted":
      return `${actor} removed the ${kind} ${target}${detail.grantRevoked === true ? " and revoked its access at the provider" : ""}`;
    case "resource.detached":
      return `${actor} detached the ${kind} ${target}${workspace ? ` from ${workspace}` : ""}`;
    case "member.role_changed": {
      const from = text(detail.from);
      const to = text(detail.to);
      return from && to
        ? `${actor} changed ${person}'s role from ${from} to ${to}`
        : `${actor} changed ${person}'s role`;
    }
    case "member.removed":
      return `${actor} removed ${person}${workspace ? ` from ${workspace}` : ""}`;
    case "workspace.ownership_transferred":
      return `${actor} transferred ownership of ${workspace ?? "the workspace"} to ${person}`;
    case "workspace.deleted":
      return `${actor} deleted the workspace ${workspace ?? target}`;
    case "workspace_invite.created": {
      const role = text(detail.role);
      return `${actor} invited ${target}${workspace ? ` to ${workspace}` : ""}${role ? ` as ${ROLE_PHRASES[role] ?? role}` : ""}`;
    }
    case "workspace_invite.revoked":
      return `${actor} revoked the invite for ${target}${workspace ? ` to ${workspace}` : ""}`;
    case "signup_invite.created":
      return `${actor} sent a sign-up invite to ${target}`;
    case "signup_invite.revoked":
      return `${actor} revoked the sign-up invite for ${target}`;
    case "invite.created":
      return `${actor} invited ${target}${bundle(detail, workspace)}`;
    case "invite.accepted":
      return `${actor} accepted the invite${bundle(detail, workspace)}`;
    case "invite.declined":
      return `${actor} declined the invite${bundle(detail, workspace)}`;
    case "invite.revoked":
      return `${actor} revoked the invite for ${target}${workspace ? ` to ${workspace}` : ""}`;
    case "invite.link_shown":
      return `${actor} was shown the invite link for ${target} because the email couldn't be sent`;
    case "instance_role.granted": {
      const from = text(detail.from);
      const to = text(detail.to);
      return `${actor} made ${person} ${INSTANCE_ROLE_PHRASES[to ?? ""] ?? "an instance role holder"}${from ? ` (was ${from})` : ""}`;
    }
    case "instance_role.revoked": {
      const from = text(detail.from);
      return `${actor} removed ${person}'s instance role${from ? ` (${from})` : ""}`;
    }
    case "user.banned": {
      const until = text(detail.expiresAt);
      const reason = text(detail.reason);
      return `${actor} banned ${person}${until ? ` until ${until.slice(0, 10)}` : ""}${reason ? ` (${reason})` : ""}`;
    }
    case "user.unbanned":
      return `${actor} unbanned ${person}`;
    case "user.removed":
      return `${actor} removed the user ${person}`;
    case "instance.upgrade_undone":
      return `${actor} undid the last upgrade (${target})`;
    case "workflow.created":
      return `${actor} created the workflow ${target}${workflowNote(detail)}`;
    case "workflow.edited":
      return `${actor} edited the workflow ${target}${workflowNote(detail)}`;
    case "workflow.enabled":
      return `${actor} turned on the workflow ${target}${workflowNote(detail)}`;
    case "workflow.disabled":
      return `${actor} turned off the workflow ${target}${workflowNote(detail)}`;
    case "workflow.deleted":
      return `${actor} deleted the workflow ${target}${workflowNote(detail)}`;
  }
}

function workflowNote(detail: AuditEvent["detail"]): string {
  const runsAs = text(detail.runsAs);
  const notes = [
    runsAs ? `which runs as ${runsAs}` : null,
    detail.sendPolicy === true ? "which can add a Bcc to mail members send" : null,
  ].filter((note): note is string => note !== null);
  return notes.length > 0 ? `, ${list(notes)}` : "";
}

export function auditPhrase(action: AuditAction, kind: AuditResourceKind | null): string {
  const resource = kind ? AUDIT_RESOURCE_NOUNS[kind] : "resource";
  switch (action) {
    case "account.deleted":
      return "deleted their account";
    case "two_factor.disabled":
      return "turned off two-factor authentication";
    case "sign_in_alerts.disabled":
      return "turned off sign-in alerts";
    case "mcp_client.created":
      return "added the mcp client";
    case "mcp_client.approved":
      return "approved the mcp client with sensitive tools";
    case "mcp_client.enabled":
      return "re-enabled the mcp client";
    case "mcp_client.sensitive_tools_enabled":
      return "turned on sensitive tools for";
    case "connection.deleted":
      return "disconnected";
    case "resource.deleted":
      return `removed the ${resource} and revoked its access at the provider`;
    case "resource.detached":
      return `detached the ${resource} from`;
    case "member.role_changed":
      return "changed 's role from to";
    case "member.removed":
      return "removed from";
    case "workspace.ownership_transferred":
      return "transferred ownership of to";
    case "workspace.deleted":
      return "deleted the workspace";
    case "workspace_invite.created":
      return "invited to as";
    case "workspace_invite.revoked":
      return "revoked the invite for to";
    case "signup_invite.created":
      return "sent a sign-up invite to";
    case "signup_invite.revoked":
      return "revoked the sign-up invite for";
    case "invite.created":
      return "invited to as";
    case "invite.accepted":
      return "accepted the invite to as";
    case "invite.declined":
      return "declined the invite to as";
    case "invite.revoked":
      return "revoked the invite for to";
    case "invite.link_shown":
      return "was shown the invite link for because the email couldn't be sent";
    case "instance_role.granted":
      return "made an instance admin an instance observer was";
    case "instance_role.revoked":
      return "removed 's instance role";
    case "user.banned":
      return "banned";
    case "user.unbanned":
      return "unbanned";
    case "user.removed":
      return "removed the user";
    case "instance.upgrade_undone":
      return "undid the last upgrade";
    case "workflow.created":
      return "created the workflow";
    case "workflow.edited":
      return "edited the workflow";
    case "workflow.enabled":
      return "turned on the workflow";
    case "workflow.disabled":
      return "turned off the workflow";
    case "workflow.deleted":
      return "deleted the workflow";
  }
}
