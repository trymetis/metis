import "server-only";
import { z } from "zod";

import {
  createCustomLabel,
  deleteCustomLabel,
  listCustomLabels,
  updateCustomLabel,
} from "@/mail/custom-labels";
import {
  clearUserLabel,
  labelTargets,
  mailboxLabelKeys,
  setLabelOnMessages,
  setUserLabel,
} from "@/mail/labels";
import { BUILT_IN_LABELS, customLabelColorSchema } from "@/server/schema";
import type { LabelColor } from "@/types/mail";

import { orFailure, type Output } from "./output";
import type { AgentMailbox } from "./scope";

export const listLabelsOutput = z.object({
  labels: z.array(z.object({ key: z.string(), builtIn: z.boolean() })),
});

export const setLabelOutput = orFailure(
  z.object({ success: z.literal(true), mailboxId: z.string(), id: z.string(), label: z.string() }),
);

export const setLabelsOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    label: z.string(),
    count: z.number(),
    previous: z.record(z.string(), z.string().nullable()),
  }),
);

export const createLabelOutput = orFailure(
  z.object({
    created: z.literal(true),
    mailboxId: z.string(),
    key: z.string(),
    name: z.string(),
    color: customLabelColorSchema,
  }),
);

export const updateLabelOutput = orFailure(
  z.object({
    updated: z.literal(true),
    mailboxId: z.string(),
    key: z.string(),
    name: z.string(),
    color: customLabelColorSchema,
  }),
);

export const deleteLabelOutput = orFailure(
  z.object({ deleted: z.literal(true), mailboxId: z.string(), key: z.string() }),
);

export const clearLabelOutput = z.object({
  success: z.literal(true),
  mailboxId: z.string(),
  id: z.string(),
});

export async function listLabels(mailboxIds: string[]): Promise<Output<typeof listLabelsOutput>> {
  const keys = await mailboxLabelKeys(mailboxIds);
  const builtIn = new Set<string>(BUILT_IN_LABELS);
  return {
    labels: [...keys].map((key) => ({ key, builtIn: builtIn.has(key) })),
  };
}

export async function setLabel(args: {
  userId: string;
  mailbox: AgentMailbox;
  id: string;
  label: string;
}): Promise<Output<typeof setLabelOutput>> {
  const target = args.mailbox.scope(args.id);
  const keys = await mailboxLabelKeys([target.mailboxId]);
  if (!keys.has(args.label)) {
    return {
      error: `Unknown label key "${args.label}". These are all of them: ${[...keys].join(", ")}`,
    };
  }
  await setUserLabel({
    userId: args.userId,
    mailboxId: target.mailboxId,
    messageId: target.messageId,
    label: args.label,
  });
  return {
    success: true,
    mailboxId: target.mailboxId,
    id: args.id,
    label: args.label,
  };
}

export async function setLabels(args: {
  userId: string;
  mailbox: AgentMailbox;
  ids: string[];
  label: string;
}): Promise<Output<typeof setLabelsOutput>> {
  const keys = await mailboxLabelKeys([args.mailbox.mailboxId]);
  if (!keys.has(args.label)) {
    return {
      error: `Unknown label key "${args.label}". These are all of them: ${[...keys].join(", ")}`,
    };
  }
  const previous = await setLabelOnMessages({
    userId: args.userId,
    targets: labelTargets(args.mailbox, args.ids),
    label: args.label,
  });
  return {
    success: true,
    mailboxId: args.mailbox.mailboxId,
    label: args.label,
    count: args.ids.length,
    previous,
  };
}

export async function createLabel(args: {
  userId: string;
  mailbox: AgentMailbox;
  name: string;
  color?: LabelColor;
}): Promise<Output<typeof createLabelOutput>> {
  const created = await createCustomLabel({
    userId: args.userId,
    mailboxIds: [args.mailbox.mailboxId],
    name: args.name,
    color: args.color,
  });
  if ("error" in created) return { error: created.error };
  return {
    created: true,
    mailboxId: args.mailbox.mailboxId,
    key: created.key,
    name: created.name,
    color: created.color,
  };
}

export async function updateLabel(args: {
  mailbox: AgentMailbox;
  key: string;
  name?: string;
  color?: LabelColor;
}): Promise<Output<typeof updateLabelOutput>> {
  const custom = await listCustomLabels([args.mailbox.mailboxId]);
  const label = custom.find((l) => l.key === args.key);
  if (!label) {
    return {
      error: `"${args.key}" is not a custom label in this mailbox — built-in labels cannot be changed. Custom labels here: ${
        custom.map((l) => l.key).join(", ") || "none"
      }`,
    };
  }
  const updated = await updateCustomLabel({
    mailboxIds: [args.mailbox.mailboxId],
    id: label.id,
    name: args.name,
    color: args.color,
  });
  if ("error" in updated) return updated;
  return {
    updated: true,
    mailboxId: args.mailbox.mailboxId,
    key: updated.key,
    name: updated.name,
    color: updated.color,
  };
}

export async function deleteLabel(
  mailbox: AgentMailbox,
  key: string,
): Promise<Output<typeof deleteLabelOutput>> {
  const custom = await listCustomLabels([mailbox.mailboxId]);
  const label = custom.find((l) => l.key === key);
  if (!label) {
    return {
      error: `"${key}" is not a custom label in this mailbox — built-in labels cannot be deleted. Custom labels here: ${
        custom.map((l) => l.key).join(", ") || "none"
      }`,
    };
  }
  const deleted = await deleteCustomLabel({
    mailboxIds: [mailbox.mailboxId],
    id: label.id,
  });
  if ("error" in deleted) return deleted;
  return { deleted: true, mailboxId: mailbox.mailboxId, key };
}

export async function clearLabel(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof clearLabelOutput>> {
  const target = mailbox.scope(id);
  await clearUserLabel({
    mailboxId: target.mailboxId,
    messageId: target.messageId,
  });
  return { success: true, mailboxId: target.mailboxId, id };
}

export async function labelMessage(args: {
  userId: string;
  mailboxId: string;
  messageId: string;
  label: string;
  action: "add" | "remove";
  validate?: boolean;
}): Promise<void> {
  if (args.action === "remove") {
    await clearUserLabel({ mailboxId: args.mailboxId, messageId: args.messageId });
    return;
  }
  const keys = args.validate === false ? null : await mailboxLabelKeys([args.mailboxId]);
  if (keys && !keys.has(args.label)) {
    throw new Error(`There is no label "${args.label}" in that mailbox`);
  }
  await setUserLabel({
    userId: args.userId,
    mailboxId: args.mailboxId,
    messageId: args.messageId,
    label: args.label,
  });
}
