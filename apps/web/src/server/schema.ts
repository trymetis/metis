import { z } from "zod";

import { REFERENCE_TYPES } from "@/ai/references";
import { AI_USAGE_FEATURES } from "@/ai/usage-features";
import { isTwoFactorCodeComplete } from "@/auth/two-factor-code";
import { connectionCredentialsSchema } from "@/connections/credential-schema";
import {
  CALENDAR_PROVIDERS,
  CONNECTION_PROVIDERS,
  CONNECTION_RESOURCES,
  DRIVE_PROVIDERS,
  MAIL_PROVIDERS,
} from "@/connections/types";
import { summarySpecSchema } from "@/mail/summary-catalog";
import { MCP_PRESET_IDS } from "@/mcp/presets";
import { MCP_TOOL_KEYS } from "@/mcp/tools";
import { LOCAL_MAIL_STATES, SEARCH_KINDS } from "@/search/fields";
import { MAX_SEARCH_LENGTH } from "@/search/query";
import { THEME_BRAND_IDS } from "@/theme/brand";
import { ANALYSIS_ACTIONS, CLASSIFICATIONS } from "@/types/analysis";
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_KINDS,
  AUDIT_SEARCH_MAX_LENGTH,
  AUDIT_VIAS,
} from "@/types/audit";
import { ATTENDEE_RESPONSES, EVENT_STATUSES } from "@/types/calendar";
import { DRIVE_ENTRY_KINDS, DRIVE_UPLOAD_STRATEGIES } from "@/types/drive";
import {
  CONFIG_FIELD_KINDS,
  CONFIG_SECTIONS,
  INSTANCE_CONFIG_KINDS,
} from "@/types/instance-config";
import {
  CUSTOM_LABEL_COLORS,
  MAIL_FOLDERS,
  MAIL_LABEL_SOURCES,
  MAIL_REMOTE_ALLOW_KINDS,
  MAIL_REMOTE_CONTENT_MODES,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_STATUSES,
} from "@/types/mail";
import { PREFLIGHT_WARNING_KINDS } from "@/types/preflight";
import {
  WORKSPACE_AI_POLICIES,
  WORKSPACE_INVITE_ROLES,
  WORKSPACE_PHISHING_DETECTION_POLICIES,
  WORKSPACE_ROLES,
} from "@/types/workspace";
import { RUN_SOURCES } from "@/workflow/runtime";
import {
  edgeSchema,
  graphSchema,
  nodeSchema,
  RUN_STATUSES,
  SEND_CLOSE_REASONS,
  SEND_RESOLUTION_OUTCOMES,
  STEP_STATUSES,
  WORKFLOW_KINDS,
  type WorkflowGraph,
  workflowDefinitionInputSchema,
  workflowSourceStateSchema,
} from "@/workflow/schema";

export const connectionProviderSchema = z.enum(CONNECTION_PROVIDERS);
export const mailProviderSchema = z.enum(MAIL_PROVIDERS);
export const calendarProviderSchema = z.enum(CALENDAR_PROVIDERS);
export const driveProviderSchema = z.enum(DRIVE_PROVIDERS);
const connectServerNameSchema = z.string().nullable();
export const mailFolderSchema = z.enum(MAIL_FOLDERS);

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export const inviteRoleSchema = z.enum(WORKSPACE_INVITE_ROLES);
export const emailAddressSchema = z.email("Enter a valid email address").trim().toLowerCase();

export const okSchema = z.object({ ok: z.literal(true) });
export const successSchema = z.object({ success: z.literal(true) });

export const workspaceScopeSchema = z.object({
  workspaceSlug: z.string().min(1),
});
export const mailboxScopeSchema = workspaceScopeSchema.extend({
  mailboxSlug: z.string().min(1),
});

export const calendarScopeSchema = workspaceScopeSchema.extend({
  calendarSlug: z.string().min(1),
});

export const driveScopeSchema = workspaceScopeSchema.extend({
  driveSlug: z.string().min(1),
});

export type WorkspaceScope = z.infer<typeof workspaceScopeSchema>;
export type MailboxScope = z.infer<typeof mailboxScopeSchema>;
export type CalendarScope = z.infer<typeof calendarScopeSchema>;
export type DriveScope = z.infer<typeof driveScopeSchema>;

export const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export const recipientSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
});

export const emailSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  from: z.string(),
  fromName: z.string().optional(),
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  toRecipients: z.array(recipientSchema).optional(),
  ccRecipients: z.array(recipientSchema).optional(),
  replyTo: z.array(recipientSchema).optional(),
  messageIdHeader: z.string().optional(),
  references: z.string().optional(),
  subject: z.string(),
  snippet: z.string(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  date: z.string(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  labels: z.array(z.string()).optional(),
  provider: mailProviderSchema,
  folder: mailFolderSchema,
  mailboxId: z.string().optional(),
  mailboxSlug: z.string().optional(),
  mailboxEmail: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export const draftAttachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  contentBase64: z.string(),
});

export const draftPayloadSchema = z.object({
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  replyToMessageId: z.string().optional(),
  attachments: z.array(draftAttachmentSchema).optional(),
});

export const fromMailboxSchema = z.object({
  fromMailboxSlug: z.string().min(1).optional(),
});

export const sendMessageInputSchema = mailboxScopeSchema
  .extend(fromMailboxSchema.shape)
  .extend(draftPayloadSchema.shape)
  .refine((payload) => payload.to.length > 0 && payload.subject.length > 0, {
    message: "Missing required fields",
  });

export const messageIdInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const themeBrandSchema = z.enum(THEME_BRAND_IDS);
export const preferencesSchema = z.object({
  workspaceOrder: z.array(z.string().min(1)).max(100),
  mailRemoteContent: z.enum(MAIL_REMOTE_CONTENT_MODES),
  mailCleanLinks: z.boolean(),
  signInAlerts: z.boolean(),
});
export const updatePreferencesInputSchema = preferencesSchema.partial();

const remoteAllowAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .regex(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/, "Not an email address");
const remoteAllowDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/,
    "Not a domain",
  );

export const remoteAllowInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("address"), value: remoteAllowAddressSchema }),
  z.object({ kind: z.literal("domain"), value: remoteAllowDomainSchema }),
]);

export const remoteAllowEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(MAIL_REMOTE_ALLOW_KINDS),
  value: z.string(),
  createdAt: z.date(),
});

export const listRemoteAllowOutputSchema = z.object({
  entries: z.array(remoteAllowEntrySchema),
});

export const revokeRemoteAllowInputSchema = z.object({
  id: z.string().min(1),
});

const totpCodeSchema = z
  .string()
  .trim()
  .refine(isTwoFactorCodeComplete, "Enter an authenticator or backup code");

export const mcpClientSchema = z.object({
  clientId: z.string(),
  slug: z.string(),
  label: z.string(),
  preset: z.enum(MCP_PRESET_IDS).nullable(),
  activeGrants: z.number(),
  enabled: z.boolean(),
  tools: z.partialRecord(z.enum(MCP_TOOL_KEYS), z.boolean()),
  hiddenWorkspaceIds: z.array(z.string()),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
});

export type McpClient = z.infer<typeof mcpClientSchema>;

export const getMcpClientInputSchema = z.object({
  slug: z.string().min(1),
});

export const mcpWorkspaceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
  aiAvailable: z.boolean(),
});

export const mcpAccessOutputSchema = z.object({
  isOwner: z.boolean(),
  workspaces: z.array(mcpWorkspaceSchema),
});

export type McpAccess = z.infer<typeof mcpAccessOutputSchema>;

const mcpHiddenWorkspaceIdsSchema = z.array(z.string().min(1)).max(500);

export const createMcpClientInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  preset: z.enum(MCP_PRESET_IDS),
  port: z.number().int().min(1024).max(65535).optional(),
  redirectUris: z.array(z.url()).max(5).optional(),
});

export const createMcpClientOutputSchema = z.object({
  client: mcpClientSchema,
  instructions: z.string(),
});

export const setMcpClientEnabledInputSchema = z.object({
  clientId: z.string().min(1),
  enabled: z.boolean(),
  code: totpCodeSchema.optional(),
});

export const setMcpClientToolsInputSchema = z.object({
  clientId: z.string().min(1),
  tools: z.partialRecord(z.enum(MCP_TOOL_KEYS), z.boolean()),
});

export const setMcpClientHiddenWorkspacesInputSchema = z.object({
  clientId: z.string().min(1),
  workspaceIds: mcpHiddenWorkspaceIdsSchema,
});

export const deleteMcpClientInputSchema = z.object({
  clientId: z.string().min(1),
});

export const mcpGrantSchema = z.object({
  id: z.string(),
  authorizedAt: z.date(),
  expiresAt: z.date(),
  scopes: z.array(z.string()),
});

export const listMcpGrantsInputSchema = z.object({
  clientId: z.string().min(1),
});

export const revokeMcpGrantsInputSchema = z.object({
  clientId: z.string().min(1),
  grantId: z.string().min(1).optional(),
});

export const revokeMcpGrantsOutputSchema = z.object({
  revoked: z.number(),
});

export const publicMcpClientInputSchema = z.object({
  clientId: z.string().min(1),
});

export const publicMcpClientOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("connected"),
    label: z.string(),
    preset: z.enum(MCP_PRESET_IDS).nullable(),
    hiddenWorkspaceIds: z.array(z.string()),
    tools: z.array(z.object({ key: z.string(), label: z.string() })),
  }),
  z.object({
    status: z.literal("new"),
    label: z.string(),
    clientIdUrl: z.string(),
    redirectHosts: z.array(z.string()),
  }),
  z.object({ status: z.literal("unknown") }),
]);

export type PublicMcpClient = z.infer<typeof publicMcpClientOutputSchema>;

export const registerMcpConsentClientInputSchema = z.object({
  clientId: z.string().min(1),
  hiddenWorkspaceIds: mcpHiddenWorkspaceIdsSchema.optional(),
  tools: z.partialRecord(z.enum(MCP_TOOL_KEYS), z.boolean()),
  code: totpCodeSchema,
});

export const userSessionSchema = z.object({
  id: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  updatedAt: z.date(),
  expiresAt: z.date(),
  isCurrent: z.boolean(),
});

export const listUserSessionsOutputSchema = z.array(userSessionSchema);

export const revokeUserSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const deleteAccountEmailSchema = z.object({
  email: z.string().trim().min(1),
});

export const deleteAccountInputSchema = deleteAccountEmailSchema.extend({
  code: totpCodeSchema,
});

const exportedResourceLinkSchema = z.object({
  provider: connectionProviderSchema,
  email: z.string(),
  server: z.string().nullable(),
  slug: z.string(),
  aiEnabled: z.boolean(),
});

export const auditEventSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  action: z.enum(AUDIT_ACTIONS),
  via: z.enum(AUDIT_VIAS),
  mcpClientId: z.string().nullable(),
  actorEmail: z.string(),
  workspaceName: z.string().nullable(),
  targetLabel: z.string().nullable(),
  resourceKind: z.enum(AUDIT_RESOURCE_KINDS).nullable(),
  detail: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
  ),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventPageSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
});

export type AuditEventPage = z.infer<typeof auditEventPageSchema>;

