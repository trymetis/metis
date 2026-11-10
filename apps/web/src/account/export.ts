import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { exportUserAuditEvents } from "@/audit";
import { serverLabel } from "@/connections/connection-store";
import { db } from "@/db";
import {
  addressBook,
  addressBookWorkspace,
  calendar,
  calendarWorkspace,
  connection,
  drive,
  driveWorkspace,
  mailbox,
  mailboxLabel,
  mailboxWorkspace,
  mailLabel,
  mailRemoteAllow,
  mailSignature,
  user,
  userPrefs,
  workflow,
  workflowRevision,
  workspace,
  workspaceMember,
} from "@/db/schema";
import { assistantThreadTitle, exportAssistantThreads } from "@/mastra/memory";
import type { DataExport } from "@/server/schema";
import type { WorkflowGraph } from "@/workflow/schema";
import { RESOURCE_KINDS, type ResourceKind } from "@/workflow/steps";
import { graphResourceIds } from "@/workflow/validation";
import { workspaceThemeBrand } from "@/workspace";

const NOTICE =
  "This file holds what Metis Suite stores for your account: preferences, workspaces, signatures, labels, workflows, Workspace Assistant chats and security activity. It is not a mailbox archive. Mail, calendar events, files and contacts stay with the provider you connected; export those from the provider.";

function iso(value: Date | string | number): string {
  return new Date(value).toISOString();
}

async function loadAccount(userId: string) {
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      defaultWorkspaceSlug: user.defaultWorkspaceSlug,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw new Error("[export] unknown user");
  return row;
}

async function loadMemberships(userId: string) {
  return db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
      branding: workspace.branding,
      role: workspaceMember.role,
      joinedAt: workspaceMember.joinedAt,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(asc(workspaceMember.joinedAt));
}

const LINK_COLUMNS = {
  provider: connection.provider,
  email: connection.email,
  server: serverLabel,
};

async function loadMailboxLinks(userId: string) {
  return db
    .select({
      ...LINK_COLUMNS,
      workspaceId: mailboxWorkspace.workspaceId,
      slug: mailboxWorkspace.slug,
      aiEnabled: mailboxWorkspace.aiEnabled,
      phishingDetectionEnabled: mailboxWorkspace.phishingDetectionEnabled,
    })
    .from(mailboxWorkspace)
    .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .where(eq(connection.userId, userId))
    .orderBy(asc(mailboxWorkspace.createdAt));
}

async function loadCalendarLinks(userId: string) {
  return db
    .select({
      ...LINK_COLUMNS,
      workspaceId: calendarWorkspace.workspaceId,
      slug: calendarWorkspace.slug,
      aiEnabled: calendarWorkspace.aiEnabled,
      visibleCalendarIds: calendarWorkspace.visibleCalendarIds,
    })
    .from(calendarWorkspace)
    .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
    .innerJoin(connection, eq(connection.id, calendar.connectionId))
    .where(eq(connection.userId, userId))
    .orderBy(asc(calendarWorkspace.createdAt));
}

async function loadAddressBookLinks(userId: string) {
  return db
    .select({
      ...LINK_COLUMNS,
      workspaceId: addressBookWorkspace.workspaceId,
      slug: addressBookWorkspace.slug,
      aiEnabled: addressBookWorkspace.aiEnabled,
      visibleBookIds: addressBookWorkspace.visibleBookIds,
    })
    .from(addressBookWorkspace)
    .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
    .innerJoin(connection, eq(connection.id, addressBook.connectionId))
    .where(eq(connection.userId, userId))
    .orderBy(asc(addressBookWorkspace.createdAt));
}

async function loadDriveLinks(userId: string) {
  return db
    .select({
      ...LINK_COLUMNS,
      workspaceId: driveWorkspace.workspaceId,
      slug: driveWorkspace.slug,
      aiEnabled: driveWorkspace.aiEnabled,
      visibleRootIds: driveWorkspace.visibleRootIds,
    })
    .from(driveWorkspace)
    .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
    .innerJoin(connection, eq(connection.id, drive.connectionId))
    .where(eq(connection.userId, userId))
    .orderBy(asc(driveWorkspace.createdAt));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row)) ?? [];
    list.push(row);
    groups.set(key(row), list);
  }
  return groups;
}

