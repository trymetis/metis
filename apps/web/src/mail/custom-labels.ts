import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mailboxLabel } from "@/db/schema";
import type { CustomLabelColor } from "@/types/mail";

import { forgetUnsure } from "./classify-unsure";

export interface StoredCustomLabel {
  id: string;
  key: string;
  name: string;
  color: CustomLabelColor;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "label"
  );
}

export async function listCustomLabels(mailboxIds: string[]): Promise<StoredCustomLabel[]> {
  if (mailboxIds.length === 0) return [];
  const rows = await db
    .select()
    .from(mailboxLabel)
    .where(inArray(mailboxLabel.mailboxId, mailboxIds))
    .orderBy(mailboxLabel.createdAt);

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, row);
  }

  return [...byKey.values()].map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    color: r.color,
  }));
}

export async function createCustomLabel(opts: {
  userId: string;
  mailboxIds: string[];
  name: string;
  color?: CustomLabelColor;
}): Promise<StoredCustomLabel | { error: string; reason: "bad_request" | "conflict" }> {
  if (opts.mailboxIds.length === 0) {
    return { error: "No mailbox in scope", reason: "bad_request" };
  }

  const key = `custom:${slugify(opts.name)}`;
  const name = opts.name.slice(0, 40);
  const color: CustomLabelColor = opts.color ?? "gray";
  const now = new Date();

  const inserted = await db
    .insert(mailboxLabel)
    .values(
      opts.mailboxIds.map((id) => ({
        id: crypto.randomUUID(),
        mailboxId: id,
        createdByUserId: opts.userId,
        key,
        name,
        color,
        createdAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [mailboxLabel.mailboxId, mailboxLabel.key],
    })
    .returning({ id: mailboxLabel.id });

  const first = inserted[0];
  if (!first) return { error: "Label already exists", reason: "conflict" };
  await forgetUnsure(opts.mailboxIds);
  return { id: first.id, key, name, color };
}

export async function deleteCustomLabel(opts: {
  mailboxIds: string[];
  id: string;
}): Promise<{ key: string } | { error: string }> {
  const [row] = await db
    .select({ key: mailboxLabel.key })
    .from(mailboxLabel)
    .where(and(eq(mailboxLabel.id, opts.id), inArray(mailboxLabel.mailboxId, opts.mailboxIds)))
    .limit(1);
  if (!row) return { error: "Label not found" };

  await db
    .delete(mailboxLabel)
    .where(and(eq(mailboxLabel.key, row.key), inArray(mailboxLabel.mailboxId, opts.mailboxIds)));
  await forgetUnsure(opts.mailboxIds);

  return { key: row.key };
}
