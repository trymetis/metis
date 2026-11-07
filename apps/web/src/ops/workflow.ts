import "server-only";
import { z } from "zod";

import { resolvedCalendarName } from "@/calendar/aggregate";
import { resolvedAddressBookName } from "@/contacts/aggregate";
import { driveName } from "@/drive/name";
import {
  cancelWorkflowRunOutputSchema,
  previewDecisionOutputSchema,
  resumeWorkflowRunOutputSchema,
  workflowRunDetailSchema,
  workflowRunSchema,
  workflowSchema,
} from "@/server/schema";
import type { WorkspaceRole } from "@/types/workspace";
import {
  cancelWorkspaceRun,
  createUserWorkflow,
  deleteUserWorkflow,
  getWorkspaceRun,
  getWorkspaceWorkflow,
  listWorkspaceRuns,
  listWorkspaceWorkflows,
  requestWorkflowRun,
  resumeWorkspaceRun,
  toggleUserWorkflow,
  updateUserWorkflow,
  type WorkspaceScope,
} from "@/workflow";
import { previewDecision as previewAsk } from "@/workflow/preview";
import type { GraphNode } from "@/workflow/schema";
import { allSteps, CATEGORY_LABELS, nodeOutputs } from "@/workflow/steps";
import { STEP_CATEGORIES } from "@/workflow/steps/types";
import { typeLabel } from "@/workflow/values";

import { orFailure, type Output } from "./output";
import { type AgentMailbox, auditedBy, mailScopeFor, type WorkspaceCtx } from "./scope";

export const listWorkflowsOutput = z.object({
  workflows: z.array(workflowSchema),
  mailboxes: z.array(z.object({ mailboxId: z.string(), email: z.string() })),
  calendars: z.array(z.object({ calendarAccountId: z.string(), email: z.string() })),
  drives: z.array(z.object({ driveId: z.string(), email: z.string() })),
});

export const listWorkflowStepsOutput = z.object({
  categories: z.record(z.enum(STEP_CATEGORIES), z.string()),
  steps: z.array(
    z.object({
      step: z.string(),
      label: z.string(),
      category: z.enum(STEP_CATEGORIES),
      description: z.string(),
      effect: z.enum(["read", "write", "dispatch"]),
      trigger: z.string().optional(),
      passesOn: z.string().optional(),
      merge: z.enum(["append", "join", "aggregate", "collect"]).optional(),
      outputs: z.union([z.string(), z.array(z.string())]),
      params: z.record(
        z.string(),
        z.object({
          label: z.string(),
          kind: z.string(),
          type: z.string(),
          required: z.literal(true).optional(),
          literalOnly: z.literal(true).optional(),
          options: z.array(z.string()).optional(),
          default: z.unknown().optional(),
          help: z.string().optional(),
        }),
      ),
    }),
  ),
});

export const listWorkflowRunsOutput = z.object({ runs: z.array(workflowRunSchema) });

export const getWorkflowRunOutput = orFailure(z.object({ run: workflowRunDetailSchema }));

export const cancelWorkflowRunOutput = orFailure(
  z.intersection(z.object({ runId: z.string() }), cancelWorkflowRunOutputSchema),
);

export const resumeWorkflowRunOutput = orFailure(
  z.intersection(z.object({ runId: z.string() }), resumeWorkflowRunOutputSchema),
);

export const workflowWriteOutput = orFailure(z.object({ workflow: workflowSchema }));

export const toggleWorkflowOutput = orFailure(
  z.object({ success: z.literal(true), workflowId: z.string(), enabled: z.boolean() }),
);

export const deleteWorkflowOutput = orFailure(
  z.object({ success: z.literal(true), workflowId: z.string() }),
);

export const applyWorkflowsOutput = orFailure(
  z.object({ queued: z.literal(true), runId: z.string(), note: z.string() }),
);

export const previewDecisionOutput = orFailure(
  z.object({
    mailboxId: z.string(),
    count: z.number(),
    items: previewDecisionOutputSchema.shape.items,
    note: z.string(),
  }),
);

