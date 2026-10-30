import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { AI_USAGE_FEATURES } from "@/ai/usage-features";
import { CONNECTION_PROVIDERS } from "@/connections/types";
import { MCP_PRESET_IDS } from "@/mcp/presets";
import type { McpCapabilityPrefs } from "@/mcp/tools";
import type { AnalysisResult } from "@/types/analysis";
import { AUDIT_ACTIONS, AUDIT_RESOURCE_KINDS, AUDIT_VIAS, type AuditDetail } from "@/types/audit";
import { INSTANCE_CONFIG_KINDS } from "@/types/instance-config";
import type { DraftPayload } from "@/types/mail";
import {
  CUSTOM_LABEL_COLORS,
  MAIL_LABEL_SOURCES,
  MAIL_REMOTE_ALLOW_KINDS,
  MAIL_REMOTE_CONTENT_MODES,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_STATUSES,
} from "@/types/mail";
import type { PreflightWarning } from "@/types/preflight";
import type { ThreadSummary } from "@/types/thread-summary";
import {
  WORKSPACE_AI_POLICIES,
  WORKSPACE_PHISHING_DETECTION_POLICIES,
  WORKSPACE_ROLES,
} from "@/types/workspace";
import type {
  FeedCursor,
  RunInput,
  RunSummaryLine,
  StepReceipt,
  StepResolution,
  StepRunOutput,
  WaitState,
} from "@/workflow/runtime";
import {
  BLOB_KINDS,
  ENDPOINT_KINDS,
  RUN_STATUSES,
  STEP_STATUSES,
  WAIT_KINDS,
  WAIT_STATUSES,
  WORKFLOW_KINDS,
  type WorkflowGraph,
} from "@/workflow/schema";
import { RESOURCE_KINDS } from "@/workflow/steps/types";

import * as authSchemas from "./auth-schema";
import { encryptedText } from "./crypto";

export * from "./auth-schema";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

const bool = (name: string) => integer(name, { mode: "boolean" });

export const workspace = sqliteTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    aiPolicy: text("ai_policy", { enum: WORKSPACE_AI_POLICIES }).notNull().default("optional"),
    phishingDetectionPolicy: text("phishing_detection_policy", {
      enum: WORKSPACE_PHISHING_DETECTION_POLICIES,
    })
      .notNull()
      .default("optional"),
    branding: text("branding", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("workspace_slug_idx").on(table.slug)],
);

export const workspaceInvite = sqliteTable(
  "workspace_invite",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: WORKSPACE_ROLES }).notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_invite_token_hash_idx").on(table.tokenHash),
    index("workspace_invite_workspace_idx").on(table.workspaceId),
    index("workspace_invite_email_idx").on(table.email),
  ],
);

export const workspaceMember = sqliteTable(
  "workspace_member",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    role: text("role", { enum: WORKSPACE_ROLES }).notNull().default("member"),
    invitedBy: text("invited_by"),
    joinedAt: timestamp("joined_at").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_member_workspace_user_idx").on(table.workspaceId, table.userId),
    uniqueIndex("workspace_member_one_owner_idx")
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner'`),
    index("workspace_member_user_idx").on(table.userId),
    index("workspace_member_workspace_idx").on(table.workspaceId),
  ],
);