export const auditFilterSchema = z.object({
  q: z.string().trim().max(AUDIT_SEARCH_MAX_LENGTH).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;

export const auditCursorInputSchema = z.object({
  cursor: z.string().max(200).optional(),
});

export const auditPageInputSchema = auditFilterSchema.extend(auditCursorInputSchema.shape);

export type AuditPageInput = z.infer<typeof auditPageInputSchema>;

export const workspaceAuditInputSchema = workspaceScopeSchema.extend({
  ...auditPageInputSchema.shape,
});

export const dashboardAuditOutputSchema = auditEventPageSchema.extend({
  retentionDays: z.number(),
});

export type DashboardAudit = z.infer<typeof dashboardAuditOutputSchema>;

export const dataExportSchema = z.object({
  format: z.literal("metis-suite-export"),
  version: z.literal(1),
  exportedAt: z.string(),
  notice: z.string(),
  account: z.object({
    name: z.string(),
    email: z.string(),
    createdAt: z.string(),
  }),
  preferences: z.object({
    defaultWorkspace: z.string().nullable(),
    workspaceOrder: z.array(z.string()),
    mailRemoteContent: z.enum(MAIL_REMOTE_CONTENT_MODES),
    mailCleanLinks: z.boolean(),
    signInAlerts: z.boolean(),
    remoteContentAllowed: z.array(
      z.object({
        kind: z.enum(MAIL_REMOTE_ALLOW_KINDS),
        value: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  workspaces: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      role: z.enum(WORKSPACE_ROLES),
      joinedAt: z.string(),
      aiPolicy: z.enum(WORKSPACE_AI_POLICIES),
      phishingDetectionPolicy: z.enum(WORKSPACE_PHISHING_DETECTION_POLICIES),
      themeBrand: z.enum(THEME_BRAND_IDS),
      mailboxes: z.array(
        exportedResourceLinkSchema.extend({
          phishingDetectionEnabled: z.boolean(),
        }),
      ),
      calendars: z.array(
        exportedResourceLinkSchema.extend({
          visibleCalendarIds: z.array(z.string()),
        }),
      ),
      drives: z.array(
        exportedResourceLinkSchema.extend({
          visibleRootIds: z.array(z.string()),
        }),
      ),
    }),
  ),
  labels: z.array(
    z.object({
      mailbox: z.string(),
      provider: connectionProviderSchema,
      definitions: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          color: z.enum(CUSTOM_LABEL_COLORS),
          createdAt: z.string(),
        }),
      ),
      assignments: z.array(
        z.object({
          messageId: z.string(),
          label: z.string(),
          source: z.enum(MAIL_LABEL_SOURCES),
          confidence: z.number(),
          classifiedAt: z.string(),
        }),
      ),
    }),
  ),
  workflows: z.array(
    z.object({
      workspace: z.string().nullable(),
      name: z.string(),
      enabled: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
      mailboxes: z.record(z.string(), z.string()),
      calendars: z.record(z.string(), z.string()),
      drives: z.record(z.string(), z.string()),
      graph: z.custom<WorkflowGraph>(),
    }),
  ),
  assistantThreads: z.array(
    z.object({
      workspace: z.string().nullable(),
      title: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      messages: z.array(z.any()),
    }),
  ),
  securityActivity: z.array(
    auditEventSchema
      .omit({ id: true, createdAt: true, mcpClientId: true })
      .extend({ at: z.string() }),
  ),
});

export type DataExport = z.infer<typeof dataExportSchema>;

export const setThemeBrandInputSchema = workspaceScopeSchema.extend({
  themeBrand: themeBrandSchema,
});

export const deleteWorkspaceOutputSchema = successSchema;

export const getWorkspacePolicyOutputSchema = z.object({
  aiPolicy: z.enum(WORKSPACE_AI_POLICIES),
  phishingDetectionPolicy: z.enum(WORKSPACE_PHISHING_DETECTION_POLICIES),
  platform: z.object({ ai: z.boolean(), phishingDetection: z.boolean() }),
  mailboxes: z.array(
    z.object({
      linkId: z.string(),
      email: z.string(),
      aiEnabled: z.boolean(),
      phishingDetectionEnabled: z.boolean(),
    }),
  ),
});

export const setWorkspacePolicyInputSchema = workspaceScopeSchema.extend({
  aiPolicy: z.enum(WORKSPACE_AI_POLICIES).optional(),
  phishingDetectionPolicy: z.enum(WORKSPACE_PHISHING_DETECTION_POLICIES).optional(),
  code: totpCodeSchema,
});

export const acceptInviteInputSchema = z.object({
  token: z.string().trim().min(1),
});
export const acceptInviteOutputSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  workspaceSlug: z.string(),
});

export const resolvedPolicySchema = z.object({
  ai: z.boolean(),
  phishingDetection: z.boolean(),
});

export const workspaceAiPolicySchema = z.enum(WORKSPACE_AI_POLICIES);
export const workspacePhishingDetectionPolicySchema = z.enum(WORKSPACE_PHISHING_DETECTION_POLICIES);

export const workspaceMailboxSchema = z.object({
  mailboxId: z.string(),
  linkId: z.string(),
  provider: mailProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  slug: z.string(),
  image: z.string().nullable(),
  ownedByMe: z.boolean(),
  aiEnabled: z.boolean(),
  phishingDetectionEnabled: z.boolean(),
  policy: resolvedPolicySchema,
});

export const listWorkspaceMailboxesOutputSchema = z.object({
  primary: z.object({
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  }),
  mailboxes: z.array(workspaceMailboxSchema),
  viewerRole: workspaceRoleSchema.nullable(),
});

export const attachableMailboxSchema = z.object({
  mailboxId: z.string(),
  provider: mailProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
});
export const listAttachableOutputSchema = z.object({
  mailboxes: z.array(attachableMailboxSchema),
});

export const attachMailboxInputSchema = workspaceScopeSchema.extend({
  mailboxId: z.string().min(1),
});
export const attachMailboxOutputSchema = z.object({
  linkId: z.string(),
  slug: z.string(),
});

export const userMailboxSchema = z.object({
  mailboxId: z.string(),
  provider: mailProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
  workspaces: z.array(
    z.object({
      linkId: z.string(),
      name: z.string(),
      workspaceSlug: z.string(),
      mailboxSlug: z.string(),
      aiEnabled: z.boolean(),
      phishingDetectionEnabled: z.boolean(),
      policy: resolvedPolicySchema,
    }),
  ),
});

export const setMailboxPolicyInputSchema = z.object({
  linkId: z.string().min(1),
  aiEnabled: z.boolean().optional(),
  phishingDetectionEnabled: z.boolean().optional(),
  code: totpCodeSchema.optional(),
});

export const setAllMailboxPolicyInputSchema = z.object({
  mailboxId: z.string().min(1),
  aiEnabled: z.boolean().optional(),
  phishingDetectionEnabled: z.boolean().optional(),
  code: totpCodeSchema.optional(),
});
export const listUserMailboxesOutputSchema = z.object({
  mailboxes: z.array(userMailboxSchema),
});

export const detachMailboxInputSchema = z.object({
  linkId: z.string().min(1),
});

export const detachWorkspaceMailboxInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
});

export const deleteMailboxInputSchema = z.object({
  mailboxId: z.string().min(1),
});

export const connectionResourceSchema = z.enum(CONNECTION_RESOURCES);

export const userConnectionSchema = z.object({
  connectionId: z.string(),
  provider: connectionProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
  granted: z.array(connectionResourceSchema),
  linked: z.array(connectionResourceSchema),
});
export const listConnectionsOutputSchema = z.object({
  connections: z.array(userConnectionSchema),
});

export const unavailableConnectionsOutputSchema = z.object({
  connectionIds: z.array(z.string()),
});

export const deleteConnectionInputSchema = z.object({
  connectionId: z.string().min(1),
});

export const createCredentialConnectionInputSchema = z.object({
  email: emailAddressSchema,
  credentials: connectionCredentialsSchema,
  attachToWorkspaceSlug: z.string().min(1).optional(),
});

export const createCredentialConnectionOutputSchema = z.object({
  connectionId: z.string(),
  resource: z.enum(CONNECTION_RESOURCES),
  slug: z.string().nullable(),
});

export const providerCalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  timeZone: z.string().nullable(),
  primary: z.boolean(),
  readOnly: z.boolean(),
});
export const listProviderCalendarsOutputSchema = z.object({
  calendars: z.array(providerCalendarSchema),
});

export const userCalendarSchema = z.object({
  calendarId: z.string(),
  provider: calendarProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
  workspaces: z.array(
    z.object({
      linkId: z.string(),
      name: z.string(),
      workspaceSlug: z.string(),
      calendarSlug: z.string(),
      aiEnabled: z.boolean(),
      policy: z.object({ ai: z.boolean() }),
    }),
  ),
});

export const setCalendarPolicyInputSchema = z.object({
  linkId: z.string().min(1),
  aiEnabled: z.boolean(),
  code: totpCodeSchema.optional(),
});

export const setAllCalendarPolicyInputSchema = z.object({
  calendarId: z.string().min(1),
  aiEnabled: z.boolean(),
  code: totpCodeSchema.optional(),
});
export const listUserCalendarsOutputSchema = z.object({
  calendars: z.array(userCalendarSchema),
});

export const workspaceCalendarSchema = z.object({
  calendarId: z.string(),
  linkId: z.string(),
  provider: calendarProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  slug: z.string(),
  image: z.string().nullable(),
  ownedByMe: z.boolean(),
  visibleCalendarIds: z.array(z.string()),
  aiEnabled: z.boolean(),
  policy: z.object({ ai: z.boolean() }),
});
export const listWorkspaceCalendarsOutputSchema = z.object({
  calendars: z.array(workspaceCalendarSchema),
  viewerRole: workspaceRoleSchema.nullable(),
});

export const attachableCalendarSchema = z.object({
  calendarId: z.string(),
  provider: calendarProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
});
export const listAttachableCalendarsOutputSchema = z.object({
  calendars: z.array(attachableCalendarSchema),
});

export const attachCalendarInputSchema = workspaceScopeSchema.extend({
  calendarId: z.string().min(1),
});
export const attachCalendarOutputSchema = z.object({
  linkId: z.string(),
  slug: z.string(),
});

export const detachCalendarInputSchema = z.object({
  linkId: z.string().min(1),
});
export const detachWorkspaceCalendarInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
});
export const deleteCalendarInputSchema = z.object({
  calendarId: z.string().min(1),
});

export const workspaceCalendarLinkInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
});

export const setCalendarVisibilityInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
  visibleCalendarIds: z.array(z.string()),
});
export const setCalendarVisibilityOutputSchema = z.object({
  linkId: z.string(),
  visibleCalendarIds: z.array(z.string()),
});

export const attendeeResponseSchema = z.enum(ATTENDEE_RESPONSES);

export const eventAttendeeSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  response: attendeeResponseSchema.optional(),
  optional: z.boolean().optional(),
  organizer: z.boolean().optional(),
  self: z.boolean().optional(),
});

export const eventConferenceSchema = z.object({
  name: z.string().optional(),
  meetingId: z.string().optional(),
  passcode: z.string().optional(),
  phones: z
    .array(
      z.object({
        number: z.string(),
        label: z.string().optional(),
        pin: z.string().optional(),
      }),
    )
    .optional(),
});

export const calendarEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  calendarName: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  status: z.enum(EVENT_STATUSES).optional(),
  recurring: z.boolean().optional(),
  organizer: eventAttendeeSchema.optional(),
  attendees: z.array(eventAttendeeSchema).optional(),
  myResponse: attendeeResponseSchema.optional(),
  meetingUrl: z.string().optional(),
  conference: eventConferenceSchema.optional(),
  timeZone: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  accountId: z.string().optional(),
  accountSlug: z.string().optional(),
  accountEmail: z.string().optional(),
});

export const calendarSourceErrorSchema = z.object({
  accountId: z.string(),
  accountEmail: z.string(),
  error: z.string(),
});

export const listEventsInputSchema = calendarScopeSchema.extend({
  timeMin: z.string().min(1),
  timeMax: z.string().min(1),
  calendarIds: z.array(z.string()).optional(),
  query: z.string().optional(),
  max: z.number().int().min(1).max(2500).optional(),
});
export const listEventsOutputSchema = z.object({
  events: z.array(calendarEventSchema),
  calendarErrors: z.array(calendarSourceErrorSchema).optional(),
});
export const listEventDaysInputSchema = calendarScopeSchema.extend({
  timeMin: z.string().min(1),
  timeMax: z.string().min(1),
  calendarIds: z.array(z.string()).optional(),
  timeZone: z.string().min(1),
});
export const listEventDaysOutputSchema = z.object({
  days: z.record(z.string(), z.number().int()),
  calendarErrors: z.array(calendarSourceErrorSchema).optional(),
});

export const sessionCalendarSchema = providerCalendarSchema.extend({
  accountId: z.string(),
  accountSlug: z.string(),
  accountEmail: z.string(),
  provider: calendarProviderSchema,
  visible: z.boolean(),
});
export const listSessionCalendarsOutputSchema = z.object({
  calendars: z.array(sessionCalendarSchema),
  calendarErrors: z.array(calendarSourceErrorSchema).optional(),
});

