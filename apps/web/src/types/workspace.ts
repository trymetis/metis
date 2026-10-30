export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_INVITE_ROLES = ["admin", "member"] as const;
export type WorkspaceInviteRole = (typeof WORKSPACE_INVITE_ROLES)[number];

export const WORKSPACE_AI_POLICIES = ["off", "optional"] as const;
export type WorkspaceAiPolicy = (typeof WORKSPACE_AI_POLICIES)[number];

export const WORKSPACE_PHISHING_DETECTION_POLICIES = ["off", "optional", "required"] as const;
export type WorkspacePhishingDetectionPolicy =
  (typeof WORKSPACE_PHISHING_DETECTION_POLICIES)[number];
