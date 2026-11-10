export const INSTANCE_ROLES = ["owner", "admin", "observer"] as const;
export type InstanceRole = (typeof INSTANCE_ROLES)[number];

export const GRANTED_INSTANCE_ROLES = ["admin", "observer"] as const;
export type GrantedInstanceRole = (typeof GRANTED_INSTANCE_ROLES)[number];

export const USER_ROLES = ["owner", "admin", "observer", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ASSIGNABLE_USER_ROLES = ["admin", "observer", "user"] as const;
export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number];

export const DASHBOARD_REQUIREMENTS = ["read", "operate"] as const;
export type DashboardRequirement = (typeof DASHBOARD_REQUIREMENTS)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  observer: "Observer",
  user: "User",
};

export function userRoleOf(role: InstanceRole | null): UserRole {
  return role ?? "user";
}

export function grantedRoleOf(role: AssignableUserRole): GrantedInstanceRole | null {
  return role === "user" ? null : role;
}

export function meetsRequirement(role: InstanceRole, requirement: DashboardRequirement): boolean {
  return requirement === "read" || role !== "observer";
}

export function canGrantInstanceRole(
  actor: InstanceRole,
  role: GrantedInstanceRole | null,
): boolean {
  if (actor === "owner") return true;
  return actor === "admin" && role !== "admin";
}

export function canManageUser(actor: InstanceRole | null, target: InstanceRole | null): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "admin" && target !== "admin";
}

export function canManageAccountInvites(actor: InstanceRole | null): boolean {
  return actor === "owner" || actor === "admin";
}