export const getEventInputSchema = calendarScopeSchema.extend({
  accountId: z.string().optional(),
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
});

export const createEventInputSchema = calendarScopeSchema.extend({
  accountId: z.string().optional(),
  calendarId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
  addMeeting: z.boolean().optional(),
});
export const createEventOutputSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  accountId: z.string(),
});

export const updateEventInputSchema = calendarScopeSchema.extend({
  accountId: z.string().optional(),
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
});

export const respondEventInputSchema = getEventInputSchema.extend({
  response: attendeeResponseSchema,
});

export const driveEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(DRIVE_ENTRY_KINDS),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  modifiedAt: z.string().nullable(),
  parentId: z.string().nullable(),
  webUrl: z.string().nullable(),
  native: z.boolean(),
  driveId: z.string(),
  driveSlug: z.string(),
});

export const driveSourceErrorSchema = z.object({
  driveId: z.string(),
  driveSlug: z.string(),
  email: z.string(),
  message: z.string(),
});

export const driveListingOutputSchema = z.object({
  entries: z.array(driveEntrySchema),
  cursor: z.string().nullable(),
  driveErrors: z.array(driveSourceErrorSchema).optional(),
});

export const listDriveFolderInputSchema = driveScopeSchema.extend({
  driveId: z.string().optional(),
  parentId: z.string().nullable().optional(),
  cursor: z.string().optional(),
});

export const searchDriveInputSchema = driveScopeSchema.extend({
  driveId: z.string().optional(),
  query: z.string().trim().min(1).max(200),
  cursor: z.string().optional(),
});

export const driveEntryInputSchema = driveScopeSchema.extend({
  driveId: z.string().optional(),
  fileId: z.string().min(1),
});

export const createDriveFolderInputSchema = driveScopeSchema.extend({
  driveId: z.string().optional(),
  parentId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(255),
});

export const renameDriveEntryInputSchema = driveEntryInputSchema.extend({
  name: z.string().trim().min(1).max(255),
});

export const moveDriveEntryInputSchema = driveEntryInputSchema.extend({
  parentId: z.string().nullable(),
});

export const beginDriveUploadInputSchema = driveScopeSchema.extend({
  parentId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(0),
  mime: z.string().trim().min(1).max(255),
});

export const beginDriveUploadOutputSchema = z.object({
  strategy: z.enum(DRIVE_UPLOAD_STRATEGIES),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  chunkSize: z.number(),
  authRequired: z.boolean(),
});

export const driveQuotaSchema = z.object({
  driveId: z.string(),
  driveSlug: z.string(),
  email: z.string(),
  provider: driveProviderSchema,
  usedBytes: z.number().nullable(),
  totalBytes: z.number().nullable(),
});

export const driveQuotasOutputSchema = z.object({
  quotas: z.array(driveQuotaSchema),
  driveErrors: z.array(driveSourceErrorSchema).optional(),
});

export const userDriveSchema = z.object({
  driveId: z.string(),
  provider: driveProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
  workspaces: z.array(
    z.object({
      linkId: z.string(),
      name: z.string(),
      workspaceSlug: z.string(),
      driveSlug: z.string(),
      aiEnabled: z.boolean(),
      policy: z.object({ ai: z.boolean() }),
    }),
  ),
});

export const setDrivePolicyInputSchema = z.object({
  linkId: z.string().min(1),
  aiEnabled: z.boolean(),
  code: totpCodeSchema.optional(),
});

export const setAllDrivePolicyInputSchema = z.object({
  driveId: z.string().min(1),
  aiEnabled: z.boolean(),
  code: totpCodeSchema.optional(),
});
export const listUserDrivesOutputSchema = z.object({
  drives: z.array(userDriveSchema),
});

export const workspaceDriveSchema = z.object({
  driveId: z.string(),
  linkId: z.string(),
  provider: driveProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  slug: z.string(),
  image: z.string().nullable(),
  ownedByMe: z.boolean(),
  visibleRootIds: z.array(z.string()),
  aiEnabled: z.boolean(),
  policy: z.object({ ai: z.boolean() }),
});
export const listWorkspaceDrivesOutputSchema = z.object({
  drives: z.array(workspaceDriveSchema),
  viewerRole: workspaceRoleSchema.nullable(),
});

export const attachableDriveSchema = z.object({
  driveId: z.string(),
  provider: driveProviderSchema,
  email: z.string(),
  server: connectServerNameSchema,
  image: z.string().nullable(),
});
export const listAttachableDrivesOutputSchema = z.object({
  drives: z.array(attachableDriveSchema),
});

export const attachDriveInputSchema = workspaceScopeSchema.extend({
  driveId: z.string().min(1),
});
export const attachDriveOutputSchema = z.object({
  linkId: z.string(),
  slug: z.string(),
});

export const detachDriveInputSchema = z.object({
  linkId: z.string().min(1),
});
export const detachWorkspaceDriveInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
});
export const deleteDriveInputSchema = z.object({
  driveId: z.string().min(1),
});

export const workspaceDriveLinkInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
});

export const setDriveVisibilityInputSchema = workspaceScopeSchema.extend({
  linkId: z.string().min(1),
  visibleRootIds: z.array(z.string()),
});
export const setDriveVisibilityOutputSchema = z.object({
  linkId: z.string(),
  visibleRootIds: z.array(z.string()),
});

export const driveRootFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export const listDriveRootsOutputSchema = z.object({
  roots: z.array(driveRootFolderSchema),
});

export const drivePinSchema = z.object({
  id: z.string(),
  driveId: z.string(),
  driveSlug: z.string(),
  folderId: z.string(),
  label: z.string(),
});

export const listDrivePinsOutputSchema = z.object({
  pins: z.array(drivePinSchema),
});

export const createDrivePinInputSchema = driveScopeSchema.extend({
  driveId: z.string().optional(),
  folderId: z.string().min(1),
  label: z.string().trim().min(1).max(255),
});

export const deleteDrivePinInputSchema = driveScopeSchema.extend({
  pinId: z.string().min(1),
});

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
  themeBrand: themeBrandSchema,
  logo: z.string().nullable(),
});

export const setWorkspaceLogoInputSchema = workspaceScopeSchema.extend({
  imageBase64: z.string().min(1).max(7_500_000).nullable(),
});

export const setWorkspaceLogoOutputSchema = z.object({
  logo: z.string().nullable(),
});

export const workspaceIdInputSchema = workspaceScopeSchema;

export const deleteWorkspaceInputSchema = workspaceScopeSchema.extend({
  code: totpCodeSchema,
});

export const memberSchema = z.object({
  memberId: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: workspaceRoleSchema,
  joinedAt: z.date(),
});

export const pendingInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: workspaceRoleSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
});

export const listWorkspacesOutputSchema = z.object({
  workspaces: z.array(
    workspaceSummarySchema.extend({
      mailboxCount: z.number(),
      inboxMailboxSlug: z.string().nullable(),
      calendarCount: z.number(),
      firstCalendarSlug: z.string().nullable(),
      driveCount: z.number(),
      firstDriveSlug: z.string().nullable(),
    }),
  ),
});

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
});

export const createWorkspaceOutputSchema = z.object({
  workspaceId: z.string(),
  slug: z.string(),
  name: z.string(),
  role: z.literal("owner"),
});

export const listMembersOutputSchema = z.object({
  members: z.array(memberSchema),
  pendingInvites: z.array(pendingInviteSchema),
});

export const updateMemberRoleInputSchema = workspaceScopeSchema.extend({
  memberId: z.string().min(1),
  role: inviteRoleSchema,
  code: totpCodeSchema.optional(),
});

export const transferOwnershipInputSchema = workspaceScopeSchema.extend({
  memberId: z.string().min(1),
  code: totpCodeSchema,
});

export const removeMemberInputSchema = workspaceScopeSchema.extend({
  memberId: z.string().min(1),
});

export const listInvitesOutputSchema = z.object({
  invites: z.array(pendingInviteSchema),
});

export const createInviteInputSchema = workspaceScopeSchema.extend({
  email: emailAddressSchema,
  role: inviteRoleSchema.optional().default("member"),
});

export const createInviteOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: inviteRoleSchema,
  expiresAt: z.string(),
  url: z.string(),
});

export const revokeInviteInputSchema = workspaceScopeSchema.extend({
  inviteId: z.string().min(1),
});

export const signupNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(100, "Name must be 100 characters or fewer");

export const signupPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or fewer");

export const firstSignupInputSchema = z.object({
  setupCode: z.string().trim().min(1, "Enter the setup code"),
  name: signupNameSchema,
  email: emailAddressSchema,
  password: signupPasswordSchema,
});

export const firstSignupOutputSchema = z.object({
  email: z.string(),
  workspaceSlug: z.string(),
});

export const signupInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const createSignupInviteInputSchema = z.object({
  email: emailAddressSchema,
});

export const createSignupInviteOutputSchema = z.object({
  invite: signupInviteSchema,
  url: z.string(),
  delivered: z.boolean(),
});

export const listSignupInvitesOutputSchema = z.object({
  invites: z.array(signupInviteSchema),
});

export const revokeSignupInviteInputSchema = z.object({
  inviteId: z.string().min(1),
});

export const signupInviteTokenInputSchema = z.object({
  token: z.string().trim().min(1),
});

export const signupInvitePreviewOutputSchema = z.object({
  email: z.string(),
});

export const inviteSignupInputSchema = z.object({
  token: z.string().trim().min(1),
  name: signupNameSchema,
  password: signupPasswordSchema,
});

export const inviteSignupOutputSchema = z.object({
  email: z.string(),
  workspaceSlug: z.string(),
});

export const dashboardStatsOutputSchema = z.object({
  users: z.number(),
  workspaces: z.number(),
  mailboxes: z.number(),
  calendars: z.number(),
  drives: z.number(),
});

export const dashboardUsageRangeSchema = z.enum(["7d", "30d", "90d"]);

export const dashboardUsageInputSchema = z.object({
  range: dashboardUsageRangeSchema,
});

export const aiUsageFeatureSchema = z.enum(AI_USAGE_FEATURES);

const usageTokensSchema = z.object({
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

export const dashboardUsageTotalsSchema = usageTokensSchema.extend({
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
});

export const dashboardUsageByFeatureSchema = usageTokensSchema.extend({
  feature: aiUsageFeatureSchema,
});

export const dashboardUsageByModelSchema = usageTokensSchema.extend({
  model: z.string(),
  provider: z.string(),
});

export const dashboardUsageDaySchema = z.object({
  date: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

export const dashboardUsageCallSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  feature: aiUsageFeatureSchema,
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  steps: z.number(),
  finishReason: z.string().nullable(),
});

export const dashboardUsageOutputSchema = z.object({
  totals: dashboardUsageTotalsSchema,
  byFeature: z.array(dashboardUsageByFeatureSchema),
  byModel: z.array(dashboardUsageByModelSchema),
  daily: z.array(dashboardUsageDaySchema),
  recent: z.array(dashboardUsageCallSchema),
});

export const dashboardOverviewOutputSchema = z.object({
  quarantinedConnections: z.number(),
  scheduledPending: z.number(),
  scheduledOverdue: z.number(),
  scheduledFailed: z.number(),
  tokens7d: z.array(
    z.object({
      date: z.string(),
      totalTokens: z.number(),
    }),
  ),
});

export const dashboardProviderCountSchema = z.object({
  provider: z.string(),
  connections: z.number(),
  mailboxes: z.number(),
  calendars: z.number(),
  drives: z.number(),
});

export const dashboardQuarantinedConnectionSchema = z.object({
  id: z.string(),
  email: z.string(),
  provider: z.string(),
  quarantinedAt: z.string(),
});

export const dashboardConnectionsOutputSchema = z.object({
  total: z.number(),
  quarantined: z.number(),
  byProvider: z.array(dashboardProviderCountSchema),
  quarantinedList: z.array(dashboardQuarantinedConnectionSchema),
});

export const dashboardRecentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
  twoFactorEnabled: z.boolean(),
});

export const dashboardPeopleOutputSchema = z.object({
  users: z.number(),
  withTwoFactor: z.number(),
  pendingSignupInvites: z.number(),
  pendingWorkspaceInvites: z.number(),
  recentUsers: z.array(dashboardRecentUserSchema),
});

