import { isOneOf } from "@/lib/guards";
import type { McpOnlyToolKey, ToolKey } from "@/mastra/toolkit/keys";
import {
  type DashboardRequirement,
  type InstanceRole,
  meetsRequirement,
} from "@/types/instance-role";

export const MCP_TOOL_MANIFEST = [
  {
    key: "listWorkspaces",
    label: "List workspaces",
    description: "List the workspaces this client can reach",
    group: "Workspaces",
  },
  {
    key: "getWorkspace",
    label: "Open workspace",
    description: "Read one workspace's mailboxes, calendars, drives, address books and members",
    group: "Workspaces",
  },
  {
    key: "createWorkspace",
    label: "Create workspace",
    description: "Create a new, empty workspace that you own",
    group: "Workspaces",
    sensitive: true,
  },
  {
    key: "attachResource",
    label: "Attach to workspace",
    description:
      "Attach one of your mailboxes, calendars, drives or address books to a workspace, with AI off",
    group: "Workspaces",
    sensitive: true,
  },
  {
    key: "listAccountResources",
    label: "List your accounts",
    description:
      "List your mailboxes, calendars, drives and address books and the reachable workspaces each is attached to",
    group: "Account",
  },
  {
    key: "listUnavailableAccounts",
    label: "List unavailable accounts",
    description: "List your connected accounts that stopped working",
    group: "Account",
  },
  {
    key: "listSignupInvites",
    label: "List sign-up invites",
    description: "List the pending account invitations (instance owner, admins and observers)",
    group: "Account",
    instance: "read",
  },
  {
    key: "createSignupInvite",
    label: "Send sign-up invite",
    description: "Email someone an invitation to create an account (instance owner and admins)",
    group: "Account",
    sensitive: true,
    instance: "operate",
  },
  {
    key: "revokeSignupInvite",
    label: "Revoke sign-up invite",
    description:
      "Revoke an account invitation that was not accepted yet (instance owner and admins)",
    group: "Account",
    sensitive: true,
    instance: "operate",
  },
  {
    key: "getInstanceStats",
    label: "Instance totals",
    description: "Count users, workspaces and connected accounts on the server",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceUsage",
    label: "AI usage",
    description: "Read AI calls, tokens and cost across the server",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceOverview",
    label: "Instance overview",
    description: "Read the server's health, backlog and recent failures",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceConnections",
    label: "Instance connections",
    description: "Read connected accounts by provider across the server",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstancePeople",
    label: "Instance people",
    description: "Read accounts, two-factor adoption, bans and pending invites",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceUsers",
    label: "Instance users",
    description:
      "List accounts with their role and ban, filtered like Dashboard → Accounts → Users",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceWorkspaces",
    label: "Instance workspaces",
    description: "Read every workspace with its members and resources",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceAutomation",
    label: "Instance automation",
    description: "Read the workflow runner's state and recent runs",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceMcpClients",
    label: "Instance MCP clients",
    description: "List every MCP client registered on the server",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getInstanceAuditLog",
    label: "Audit log",
    description: "Read security-relevant changes across the server",
    group: "Instance (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemOverview",
    label: "System overview",
    description: "Read how every driver and provider is configured",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemInstance",
    label: "Instance settings",
    description: "Read the app URL, sign-up mode, legal links and relay limits",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemLlm",
    label: "LLM settings",
    description: "Read the LLM and decision-model configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemPhishing",
    label: "Phishing settings",
    description: "Read the phishing-detection configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemMail",
    label: "Mail settings",
    description: "Read the transactional mail configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemCache",
    label: "Cache settings",
    description: "Read the cache driver configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemRunner",
    label: "Runner settings",
    description: "Read the workflow runner's configuration and health",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemDatabase",
    label: "Database settings",
    description: "Read the database configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "getSystemProvider",
    label: "Provider settings",
    description: "Read one connection provider's configuration",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "runSystemCheck",
    label: "Run health check",
    description: "Connect to a driver or provider now and report the result",
    group: "System (dashboard)",
    instance: "operate",
    sensitive: true,
  },
  {
    key: "getPreflightWarnings",
    label: "Deploy warnings",
    description: "Read what the last deploy's preflight run warned about",
    group: "System (dashboard)",
    instance: "read",
  },
  {
    key: "listMailboxes",
    label: "List mailboxes",
    description: "List the connected mailboxes in a workspace",
    group: "Mailboxes",
  },
  {
    key: "aggregateInbox",
    label: "Aggregate inbox",
    description: "Read a merged inbox across every connected mailbox",
    group: "Messages",
  },
  {
    key: "listEmails",
    label: "List emails",
    description: "List emails from a folder of one mailbox",
    group: "Messages",
  },
  {
    key: "getEmail",
    label: "Get email",
    description: "Read the full body of a single email",
    group: "Messages",
  },
  {
    key: "getThread",
    label: "Get thread",
    description: "Read an entire conversation thread",
    group: "Messages",
  },
  {
    key: "searchMail",
    label: "Search mail",
    description: "Search across one or all mailboxes",
    group: "Search",
  },
  {
    key: "markRead",
    label: "Mark read",
    description: "Mark emails as read or unread",
    group: "Actions",
  },
  {
    key: "starEmail",
    label: "Star email",
    description: "Star or unstar an email",
    group: "Actions",
  },
  {
    key: "archiveEmail",
    label: "Archive email",
    description: "Archive an email out of the inbox",
    group: "Actions",
  },
  {
    key: "restoreEmail",
    label: "Restore email",
    description: "Restore an archived or trashed email",
    group: "Actions",
  },
  {
    key: "deleteEmails",
    label: "Delete emails",
    description: "Move emails to the trash",
    group: "Actions",
    sensitive: true,
  },
  {
    key: "sendEmail",
    label: "Send email",
    description: "Send mail from a connected mailbox",
    group: "Actions",
    sensitive: true,
  },
  {
    key: "analyzePhishing",
    label: "Analyze phishing",
    description: "Score an email with the phishing-detection engine",
    group: "Messages",
  },
  {
    key: "listLabels",
    label: "List labels",
    description: "List the built-in and custom labels",
    group: "Labels",
  },
  {
    key: "setLabel",
    label: "Set label",
    description: "Apply a label to an email",
    group: "Labels",
  },
  {
    key: "clearLabel",
    label: "Clear label",
    description: "Remove the label from an email",
    group: "Labels",
  },
  {
    key: "createDraft",
    label: "Create draft",
    description: "Create a draft email (never sends)",
    group: "Drafts",
  },
  {
    key: "updateDraft",
    label: "Update draft",
    description: "Update an existing draft",
    group: "Drafts",
  },
  {
    key: "deleteDraft",
    label: "Delete draft",
    description: "Delete a draft",
    group: "Drafts",
    sensitive: true,
  },
  {
    key: "listAttachments",
    label: "List attachments",
    description: "List the attachments on an email",
    group: "Messages",
  },
  {
    key: "getAttachmentText",
    label: "Read attachment",
    description: "Read a PDF, invite, contact card, pass, forwarded email or text attachment",
    group: "Messages",
  },
  {
    key: "getRawEmail",
    label: "Get raw email",
    description: "Read an email's full source and headers",
    group: "Messages",
  },
  {
    key: "summarizeThread",
    label: "Summarize thread",
    description: "Summarize a conversation into cards",
    group: "Messages",
  },
  {
    key: "setLabels",
    label: "Set labels",
    description: "Apply one label to several emails",
    group: "Labels",
  },
  {
    key: "createLabel",
    label: "Create label",
    description: "Create a custom label in a mailbox",
    group: "Labels",
  },
  {
    key: "deleteLabel",
    label: "Delete label",
    description: "Delete a custom label from a mailbox",
    group: "Labels",
    sensitive: true,
  },
  {
    key: "snoozeEmail",
    label: "Snooze email",
    description: "Archive an email until a chosen time",
    group: "Snooze & schedule",
  },
  {
    key: "cancelSnooze",
    label: "Cancel snooze",
    description: "Cancel a snooze and leave the email archived",
    group: "Snooze & schedule",
  },
  {
    key: "unsnoozeEmail",
    label: "Unsnooze email",
    description: "Bring a snoozed email back to the inbox now",
    group: "Snooze & schedule",
  },
  {
    key: "listSnoozed",
    label: "List snoozed",
    description: "List snoozed emails and when they come back",
    group: "Snooze & schedule",
  },
  {
    key: "scheduleEmail",
    label: "Schedule email",
    description: "Schedule mail to send later from a connected mailbox",
    group: "Snooze & schedule",
    sensitive: true,
  },
  {
    key: "listScheduled",
    label: "List scheduled",
    description: "List scheduled emails and their status",
    group: "Snooze & schedule",
  },
  {
    key: "cancelScheduled",
    label: "Cancel scheduled",
    description: "Call back a scheduled email before it goes out",
    group: "Snooze & schedule",
    sensitive: true,
  },
  {
    key: "retryScheduled",
    label: "Retry scheduled",
    description: "Retry a scheduled email whose send failed",
    group: "Snooze & schedule",
    sensitive: true,
  },
  {
    key: "muteThread",
    label: "Mute thread",
    description: "Keep new replies in a conversation out of your inbox",
    group: "Triage",
  },
  {
    key: "unmuteThread",
    label: "Unmute thread",
    description: "Unmute a conversation",
    group: "Triage",
  },
  {
    key: "listMuted",
    label: "List muted",
    description: "List the conversations you muted",
    group: "Triage",
  },
  {
    key: "addReadLater",
    label: "Read later",
    description: "Keep an email on your read-later list",
    group: "Triage",
  },
  {
    key: "removeReadLater",
    label: "Remove from read later",
    description: "Take an email off your read-later list",
    group: "Triage",
  },
  {
    key: "listReadLater",
    label: "List read later",
    description: "List your read-later emails",
    group: "Triage",
  },
  {
    key: "listSubscriptions",
    label: "List subscriptions",
    description: "Find newsletters and mailing lists in a mailbox",
    group: "Triage",
  },
  {
    key: "unsubscribe",
    label: "Unsubscribe",
    description: "Unsubscribe from newsletters and mailing lists",
    group: "Triage",
    sensitive: true,
  },
  {
    key: "listWorkflows",
    label: "List workflows",
    description: "List this workspace's workflow graphs",
    group: "Workflows",
  },
  {
    key: "listWorkflowRuns",
    label: "List workflow runs",
    description: "Review recent workflow runs and their per-step outcomes",
    group: "Workflows",
  },
  {
    key: "getWorkflowRun",
    label: "Get workflow run",
    description:
      "Open one workflow run — its trigger, revision, every step's attempts and its open waits",
    group: "Workflows",
  },
  {
    key: "listWorkflowSteps",
    label: "List workflow steps",
    description: "Read the catalog of workflow triggers and steps, with their settings",
    group: "Workflows",
  },
  {
    key: "createWorkflow",
    label: "Create workflow",
    description: "Create a workflow graph — a standing instruction that runs in the background",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "updateWorkflow",
    label: "Update workflow",
    description: "Rewrite an existing workflow",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "toggleWorkflow",
    label: "Toggle workflow",
    description: "Enable or disable a workflow",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "deleteWorkflow",
    label: "Delete workflow",
    description: "Delete a workflow (workspace admins only)",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "applyWorkflows",
    label: "Run workflow now",
    description: "Queue a manual run of one workflow",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "cancelWorkflowRun",
    label: "Cancel workflow run",
    description:
      "Cancel one queued or running workflow run — steps already in progress are not called back",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "resumeWorkflowRun",
    label: "Retry workflow run",
    description:
      "Re-queue the failed or blocked steps of one run — completed steps and sends are never repeated",
    group: "Workflows",
    sensitive: true,
  },
  {
    key: "previewDecision",
    label: "Preview decision",
    description: "Try an Ask step on recent mail without saving anything",
    group: "Workflows",
  },
  {
    key: "listCalendars",
    label: "List calendars",
    description: "List the calendar accounts and the calendars this workspace can see",
    group: "Calendar",
  },
  {
    key: "listEvents",
    label: "List events",
    description: "Read events in a time window across the visible calendars",
    group: "Calendar",
  },
  {
    key: "getEvent",
    label: "Get event",
    description: "Read one event in full, including attendee responses",
    group: "Calendar",
  },
  {
    key: "createEvent",
    label: "Create event",
    description: "Create a real calendar event and notify its attendees",
    group: "Calendar",
    sensitive: true,
  },
  {
    key: "updateEvent",
    label: "Update event",
    description: "Change an existing event and notify its attendees",
    group: "Calendar",
    sensitive: true,
  },
  {
    key: "deleteEvent",
    label: "Delete event",
    description: "Delete an event and notify its attendees",
    group: "Calendar",
    sensitive: true,
  },
  {
    key: "respondToEvent",
    label: "Respond to invite",
    description: "Accept, decline, or tentatively accept an invitation",
    group: "Calendar",
    sensitive: true,
  },
  {
    key: "listAddressBooks",
    label: "List address books",
    description: "List the address books and the books this workspace can see",
    group: "Contacts",
  },
  {
    key: "searchContacts",
    label: "Search contacts",
    description: "Search saved contacts by name, email, phone or organization",
    group: "Contacts",
  },
  {
    key: "getContact",
    label: "Read contact",
    description: "Open one saved contact in full",
    group: "Contacts",
  },
  {
    key: "createContact",
    label: "Create contact",
    description: "Save a new contact to an address book",
    group: "Contacts",
    sensitive: true,
  },
  {
    key: "updateContact",
    label: "Edit contact",
    description: "Change a saved contact",
    group: "Contacts",
    sensitive: true,
  },
  {
    key: "deleteContact",
    label: "Delete contact",
    description: "Delete a saved contact at the provider",
    group: "Contacts",
    sensitive: true,
  },
  {
    key: "listWorkspaceMembers",
    label: "List members",
    description: "List the people in the workspace and their roles",
    group: "People",
  },
  {
    key: "findMemberMail",
    label: "Find member mail",
    description: "Find mail exchanged with one workspace member",
    group: "People",
  },
  {
    key: "findMemberEvents",
    label: "Find member events",
    description: "See what a workspace member has on in a time window",
    group: "People",
  },
  {
    key: "findMemberFiles",
    label: "Find member files",
    description: "List and search the drives a workspace member connected",
    group: "People",
  },
  {
    key: "listDrives",
    label: "List drives",
    description: "List the file storage drives connected to this workspace",
    group: "Drive",
  },
  {
    key: "listFolder",
    label: "Browse folders",
    description: "List the files and folders inside a drive folder",
    group: "Drive",
  },
  {
    key: "searchFiles",
    label: "Search files",
    description: "Search every connected drive by file name or content",
    group: "Drive",
  },
  {
    key: "getFile",
    label: "Get file details",
    description: "Read one file's name, size, type and location",
    group: "Drive",
  },
  {
    key: "getFileText",
    label: "Read text file",
    description: "Read the contents of a plain-text file in a drive",
    group: "Drive",
  },
  {
    key: "createFolder",
    label: "Create folder",
    description: "Create a new folder inside an existing drive folder",
    group: "Drive",
    sensitive: true,
  },
  {
    key: "renameFile",
    label: "Rename file",
    description: "Rename a file or folder in a drive",
    group: "Drive",
    sensitive: true,
  },
  {
    key: "moveFile",
    label: "Move file",
    description: "Move a file or folder into another folder in the same drive",
    group: "Drive",
    sensitive: true,
  },
  {
    key: "deleteFile",
    label: "Delete file",
    description: "Delete a file or folder from a drive",
    group: "Drive",
    sensitive: true,
  },
  {
    key: "listPins",
    label: "List pins",
    description: "List the drive folders you pinned",
    group: "Drive",
  },
  {
    key: "pinFolder",
    label: "Pin folder",
    description: "Pin a drive folder for quick access (only you see it)",
    group: "Drive",
  },
  {
    key: "unpinFolder",
    label: "Unpin folder",
    description: "Remove one of your folder pins",
    group: "Drive",
  },
  {
    key: "getDriveQuota",
    label: "Drive storage",
    description: "Read how much storage each drive uses",
    group: "Drive",
  },
  {
    key: "listInvites",
    label: "List invites",
    description: "List pending invitations to a workspace (admins)",
    group: "Workspace admin",
  },
  {
    key: "revokeInvite",
    label: "Revoke invite",
    description: "Revoke a pending workspace invitation (admins)",
    group: "Workspace admin",
    sensitive: true,
  },
  {
    key: "removeMember",
    label: "Remove member",
    description: "Remove someone from a workspace (admins)",
    group: "Workspace admin",
    sensitive: true,
  },
  {
    key: "setWorkspaceTheme",
    label: "Change accent color",
    description: "Change a workspace's accent color for everyone (admins)",
    group: "Workspace admin",
    sensitive: true,
  },
] as const satisfies readonly {
  key: ToolKey | McpOnlyToolKey;
  label: string;
  description: string;
  group: string;
  sensitive?: true;
  instance?: DashboardRequirement;
}[];

