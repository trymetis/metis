import "server-only";
import { MCPServer } from "@mastra/mcp";

import { decisionEnabled } from "@/config/runtime";
import type { McpToolPrefs } from "@/mcp/tools";
import { isMcpToolEnabled, isMcpToolKey, mcpToolAllowed } from "@/mcp/tools";
import { phishingDetectionEnabled } from "@/services/phishing-detection";
import type { InstanceRole } from "@/types/instance-role";

import type { McpOnlyToolKey, ToolKey } from "../toolkit/keys";
import {
  attachResource,
  createSignupInvite,
  createWorkspace,
  getWorkspace,
  listAccountResources,
  listSignupInvites,
  listUnavailableAccounts,
  listWorkspaces,
  revokeSignupInvite,
} from "./tools/account";
import {
  archiveEmail,
  deleteEmails,
  markRead,
  restoreEmail,
  sendEmail,
  starEmail,
} from "./tools/actions";
import { listInvites, removeMember, revokeInvite, setWorkspaceTheme } from "./tools/admin";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listCalendars,
  listEvents,
  respondToEvent,
  updateEvent,
} from "./tools/calendar";
import {
  createContact,
  deleteContact,
  getContact,
  listAddressBooks,
  searchContacts,
  updateContact,
} from "./tools/contacts";
import { createDraft, deleteDraft, updateDraft } from "./tools/drafts";
import {
  createFolder,
  deleteFile,
  getDriveQuota,
  getFile,
  getFileText,
  listDrives,
  listFolder,
  listPins,
  moveFile,
  pinFolder,
  renameFile,
  searchFiles,
  unpinFolder,
} from "./tools/drive";
import {
  addReadLater,
  cancelScheduled,
  cancelSnooze,
  listMuted,
  listReadLater,
  listScheduled,
  listSnoozed,
  listSubscriptions,
  muteThread,
  removeReadLater,
  retryScheduled,
  scheduleEmail,
  snoozeEmail,
  unmuteThread,
  unsnoozeEmail,
  unsubscribe,
} from "./tools/inbox";
import {
  getInstanceAuditLog,
  getInstanceAutomation,
  getInstanceConnections,
  getInstanceMcpClients,
  getInstanceOverview,
  getInstancePeople,
  getInstanceStats,
  getInstanceUsers,
  getInstanceUsage,
  getInstanceWorkspaces,
  getPreflightWarnings,
  getSystemCache,
  getSystemDatabase,
  getSystemInstance,
  getSystemLlm,
  getSystemMail,
  getSystemOverview,
  getSystemPhishing,
  getSystemProvider,
  getSystemRunner,
  runSystemCheck,
} from "./tools/instance";
import {
  clearLabel,
  createLabel,
  deleteLabel,
  listLabels,
  setLabel,
  setLabels,
} from "./tools/labels";
import { getAttachmentText, getRawEmail, listAttachments, summarizeThread } from "./tools/mail";
import {
  findMemberEvents,
  findMemberFiles,
  findMemberMail,
  listWorkspaceMembers,
} from "./tools/members";
import { aggregateInbox, getEmail, getThread, listEmails, listMailboxes } from "./tools/messages";
import { analyzePhishing } from "./tools/phishing";
import { searchMail } from "./tools/search";
import { deleteSignature, listSignatures, saveSignature, setMailFooter } from "./tools/signatures";
import {
  applyWorkflows,
  cancelWorkflowRun,
  deleteWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflowSteps,
  previewDecision,
  resumeWorkflowRun,
  toggleWorkflow,
  workflowGraphTools,
} from "./tools/workflows";

const { listWorkflows, createWorkflow, updateWorkflow } = workflowGraphTools.withDecisionSteps;

const MCP_TOOLS = {
  listWorkspaces,
  getWorkspace,
  listAccountResources,
  listUnavailableAccounts,
  createWorkspace,
  attachResource,
  listSignupInvites,
  createSignupInvite,
  revokeSignupInvite,
  getInstanceStats,
  getInstanceUsage,
  getInstanceOverview,
  getInstanceConnections,
  getInstancePeople,
  getInstanceUsers,
  getInstanceWorkspaces,
  getInstanceAutomation,
  getInstanceMcpClients,
  getInstanceAuditLog,
  getSystemOverview,
  getSystemInstance,
  getSystemLlm,
  getSystemPhishing,
  getSystemMail,
  getSystemCache,
  getSystemRunner,
  getSystemDatabase,
  getSystemProvider,
  runSystemCheck,
  getPreflightWarnings,
  listMailboxes,
  aggregateInbox,
  searchMail,
  listEmails,
  getEmail,
  getThread,
  markRead,
  starEmail,
  archiveEmail,
  restoreEmail,
  deleteEmails,
  sendEmail,
  createDraft,
  updateDraft,
  analyzePhishing,
  listLabels,
  setLabel,
  clearLabel,
  listWorkflows,
  listWorkflowRuns,
  getWorkflowRun,
  createWorkflow,
  updateWorkflow,
  toggleWorkflow,
  deleteWorkflow,
  applyWorkflows,
  cancelWorkflowRun,
  resumeWorkflowRun,
  listWorkflowSteps,
  listCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  respondToEvent,
  listWorkspaceMembers,
  findMemberMail,
  findMemberEvents,
  findMemberFiles,
  listDrives,
  listFolder,
  searchFiles,
  getFile,
  getFileText,
  createFolder,
  renameFile,
  moveFile,
  deleteFile,
  snoozeEmail,
  cancelSnooze,
  unsnoozeEmail,
  listSnoozed,
  scheduleEmail,
  listScheduled,
  cancelScheduled,
  retryScheduled,
  listAttachments,
  getAttachmentText,
  muteThread,
  unmuteThread,
  listMuted,
  addReadLater,
  removeReadLater,
  listReadLater,
  listSubscriptions,
  unsubscribe,
  createLabel,
  deleteLabel,
  setLabels,
  searchContacts,
  listAddressBooks,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  deleteDraft,
  getRawEmail,
  summarizeThread,
  listPins,
  pinFolder,
  unpinFolder,
  getDriveQuota,
  previewDecision,
  listInvites,
  removeMember,
  revokeInvite,
  setWorkspaceTheme,
  listSignatures,
  saveSignature,
  deleteSignature,
  setMailFooter,
} satisfies Record<ToolKey | McpOnlyToolKey, unknown>;

export function buildMcpServer(
  prefs: McpToolPrefs | null | undefined,
  viewer: { instanceRole: InstanceRole | null },
) {
  const phishingDetection = phishingDetectionEnabled();
  const decisionSteps = decisionEnabled("workflowNode");
  const graphTools = decisionSteps
    ? workflowGraphTools.withDecisionSteps
    : workflowGraphTools.withoutDecisionSteps;
  const tools = Object.fromEntries(
    Object.entries({ ...MCP_TOOLS, ...graphTools }).filter(([key]) => {
      if (!isMcpToolKey(key)) return false;
      if (key === "analyzePhishing" && !phishingDetection) {
        return false;
      }
      if (key === "previewDecision" && !decisionSteps) return false;
      if (!mcpToolAllowed(key, viewer.instanceRole)) return false;
      return isMcpToolEnabled(prefs, key);
    }),
  );

  return new MCPServer({
    id: "metis-suite",
    name: "metis-suite",
    version: "0.1.0",
    tools,
    protocolVersion: "2026-07-28",
  });
}