export const dashboardWorkspaceRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  aiPolicy: z.string(),
  members: z.number(),
  mailboxes: z.number(),
  calendars: z.number(),
  drives: z.number(),
  createdAt: z.string(),
});

export const dashboardWorkspacesOutputSchema = z.object({
  total: z.number(),
  shared: z.number(),
  personal: z.number(),
  list: z.array(dashboardWorkspaceRowSchema),
});

export const dashboardAutomationRunSchema = z.object({
  id: z.string(),
  workflowName: z.string(),
  kind: z.enum(WORKFLOW_KINDS),
  status: z.enum(RUN_STATUSES),
  error: z.string().nullable(),
  ranAt: z.string(),
});

export const DASHBOARD_RUNNER_STATUSES = ["never", "failing", "delayed", "busy", "idle"] as const;

export const dashboardRunnerSchema = z.object({
  driver: z.enum(["bullmq", "cron", "internal"]),
  cadenceSec: z.number(),
  tickBudgetMs: z.number(),
  status: z.enum(DASHBOARD_RUNNER_STATUSES),
  lastTickAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastDiscoveryAt: z.string().nullable(),
  nextCheckAt: z.string().nullable(),
  lastError: z.string().nullable(),
  dueTriggers: z.number(),
  discoveryLagMs: z.number().nullable(),
  triggerErrors: z.number(),
  backlog: z.number(),
  backlogAgeMs: z.number().nullable(),
  held: z.number(),
  blocked: z.number(),
  unknown: z.number(),
});

export const dashboardAutomationOutputSchema = z.object({
  runner: dashboardRunnerSchema,
  workflows: z.object({
    total: z.number(),
    enabled: z.number(),
    runs24h: z.number(),
    runs7d: z.number(),
    failures7d: z.number(),
  }),
  scheduled: z.object({
    pending: z.number(),
    completed: z.number(),
    failed: z.number(),
    pendingSnoozes: z.number(),
    pendingSends: z.number(),
  }),
  recentRuns: z.array(dashboardAutomationRunSchema),
});

export const dashboardMcpClientSchema = z.object({
  clientId: z.string(),
  label: z.string(),
  preset: z.string().nullable(),
  enabled: z.boolean(),
  cimd: z.boolean(),
  hiddenWorkspaces: z.number(),
  toolsEnabled: z.number(),
  toolsTotal: z.number(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const dashboardMcpOutputSchema = z.object({
  total: z.number(),
  enabled: z.number(),
  cimd: z.number(),
  clients: z.array(dashboardMcpClientSchema),
});

const dashboardSecretSchema = z.object({
  set: z.boolean(),
  hint: z.string().nullable(),
});

export const configSectionSchema = z.enum(CONFIG_SECTIONS);

const dashboardConfigSectionStateSchema = z.object({
  section: configSectionSchema,
  label: z.string(),
});

export const dashboardConfigStateSchema = z.object({
  version: z.number(),
  sections: z.array(dashboardConfigSectionStateSchema),
});

export const SYSTEM_DRIVERS = ["llm", "phishing", "mail", "cache", "runner", "database"] as const;
export const systemDriverSchema = z.enum(SYSTEM_DRIVERS);

export const SYSTEM_VENDORS = [
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "redis",
  "upstash",
  "turso",
  "sqlite",
  "resend",
  "aws",
  "cloudflare",
] as const;
const systemVendorSchema = z.enum(SYSTEM_VENDORS).nullable();

const SYSTEM_TONES = ["ok", "neutral", "warning", "danger", "off"] as const;

const dashboardSystemBadgeSchema = z.object({
  label: z.string(),
  tone: z.enum(SYSTEM_TONES),
});

const dashboardConnectionCountSchema = z.object({
  active: z.number(),
  quarantined: z.number(),
});

const dashboardEntryBaseSchema = z.object({
  name: z.string(),
  connections: dashboardConnectionCountSchema,
});

const dashboardEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  secure: z.boolean(),
});

export const dashboardProviderEntrySchema = z.discriminatedUnion("kind", [
  dashboardEntryBaseSchema.extend({
    kind: z.literal("imap"),
    imap: dashboardEndpointSchema,
    smtp: dashboardEndpointSchema,
    allowInsecureTls: z.boolean(),
  }),
  dashboardEntryBaseSchema.extend({
    kind: z.literal("dav"),
    url: z.string(),
    allowInsecureTls: z.boolean(),
  }),
  dashboardEntryBaseSchema.extend({
    kind: z.literal("gateway"),
    domain: z.string(),
    endpoint: z.string(),
  }),
  dashboardEntryBaseSchema.extend({
    kind: z.literal("s3"),
    vendor: systemVendorSchema,
    endpoint: z.string(),
    region: z.string(),
    accessKeyId: z.string(),
    secretAccessKey: dashboardSecretSchema,
    forcePathStyle: z.boolean(),
    allowInsecureTls: z.boolean(),
    transfer: z.string(),
    checksums: z.string(),
  }),
  dashboardEntryBaseSchema.extend({
    kind: z.literal("ftp"),
    host: z.string(),
    port: z.number(),
    secure: z.string(),
    allowInsecureTls: z.boolean(),
    poolSize: z.number(),
  }),
  dashboardEntryBaseSchema.extend({
    kind: z.literal("sftp"),
    host: z.string(),
    port: z.number(),
    hostKeySha256: z.string(),
    poolSize: z.number(),
  }),
]);

export const dashboardSystemProviderInputSchema = z.object({
  provider: connectionProviderSchema,
});

export const dashboardSystemProviderOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  provider: connectionProviderSchema,
  configured: z.boolean(),
  envVars: z.array(z.string()),
  connections: dashboardConnectionCountSchema,
  oauth: z
    .object({
      clientId: z.string().nullable(),
      clientSecret: dashboardSecretSchema,
      redirectUri: z.string(),
      zohoRegion: z.string().nullable(),
    })
    .nullable(),
  entries: z.array(dashboardProviderEntrySchema),
});

export const dashboardSystemOverviewOutputSchema = z.object({
  drivers: z.array(
    z.object({
      driver: systemDriverSchema,
      vendor: systemVendorSchema,
      badge: dashboardSystemBadgeSchema,
      detail: z.string(),
    }),
  ),
  providers: z.array(
    z.object({
      provider: connectionProviderSchema,
      configured: z.boolean(),
      entries: z.number(),
      connections: dashboardConnectionCountSchema,
    }),
  ),
  instance: z.object({
    badge: dashboardSystemBadgeSchema,
    detail: z.string(),
  }),
  warnings: z.array(z.string()),
});

export const dashboardSystemInstanceOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  appUrl: z.string(),
  secureCookies: z.boolean(),
  signupDisabled: z.boolean(),
  ownerEmail: z.string().nullable(),
  setupCode: z.enum(["unset", "live", "spent"]),
  legal: z.object({
    version: z.string(),
    termsUrl: z.string().nullable(),
    privacyUrl: z.string().nullable(),
  }),
  relay: z.object({
    maxMb: z.number(),
    concurrency: z.number(),
  }),
  imageProxy: z.boolean(),
});

export const SYSTEM_CHECK_STATUSES = ["ok", "warning", "failed", "skipped"] as const;

export const dashboardSystemCheckInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("driver"), driver: systemDriverSchema }),
  z.object({ kind: z.literal("provider"), provider: connectionProviderSchema }),
]);

export const dashboardSystemCheckOutputSchema = z.object({
  checkedAt: z.string(),
  results: z.array(
    z.object({
      server: z.string().nullable(),
      label: z.string(),
      status: z.enum(SYSTEM_CHECK_STATUSES),
      message: z.string().nullable(),
      latencyMs: z.number().nullable(),
    }),
  ),
});

const configFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(CONFIG_FIELD_KINDS),
  options: z.array(z.string()).nullable(),
  when: z.object({ key: z.string(), values: z.array(z.string()) }).nullable(),
  description: z.string().nullable(),
  optional: z.boolean(),
});

const configValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const configValuesSchema = z.record(z.string(), configValueSchema);

const configSecretsSchema = z.record(z.string(), dashboardSecretSchema);

export const dashboardConfigFormInputSchema = z.object({
  section: configSectionSchema,
});

export const dashboardConfigFormOutputSchema = z.object({
  state: dashboardConfigSectionStateSchema,
  version: z.number(),
  list: z.boolean(),
  fields: z.array(configFieldSchema),
  values: configValuesSchema,
  secrets: configSecretsSchema,
  entries: z.array(
    z.object({
      id: z.string(),
      values: configValuesSchema,
      secrets: configSecretsSchema,
    }),
  ),
});

export const dashboardConfigUpdateInputSchema = z.object({
  expectedVersion: z.number().int().min(0),
  sections: z
    .array(
      z.object({
        section: configSectionSchema,
        values: configValuesSchema,
        entries: z
          .array(z.object({ id: z.string().nullable(), values: configValuesSchema }))
          .nullable(),
      }),
    )
    .min(1),
  code: totpCodeSchema,
});

export const dashboardConfigSaveOutputSchema = z.object({
  saved: z.boolean(),
  version: z.number(),
  check: dashboardSystemCheckOutputSchema.nullable(),
  warnings: z.array(z.string()),
});

export const dashboardConfigHistoryOutputSchema = z.object({
  current: z.number(),
  versions: z.array(
    z.object({
      version: z.number(),
      isCurrent: z.boolean(),
      kind: z.enum(INSTANCE_CONFIG_KINDS),
      changedKeys: z.array(z.string()),
      revertedFromVersion: z.number().nullable(),
      createdAt: z.string(),
      author: z.object({ name: z.string(), email: z.string() }).nullable(),
    }),
  ),
});

export const dashboardConfigDiffInputSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
});

export const dashboardConfigDiffOutputSchema = z.object({
  from: z.number(),
  to: z.number(),
  sections: z.array(
    z.object({
      section: configSectionSchema,
      label: z.string(),
      changes: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          secret: z.boolean(),
          from: z.string().nullable(),
          to: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export const dashboardConfigRevertInputSchema = z.object({
  version: z.number().int().min(1),
  expectedVersion: z.number().int().min(1),
  code: totpCodeSchema,
});

export const dashboardPreflightOutputSchema = z.object({
  currentVersion: z.number(),
  run: z
    .object({
      id: z.number(),
      ranAt: z.string(),
      configVersion: z.number(),
      warnings: z.array(
        z.object({
          kind: z.enum(PREFLIGHT_WARNING_KINDS),
          message: z.string(),
        }),
      ),
      acknowledgedAt: z.string().nullable(),
      acknowledgedBy: z.object({ name: z.string(), email: z.string() }).nullable(),
    })
    .nullable(),
});

export const dashboardPreflightAcknowledgeInputSchema = z.object({
  id: z.number().int().min(1),
});

const UPGRADE_KINDS = ["upgrade", "rollback"] as const;
const UPGRADE_STATES = ["running", "succeeded", "failed", "rollback-failed"] as const;
const UPGRADE_STEPS = ["pull", "snapshot", "preflight", "switch", "ready", "restore"] as const;

export const dashboardUpgradeSchema = z.object({
  id: z.string(),
  kind: z.enum(UPGRADE_KINDS),
  fromVersion: z.string().nullable(),
  toVersion: z.string(),
  state: z.enum(UPGRADE_STATES),
  step: z.enum(UPGRADE_STEPS).nullable(),
  restored: z.boolean(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const dashboardUpdatesOutputSchema = z.object({
  reachable: z.boolean(),
  error: z.string().nullable(),
  currentVersion: z.string().nullable(),
  releases: z.array(
    z.object({ version: z.string(), newer: z.boolean(), notes: z.string().nullable() }),
  ),
  snapshots: z.boolean(),
  rollbackVersion: z.string().nullable(),
  rollbackSnapshotAt: z.string().nullable(),
  upgrade: dashboardUpgradeSchema.nullable(),
});

export const dashboardUpdatesEnabledOutputSchema = z.object({
  enabled: z.boolean(),
});

export const dashboardUpgradeInputSchema = z.object({
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/, "Pick a release such as 1.4.0"),
  code: totpCodeSchema,
});

export const dashboardRollbackInputSchema = z.object({
  code: totpCodeSchema,
});

export const dashboardSystemLlmOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  driver: z.string(),
  vendor: systemVendorSchema,
  name: z.string().nullable(),
  baseUrl: z.string().nullable(),
  apiKey: dashboardSecretSchema.nullable(),
  chatModel: z.string().nullable(),
  smartReplyModel: z.string().nullable(),
  classifierModel: z.string().nullable(),
  summaryModel: z.string().nullable(),
  summaryVision: z.boolean().nullable(),
  structuredOutputs: z.boolean().nullable(),
  decision: z.object({
    driver: z.string(),
    vendor: systemVendorSchema,
    model: z.string().nullable(),
    baseUrl: z.string().nullable(),
    apiKey: dashboardSecretSchema.nullable(),
    classifier: z.boolean(),
    classifierBatch: z.number().nullable(),
    summaryGate: z.boolean(),
    workflowNode: z.boolean(),
  }),
});

export const dashboardSystemPhishingOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  driver: z.string(),
  backendUrl: z.string().nullable(),
});

export const dashboardSystemMailOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  driver: z.string(),
  vendor: systemVendorSchema,
  fromAuth: z.string(),
  fromInvite: z.string(),
  apiKey: dashboardSecretSchema.nullable(),
  smtp: z
    .object({
      viaUrl: z.boolean(),
      host: z.string().nullable(),
      port: z.number().nullable(),
      secure: z.boolean().nullable(),
      user: z.string().nullable(),
      password: dashboardSecretSchema,
    })
    .nullable(),
});

export const dashboardSystemCacheOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  driver: z.string(),
  vendor: systemVendorSchema,
  url: z.string().nullable(),
});