export async function workspaceScope(ctx: WorkspaceCtx): Promise<WorkspaceScope> {
  const me = (await ctx.members()).find((member) => member.userId === ctx.userId);
  return {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    role: ctx.workspaceRole,
    person: { email: me?.email ?? "", name: me?.name ?? "" },
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      linkId: m.linkId,
      email: m.email,
      aiEnabled: true,
    })),
    calendars: ctx.calendars.map((c) => ({
      accountId: c.accountId,
      linkId: c.linkId,
      email: c.accountEmail,
      name: resolvedCalendarName(c, ctx.calendars),
      slug: c.accountSlug,
      aiEnabled: c.policy.ai,
    })),
    drives: ctx.drives.map((d) => ({
      driveId: d.driveId,
      linkId: d.linkId,
      email: d.email,
      name: driveName(d, ctx.drives),
      slug: d.driveSlug,
      aiEnabled: d.policy.ai,
    })),
    addressBooks: ctx.addressBooks.map((a) => ({
      addressBookId: a.accountId,
      linkId: a.linkId,
      email: a.accountEmail,
      name: resolvedAddressBookName(a, ctx.addressBooks),
      slug: a.accountSlug,
      aiEnabled: a.policy.ai,
    })),
  };
}

export async function listWorkflows(
  ctx: WorkspaceCtx,
): Promise<Output<typeof listWorkflowsOutput>> {
  const workflows = await listWorkspaceWorkflows(await workspaceScope(ctx));
  return {
    workflows,
    mailboxes: ctx.mailboxes.map((m) => ({ mailboxId: m.mailboxId, email: m.email })),
    calendars: ctx.calendars.map((c) => ({
      calendarAccountId: c.accountId,
      email: c.accountEmail,
    })),
    drives: ctx.drives.map((d) => ({ driveId: d.driveId, email: d.email })),
  };
}

export function listWorkflowSteps(args: {
  category?: string;
  decisionSteps: boolean;
}): Output<typeof listWorkflowStepsOutput> {
  const steps = allSteps().filter(
    (def) =>
      (def.scope === undefined || def.scope === "any") &&
      (!args.category || def.category === args.category) &&
      (args.decisionSteps || (def.key !== "ai.ask" && def.key !== "ai.branch")),
  );
  return {
    categories: CATEGORY_LABELS,
    steps: steps.map((def) => {
      const sample: GraphNode = { id: "n", step: def.key, position: { x: 0, y: 0 }, params: {} };
      const outputs = def.outputs
        ? nodeOutputs(sample, { nodes: [sample], edges: [] })
        : [{ id: "out" }];
      return {
        step: def.key,
        label: def.label,
        category: def.category,
        description: def.description,
        effect: def.effect,
        ...(def.trigger ? { trigger: def.trigger.kind } : {}),
        ...(def.many ? { passesOn: "one item per entry" } : {}),
        ...(def.merge ? { merge: def.merge } : {}),
        outputs:
          def.outputs &&
          outputs.length === 0 &&
          def.key !== "logic.stop" &&
          def.key !== "flow.return"
            ? "depends on its settings"
            : outputs.map((output) => output.id),
        params: Object.fromEntries(
          Object.entries(def.params).map(([name, spec]) => [
            name,
            {
              label: spec.label,
              kind: spec.kind,
              type: typeLabel(spec.type),
              ...(spec.required ? { required: true } : {}),
              ...(spec.bindable === false || !spec.bindable ? { literalOnly: true } : {}),
              ...(spec.options ? { options: spec.options.map((option) => option.value) } : {}),
              ...(spec.default ? { default: spec.default } : {}),
              ...(spec.help ? { help: spec.help } : {}),
            },
          ]),
        ),
      };
    }),
  };
}

export async function listWorkflowRuns(args: {
  ctx: WorkspaceCtx;
  workflowId?: string;
  limit: number;
}): Promise<Output<typeof listWorkflowRunsOutput>> {
  const runs = await listWorkspaceRuns({
    scope: await workspaceScope(args.ctx),
    workflowId: args.workflowId,
    limit: args.limit,
  });
  return { runs };
}

export async function getWorkflowRun(args: {
  ctx: WorkspaceCtx;
  runId: string;
}): Promise<Output<typeof getWorkflowRunOutput>> {
  const run = await getWorkspaceRun(await workspaceScope(args.ctx), args.runId);
  if (!run) return { error: `No workflow run "${args.runId}" in this workspace` };
  return { run };
}

