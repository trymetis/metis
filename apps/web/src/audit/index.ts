import "server-only";
import { and, type Column, desc, eq, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditEvent, user, workspace } from "@/db/schema";
import type { AuditEvent, AuditEventPage, AuditFilter, AuditPageInput } from "@/server/schema";
import { clientIp } from "@/services/client-ip";
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_KINDS,
  type AuditAction,
  type AuditDetail,
  type AuditResourceKind,
  type AuditVia,
  AUDIT_ACTION_LABELS,
  auditEventTitle,
} from "@/types/audit";

import { auditPhrase } from "./format";

export interface AuditActor {
  userId: string;
  email?: string;
  via: AuditVia;
  mcpClientId?: string;
  headers?: Headers;
}

export interface AuditEventInput {
  action: AuditAction;
  workspaceId?: string | null;
  workspaceName?: string;
  targetUserId?: string | null;
  targetLabel?: string | null;
  resourceKind?: AuditResourceKind;
  detail?: AuditDetail;
}

export function appActor(
  appUser: { userId: string; user: { email: string } },
  headers: Headers,
): AuditActor {
  return {
    userId: appUser.userId,
    email: appUser.user.email,
    via: "app",
    headers,
  };
}

const USER_AGENT_MAX = 512;

function requestIp(headers: Headers | undefined): string | null {
  if (!headers) return null;
  return clientIp(headers);
}

async function userEmail(userId: string | null | undefined) {
  if (!userId) return null;
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

async function workspaceRow(workspaceId: string | null | undefined) {
  if (!workspaceId) return null;
  const [row] = await db
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function recordAuditEvent(by: AuditActor, event: AuditEventInput): Promise<void> {
  try {
    const [actor, ws, target] = await Promise.all([
      userEmail(by.userId),
      workspaceRow(event.workspaceId),
      userEmail(event.targetUserId),
    ]);
    await db.insert(auditEvent).values({
      id: crypto.randomUUID(),
      createdAt: new Date(),
      action: event.action,
      via: by.via,
      mcpClientId: by.mcpClientId ?? null,
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? by.email ?? "",
      workspaceId: ws?.id ?? null,
      workspaceName: ws?.name ?? event.workspaceName ?? null,
      targetUserId: target?.id ?? null,
      targetLabel: event.targetLabel ?? target?.email ?? null,
      resourceKind: event.resourceKind ?? null,
      detail: event.detail ?? {},
      ip: requestIp(by.headers),
      userAgent: by.headers?.get("user-agent")?.slice(0, USER_AGENT_MAX) ?? null,
    });
  } catch (err) {
    console.error(`[audit] failed to record ${event.action}`, err);
  }
}

export const AUDIT_PAGE_SIZE = 50;

function parseCursor(cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const dot = cursor.indexOf(".");
  const ms = Number(cursor.slice(0, dot));
  const id = cursor.slice(dot + 1);
  if (dot < 1 || !Number.isFinite(ms) || !id) return undefined;
  const at = new Date(ms);
  return or(lt(auditEvent.createdAt, at), and(eq(auditEvent.createdAt, at), lt(auditEvent.id, id)));
}

const AUDIT_TITLES = AUDIT_ACTIONS.flatMap((action) =>
  [null, ...AUDIT_RESOURCE_KINDS].map((kind) => ({
    action,
    kind,
    title: auditEventTitle(action, kind).toLowerCase(),
    label: AUDIT_ACTION_LABELS[action].toLowerCase(),
    phrase: auditPhrase(action, kind),
  })),
);

function containing(column: Column, q: string): SQL {
  const pattern = `%${q.replaceAll(/[\\%_]/g, "\\$&")}%`;
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

function textMatch(q: string, withNetwork: boolean): SQL | undefined {
  const needle = q.toLowerCase();
  const titles = AUDIT_TITLES.filter(
    ({ title, label, phrase }) =>
      title.includes(needle) || label.includes(needle) || phrase.includes(needle),
  ).map(({ action, kind }) =>
    and(
      eq(auditEvent.action, action),
      kind ? eq(auditEvent.resourceKind, kind) : isNull(auditEvent.resourceKind),
    ),
  );
  return or(
    ...titles,
    containing(auditEvent.actorEmail, q),
    containing(auditEvent.targetLabel, q),
    containing(auditEvent.workspaceName, q),
    withNetwork ? containing(auditEvent.ip, q) : undefined,
  );
}

function filterScope(filter: AuditFilter, withNetwork: boolean): SQL | undefined {
  return and(
    filter.action ? eq(auditEvent.action, filter.action) : undefined,
    filter.q ? textMatch(filter.q, withNetwork) : undefined,
  );
}

type AuditRow = typeof auditEvent.$inferSelect;

async function memberNames(rows: AuditRow[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows.flatMap((row) => [row.actorUserId, row.targetUserId]).filter((id) => id !== null),
    ),
  ];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(found.filter((row) => row.name).map((row) => [row.id, row.name]));
}

function toView(row: AuditRow, withNetwork: boolean, names?: Map<string, string>): AuditEvent {
  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    via: row.via,
    mcpClientId: row.mcpClientId,
    actorEmail: row.actorEmail,
    ...(names && {
      actorName: (row.actorUserId && names.get(row.actorUserId)) || null,
      targetName: (row.targetUserId && names.get(row.targetUserId)) || null,
    }),
    workspaceName: row.workspaceName,
    targetLabel: row.targetLabel,
    resourceKind: row.resourceKind,
    detail: row.detail,
    ip: withNetwork ? row.ip : null,
    userAgent: withNetwork ? row.userAgent : null,
  };
}

async function listPage(
  scope: SQL | undefined,
  { cursor, ...filter }: AuditPageInput,
  withNetwork: boolean,
): Promise<AuditEventPage> {
  const rows = await db
    .select()
    .from(auditEvent)
    .where(and(scope, filterScope(filter, withNetwork), parseCursor(cursor)))
    .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
    .limit(AUDIT_PAGE_SIZE + 1);
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = page.at(-1);
  const names = await memberNames(page);
  return {
    events: page.map((row) => toView(row, withNetwork, names)),
    nextCursor:
      rows.length > AUDIT_PAGE_SIZE && last ? `${last.createdAt.getTime()}.${last.id}` : null,
  };
}

function userScope(userId: string): SQL | undefined {
  return or(eq(auditEvent.actorUserId, userId), eq(auditEvent.targetUserId, userId));
}

export function listUserAuditEvents(userId: string, page: AuditPageInput = {}) {
  return listPage(userScope(userId), page, true);
}

export function listWorkspaceAuditEvents(workspaceId: string, page: AuditPageInput = {}) {
  return listPage(eq(auditEvent.workspaceId, workspaceId), page, false);
}

export function listInstanceAuditEvents(page: AuditPageInput = {}) {
  return listPage(undefined, page, true);
}

export async function exportUserAuditEvents(userId: string): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvent)
    .where(userScope(userId))
    .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id));
  return rows.map((row) => toView(row, true));
}