export const dashboardSystemRunnerOutputSchema = z.object({
  config: dashboardConfigStateSchema,
  driver: z.string(),
  vendor: systemVendorSchema,
  cadenceSec: z.number(),
  tickBudgetMs: z.number(),
  batchSize: z.number(),
  concurrency: z.number(),
  queuePrefix: z.string().nullable(),
  redisUrl: z.string().nullable(),
  cronSecret: dashboardSecretSchema.nullable(),
  status: dashboardRunnerSchema,
});

export const dashboardSystemDatabaseOutputSchema = z.object({
  driver: z.string(),
  vendor: systemVendorSchema,
  app: z.string(),
  mastra: z.string(),
});

export const classificationSchema = z.enum(CLASSIFICATIONS);

export const analysisResultSchema = z.object({
  classification: classificationSchema,
  action: z.enum(ANALYSIS_ACTIONS),
  confidence: z.number(),
  reasons: z.array(z.string()),
});

export const analyzePhishingInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const smartReplySchema = z.object({
  label: z.string(),
  body: z.string(),
});

export const smartRepliesInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  sender: z.string().optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
});

export const smartRepliesOutputSchema = z.object({
  replies: z.array(smartReplySchema),
  error: z.string().optional(),
});

export const smartRepliesGenerationSchema = z.object({
  replies: z
    .array(
      z.object({
        label: z.string(),
        body: z.string(),
      }),
    )
    .length(3),
});

export const threadSummaryInputSchema = mailboxScopeSchema.extend({
  messageId: z.string().min(1),
  threadId: z.string().optional(),
});

export const threadSummaryOutputSchema = z.object({
  spec: summarySpecSchema.nullable(),
});

export const assistantThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
});

export const listAssistantThreadsOutputSchema = z.object({
  threads: z.array(assistantThreadSchema),
});

export const createAssistantThreadInputSchema = workspaceScopeSchema.extend({
  title: z.string().optional(),
});

export const createAssistantThreadOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const assistantThreadIdInputSchema = workspaceScopeSchema.extend({
  threadId: z.string().min(1),
});

export const renameAssistantThreadInputSchema = workspaceScopeSchema.extend({
  threadId: z.string().min(1),
  title: z.string().min(1),
});

export const chatTriggerSchema = z.enum(["submit-message", "regenerate-message"]);

export const mailboxChatInputSchema = mailboxScopeSchema.extend({
  messages: z.array(z.any()).default([]),
  trigger: chatTriggerSchema.optional(),
});

export const calendarChatInputSchema = calendarScopeSchema.extend({
  messages: z.array(z.any()).default([]),
  trigger: chatTriggerSchema.optional(),
});

export const driveChatInputSchema = driveScopeSchema.extend({
  messages: z.array(z.any()).default([]),
  trigger: chatTriggerSchema.optional(),
});

export const workspaceChatInputSchema = workspaceScopeSchema.extend({
  messages: z.array(z.any()).default([]),
  trigger: chatTriggerSchema.optional(),
  threadId: z.string().min(1).optional(),
});

export const assistantThreadMessagesOutputSchema = z.object({
  messages: z.array(z.any()),
});

export const referenceTypeSchema = z.enum(REFERENCE_TYPES);

export const agentReferenceSchema = z.object({
  type: referenceTypeSchema,
  id: z.string().min(1),
});

export const resolvedReferenceSchema = agentReferenceSchema.extend({
  label: z.string(),
  detail: z.string().optional(),
});

export const suggestReferencesInputSchema = workspaceScopeSchema.extend({
  query: z.string().max(200).default(""),
  limit: z.number().int().min(1).max(10).default(6),
});

export const suggestReferencesOutputSchema = z.object({
  groups: z.array(
    z.object({
      type: referenceTypeSchema,
      items: z.array(resolvedReferenceSchema),
    }),
  ),
});

export const resolveReferencesInputSchema = workspaceScopeSchema.extend({
  refs: z.array(agentReferenceSchema).max(50),
});

export const resolveReferencesOutputSchema = z.object({
  references: z.array(resolvedReferenceSchema),
});

export const okOutputSchema = z.object({ success: z.literal(true) });

export const listAttachmentsInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const listAttachmentsOutputSchema = z.object({
  attachments: z.array(attachmentSchema),
});

export const downloadAttachmentInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  attachmentId: z.string().min(1),
  filename: z.string().default("attachment"),
  mimeType: z.string().default("application/octet-stream"),
});

export const downloadAttachmentOutputSchema = z.object({
  data: z.string(),
  mimeType: z.string(),
  filename: z.string(),
  size: z.number(),
});

export const customLabelColorSchema = z.enum(CUSTOM_LABEL_COLORS);

export const customLabelSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  color: customLabelColorSchema,
});

export const listCustomLabelsOutputSchema = z.object({
  labels: z.array(customLabelSchema),
});

export const createCustomLabelInputSchema = mailboxScopeSchema.extend({
  name: z.string().trim().min(1),
  color: customLabelColorSchema.optional(),
});

export const deleteCustomLabelInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const deleteCustomLabelOutputSchema = successSchema;

export const saveDraftInputSchema = mailboxScopeSchema.extend(fromMailboxSchema.shape).extend({
  draftId: z.string().optional(),
  payload: draftPayloadSchema,
});

export const saveDraftOutputSchema = z.object({
  id: z.string(),
});

export const deleteDraftInputSchema = mailboxScopeSchema.extend(fromMailboxSchema.shape).extend({
  draftId: z.string().min(1),
});

export const deleteDraftOutputSchema = successSchema;

export const getThreadInputSchema = mailboxScopeSchema.extend({
  threadId: z.string().min(1),
});

export const getThreadOutputSchema = z.object({
  messages: z.array(emailSchema),
});

export const BUILT_IN_LABELS = [
  "action_required",
  "work",
  "transactions",
  "updates",
  "newsletter",
  "personal",
  "promotional",
  "social",
] as const;

export type BuiltInLabel = (typeof BUILT_IN_LABELS)[number];

export const builtInLabelSchema = z.enum(BUILT_IN_LABELS);

export const labelInfoSchema = z.object({
  label: z.string(),
  confidence: z.number(),
});

export const labelMapSchema = z.record(z.string(), labelInfoSchema);

export const getMapOutputSchema = z.object({
  labels: labelMapSchema,
});

export const classifyItemSchema = z.object({
  id: z.string(),
  sender: z.string().optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
});

export const classifyInputSchema = mailboxScopeSchema.extend({
  items: z.array(classifyItemSchema),
});

export const classifyOutputSchema = z.object({
  labels: labelMapSchema,
});

export const classifyResultSchema = z.object({
  classifications: z.array(
    z.object({
      ref: z.string(),
      label: z.string(),
      confidence: z.number().min(0).max(100),
    }),
  ),
});

export const setOnMessageInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const setOnMessageOutputSchema = z.object({
  success: z.literal(true),
  messageId: z.string(),
  label: z.string(),
});

export const clearOnMessageInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const clearOnMessageOutputSchema = successSchema;

export const setOnMessagesInputSchema = mailboxScopeSchema.extend({
  ids: z.array(z.string().min(1)).min(1).max(200),
  label: z.string().min(1),
});

export const setOnMessagesOutputSchema = z.object({
  success: z.literal(true),
  previous: z.record(z.string(), z.string().nullable()),
});

export const restoreLabelsInputSchema = mailboxScopeSchema.extend({
  entries: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export const restoreLabelsOutputSchema = successSchema;

export const listReadLaterOutputSchema = z.object({
  messageIds: z.array(z.string()),
});

export const listReadLaterEmailsOutputSchema = z.object({
  emails: z.array(emailSchema),
});

export const readLaterAddInputSchema = mailboxScopeSchema.extend({
  messageId: z.string().min(1),
});

export const readLaterRemoveInputSchema = mailboxScopeSchema.extend({
  messageId: z.string().min(1),
});

export const readLaterMutationOutputSchema = z.object({
  success: z.literal(true),
  messageId: z.string(),
});

export const apologyToneEnum = z.enum(["brief", "warm", "formal"]);

export const draftApologyInputSchema = mailboxScopeSchema.extend({
  messageId: z.string().min(1),
  situation: z.string().min(1).max(500),
  tone: apologyToneEnum.default("warm"),
});

export const draftReplyOutputSchema = z.object({
  bodyHtml: z.string(),
});

export const REPLY_STANCES = [
  "decline",
  "accept",
  "negotiate",
  "buy_time",
  "clarify",
  "defer",
] as const;

export const replyStanceEnum = z.enum(REPLY_STANCES);

export const draftStanceInputSchema = mailboxScopeSchema.extend({
  messageId: z.string().min(1),
  stance: replyStanceEnum,
});

export const listMuteOutputSchema = z.object({
  threadIds: z.array(z.string()),
});

export const muteThreadsInputSchema = mailboxScopeSchema.extend({
  threadIds: z.array(z.string()).min(1),
});

export const muteThreadsOutputSchema = z.object({
  success: z.literal(true),
  muted: z.array(z.string()),
});

export const unmuteThreadsOutputSchema = successSchema;

export const workflowGraphSchema = graphSchema;
export const workflowKindSchema = z.enum(WORKFLOW_KINDS);
export const runStatusSchema = z.enum(RUN_STATUSES);
const stepStatusSchema = z.enum(STEP_STATUSES);

export const workflowEndpointSchema = z.object({
  triggerNodeId: z.string(),
  endpointId: z.string(),
  url: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: workflowKindSchema,
  enabled: z.boolean(),
  disabledReason: z.string().nullable(),
  revision: z.number(),
  graph: workflowGraphSchema,
  mailboxIds: z.array(z.string()),
  calendarIds: z.array(z.string()),
  driveIds: z.array(z.string()),
  callable: z.boolean(),
  sources: z.array(workflowSourceStateSchema),
  endpoints: z.array(workflowEndpointSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkflowInputSchema = workspaceScopeSchema.extend({
  workflow: workflowDefinitionInputSchema,
});

export const updateWorkflowInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  workflow: workflowDefinitionInputSchema,
});

export const toggleWorkflowInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export const deleteWorkflowInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
});

export const runWorkflowInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  inputs: z.record(z.string(), z.json()).optional(),
});

const workflowDirectoryEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  email: z.string(),
  aiEnabled: z.boolean(),
});

export const workflowDirectorySchema = z.object({
  mailboxes: z.array(workflowDirectoryEntrySchema),
  calendars: z.array(workflowDirectoryEntrySchema),
  drives: z.array(workflowDirectoryEntrySchema),
  members: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string() })),
});

