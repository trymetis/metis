export const AUDIT_ACTIONS = [
  "account.deleted",
  "two_factor.disabled",
  "sign_in_alerts.disabled",
  "mcp_client.created",
  "mcp_client.approved",
  "mcp_client.enabled",
  "mcp_client.sensitive_tools_enabled",
  "connection.deleted",
  "resource.deleted",
  "resource.detached",
  "member.role_changed",
  "member.removed",
  "workspace.ownership_transferred",
  "workspace.deleted",
  "workspace.mail_footer_changed",
  "workspace_invite.created",
  "workspace_invite.revoked",
  "signup_invite.created",
  "signup_invite.revoked",
  "invite.created",
  "invite.accepted",
  "invite.declined",
  "invite.revoked",
  "invite.link_shown",
  "instance_role.granted",
  "instance_role.revoked",
  "user.banned",
  "user.unbanned",
  "user.removed",
  "instance.upgrade_undone",
  "workflow.created",
  "workflow.edited",
  "workflow.enabled",
  "workflow.disabled",
  "workflow.deleted",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SEARCH_MAX_LENGTH = 200;

export const USER_AUDIT_ACTIONS = AUDIT_ACTIONS.filter((action) => action !== "account.deleted");

export const WORKSPACE_AUDIT_ACTIONS = [
  "resource.detached",
  "member.role_changed",
  "member.removed",
  "workspace.ownership_transferred",
  "workspace.mail_footer_changed",
  "workspace_invite.created",
  "workspace_invite.revoked",
  "invite.created",
  "invite.accepted",
  "invite.declined",
  "invite.revoked",
  "invite.link_shown",
  "workflow.created",
  "workflow.edited",
  "workflow.enabled",
  "workflow.disabled",
  "workflow.deleted",
] as const satisfies readonly AuditAction[];

export const AUDIT_VIAS = ["app", "assistant", "mcp"] as const;
export type AuditVia = (typeof AUDIT_VIAS)[number];

export const AUDIT_RESOURCE_KINDS = ["mailbox", "calendar", "drive", "addressbook"] as const;
export type AuditResourceKind = (typeof AUDIT_RESOURCE_KINDS)[number];

export type AuditDetail = Record<string, string | number | boolean | null | string[]>;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "account.deleted": "Account deleted",
  "two_factor.disabled": "Two-factor authentication disabled",
  "sign_in_alerts.disabled": "Sign-in alerts turned off",
  "mcp_client.created": "MCP client added",
  "mcp_client.approved": "MCP client approved",
  "mcp_client.enabled": "MCP client re-enabled",
  "mcp_client.sensitive_tools_enabled": "Sensitive MCP tools turned on",
  "connection.deleted": "Account disconnected",
  "resource.deleted": "Resource removed",
  "resource.detached": "Resource detached from a workspace",
  "member.role_changed": "Member role changed",
  "member.removed": "Member removed",
  "workspace.ownership_transferred": "Ownership transferred",
  "workspace.deleted": "Workspace deleted",
  "workspace.mail_footer_changed": "Mail footer changed",
  "workspace_invite.created": "Workspace invite sent",
  "workspace_invite.revoked": "Workspace invite revoked",
  "signup_invite.created": "Sign-up invite sent",
  "signup_invite.revoked": "Sign-up invite revoked",
  "invite.created": "Invite sent",
  "invite.accepted": "Invite accepted",
  "invite.declined": "Invite declined",
  "invite.revoked": "Invite revoked",
  "invite.link_shown": "Invite link shown",
  "instance_role.granted": "Instance role granted",
  "instance_role.revoked": "Instance role revoked",
  "user.banned": "User banned",
  "user.unbanned": "User unbanned",
  "user.removed": "User removed",
  "instance.upgrade_undone": "Instance upgrade undone",
  "workflow.created": "Workflow created",
  "workflow.edited": "Workflow edited",
  "workflow.enabled": "Workflow turned on",
  "workflow.disabled": "Workflow turned off",
  "workflow.deleted": "Workflow deleted",
};

export const AUDIT_RESOURCE_NOUNS: Record<AuditResourceKind, string> = {
  mailbox: "mailbox",
  calendar: "calendar",
  drive: "drive",
  addressbook: "address book",
};

export function auditEventTitle(
  action: AuditAction,
  resourceKind: AuditResourceKind | null,
): string {
  if (resourceKind) {
    const verb = action === "resource.detached" ? "detached" : "removed";
    const noun = AUDIT_RESOURCE_NOUNS[resourceKind];
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`;
  }
  return AUDIT_ACTION_LABELS[action];
}