async function loadLabels(userId: string): Promise<DataExport["labels"]> {
  const owned = await db
    .select({
      id: mailbox.id,
      email: connection.email,
      provider: connection.provider,
    })
    .from(mailbox)
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .where(eq(connection.userId, userId))
    .orderBy(asc(mailbox.createdAt));
  if (owned.length === 0) return [];

  const ids = owned.map((m) => m.id);
  const [definitions, assignments] = await Promise.all([
    db
      .select()
      .from(mailboxLabel)
      .where(inArray(mailboxLabel.mailboxId, ids))
      .orderBy(asc(mailboxLabel.createdAt)),
    db
      .select()
      .from(mailLabel)
      .where(inArray(mailLabel.mailboxId, ids))
      .orderBy(asc(mailLabel.classifiedAt)),
  ]);
  const definitionsBy = groupBy(definitions, (row) => row.mailboxId);
  const assignmentsBy = groupBy(assignments, (row) => row.mailboxId);

  return owned.map((m) => ({
    mailbox: m.email,
    provider: m.provider,
    definitions: (definitionsBy.get(m.id) ?? []).map((row) => ({
      key: row.key,
      name: row.name,
      color: row.color,
      createdAt: iso(row.createdAt),
    })),
    assignments: (assignmentsBy.get(m.id) ?? []).map((row) => ({
      messageId: row.messageId,
      label: row.label,
      source: row.source,
      confidence: row.confidence,
      classifiedAt: iso(row.classifiedAt),
    })),
  }));
}

async function loadSignatures(userId: string): Promise<DataExport["signatures"]> {
  const rows = await db
    .select({
      email: connection.email,
      scope: mailSignature.scope,
      name: mailSignature.name,
      html: mailSignature.html,
      defaultNew: mailSignature.defaultNew,
      defaultReply: mailSignature.defaultReply,
      createdAt: mailSignature.createdAt,
    })
    .from(mailSignature)
    .innerJoin(mailbox, eq(mailbox.id, mailSignature.mailboxId))
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .where(
      or(
        and(eq(mailSignature.scope, "personal"), eq(mailSignature.userId, userId)),
        and(eq(mailSignature.scope, "mailbox"), eq(connection.userId, userId)),
      ),
    )
    .orderBy(asc(mailSignature.createdAt));
  return rows.flatMap((row) =>
    row.scope === "workspace"
      ? []
      : [
          {
            mailbox: row.email,
            scope: row.scope,
            name: row.name,
            html: row.html,
            defaultNew: row.defaultNew,
            defaultReply: row.defaultReply,
            createdAt: iso(row.createdAt),
          },
        ],
  );
}

async function resourceEmails(kind: ResourceKind, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const table = { mailbox, calendar, drive, addressbook: addressBook }[kind];
  const rows = await db
    .select({ id: table.id, email: connection.email })
    .from(table)
    .innerJoin(connection, eq(connection.id, table.connectionId))
    .where(inArray(table.id, ids));
  return new Map(rows.map((row) => [row.id, row.email]));
}

async function loadWorkflows(userId: string): Promise<DataExport["workflows"]> {
  const rows = await db
    .select({
      name: workflow.name,
      enabled: workflow.enabled,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      workspace: workspace.slug,
      graph: workflowRevision.graph,
    })
    .from(workflow)
    .innerJoin(
      workflowRevision,
      and(
        eq(workflowRevision.workflowId, workflow.id),
        eq(workflowRevision.revision, workflow.revision),
      ),
    )
    .leftJoin(workspace, eq(workspace.id, workflow.workspaceId))
    .where(
      and(
        eq(workflow.kind, "user"),
        eq(workflow.principalUserId, userId),
        isNull(workflow.deletedAt),
      ),
    )
    .orderBy(asc(workflow.sortOrder), asc(workflow.createdAt));

  const emails = new Map(
    await Promise.all(
      RESOURCE_KINDS.map(
        async (kind) =>
          [
            kind,
            await resourceEmails(kind, [
              ...new Set(rows.flatMap((row) => graphResourceIds(row.graph, kind))),
            ]),
          ] as const,
      ),
    ),
  );
  const named = (graph: WorkflowGraph, kind: ResourceKind) =>
    Object.fromEntries(
      graphResourceIds(graph, kind).flatMap((id) => {
        const email = emails.get(kind)?.get(id);
        return email ? [[id, email]] : [];
      }),
    );

  return rows.map((row) => {
    return {
      workspace: row.workspace,
      name: row.name,
      enabled: row.enabled,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      mailboxes: named(row.graph, "mailbox"),
      calendars: named(row.graph, "calendar"),
      drives: named(row.graph, "drive"),
      addressBooks: named(row.graph, "addressbook"),
      graph: row.graph,
    };
  });
}