export const connection = sqliteTable(
  "connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    image: text("image"),
    provider: text("provider", { enum: CONNECTION_PROVIDERS }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: encryptedText("access_token"),
    refreshToken: encryptedText("refresh_token"),
    credentials: encryptedText("credentials"),
    server: text("server"),
    serverName: text("server_name"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    quarantinedAt: timestamp("quarantined_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("connection_user_idx").on(table.userId),
    uniqueIndex("connection_user_provider_account_idx").on(
      table.userId,
      table.provider,
      table.providerAccountId,
    ),
  ],
);

export const mailbox = sqliteTable(
  "mailbox",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    active: bool("active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("mailbox_connection_idx").on(table.connectionId)],
);

export const calendar = sqliteTable(
  "calendar",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    active: bool("active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("calendar_connection_idx").on(table.connectionId)],
);

export const drive = sqliteTable(
  "drive",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    active: bool("active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("drive_connection_idx").on(table.connectionId)],
);

export const mailboxWorkspace = sqliteTable(
  "mailbox_workspace",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    aiEnabled: bool("ai_enabled").notNull().default(false),
    phishingDetectionEnabled: bool("phishing_detection_enabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("mailbox_workspace_mailbox_idx").on(table.mailboxId),
    index("mailbox_workspace_workspace_idx").on(table.workspaceId),
    uniqueIndex("mailbox_workspace_mailbox_workspace_idx").on(table.mailboxId, table.workspaceId),
    uniqueIndex("mailbox_workspace_workspace_slug_idx").on(table.workspaceId, table.slug),
  ],
);

export const calendarWorkspace = sqliteTable(
  "calendar_workspace",
  {
    id: text("id").primaryKey(),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendar.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    visibleCalendarIds: text("visible_calendar_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    aiEnabled: bool("ai_enabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("calendar_workspace_calendar_idx").on(table.calendarId),
    index("calendar_workspace_workspace_idx").on(table.workspaceId),
    uniqueIndex("calendar_workspace_calendar_workspace_idx").on(
      table.calendarId,
      table.workspaceId,
    ),
    uniqueIndex("calendar_workspace_workspace_slug_idx").on(table.workspaceId, table.slug),
  ],
);

export const driveWorkspace = sqliteTable(
  "drive_workspace",
  {
    id: text("id").primaryKey(),
    driveId: text("drive_id")
      .notNull()
      .references(() => drive.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    visibleRootIds: text("visible_root_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    aiEnabled: bool("ai_enabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("drive_workspace_drive_idx").on(table.driveId),
    index("drive_workspace_workspace_idx").on(table.workspaceId),
    uniqueIndex("drive_workspace_drive_workspace_idx").on(table.driveId, table.workspaceId),
    uniqueIndex("drive_workspace_workspace_slug_idx").on(table.workspaceId, table.slug),
  ],
);

export const drivePin = sqliteTable(
  "drive_pin",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    driveId: text("drive_id")
      .notNull()
      .references(() => drive.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("drive_pin_user_idx").on(table.userId),
    index("drive_pin_drive_idx").on(table.driveId),
    uniqueIndex("drive_pin_user_drive_folder_idx").on(table.userId, table.driveId, table.folderId),
  ],
);

export const mailLabel = sqliteTable(
  "mail_label",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    label: text("label").notNull(),
    confidence: integer("confidence").notNull().default(50),
    source: text("source", { enum: MAIL_LABEL_SOURCES }).notNull().default("ai"),
    setByUserId: text("set_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    classifiedAt: timestamp("classified_at").notNull(),
  },
  (table) => [
    index("mail_label_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_label_mailbox_message_idx").on(table.mailboxId, table.messageId),
  ],
);

export const mailMute = sqliteTable(
  "mail_mute",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("mail_mute_user_idx").on(table.userId),
    index("mail_mute_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_mute_user_mailbox_thread_idx").on(
      table.userId,
      table.mailboxId,
      table.threadId,
    ),
  ],
);

export const mailReadLater = sqliteTable(
  "mail_read_later",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("mail_read_later_user_idx").on(table.userId),
    index("mail_read_later_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_read_later_user_mailbox_msg_idx").on(
      table.userId,
      table.mailboxId,
      table.messageId,
    ),
  ],
);

export const savedSearch = sqliteTable(
  "saved_search",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("saved_search_user_workspace_idx").on(table.userId, table.workspaceId)],
);

export const mailUnsubscribe = sqliteTable(
  "mail_unsubscribe",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    unsubscribedByUserId: text("unsubscribed_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    senderEmail: text("sender_email").notNull(),
    senderName: text("sender_name"),
    method: text("method", { enum: UNSUBSCRIBE_METHODS }).notNull(),
    status: text("status", { enum: UNSUBSCRIBE_STATUSES }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("mail_unsubscribe_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_unsubscribe_mailbox_sender_idx").on(table.mailboxId, table.senderEmail),
  ],
);

export const workflow = sqliteTable(
  "workflow",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: WORKFLOW_KINDS }).notNull(),
    workspaceId: text("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
    principalUserId: text("principal_user_id").references(() => authSchemas.user.id, {
      onDelete: "cascade",
    }),
    mailboxId: text("mailbox_id").references(() => mailbox.id, {
      onDelete: "cascade",
    }),
    originLinkId: text("origin_link_id").references(() => mailboxWorkspace.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    targetKey: text("target_key"),
    enabled: bool("enabled").notNull().default(true),
    disabledReason: text("disabled_reason"),
    samples: text("samples", { mode: "json" }).$type<Record<string, unknown>>(),
    revision: integer("revision").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("workflow_workspace_idx").on(table.workspaceId, table.kind),
    index("workflow_mailbox_idx").on(table.mailboxId, table.kind),
    index("workflow_principal_idx").on(table.principalUserId),
    uniqueIndex("workflow_live_target_idx")
      .on(table.mailboxId, table.kind, table.targetKey)
      .where(sql`${table.targetKey} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    check(
      "workflow_user_scope_ck",
      sql`${table.kind} <> 'user' OR (${table.workspaceId} IS NOT NULL AND ${table.principalUserId} IS NOT NULL)`,
    ),
    check(
      "workflow_mail_builtin_scope_ck",
      sql`${table.kind} NOT IN ('scheduled-send', 'snooze') OR (${table.mailboxId} IS NOT NULL AND ${table.principalUserId} IS NOT NULL)`,
    ),
    check(
      "workflow_system_scope_ck",
      sql`${table.kind} <> 'system' OR (${table.workspaceId} IS NULL AND ${table.principalUserId} IS NULL AND ${table.mailboxId} IS NULL)`,
    ),
  ],
);

export const workflowRevision = sqliteTable(
  "workflow_revision",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    graph: text("graph", { mode: "json" }).$type<WorkflowGraph>().notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("workflow_revision_number_idx").on(table.workflowId, table.revision)],
);

export const workflowResource = sqliteTable(
  "workflow_resource",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => workflowRevision.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull(),
    mailboxId: text("mailbox_id").references(() => mailbox.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").references(() => calendar.id, { onDelete: "cascade" }),
    driveId: text("drive_id").references(() => drive.id, { onDelete: "cascade" }),
    mailboxWorkspaceId: text("mailbox_workspace_id").references(() => mailboxWorkspace.id, {
      onDelete: "cascade",
    }),
    calendarWorkspaceId: text("calendar_workspace_id").references(() => calendarWorkspace.id, {
      onDelete: "cascade",
    }),
    driveWorkspaceId: text("drive_workspace_id").references(() => driveWorkspace.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("workflow_resource_node_idx").on(table.revisionId, table.nodeId),
    index("workflow_resource_mailbox_idx").on(table.mailboxId),
    index("workflow_resource_calendar_idx").on(table.calendarId),
    index("workflow_resource_drive_idx").on(table.driveId),
    check(
      "workflow_resource_one_ck",
      sql`(${table.kind} = 'mailbox' AND ${table.mailboxId} IS NOT NULL AND ${table.calendarId} IS NULL AND ${table.driveId} IS NULL) OR (${table.kind} = 'calendar' AND ${table.calendarId} IS NOT NULL AND ${table.mailboxId} IS NULL AND ${table.driveId} IS NULL) OR (${table.kind} = 'drive' AND ${table.driveId} IS NOT NULL AND ${table.mailboxId} IS NULL AND ${table.calendarId} IS NULL)`,
    ),
  ],
);

export const workflowTrigger = sqliteTable(
  "workflow_trigger",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => workflowRevision.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    kind: text("kind").notNull(),
    cron: text("cron"),
    timezone: text("timezone").notNull().default("Etc/UTC"),
    armed: bool("armed").notNull().default(true),
    nextDueAt: timestamp("next_due_at"),
    baselineAt: timestamp("baseline_at"),
    claimedAt: timestamp("claimed_at"),
    claimToken: text("claim_token"),
    lastRunAt: timestamp("last_run_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_trigger_node_idx").on(table.workflowId, table.nodeId),
    index("workflow_trigger_due_idx").on(table.armed, table.nextDueAt),
    index("workflow_trigger_kind_idx").on(table.kind, table.armed),
  ],
);

export const workflowCursor = sqliteTable(
  "workflow_cursor",
  {
    id: text("id").primaryKey(),
    triggerId: text("trigger_id")
      .notNull()
      .references(() => workflowTrigger.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    cursor: text("cursor", { mode: "json" }).$type<FeedCursor>().notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [uniqueIndex("workflow_cursor_trigger_scope_idx").on(table.triggerId, table.scope)],
);

export const workflowEvent = sqliteTable(
  "workflow_event",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    triggerId: text("trigger_id")
      .notNull()
      .references(() => workflowTrigger.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    skippedReason: text("skipped_reason"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_event_key_idx").on(table.triggerId, table.key),
    index("workflow_event_workflow_idx").on(table.workflowId),
    index("workflow_event_created_idx").on(table.createdAt),
  ],
);

export const workflowRun = sqliteTable(
  "workflow_run",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => workflowRevision.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => workflowEvent.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: WORKFLOW_KINDS }).notNull(),
    workspaceId: text("workspace_id").references(() => workspace.id, {
      onDelete: "cascade",
    }),
    principalUserId: text("principal_user_id").references(() => authSchemas.user.id, {
      onDelete: "cascade",
    }),
    parentRunId: text("parent_run_id"),
    limitKey: text("limit_key"),
    input: text("input", { mode: "json" }).$type<RunInput>().notNull(),
    output: text("output", { mode: "json" }).$type<unknown>(),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("pending"),
    dueAt: timestamp("due_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    blockedAt: timestamp("blocked_at"),
    error: text("error"),
    summary: text("summary", { mode: "json" }).$type<RunSummaryLine[]>(),
    upgraded: bool("upgraded").notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_run_event_idx").on(table.eventId),
    index("workflow_run_due_idx").on(table.status, table.dueAt),
    index("workflow_run_workflow_idx").on(table.workflowId, table.createdAt),
    index("workflow_run_workspace_idx").on(table.workspaceId, table.createdAt),
    index("workflow_run_limit_idx").on(table.workflowId, table.limitKey),
    index("workflow_run_parent_idx").on(table.parentRunId),
  ],
);

export const workflowStepRun = sqliteTable(
  "workflow_step_run",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRun.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    itemKey: text("item_key").notNull(),
    branch: text("branch"),
    status: text("status", { enum: STEP_STATUSES }).notNull(),
    input: text("input", { mode: "json" }).$type<unknown>(),
    output: text("output", { mode: "json" }).$type<StepRunOutput | null>(),
    outputHandles: text("output_handles", { mode: "json" }).$type<string[] | null>(),
    state: text("state", { mode: "json" }).$type<WaitState | null>(),
    wakeAt: timestamp("wake_at"),
    receipt: text("receipt", { mode: "json" }).$type<StepReceipt | null>(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    resolution: text("resolution", {
      mode: "json",
    }).$type<StepResolution | null>(),
    resolvedByUserId: text("resolved_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    uniqueIndex("workflow_step_run_identity_idx").on(table.runId, table.nodeId, table.itemKey),
    index("workflow_step_run_run_idx").on(table.runId),
  ],
);

export const workflowWait = sqliteTable(
  "workflow_wait",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRun.id, { onDelete: "cascade" }),
    stepRunId: text("step_run_id")
      .notNull()
      .references(() => workflowStepRun.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: WAIT_KINDS }).notNull(),
    status: text("status", { enum: WAIT_STATUSES }).notNull().default("open"),
    wakeAt: timestamp("wake_at"),
    deadlineAt: timestamp("deadline_at"),
    approvers: text("approvers", { mode: "json" }).$type<string[] | null>(),
    request: text("request"),
    childRunId: text("child_run_id"),
    decision: text("decision"),
    decidedByUserId: text("decided_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_wait_step_run_idx").on(table.stepRunId),
    index("workflow_wait_due_idx").on(table.status, table.wakeAt),
    index("workflow_wait_workspace_idx").on(table.workspaceId, table.status),
    index("workflow_wait_run_idx").on(table.runId),
  ],
);

export const workflowBlob = sqliteTable(
  "workflow_blob",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => workflowRun.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: BLOB_KINDS }).notNull(),
    name: text("name"),
    mimeType: text("mime_type"),
    size: integer("size").notNull().default(0),
    payload: text("payload", { mode: "json" }).$type<DraftPayload | null>(),
    data: text("data"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_blob_draft_idx")
      .on(table.workflowId)
      .where(sql`${table.kind} = 'draft'`),
    index("workflow_blob_run_idx").on(table.runId),
  ],
);

export const workflowEndpoint = sqliteTable(
  "workflow_endpoint",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    triggerId: text("trigger_id")
      .notNull()
      .references(() => workflowTrigger.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ENDPOINT_KINDS }).notNull(),
    secret: encryptedText("secret").notNull(),
    externalId: text("external_id"),
    resourceId: text("resource_id"),
    expiresAt: timestamp("expires_at"),
    lastSeenAt: timestamp("last_seen_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_endpoint_trigger_kind_idx").on(table.triggerId, table.kind),
    index("workflow_endpoint_expiry_idx").on(table.kind, table.expiresAt),
  ],
);

export const workflowTick = sqliteTable("workflow_tick", {
  id: text("id").primaryKey(),
  lastDiscoveryAt: timestamp("last_discovery_at"),
  nextCheckAt: timestamp("next_check_at"),
  leaseOwner: text("lease_owner"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  lastError: text("last_error"),
  lastTickAt: timestamp("last_tick_at"),
  lastSuccessAt: timestamp("last_success_at"),
  updatedAt: timestamp("updated_at").notNull(),
});

export const mailboxLabel = sqliteTable(
  "mailbox_label",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    color: text("color", { enum: CUSTOM_LABEL_COLORS }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("mailbox_label_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mailbox_label_mailbox_key_idx").on(table.mailboxId, table.key),
  ],
);

export const mailMessage = sqliteTable(
  "mail_message",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    threadId: text("thread_id"),
    sender: text("sender").notNull(),
    senderEmail: text("sender_email"),
    subject: text("subject").notNull(),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    analysisResult: text("analysis_result", {
      mode: "json",
    }).$type<AnalysisResult>(),
    isRead: bool("is_read").notNull().default(false),
    receivedAt: timestamp("received_at").notNull(),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (table) => [
    index("mail_message_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_message_mailbox_msg_idx").on(table.mailboxId, table.providerMessageId),
  ],
);

export const mailThreadSummary = sqliteTable(
  "mail_thread_summary",
  {
    id: text("id").primaryKey(),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    threadKey: text("thread_key").notNull(),
    summary: text("summary", { mode: "json" }).$type<ThreadSummary>().notNull(),
    messageCount: integer("message_count").notNull(),
    lastMessageId: text("last_message_id").notNull(),
    incrementCount: integer("increment_count").notNull().default(0),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("mail_thread_summary_mailbox_idx").on(table.mailboxId),
    uniqueIndex("mail_thread_summary_mailbox_thread_idx").on(table.mailboxId, table.threadKey),
  ],
);

export const legalConsent = sqliteTable(
  "legal_consent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    termsUrl: text("terms_url"),
    privacyUrl: text("privacy_url"),
    version: text("version").notNull(),
    consentedAt: timestamp("consented_at").notNull(),
  },
  (table) => [
    index("legal_consent_user_idx").on(table.userId),
    index("legal_consent_email_idx").on(table.email),
  ],
);

export const userPrefs = sqliteTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchemas.user.id, { onDelete: "cascade" }),
  workspaceOrder: text("workspace_order", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  mailRemoteContent: text("mail_remote_content", {
    enum: MAIL_REMOTE_CONTENT_MODES,
  })
    .notNull()
    .default("block"),
  mailCleanLinks: bool("mail_clean_links").notNull().default(true),
  signInAlerts: bool("sign_in_alerts").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull(),
});

export const mailRemoteAllow = sqliteTable(
  "mail_remote_allow",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MAIL_REMOTE_ALLOW_KINDS }).notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("mail_remote_allow_user_kind_value_idx").on(table.userId, table.kind, table.value),
  ],
);

export const mcpClient = sqliteTable(
  "mcp_client",
  {
    clientId: text("client_id")
      .primaryKey()
      .references(() => authSchemas.oauthClient.clientId, {
        onDelete: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => authSchemas.user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    preset: text("preset", { enum: MCP_PRESET_IDS }),
    enabled: bool("enabled").notNull().default(true),
    capabilities: text("capabilities", { mode: "json" })
      .$type<McpCapabilityPrefs>()
      .notNull()
      .default(sql`'{}'`),
    hiddenWorkspaceIds: text("hidden_workspace_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [
    index("mcp_client_user_idx").on(table.userId),
    uniqueIndex("mcp_client_user_slug_idx").on(table.userId, table.slug),
  ],
);

export const signupInvite = sqliteTable(
  "signup_invite",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    acceptedUserId: text("accepted_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("signup_invite_token_hash_idx").on(table.tokenHash),
    uniqueIndex("signup_invite_pending_email_idx")
      .on(table.email)
      .where(sql`${table.acceptedAt} is null`),
    index("signup_invite_email_idx").on(table.email),
    index("signup_invite_invited_by_idx").on(table.invitedBy),
  ],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    workspaceId: text("workspace_id").references(() => workspace.id, {
      onDelete: "set null",
    }),
    feature: text("feature", { enum: AI_USAGE_FEATURES }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    steps: integer("steps").notNull().default(1),
    finishReason: text("finish_reason"),
    runId: text("run_id"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
    index("ai_usage_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("ai_usage_feature_created_idx").on(table.feature, table.createdAt),
  ],
);

export const instanceConfig = sqliteTable(
  "instance_config",
  {
    version: integer("version").primaryKey({ autoIncrement: true }),
    isCurrent: bool("is_current").notNull(),
    changedKeys: text("changed_keys", { mode: "json" }).$type<string[]>().notNull(),
    kind: text("kind", { enum: INSTANCE_CONFIG_KINDS }).notNull(),
    revertedFromVersion: integer("reverted_from_version"),
    createdByUserId: text("created_by_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    llmDriver: text("llm_driver").notNull(),
    llmApiKey: encryptedText("llm_api_key"),
    llmBaseUrl: text("llm_base_url"),
    llmName: text("llm_name"),
    llmStructuredOutputs: bool("llm_structured_outputs"),
    llmChatModel: text("llm_chat_model"),
    llmSmartReplyModel: text("llm_smart_reply_model"),
    llmClassifierModel: text("llm_classifier_model"),
    llmSummaryModel: text("llm_summary_model"),
    llmSummaryVision: bool("llm_summary_vision"),
    decisionDriver: text("decision_driver"),
    decisionModel: text("decision_model"),
    decisionBaseUrl: text("decision_base_url"),
    decisionApiKey: encryptedText("decision_api_key"),
    decisionClassifier: bool("decision_classifier"),
    decisionSummaryGate: bool("decision_summary_gate"),
    decisionWorkflowNode: bool("decision_workflow_node"),
    decisionClassifierBatch: integer("decision_classifier_batch"),
    phishingDriver: text("phishing_driver").notNull(),
    phishingBackendUrl: text("phishing_backend_url"),
    mailDriver: text("mail_driver").notNull(),
    mailFrom: text("mail_from"),
    mailFromAuth: text("mail_from_auth"),
    mailFromInvite: text("mail_from_invite"),
    mailResendApiKey: encryptedText("mail_resend_api_key"),
    mailSmtpUrl: encryptedText("mail_smtp_url"),
    mailSmtpHost: text("mail_smtp_host"),
    mailSmtpPort: integer("mail_smtp_port"),
    mailSmtpUser: text("mail_smtp_user"),
    mailSmtpPass: encryptedText("mail_smtp_pass"),
    mailSmtpSecure: bool("mail_smtp_secure"),
    mailConsoleUrl: text("mail_console_url"),
    mailConsoleToken: encryptedText("mail_console_token"),
    signupDisabled: bool("signup_disabled").notNull(),
    legalTermsUrl: text("legal_terms_url"),
    legalPrivacyUrl: text("legal_privacy_url"),
    legalVersion: text("legal_version").notNull(),
    relayMaxMb: integer("relay_max_mb").notNull(),
    relayConcurrency: integer("relay_concurrency").notNull(),
    imageProxyEnabled: bool("image_proxy_enabled"),
    imageProxyMaxMb: real("image_proxy_max_mb"),
    cacheDriver: text("cache_driver").notNull(),
    cacheUrl: encryptedText("cache_url"),
    cacheToken: encryptedText("cache_token"),
    runnerDriver: text("runner_driver").notNull(),
    runnerCadenceSec: integer("runner_cadence_sec").notNull(),
    runnerTickBudgetMs: integer("runner_tick_budget_ms").notNull(),
    runnerBatchSize: integer("runner_batch_size").notNull(),
    runnerConcurrency: integer("runner_concurrency").notNull(),
    runnerRedisUrl: encryptedText("runner_redis_url"),
    runnerQueuePrefix: text("runner_queue_prefix"),
    runnerCronSecret: encryptedText("runner_cron_secret"),
    runnerStepDataDays: integer("runner_step_data_days").notNull().default(7),
    runnerHistoryDays: integer("runner_history_days").notNull().default(90),
    runnerPublicUrl: text("runner_public_url"),
    runnerTrustedProxies: text("runner_trusted_proxies", { mode: "json" }).$type<string[]>(),
    googleClientId: text("google_client_id"),
    googleClientSecret: encryptedText("google_client_secret"),
    microsoftClientId: text("microsoft_client_id"),
    microsoftClientSecret: encryptedText("microsoft_client_secret"),
    zohoClientId: text("zoho_client_id"),
    zohoClientSecret: encryptedText("zoho_client_secret"),
    zohoRegion: text("zoho_region").notNull(),
    servers: encryptedText("servers").notNull(),
  },
  (table) => [
    uniqueIndex("instance_config_current_idx")
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} = 1`),
  ],
);

export const preflightRun = sqliteTable("preflight_run", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ranAt: timestamp("ran_at").notNull(),
  configVersion: integer("config_version").notNull(),
  warnings: text("warnings", { mode: "json" }).$type<PreflightWarning[]>().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedByUserId: text("acknowledged_by_user_id").references(() => authSchemas.user.id, {
    onDelete: "set null",
  }),
});

export const auditEvent = sqliteTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at").notNull(),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    via: text("via", { enum: AUDIT_VIAS }).notNull(),
    mcpClientId: text("mcp_client_id"),
    actorUserId: text("actor_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull(),
    workspaceId: text("workspace_id").references(() => workspace.id, {
      onDelete: "set null",
    }),
    workspaceName: text("workspace_name"),
    targetUserId: text("target_user_id").references(() => authSchemas.user.id, {
      onDelete: "set null",
    }),
    targetLabel: text("target_label"),
    resourceKind: text("resource_kind", { enum: AUDIT_RESOURCE_KINDS }),
    detail: text("detail", { mode: "json" }).$type<AuditDetail>().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("audit_event_created_idx").on(table.createdAt),
    index("audit_event_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_event_target_created_idx").on(table.targetUserId, table.createdAt),
    index("audit_event_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const schemaMigration = sqliteTable("schema_migration", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at").notNull(),
});