export const listWorkflowsOutputSchema = z.object({
  workflows: z.array(workflowSchema),
  directory: workflowDirectorySchema,
});

export const workflowOutputSchema = z.object({
  workflow: workflowSchema.nullable(),
});

export const toggleWorkflowOutputSchema = successSchema;
export const deleteWorkflowOutputSchema = successSchema;

export const runWorkflowOutputSchema = z.object({
  runId: z.string(),
  status: z.literal("queued"),
});

export const workflowRunStepSchema = z.object({
  nodeId: z.string(),
  step: z.string(),
  status: stepStatusSchema,
  count: z.number(),
  detail: z.string().optional(),
});

export const workflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  status: runStatusSchema,
  dueAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  attempts: z.number(),
  error: z.string().nullable(),
  upgraded: z.boolean(),
  steps: z.array(workflowRunStepSchema),
});

export const listWorkflowRunsInputSchema = workspaceScopeSchema.extend({
  workflowId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listWorkflowRunsOutputSchema = z.object({
  runs: z.array(workflowRunSchema),
});

export const sendCloseReasonSchema = z.enum(SEND_CLOSE_REASONS);

const workflowRunPersonSchema = z.object({ name: z.string(), email: z.string() }).nullable();

export const workflowRunDetailSchema = workflowRunSchema.extend({
  revision: z.number(),
  revisionCreatedAt: z.string(),
  currentRevision: z.number().nullable(),
  principal: workflowRunPersonSchema,
  trigger: z.object({
    nodeId: z.string(),
    step: z.string().nullable(),
    source: z.enum(RUN_SOURCES),
    scheduledFor: z.string(),
    firedFor: z.string().nullable(),
    missed: z.number(),
    requestedBy: workflowRunPersonSchema,
    event: z.unknown(),
  }),
  output: z.unknown(),
  graph: workflowGraphSchema,
  nodes: z.array(
    z.object({
      nodeId: z.string(),
      step: z.string(),
      reached: z.boolean(),
      lines: z.array(
        z.object({ status: stepStatusSchema, count: z.number(), detail: z.string().nullable() }),
      ),
      items: z.array(
        z.object({
          id: z.string(),
          itemKey: z.string(),
          status: stepStatusSchema,
          attempts: z.number(),
          startedAt: z.string().nullable(),
          finishedAt: z.string().nullable(),
          detail: z.string().nullable(),
          error: z.string().nullable(),
          operation: z.string().nullable(),
          title: z.string().nullable(),
          subtitle: z.string().nullable(),
          inputs: z
            .array(z.object({ port: z.number(), state: z.string(), count: z.number() }))
            .nullable(),
          decision: z
            .object({
              handle: z.string(),
              probability: z.number(),
              model: z.string(),
              score: z.number().optional(),
            })
            .nullable(),
          outputs: z.array(z.string()).nullable(),
          input: z.unknown(),
          output: z.unknown(),
          wakeAt: z.string().nullable(),
          resolvable: z.boolean(),
          resolution: z
            .object({
              outcome: z.enum(SEND_RESOLUTION_OUTCOMES),
              reason: sendCloseReasonSchema.nullable(),
              note: z.string().nullable(),
              resolvedAt: z.string(),
              resolvedBy: workflowRunPersonSchema,
            })
            .nullable(),
        }),
      ),
      outputs: z.array(
        z.object({ handle: edgeSchema.shape.sourceHandle, carried: z.boolean().nullable() }),
      ),
    }),
  ),
  waits: z.array(
    z.object({
      id: z.string(),
      nodeId: z.string(),
      kind: z.string(),
      status: z.string(),
      wakeAt: z.string().nullable(),
      deadlineAt: z.string().nullable(),
      request: z.string().nullable(),
      approvers: z.array(z.object({ name: z.string(), email: z.string() })),
      decision: z.string().nullable(),
      decidedBy: workflowRunPersonSchema,
      canDecide: z.boolean(),
    }),
  ),
});

export const getWorkflowRunInputSchema = workspaceScopeSchema.extend({
  runId: z.string().min(1),
});

export const getWorkflowRunOutputSchema = z.object({
  run: workflowRunDetailSchema,
});

export const cancelWorkflowRunInputSchema = getWorkflowRunInputSchema;

export const cancelWorkflowRunOutputSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("cancelled"), unresolved: z.number(), message: z.string() }),
  z.object({ state: z.literal("stopping"), inFlight: z.number(), message: z.string() }),
  z.object({ state: z.literal("finished"), status: runStatusSchema, message: z.string() }),
]);

export const resumeWorkflowRunInputSchema = getWorkflowRunInputSchema;

export const resumeWorkflowRunOutputSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("resumed"),
    retrying: z.number(),
    kept: z.number(),
    message: z.string(),
  }),
  z.object({ state: z.literal("refused"), status: runStatusSchema, message: z.string() }),
]);

export const dispatchStepInputSchema = getWorkflowRunInputSchema.extend({
  stepRunId: z.string().min(1),
});

export const dispatchCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  at: z.string().nullable(),
});

export const inspectDispatchOutputSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  z.object({
    state: z.literal("unconfirmed"),
    stepRunId: z.string(),
    step: z.string(),
    settled: z.boolean(),
    reconcilable: z.boolean(),
    dispatchedAt: z.date().nullable(),
    error: z.string().nullable(),
    candidates: z.array(dispatchCandidateSchema),
    lookupError: z.string().nullable(),
    notice: z.string().nullable(),
  }),
]);

export type InspectDispatchOutput = z.infer<typeof inspectDispatchOutputSchema>;

export const resolveDispatchInputSchema = dispatchStepInputSchema.extend({
  decision: z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("verified"), candidateId: z.string().min(1).max(512) }),
    z.object({
      outcome: z.literal("closed"),
      reason: sendCloseReasonSchema,
      note: z.string().trim().max(500).nullable(),
    }),
  ]),
});

export const resolveDispatchOutputSchema = z.object({ message: z.string() });

export const previewDecisionInputSchema = workspaceScopeSchema.extend({
  mailboxId: z.string().min(1),
  node: z.object({ params: nodeSchema.shape.params }),
  limit: z.number().int().min(1).max(20).default(10),
});

const decisionAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), probability: z.number() }),
  z.object({ type: z.literal("choice"), probabilities: z.record(z.string(), z.number()) }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    probabilities: z.record(z.string(), z.number()),
  }),
  z.object({ type: z.literal("refusal") }),
]);

export const previewDecisionOutputSchema = z.object({
  items: z.array(
    z.object({
      messageId: z.string(),
      from: z.string(),
      subject: z.string(),
      answers: z.record(z.string(), decisionAnswerSchema).nullable(),
    }),
  ),
});

export type PreviewDecisionOutput = z.infer<typeof previewDecisionOutputSchema>;

export const testWorkflowInputSchema = workspaceScopeSchema.extend({
  graph: workflowGraphSchema,
  triggerNodeId: z.string().min(1),
  sampleId: z.string().min(1).max(800).optional(),
  event: z.json().optional(),
  inputs: z.record(z.string(), z.json()).optional(),
  replayRunId: z.string().min(1).optional(),
  fromNodeId: z.string().min(1).optional(),
});

export const testWorkflowOutputSchema = z.object({
  status: runStatusSchema,
  error: z.string().nullable(),
  event: z.unknown(),
  steps: z.array(
    z.object({
      nodeId: z.string(),
      status: stepStatusSchema,
      count: z.number(),
      detail: z.string().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      nodeId: z.string(),
      itemKey: z.string(),
      status: stepStatusSchema,
      title: z.string().nullable(),
      subtitle: z.string().nullable(),
      outputs: z.array(z.string()),
      detail: z.string().nullable(),
      error: z.string().nullable(),
      input: z.unknown(),
      result: z.unknown(),
    }),
  ),
});

export type TestWorkflowOutput = z.infer<typeof testWorkflowOutputSchema>;

export const testSamplesInputSchema = workspaceScopeSchema.extend({
  graph: workflowGraphSchema,
  triggerNodeId: z.string().min(1),
});

export const testSamplesOutputSchema = z.object({
  samples: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subtitle: z.string(),
      at: z.string().nullable(),
    }),
  ),
});

export const pinSampleInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  triggerNodeId: z.string().min(1),
  event: z.json().nullable(),
});

export const workflowSamplesInputSchema = workspaceScopeSchema.extend({ id: z.string().min(1) });

export const workflowSamplesOutputSchema = z.object({
  samples: z.record(z.string(), z.unknown()),
});

export const workflowRevisionsInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export const workflowRevisionsOutputSchema = z.object({
  revisions: z.array(
    z.object({ revision: z.number(), createdAt: z.string(), graph: workflowGraphSchema }),
  ),
});

export const workflowApprovalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  request: z.string(),
  createdAt: z.string(),
  deadlineAt: z.string().nullable(),
});

export const listApprovalsOutputSchema = z.object({
  approvals: z.array(workflowApprovalSchema),
});

export const decideApprovalInputSchema = workspaceScopeSchema.extend({
  waitId: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
  note: z.string().trim().max(500).nullable().default(null),
});

export const webhookSecretInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
  endpointId: z.string().min(1),
  rotate: z.boolean().default(false),
});

export const webhookSecretOutputSchema = z.object({
  url: z.string(),
  secret: z.string(),
});

export type WorkflowApproval = z.infer<typeof workflowApprovalSchema>;
export type WorkflowDirectory = z.infer<typeof workflowDirectorySchema>;

export const scheduledSendStatusSchema = runStatusSchema;

export const scheduledSendResolutionSchema = z.object({
  outcome: z.enum(SEND_RESOLUTION_OUTCOMES),
  reason: sendCloseReasonSchema.nullable(),
  note: z.string().nullable(),
  resolvedAt: z.date(),
  resolvedByName: z.string(),
});

export const scheduledSendItemSchema = z.object({
  id: z.string(),
  scheduledFor: z.date(),
  status: scheduledSendStatusSchema,
  sent: z.boolean(),
  unconfirmed: z.boolean(),
  resolution: scheduledSendResolutionSchema.nullable(),
  subject: z.string(),
  error: z.string().nullable(),
  payload: draftPayloadSchema.nullable(),
  scheduledByName: z.string(),
  scheduledByMe: z.boolean(),
});

export const createScheduledSendInputSchema = mailboxScopeSchema
  .extend(fromMailboxSchema.shape)
  .extend({
    payload: draftPayloadSchema,
    scheduledFor: z.string().min(1),
  });

export const createScheduledSendOutputSchema = z.object({
  id: z.string(),
  scheduledFor: z.string(),
});

export const listScheduledSendOutputSchema = z.object({
  scheduled: z.array(scheduledSendItemSchema),
});

export const cancelScheduledSendInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
});

export const cancelScheduledSendOutputSchema = successSchema;

export const retryScheduledSendInputSchema = cancelScheduledSendInputSchema;

export const retryScheduledSendOutputSchema = z.object({
  message: z.string(),
});

export const inspectUnconfirmedSendInputSchema = cancelScheduledSendInputSchema;

export const sentCandidateSchema = z.object({
  id: z.string(),
  subject: z.string(),
  to: z.array(z.string()),
  date: z.string(),
});

export const inspectUnconfirmedSendOutputSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  z.object({
    state: z.literal("unconfirmed"),
    stepRunId: z.string(),
    settled: z.boolean(),
    dispatchedAt: z.date().nullable(),
    error: z.string().nullable(),
    candidates: z.array(sentCandidateSchema),
    lookupError: z.string().nullable(),
    notice: z.string().nullable(),
  }),
]);

export const resolveUnconfirmedSendInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  stepRunId: z.string().min(1),
  decision: z.discriminatedUnion("outcome", [
    z.object({
      outcome: z.literal("verified"),
      providerMessageId: z.string().min(1).max(512),
    }),
    z.object({
      outcome: z.literal("closed"),
      reason: sendCloseReasonSchema,
      note: z.string().trim().max(500).nullable(),
    }),
  ]),
});

export const resolveUnconfirmedSendOutputSchema = z.object({
  message: z.string(),
});

