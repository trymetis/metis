import "server-only";
import { aiEnabled as instanceAiEnabled, phishingDetectionEnabled } from "@/config/runtime";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";

export interface WorkspacePolicy {
  aiPolicy: WorkspaceAiPolicy;
  phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
}

export interface MailboxPolicyFlags {
  aiEnabled: boolean;
  phishingDetectionEnabled: boolean;
}

export interface ResolvedPolicy {
  ai: boolean;
  phishingDetection: boolean;
}

export interface ScopePolicy extends ResolvedPolicy {
  workspaceAi: boolean;
}

export function platformPolicy(): ResolvedPolicy {
  return {
    ai: instanceAiEnabled(),
    phishingDetection: phishingDetectionEnabled(),
  };
}

export function workspaceAllowsAi(workspace: WorkspacePolicy): boolean {
  return instanceAiEnabled() && workspace.aiPolicy !== "off";
}

export function aiEnabled(row: { policy: { ai: boolean } }): boolean {
  return row.policy.ai;
}

function workspaceAllowsPhishingDetection(workspace: WorkspacePolicy): boolean {
  return phishingDetectionEnabled() && workspace.phishingDetectionPolicy !== "off";
}

export function resolveMailboxPolicy(
  mailbox: MailboxPolicyFlags,
  workspace: WorkspacePolicy,
): ResolvedPolicy {
  return {
    ai: workspaceAllowsAi(workspace) && mailbox.aiEnabled,
    phishingDetection:
      workspaceAllowsPhishingDetection(workspace) &&
      (workspace.phishingDetectionPolicy === "required" || mailbox.phishingDetectionEnabled),
  };
}

export function scopePolicy(
  workspace: WorkspacePolicy | null,
  resources: { policy: { ai: boolean; phishingDetection?: boolean } }[],
): ScopePolicy {
  return {
    workspaceAi: workspace ? workspaceAllowsAi(workspace) : false,
    ai: resources.some((r) => r.policy.ai),
    phishingDetection: resources.some((r) => r.policy.phishingDetection),
  };
}

export function resolveCalendarPolicy(
  calendar: { aiEnabled: boolean },
  workspace: WorkspacePolicy,
): { ai: boolean } {
  return { ai: workspaceAllowsAi(workspace) && calendar.aiEnabled };
}

export function resolveAddressBookPolicy(
  addressBook: { aiEnabled: boolean },
  workspace: WorkspacePolicy,
): { ai: boolean } {
  return { ai: workspaceAllowsAi(workspace) && addressBook.aiEnabled };
}

export function resolveDrivePolicy(
  drive: { aiEnabled: boolean },
  workspace: WorkspacePolicy,
): { ai: boolean } {
  return { ai: workspaceAllowsAi(workspace) && drive.aiEnabled };
}
