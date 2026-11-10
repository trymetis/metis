import "server-only";
import type { ToolKey } from "../toolkit/keys";
import { workspaceAdminTools } from "./workspace-admin-tools";
import { workspaceCalendarTools } from "./workspace-calendar-tools";
import { workspaceContactTools } from "./workspace-contact-tools";
import { workspaceDriveTools } from "./workspace-drive-tools";
import { workspaceInboxTools } from "./workspace-inbox-tools";
import { workspaceMailTools } from "./workspace-mail-tools";
import { workspaceMemberTools } from "./workspace-member-tools";
import { workspaceSignatureTools } from "./workspace-signature-tools";
import { workspaceWorkflowGraphTools, workspaceWorkflowTools } from "./workspace-workflow-tools";

export const allWorkspaceTools = {
  ...workspaceMailTools,
  ...workspaceInboxTools,
  ...workspaceWorkflowTools,
  ...workspaceCalendarTools,
  ...workspaceDriveTools,
  ...workspaceContactTools,
  ...workspaceMemberTools,
  ...workspaceAdminTools,
  ...workspaceSignatureTools,
} satisfies Record<ToolKey, unknown>;

export const RESIDENT_TOOL_KEYS = [
  "listMailboxes",
  "aggregateInbox",
  "searchMail",
  "listCalendars",
  "listDrives",
] as const satisfies readonly ToolKey[];

type ResidentToolKey = (typeof RESIDENT_TOOL_KEYS)[number];

export const workspaceResidentTools: Pick<typeof allWorkspaceTools, ResidentToolKey> = {
  listMailboxes: allWorkspaceTools.listMailboxes,
  aggregateInbox: allWorkspaceTools.aggregateInbox,
  searchMail: allWorkspaceTools.searchMail,
  listCalendars: allWorkspaceTools.listCalendars,
  listDrives: allWorkspaceTools.listDrives,
};

const residentKeys = new Set<string>(RESIDENT_TOOL_KEYS);

function searchableTools(phishingDetection: boolean, decisionSteps: boolean) {
  const switchedOff = new Set<string>([
    ...(phishingDetection ? [] : ["analyzePhishing"]),
    ...(decisionSteps ? [] : ["previewDecision"]),
  ]);
  const graphTools = decisionSteps
    ? workspaceWorkflowGraphTools.withDecisionSteps
    : workspaceWorkflowGraphTools.withoutDecisionSteps;
  return Object.fromEntries(
    Object.entries({ ...allWorkspaceTools, ...graphTools }).filter(
      ([key]) => !switchedOff.has(key) && !residentKeys.has(key),
    ),
  );
}

export type SearchableTools = ReturnType<typeof searchableTools>;

function rosters(phishingDetection: boolean) {
  return {
    withDecisionSteps: searchableTools(phishingDetection, true),
    withoutDecisionSteps: searchableTools(phishingDetection, false),
  };
}

export const workspaceSearchableTools = {
  withPhishingDetection: rosters(true),
  withoutPhishingDetection: rosters(false),
};