async function loadAssistantThreads(userId: string): Promise<DataExport["assistantThreads"]> {
  const exported = await exportAssistantThreads(userId);
  const workspaceIds = [
    ...new Set(
      exported.flatMap(({ thread }) => {
        const id = thread.metadata?.workspaceId;
        return typeof id === "string" ? [id] : [];
      }),
    ),
  ];
  const slugs = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const rows = await db
      .select({ id: workspace.id, slug: workspace.slug })
      .from(workspace)
      .where(inArray(workspace.id, workspaceIds));
    for (const row of rows) slugs.set(row.id, row.slug);
  }

  return exported
    .map(({ thread, messages }) => {
      const workspaceId = thread.metadata?.workspaceId;
      return {
        workspace: typeof workspaceId === "string" ? (slugs.get(workspaceId) ?? null) : null,
        title: assistantThreadTitle(thread),
        createdAt: iso(thread.createdAt),
        updatedAt: iso(thread.updatedAt),
        messages,
      };
    })
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function buildDataExport(userId: string): Promise<DataExport> {
  const [
    account,
    [prefs],
    allowed,
    memberships,
    mailboxLinks,
    calendarLinks,
    driveLinks,
    addressBookLinks,
    signatures,
    labels,
    workflows,
    assistantThreads,
    auditEvents,
  ] = await Promise.all([
    loadAccount(userId),
    db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1),
    db
      .select()
      .from(mailRemoteAllow)
      .where(eq(mailRemoteAllow.userId, userId))
      .orderBy(asc(mailRemoteAllow.kind), asc(mailRemoteAllow.value)),
    loadMemberships(userId),
    loadMailboxLinks(userId),
    loadCalendarLinks(userId),
    loadDriveLinks(userId),
    loadAddressBookLinks(userId),
    loadSignatures(userId),
    loadLabels(userId),
    loadWorkflows(userId),
    loadAssistantThreads(userId),
    exportUserAuditEvents(userId),
  ]);

  const slugById = new Map(memberships.map((m) => [m.id, m.slug]));
  const mailboxesBy = groupBy(mailboxLinks, (row) => row.workspaceId);
  const calendarsBy = groupBy(calendarLinks, (row) => row.workspaceId);
  const drivesBy = groupBy(driveLinks, (row) => row.workspaceId);
  const addressBooksBy = groupBy(addressBookLinks, (row) => row.workspaceId);

  return {
    format: "metis-suite-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    notice: NOTICE,
    account: {
      name: account.name,
      email: account.email,
      createdAt: iso(account.createdAt),
    },
    preferences: {
      defaultWorkspace: account.defaultWorkspaceSlug ?? null,
      workspaceOrder: (prefs?.workspaceOrder ?? []).flatMap((id) => {
        const slug = slugById.get(id);
        return slug ? [slug] : [];
      }),
      mailRemoteContent: prefs?.mailRemoteContent ?? "block",
      mailCleanLinks: prefs?.mailCleanLinks ?? true,
      signInAlerts: prefs?.signInAlerts ?? true,
      remoteContentAllowed: allowed.map((row) => ({
        kind: row.kind,
        value: row.value,
        createdAt: iso(row.createdAt),
      })),
    },
    workspaces: memberships.map((m) => ({
      name: m.name,
      slug: m.slug,
      role: m.role,
      joinedAt: iso(m.joinedAt),
      aiPolicy: m.aiPolicy,
      phishingDetectionPolicy: m.phishingDetectionPolicy,
      themeBrand: workspaceThemeBrand(m.branding ?? null),
      mailboxes: (mailboxesBy.get(m.id) ?? []).map(({ workspaceId: _, ...link }) => link),
      calendars: (calendarsBy.get(m.id) ?? []).map(({ workspaceId: _, ...link }) => link),
      drives: (drivesBy.get(m.id) ?? []).map(({ workspaceId: _, ...link }) => link),
      addressBooks: (addressBooksBy.get(m.id) ?? []).map(({ workspaceId: _, ...link }) => link),
    })),
    signatures,
    labels,
    workflows,
    assistantThreads,
    securityActivity: auditEvents.map(({ id: _, createdAt, mcpClientId: __, ...event }) => ({
      at: iso(createdAt),
      ...event,
    })),
  };
}