export const listMessagesInputSchema = mailboxScopeSchema.extend({
  folder: mailFolderSchema.default("inbox"),
  pageToken: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const MAIL_LIST_STATES = ["unread", "starred"] as const;
export type MailListState = (typeof MAIL_LIST_STATES)[number];

export const listInStateInputSchema = mailboxScopeSchema.extend({
  folder: mailFolderSchema,
  state: z.enum(MAIL_LIST_STATES),
  pageToken: z.string().optional(),
});

export const listLabelledInputSchema = mailboxScopeSchema.extend({
  label: z.string().min(1),
  pageToken: z.string().optional(),
});

export const mailboxErrorSchema = z.object({
  mailboxId: z.string(),
  mailboxEmail: z.string(),
  error: z.string(),
});

export const listMessagesOutputSchema = z.object({
  emails: z.array(emailSchema),
  nextPageToken: z.string().optional(),
  total: z.number().optional(),
  mailboxErrors: z.array(mailboxErrorSchema).optional(),
});

export const getMessageInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  folder: z.string().optional(),
});

export const getMessageOutputSchema = emailSchema.partial();

export const deleteMessageInputSchema = messageIdInputSchema;

export const searchMessagesInputSchema = mailboxScopeSchema.extend({
  q: z.string().default(""),
});

export const searchMessagesOutputSchema = z.object({
  emails: z.array(emailSchema),
  nextPageToken: z.string().optional(),
  total: z.number().optional(),
  mailboxErrors: z.array(mailboxErrorSchema).optional(),
});

export const starMessageInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  starred: z.boolean(),
});

export const markReadInputSchema = mailboxScopeSchema.extend({
  ids: z.array(z.string()),
  read: z.boolean(),
});

export const markReadOutputSchema = z.object({
  success: z.literal(true),
  updated: z.number(),
});

export const bulkDeleteInputSchema = mailboxScopeSchema.extend({
  ids: z.array(z.string()).optional(),
  folder: mailFolderSchema.optional(),
  deleteAll: z.boolean().optional(),
});

export const bulkDeleteOutputSchema = z.object({
  success: z.literal(true),
  deleted: z.number(),
});

export const getRawOutputSchema = z.object({
  raw: z.string(),
});

export const snoozeMessageInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  wakeAt: z.string().min(1),
  folder: mailFolderSchema.optional(),
});

export const snoozeMessageOutputSchema = z.object({
  id: z.string(),
  wakeAt: z.string(),
});

export const snoozedEmailSchema = emailSchema.extend({
  scheduleId: z.string(),
  wakeAt: z.string(),
  status: runStatusSchema,
  error: z.string().nullable(),
});

export const listSnoozedOutputSchema = z.object({
  emails: z.array(snoozedEmailSchema),
});

export const unsubscribeMethodSchema = z.enum(UNSUBSCRIBE_METHODS);
export const unsubscribeStatusSchema = z.enum(UNSUBSCRIBE_STATUSES);

export const subscriptionSenderSchema = z.object({
  senderEmail: z.string(),
  senderName: z.string().optional(),
  messageId: z.string(),
  count: z.number(),
  latestDate: z.string(),
  latestSubject: z.string(),
  methods: z.array(unsubscribeMethodSchema).nonempty(),
  unsubscribedStatus: unsubscribeStatusSchema.optional(),
});

export const listSubscriptionsInputSchema = mailboxScopeSchema.extend({
  scanLimit: z.number().int().min(10).max(200).default(100),
});

export const listSubscriptionsOutputSchema = z.object({
  senders: z.array(subscriptionSenderSchema),
  scanned: z.number(),
});

export const bulkUnsubscribeInputSchema = mailboxScopeSchema.extend({
  items: z
    .array(
      z.object({
        senderEmail: z.string().min(1),
        messageId: z.string().min(1),
      }),
    )
    .min(1)
    .max(25),
});

export const bulkUnsubscribeResultSchema = z.object({
  senderEmail: z.string(),
  status: unsubscribeStatusSchema,
  method: unsubscribeMethodSchema.optional(),
  url: z.string().optional(),
  error: z.string().optional(),
});

export const bulkUnsubscribeOutputSchema = z.object({
  results: z.array(bulkUnsubscribeResultSchema),
});

export const contactSuggestionSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
});

export const contactSuggestionsOutputSchema = z.object({
  contacts: z.array(contactSuggestionSchema),
});

export const unsubscribeInfoInputSchema = mailboxScopeSchema.extend({
  id: z.string().min(1),
  senderEmail: z.string().min(1),
});

export const unsubscribeInfoOutputSchema = z.object({
  methods: z.array(unsubscribeMethodSchema),
  unsubscribedStatus: unsubscribeStatusSchema.optional(),
});

export const searchKindSchema = z.enum(SEARCH_KINDS);

export const searchDiagnosticSchema = z.object({
  start: z.number(),
  end: z.number(),
  message: z.string(),
});

export const searchInputSchema = workspaceScopeSchema.extend({
  q: z.string().max(MAX_SEARCH_LENGTH),
  timeZone: z.string().max(64).optional(),
  cursor: z.string().max(4000).optional(),
});

export const mailSearchHitSchema = emailSchema.extend({
  states: z.array(z.enum(LOCAL_MAIL_STATES)).optional(),
  scheduleId: z.string().optional(),
  scheduledFor: z.string().optional(),
  wakeAt: z.string().optional(),
  unconfirmed: z.boolean().optional(),
  ai: z.boolean().optional(),
});

export const searchMailOutputSchema = z.object({
  emails: z.array(mailSearchHitSchema),
  nextPageToken: z.string().optional(),
  mailboxErrors: z.array(mailboxErrorSchema).optional(),
  diagnostics: z.array(searchDiagnosticSchema),
});

export const eventSearchHitSchema = calendarEventSchema.extend({
  ai: z.boolean().optional(),
});

export const searchEventsOutputSchema = z.object({
  events: z.array(eventSearchHitSchema),
  calendarErrors: z.array(calendarSourceErrorSchema).optional(),
  diagnostics: z.array(searchDiagnosticSchema),
});

export const fileSearchHitSchema = driveEntrySchema.extend({
  ai: z.boolean().optional(),
  pinned: z.boolean().optional(),
  parentName: z.string().optional(),
});

export const searchFilesOutputSchema = z.object({
  entries: z.array(fileSearchHitSchema),
  cursor: z.string().nullable(),
  driveErrors: z.array(driveSourceErrorSchema).optional(),
  diagnostics: z.array(searchDiagnosticSchema),
});

const localHitBase = {
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  date: z.string().optional(),
};

export const localSearchHitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    ...localHitBase,
    threadId: z.string(),
  }),
  z.object({
    kind: z.literal("member"),
    ...localHitBase,
    memberId: z.string().nullable(),
    userId: z.string().nullable(),
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
    role: workspaceRoleSchema,
    invited: z.boolean(),
    inviteId: z.string().nullable(),
    joinedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("contact"),
    ...localHitBase,
    email: z.string(),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("workflow"),
    ...localHitBase,
    workflowId: z.string(),
    enabled: z.boolean(),
  }),
  z.object({
    kind: z.literal("run"),
    ...localHitBase,
    runId: z.string(),
    workflowId: z.string(),
    workflowName: z.string(),
    status: runStatusSchema,
    error: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("mailbox"),
    ...localHitBase,
    mailboxId: z.string(),
    linkId: z.string(),
    slug: z.string(),
    email: z.string(),
    provider: mailProviderSchema,
    ai: z.boolean(),
  }),
  z.object({
    kind: z.literal("calendar"),
    ...localHitBase,
    accountId: z.string(),
    linkId: z.string(),
    slug: z.string(),
    email: z.string(),
    provider: calendarProviderSchema,
    ai: z.boolean(),
    calendarId: z.string().nullable(),
    color: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("drive"),
    ...localHitBase,
    driveId: z.string(),
    linkId: z.string(),
    slug: z.string(),
    email: z.string(),
    provider: driveProviderSchema,
    server: z.string().nullable(),
    ai: z.boolean(),
  }),
  z.object({
    kind: z.literal("mail-folder"),
    ...localHitBase,
    folder: mailFolderSchema,
    mailboxSlug: z.string(),
    mailboxEmail: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("label"),
    ...localHitBase,
    key: z.string(),
    name: z.string(),
    color: z.enum(CUSTOM_LABEL_COLORS).nullable(),
    custom: z.boolean(),
    labelId: z.string().nullable(),
    mailboxSlug: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("connection"),
    ...localHitBase,
    connectionId: z.string(),
    provider: connectionProviderSchema,
    email: z.string(),
    server: z.string().nullable(),
    quarantined: z.boolean(),
    resources: z.array(connectionResourceSchema),
  }),
  z.object({
    kind: z.literal("subscription"),
    ...localHitBase,
    mailboxSlug: z.string(),
    mailboxEmail: z.string(),
    senderEmail: z.string(),
    senderName: z.string().optional(),
    messageId: z.string(),
    count: z.number(),
    latestDate: z.string(),
    latestSubject: z.string(),
    methods: z.array(unsubscribeMethodSchema),
    unsubscribedStatus: unsubscribeStatusSchema.optional(),
  }),
]);

export const searchLocalOutputSchema = z.object({
  hits: z.array(localSearchHitSchema),
  errors: z.array(z.string()),
  diagnostics: z.array(searchDiagnosticSchema),
});

export const searchSuggestInputSchema = workspaceScopeSchema.extend({
  key: z.string().max(40),
  prefix: z.string().max(100),
});

export const searchSuggestionSchema = z.object({
  value: z.string(),
  label: z.string(),
  detail: z.string().optional(),
});

export const searchSuggestOutputSchema = z.object({
  values: z.array(searchSuggestionSchema),
});

export const savedSearchSchema = z.object({
  id: z.string(),
  name: z.string(),
  query: z.string(),
  createdAt: z.date(),
});

export const listSavedSearchesOutputSchema = z.object({
  searches: z.array(savedSearchSchema),
});

export const createSavedSearchInputSchema = workspaceScopeSchema.extend({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
});

export const createSavedSearchOutputSchema = z.object({
  search: savedSearchSchema,
});

export const deleteSavedSearchInputSchema = workspaceScopeSchema.extend({
  id: z.string().min(1),
});

export type SearchDiagnosticDto = z.infer<typeof searchDiagnosticSchema>;
export type SearchMailOutput = z.infer<typeof searchMailOutputSchema>;
export type SearchEventsOutput = z.infer<typeof searchEventsOutputSchema>;
export type SearchFilesOutput = z.infer<typeof searchFilesOutputSchema>;
export type SearchLocalOutput = z.infer<typeof searchLocalOutputSchema>;
export type MailSearchHitDto = z.infer<typeof mailSearchHitSchema>;
export type EventSearchHitDto = z.infer<typeof eventSearchHitSchema>;
export type FileSearchHitDto = z.infer<typeof fileSearchHitSchema>;
export type LocalSearchHit = z.infer<typeof localSearchHitSchema>;
export type SearchSuggestion = z.infer<typeof searchSuggestionSchema>;
export type SavedSearch = z.infer<typeof savedSearchSchema>;

export type SubscriptionSender = z.infer<typeof subscriptionSenderSchema>;
export type BulkUnsubscribeResult = z.infer<typeof bulkUnsubscribeResultSchema>;