type ManifestEntry = (typeof MCP_TOOL_MANIFEST)[number];

export type McpToolKey = ManifestEntry["key"];

type RosterKey = ToolKey | McpOnlyToolKey;

export const MANIFEST_COVERS_EVERY_TOOL: Exclude<RosterKey, McpToolKey> extends never
  ? true
  : ["missing from MCP_TOOL_MANIFEST", Exclude<RosterKey, McpToolKey>] = true;

const INSTANCE_REQUIREMENTS = new Map<McpToolKey, DashboardRequirement>(
  MCP_TOOL_MANIFEST.flatMap((t) => ("instance" in t ? [[t.key, t.instance] as const] : [])),
);

export function mcpToolAllowed(key: McpToolKey, instanceRole: InstanceRole | null): boolean {
  const requirement = INSTANCE_REQUIREMENTS.get(key);
  if (!requirement) return true;
  return instanceRole !== null && meetsRequirement(instanceRole, requirement);
}

export function mcpToolsFor(viewer: { instanceRole: InstanceRole | null }) {
  return MCP_TOOL_MANIFEST.filter((t) => mcpToolAllowed(t.key, viewer.instanceRole));
}

export const MCP_TOOL_KEYS = MCP_TOOL_MANIFEST.map((t) => t.key);

export function isMcpToolKey(value: string): value is McpToolKey {
  return isOneOf(MCP_TOOL_KEYS, value);
}

const SENSITIVE = new Set<McpToolKey>(
  MCP_TOOL_MANIFEST.filter((t) => "sensitive" in t).map((t) => t.key),
);

export function isSensitiveTool(key: McpToolKey): boolean {
  return SENSITIVE.has(key);
}

export type McpToolPrefs = Partial<Record<McpToolKey, boolean>>;

export type McpCapabilityPrefs = {
  tools?: McpToolPrefs;
  resources?: Record<string, boolean>;
  prompts?: Record<string, boolean>;
};

export function isMcpToolEnabled(prefs: McpToolPrefs | null | undefined, key: McpToolKey): boolean {
  return prefs?.[key] ?? !SENSITIVE.has(key);
}

export function sensitiveToolsTurnedOn(
  before: McpToolPrefs | null | undefined,
  after: McpToolPrefs,
): McpToolKey[] {
  return [...SENSITIVE].filter(
    (key) => !isMcpToolEnabled(before, key) && isMcpToolEnabled(after, key),
  );
}