export async function cancelWorkflowRun(args: {
  ctx: WorkspaceCtx;
  runId: string;
}): Promise<Output<typeof cancelWorkflowRunOutput>> {
  const result = await cancelWorkspaceRun(await workspaceScope(args.ctx), args.runId);
  if (!result) {
    return { error: `No workflow run "${args.runId}" in this workspace` };
  }
  return { runId: args.runId, ...result };
}

export async function resumeWorkflowRun(args: {
  ctx: WorkspaceCtx;
  runId: string;
}): Promise<Output<typeof resumeWorkflowRunOutput>> {
  const result = await resumeWorkspaceRun(await workspaceScope(args.ctx), args.runId);
  if (!result) {
    return { error: `No workflow run "${args.runId}" in this workspace` };
  }
  return { runId: args.runId, ...result };
}

export async function createWorkflow(args: {
  ctx: WorkspaceCtx;
  workflow: unknown;
}): Promise<Output<typeof workflowWriteOutput>> {
  const created = await createUserWorkflow(
    await workspaceScope(args.ctx),
    args.workflow,
    auditedBy(args.ctx),
  );
  if (typeof created === "string") return { error: created };
  return { workflow: created };
}

export async function updateWorkflow(args: {
  ctx: WorkspaceCtx;
  workflowId: string;
  workflow: unknown;
}): Promise<Output<typeof workflowWriteOutput>> {
  const updated = await updateUserWorkflow(
    await workspaceScope(args.ctx),
    args.workflowId,
    args.workflow,
    auditedBy(args.ctx),
  );
  if (typeof updated === "string") return { error: updated };
  return { workflow: updated };
}

export async function toggleWorkflow(args: {
  ctx: WorkspaceCtx;
  workflowId: string;
  enabled: boolean;
}): Promise<Output<typeof toggleWorkflowOutput>> {
  const found = await toggleUserWorkflow(
    await workspaceScope(args.ctx),
    args.workflowId,
    args.enabled,
    auditedBy(args.ctx),
  );
  if (!found) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  return { success: true, workflowId: args.workflowId, enabled: args.enabled };
}

export async function deleteWorkflow(args: {
  ctx: WorkspaceCtx;
  role: WorkspaceRole | null;
  workflowId: string;
}): Promise<Output<typeof deleteWorkflowOutput>> {
  if (args.role !== "owner" && args.role !== "admin") {
    return { error: "Only a workspace owner or admin can delete workflows" };
  }
  const found = await deleteUserWorkflow(
    await workspaceScope(args.ctx),
    args.workflowId,
    auditedBy(args.ctx),
  );
  if (!found) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  return { success: true, workflowId: args.workflowId };
}

export async function applyWorkflows(args: {
  ctx: WorkspaceCtx;
  workflowId: string;
  inputs?: Record<string, unknown>;
}): Promise<Output<typeof applyWorkflowsOutput>> {
  const existing = await getWorkspaceWorkflow(await workspaceScope(args.ctx), args.workflowId);
  if (!existing) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  const requested = await requestWorkflowRun(
    await workspaceScope(args.ctx),
    args.workflowId,
    args.inputs,
  );
  if (typeof requested === "string") return { error: requested };
  return {
    queued: true,
    runId: requested.runId,
    note: "The workflow runner picks this up on its next tick; check listWorkflowRuns for the outcome.",
  };
}

export async function previewDecision(args: {
  ctx: WorkspaceCtx;
  mailbox: AgentMailbox;
  node: Pick<GraphNode, "params">;
  limit: number;
}): Promise<Output<typeof previewDecisionOutput>> {
  const preview = await previewAsk({
    userId: args.ctx.userId,
    mail: mailScopeFor(args.ctx, args.mailbox),
    node: args.node,
    limit: args.limit,
  });
  if (!preview.ok) return { error: preview.message };
  return {
    mailboxId: args.mailbox.mailboxId,
    count: preview.items.length,
    items: preview.items,
    note: "A preview only: nothing was saved, labelled or moved.",
  };
}
