import { createHash } from "node:crypto";

import Database from "better-sqlite3";
import { z } from "zod";

const NAMESPACE = "3d4f8e0a-6c1b-4f7e-9a2d-5b8c7e1f0a92";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const RESOURCES = ["mailbox", "calendar", "drive"] as const;

export function stableId(name: string): string {
  const bytes = createHash("sha1")
    .update(Buffer.from(NAMESPACE.replaceAll("-", ""), "hex"))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function naturalKeys(path: string): Map<string, string> {
  const db = new Database(path, { readonly: true });
  const keys = new Map<string, string>();
  const rows = <T extends z.ZodRawShape>(shape: T, sql: string) =>
    z.array(z.object(shape)).parse(db.prepare(sql).all());
  const text = z.string();
  const keyOf = (id: string) => {
    const key = keys.get(id);
    if (!key) throw new Error(`no natural key resolved for ${id}`);
    return key;
  };

  for (const r of rows({ id: text, email: text }, `SELECT id, email FROM "user"`)) {
    keys.set(r.id, `user:${r.email}`);
  }
  for (const r of rows({ id: text, slug: text }, `SELECT id, slug FROM "workspace"`)) {
    keys.set(r.id, `workspace:${r.slug}`);
  }
  for (const r of rows(
    { id: text, provider_id: text, user_id: text },
    `SELECT id, provider_id, user_id FROM "account"`,
  )) {
    keys.set(r.id, `account:${r.provider_id}:${keyOf(r.user_id)}`);
  }
  for (const r of rows(
    { id: text, workspace_id: text, user_id: text },
    `SELECT id, workspace_id, user_id FROM "workspace_member"`,
  )) {
    keys.set(r.id, `workspace_member:${keyOf(r.workspace_id)}:${keyOf(r.user_id)}`);
  }
  for (const r of rows(
    { id: text, user_id: text, provider: text, provider_account_id: text },
    `SELECT id, user_id, provider, provider_account_id FROM "connection"`,
  )) {
    keys.set(r.id, `connection:${keyOf(r.user_id)}:${r.provider}:${r.provider_account_id}`);
  }
  for (const resource of RESOURCES) {
    for (const r of rows(
      { id: text, connection_id: text },
      `SELECT id, connection_id FROM "${resource}"`,
    )) {
      keys.set(r.id, `${resource}:${keyOf(r.connection_id)}`);
    }
    for (const r of rows(
      { id: text, resource_id: text, workspace_id: text },
      `SELECT id, ${resource}_id AS resource_id, workspace_id FROM "${resource}_workspace"`,
    )) {
      keys.set(r.id, `${resource}_workspace:${keyOf(r.resource_id)}:${keyOf(r.workspace_id)}`);
    }
  }
  for (const r of rows({ id: text, email: text }, `SELECT id, email FROM "signup_invite"`)) {
    keys.set(r.id, `signup_invite:${r.email}`);
  }
  for (const r of rows(
    { id: text, action: text, actor_email: text, target_label: text },
    `SELECT id, action, actor_email, coalesce(target_label, '') AS target_label FROM "audit_event"`,
  )) {
    keys.set(r.id, `audit_event:${r.action}:${r.actor_email}:${r.target_label}`);
  }
  for (const r of rows(
    { id: text, client_id: text, resource_id: text },
    `SELECT id, client_id, resource_id FROM "oauth_client_resource"`,
  )) {
    keys.set(r.id, `oauth_client_resource:${r.client_id}:${r.resource_id}`);
  }
  for (const r of rows(
    { id: text, mailbox_id: text, key: text },
    `SELECT id, mailbox_id, key FROM "mailbox_label"`,
  )) {
    keys.set(r.id, `mailbox_label:${keyOf(r.mailbox_id)}:${r.key}`);
  }
  for (const r of rows(
    { id: text, user_id: text, drive_id: text, folder_id: text },
    `SELECT id, user_id, drive_id, folder_id FROM "drive_pin"`,
  )) {
    keys.set(r.id, `drive_pin:${keyOf(r.user_id)}:${keyOf(r.drive_id)}:${r.folder_id}`);
  }
  for (const r of rows(
    { id: text, kind: text, workspace_id: text, name: text },
    `SELECT id, kind, workspace_id, name FROM "workflow"`,
  )) {
    keys.set(r.id, `workflow:${keyOf(r.workspace_id)}:${r.kind}:${r.name}`);
  }
  for (const r of rows(
    { id: text, workflow_id: text, revision: z.number() },
    `SELECT id, workflow_id, revision FROM "workflow_revision"`,
  )) {
    keys.set(r.id, `workflow_revision:${keyOf(r.workflow_id)}:${r.revision}`);
  }
  for (const table of ["workflow_resource", "workflow_trigger"]) {
    for (const r of rows(
      { id: text, revision_id: text, node_id: text },
      `SELECT id, revision_id, node_id FROM "${table}"`,
    )) {
      keys.set(r.id, `${table}:${keyOf(r.revision_id)}:${r.node_id}`);
    }
  }
  for (const r of rows(
    { id: text, trigger_id: text, scope: text },
    `SELECT id, trigger_id, scope FROM "workflow_cursor"`,
  )) {
    keys.set(r.id, `workflow_cursor:${keyOf(r.trigger_id)}:${r.scope}`);
  }
  for (const r of rows(
    { id: text, trigger_id: text, kind: text },
    `SELECT id, trigger_id, kind FROM "workflow_endpoint"`,
  )) {
    keys.set(r.id, `workflow_endpoint:${keyOf(r.trigger_id)}:${r.kind}`);
  }
  for (const r of rows(
    { id: text, trigger_id: text, key: text },
    `SELECT id, trigger_id, key FROM "workflow_event"`,
  )) {
    keys.set(r.id, `workflow_event:${keyOf(r.trigger_id)}:${r.key}`);
  }
  for (const r of rows(
    { id: text, workflow_id: text, kind: text, name: text.nullable() },
    `SELECT id, workflow_id, kind, name FROM "workflow_blob" WHERE run_id IS NULL`,
  )) {
    keys.set(r.id, `workflow_blob:${keyOf(r.workflow_id)}:${r.kind}:${r.name ?? ""}`);
  }
  db.close();
  return keys;
}

export function stableIds(path: string, sql: string): string {
  const ids = new Map([...naturalKeys(path)].map(([id, key]) => [id, stableId(key)]));
  return sql.replace(UUID, (id) => {
    const stable = ids.get(id);
    if (!stable) throw new Error(`seed id ${id} has no natural key`);
    return stable;
  });
}