export type MailAttachment = z.infer<typeof attachmentSchema>;
export type MailEmail = z.infer<typeof emailSchema>;
export type DraftPayloadInput = z.infer<typeof draftPayloadSchema>;
export type UserPreferences = z.infer<typeof preferencesSchema>;
export type UpdateUserPreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
export type RemoteAllowEntry = z.infer<typeof remoteAllowEntrySchema>;
export type RemoteAllowInput = z.infer<typeof remoteAllowInputSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
export type AcceptInviteOutput = z.infer<typeof acceptInviteOutputSchema>;
export type SignupInvite = z.infer<typeof signupInviteSchema>;
export type DashboardStats = z.infer<typeof dashboardStatsOutputSchema>;
export type DashboardUsageRange = z.infer<typeof dashboardUsageRangeSchema>;
export type DashboardUsage = z.infer<typeof dashboardUsageOutputSchema>;
export type DashboardUsageTotals = z.infer<typeof dashboardUsageTotalsSchema>;
export type DashboardUsageByFeature = z.infer<typeof dashboardUsageByFeatureSchema>;
export type DashboardUsageByModel = z.infer<typeof dashboardUsageByModelSchema>;
export type DashboardUsageDay = z.infer<typeof dashboardUsageDaySchema>;
export type DashboardUsageCall = z.infer<typeof dashboardUsageCallSchema>;
export type DashboardOverview = z.infer<typeof dashboardOverviewOutputSchema>;
export type DashboardConnections = z.infer<typeof dashboardConnectionsOutputSchema>;
export type DashboardPeople = z.infer<typeof dashboardPeopleOutputSchema>;
export type DashboardWorkspaces = z.infer<typeof dashboardWorkspacesOutputSchema>;
export type DashboardAutomation = z.infer<typeof dashboardAutomationOutputSchema>;
export type DashboardRunner = z.infer<typeof dashboardRunnerSchema>;
export type DashboardRunnerStatus = DashboardRunner["status"];
export type DashboardMcp = z.infer<typeof dashboardMcpOutputSchema>;
export type DashboardSecret = z.infer<typeof dashboardSecretSchema>;
export type SystemDriver = z.infer<typeof systemDriverSchema>;
export type SystemVendor = (typeof SYSTEM_VENDORS)[number];
export type SystemTone = (typeof SYSTEM_TONES)[number];
export type SystemCheckStatus = (typeof SYSTEM_CHECK_STATUSES)[number];
export type DashboardSystemBadge = z.infer<typeof dashboardSystemBadgeSchema>;
export type DashboardSystemOverview = z.infer<typeof dashboardSystemOverviewOutputSchema>;
export type DashboardSystemInstance = z.infer<typeof dashboardSystemInstanceOutputSchema>;
export type DashboardSystemProvider = z.infer<typeof dashboardSystemProviderOutputSchema>;
export type DashboardProviderEntry = z.infer<typeof dashboardProviderEntrySchema>;
export type DashboardSystemCheckInput = z.infer<typeof dashboardSystemCheckInputSchema>;
export type DashboardSystemCheck = z.infer<typeof dashboardSystemCheckOutputSchema>;
export type DashboardSystemLlm = z.infer<typeof dashboardSystemLlmOutputSchema>;
export type DashboardSystemPhishing = z.infer<typeof dashboardSystemPhishingOutputSchema>;
export type DashboardSystemMail = z.infer<typeof dashboardSystemMailOutputSchema>;
export type DashboardSystemCache = z.infer<typeof dashboardSystemCacheOutputSchema>;
export type DashboardSystemRunner = z.infer<typeof dashboardSystemRunnerOutputSchema>;
export type DashboardSystemDatabase = z.infer<typeof dashboardSystemDatabaseOutputSchema>;
export type DashboardConfigState = z.infer<typeof dashboardConfigStateSchema>;
export type DashboardConfigSectionState = DashboardConfigState["sections"][number];
export type DashboardConfigForm = z.infer<typeof dashboardConfigFormOutputSchema>;
export type DashboardConfigField = DashboardConfigForm["fields"][number];
export type DashboardConfigValue = DashboardConfigForm["values"][string];
export type DashboardConfigUpdateInput = z.infer<typeof dashboardConfigUpdateInputSchema>;
export type DashboardConfigSave = z.infer<typeof dashboardConfigSaveOutputSchema>;
export type DashboardConfigHistory = z.infer<typeof dashboardConfigHistoryOutputSchema>;
export type DashboardConfigDiff = z.infer<typeof dashboardConfigDiffOutputSchema>;
export type DashboardPreflight = z.infer<typeof dashboardPreflightOutputSchema>;
export type DashboardUpgrade = z.infer<typeof dashboardUpgradeSchema>;
export type DashboardUpdates = z.infer<typeof dashboardUpdatesOutputSchema>;
export type WorkspaceMailbox = z.infer<typeof workspaceMailboxSchema>;
export type ListWorkspaceMailboxesOutput = z.infer<typeof listWorkspaceMailboxesOutputSchema>;
export type AttachableMailbox = z.infer<typeof attachableMailboxSchema>;
export type WorkspacePolicySettings = z.infer<typeof getWorkspacePolicyOutputSchema>;
export type UserMailbox = z.infer<typeof userMailboxSchema>;
export type UserConnection = z.infer<typeof userConnectionSchema>;
export type ProviderCalendarInfo = z.infer<typeof providerCalendarSchema>;
export type UserCalendar = z.infer<typeof userCalendarSchema>;
export type WorkspaceCalendar = z.infer<typeof workspaceCalendarSchema>;
export type ListWorkspaceCalendarsOutput = z.infer<typeof listWorkspaceCalendarsOutputSchema>;
export type AttachableCalendar = z.infer<typeof attachableCalendarSchema>;
export type SessionCalendar = z.infer<typeof sessionCalendarSchema>;
export type ListEventsOutput = z.infer<typeof listEventsOutputSchema>;
export type CalendarEventDto = z.infer<typeof calendarEventSchema>;
export type CalendarSourceErrorDto = z.infer<typeof calendarSourceErrorSchema>;
export type ProviderCalendarDto = z.infer<typeof providerCalendarSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceMember = z.infer<typeof memberSchema>;
export type PendingInvite = z.infer<typeof pendingInviteSchema>;
export type ListWorkspacesOutput = z.infer<typeof listWorkspacesOutputSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type CreateWorkspaceOutput = z.infer<typeof createWorkspaceOutputSchema>;
export type ListMembersOutput = z.infer<typeof listMembersOutputSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipInputSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
export type ListInvitesOutput = z.infer<typeof listInvitesOutputSchema>;
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;
export type CreateInviteOutput = z.infer<typeof createInviteOutputSchema>;
export type RevokeInviteInput = z.infer<typeof revokeInviteInputSchema>;
export type OkOutput = z.infer<typeof okSchema>;
export type AnalyzePhishingInput = z.infer<typeof analyzePhishingInputSchema>;
export type AnalysisResultOutput = z.infer<typeof analysisResultSchema>;
export type SmartRepliesInput = z.infer<typeof smartRepliesInputSchema>;
export type SmartRepliesOutput = z.infer<typeof smartRepliesOutputSchema>;
export type ThreadSummaryInput = z.infer<typeof threadSummaryInputSchema>;
export type ThreadSummaryOutput = z.infer<typeof threadSummaryOutputSchema>;
export type ListAttachmentsInput = z.infer<typeof listAttachmentsInputSchema>;
export type ListAttachmentsOutput = z.infer<typeof listAttachmentsOutputSchema>;
export type DownloadAttachmentInput = z.infer<typeof downloadAttachmentInputSchema>;
export type DownloadAttachmentOutput = z.infer<typeof downloadAttachmentOutputSchema>;
export type CustomLabel = z.infer<typeof customLabelSchema>;
export type ListCustomLabelsOutput = z.infer<typeof listCustomLabelsOutputSchema>;
export type CreateCustomLabelInput = z.infer<typeof createCustomLabelInputSchema>;
export type CreateCustomLabelOutput = z.infer<typeof customLabelSchema>;
export type DeleteCustomLabelInput = z.infer<typeof deleteCustomLabelInputSchema>;
export type DeleteCustomLabelOutput = z.infer<typeof deleteCustomLabelOutputSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type SaveDraftOutput = z.infer<typeof saveDraftOutputSchema>;
export type DeleteDraftInput = z.infer<typeof deleteDraftInputSchema>;
export type DeleteDraftOutput = z.infer<typeof deleteDraftOutputSchema>;
export type ThreadEmail = z.infer<typeof emailSchema>;
export type GetThreadInput = z.infer<typeof getThreadInputSchema>;
export type GetThreadOutput = z.infer<typeof getThreadOutputSchema>;
export type LabelInfo = z.infer<typeof labelInfoSchema>;
export type LabelMap = z.infer<typeof labelMapSchema>;
export type GetLabelMapOutput = z.infer<typeof getMapOutputSchema>;
export type ClassifyItemInput = z.infer<typeof classifyItemSchema>;
export type ClassifyInput = z.infer<typeof classifyInputSchema>;
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;
export type SetLabelOnMessageInput = z.infer<typeof setOnMessageInputSchema>;
export type SetLabelOnMessageOutput = z.infer<typeof setOnMessageOutputSchema>;
export type ClearLabelOnMessageInput = z.infer<typeof clearOnMessageInputSchema>;
export type ClearLabelOnMessageOutput = z.infer<typeof clearOnMessageOutputSchema>;
export type ListMuteOutput = z.infer<typeof listMuteOutputSchema>;
export type MuteThreadsInput = z.infer<typeof muteThreadsInputSchema>;
export type MuteThreadsOutput = z.infer<typeof muteThreadsOutputSchema>;
export type UnmuteThreadsOutput = z.infer<typeof unmuteThreadsOutputSchema>;
export type WorkflowOutput = z.infer<typeof workflowSchema>;
export type ListWorkflowsOutput = z.infer<typeof listWorkflowsOutputSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowInputSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowInputSchema>;
export type WorkflowMutationOutput = z.infer<typeof workflowOutputSchema>;
export type ToggleWorkflowInput = z.infer<typeof toggleWorkflowInputSchema>;
export type DeleteWorkflowInput = z.infer<typeof deleteWorkflowInputSchema>;
export type RunWorkflowInput = z.infer<typeof runWorkflowInputSchema>;
export type RunWorkflowOutput = z.infer<typeof runWorkflowOutputSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type WorkflowRunDetail = z.infer<typeof workflowRunDetailSchema>;
export type CancelWorkflowRunOutput = z.infer<typeof cancelWorkflowRunOutputSchema>;
export type ResumeWorkflowRunOutput = z.infer<typeof resumeWorkflowRunOutputSchema>;
export type WorkflowGraphInput = z.infer<typeof workflowGraphSchema>;
export type ScheduledSendItem = z.infer<typeof scheduledSendItemSchema>;
export type SendCloseReason = z.infer<typeof sendCloseReasonSchema>;
export type InspectUnconfirmedSendOutput = z.infer<typeof inspectUnconfirmedSendOutputSchema>;
export type CreateScheduledSendInput = z.infer<typeof createScheduledSendInputSchema>;
export type CreateScheduledSendOutput = z.infer<typeof createScheduledSendOutputSchema>;
export type ListScheduledSendOutput = z.infer<typeof listScheduledSendOutputSchema>;
export type CancelScheduledSendInput = z.infer<typeof cancelScheduledSendInputSchema>;
export type CancelScheduledSendOutput = z.infer<typeof cancelScheduledSendOutputSchema>;
export type DriveRootFolder = z.infer<typeof driveRootFolderSchema>;
export type UserDrive = z.infer<typeof userDriveSchema>;
export type WorkspaceDrive = z.infer<typeof workspaceDriveSchema>;
export type ListWorkspaceDrivesOutput = z.infer<typeof listWorkspaceDrivesOutputSchema>;
export type AttachableDrive = z.infer<typeof attachableDriveSchema>;
export type DriveEntryRow = z.infer<typeof driveEntrySchema>;
export type DriveListingOutput = z.infer<typeof driveListingOutputSchema>;
export type DrivePin = z.infer<typeof drivePinSchema>;
export type DriveQuotaRow = z.infer<typeof driveQuotaSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesInputSchema>;
export type ListMessagesOutput = z.infer<typeof listMessagesOutputSchema>;
export type GetMessageInput = z.infer<typeof getMessageInputSchema>;
export type GetMessageOutput = z.infer<typeof getMessageOutputSchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
export type SearchMessagesInput = z.infer<typeof searchMessagesInputSchema>;
export type SearchMessagesOutput = z.infer<typeof searchMessagesOutputSchema>;
export type StarMessageInput = z.infer<typeof starMessageInputSchema>;
export type MarkReadInput = z.infer<typeof markReadInputSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteInputSchema>;
export type SnoozeMessageInput = z.infer<typeof snoozeMessageInputSchema>;
export type SnoozedEmail = z.infer<typeof snoozedEmailSchema>;
export type ListSnoozedOutput = z.infer<typeof listSnoozedOutputSchema>;
export type GetRawOutput = z.infer<typeof getRawOutputSchema>;
