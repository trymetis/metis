import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor } from "@/audit";
import { mailSessionFor } from "@/mail/session";
import { rateLimit } from "@/services/rate-limit";
import {
  cancelWorkspaceRun,
  createUserWorkflow,
  decideApproval,
  deleteUserWorkflow,
  getWorkspaceRun,
  getWorkspaceWorkflow,
  inspectWorkspaceDispatch,
  listPendingApprovals,
  listWorkflowRevisions,
  listWorkspaceRuns,
  listWorkspaceWorkflows,
  requestWorkflowRun,
  resolveWorkspaceDispatch,
  resumeWorkspaceRun,
  toggleUserWorkflow,
  updateUserWorkflow,
  type WorkflowSummary,
} from "@/workflow";
import { endpointUrl, newSecret } from "@/workflow/inbound/endpoints";
import { previewDecision } from "@/workflow/preview";
import { workflowScopeFor } from "@/workflow/scope";
import {
  getEndpoint,
  loadDefinition,
  pinSample,
  rotateEndpointSecret,
  unpinSample,
} from "@/workflow/store";
import { listTestSamples, testRunGraph } from "@/workflow/test-run";
import { listWorkspaceMembers } from "@/workspace";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  cancelWorkflowRunInputSchema,
  cancelWorkflowRunOutputSchema,
  createWorkflowInputSchema,
  decideApprovalInputSchema,
  deleteWorkflowInputSchema,
  deleteWorkflowOutputSchema,
  dispatchStepInputSchema,
  getWorkflowRunInputSchema,
  getWorkflowRunOutputSchema,
  inspectDispatchOutputSchema,
  listApprovalsOutputSchema,
  listWorkflowRunsInputSchema,
  listWorkflowRunsOutputSchema,
  listWorkflowsOutputSchema,
  pinSampleInputSchema,
  previewDecisionInputSchema,
  previewDecisionOutputSchema,
  resolveDispatchInputSchema,
  resolveDispatchOutputSchema,
  resumeWorkflowRunInputSchema,
  resumeWorkflowRunOutputSchema,
  runWorkflowInputSchema,
  runWorkflowOutputSchema,
  successSchema,
  testSamplesInputSchema,
  testSamplesOutputSchema,
  testWorkflowInputSchema,
  testWorkflowOutputSchema,
  toggleWorkflowInputSchema,
  toggleWorkflowOutputSchema,
  updateWorkflowInputSchema,
  webhookSecretInputSchema,
  webhookSecretOutputSchema,
  workflowOutputSchema,
  workflowRevisionsInputSchema,
  workflowRevisionsOutputSchema,
  workflowSamplesInputSchema,
  workflowSamplesOutputSchema,
  workspaceScopeSchema,
} from "../schema";

function orThrow(result: WorkflowSummary | string): WorkflowSummary {
  if (typeof result === "string") throw new ORPCError("BAD_REQUEST", { message: result });
  return result;
}

function notFound(): ORPCError<"NOT_FOUND", unknown> {
  return new ORPCError("NOT_FOUND", { message: "Not found" });
}

export const workflowsRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkflowsOutputSchema)
    .handler(async ({ context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const [workflows, members] = await Promise.all([
        listWorkspaceWorkflows(scope),
        listWorkspaceMembers(scope.workspaceId),
      ]);
      return {
        workflows,
        directory: {
          mailboxes: scope.directory.map((m) => ({
            id: m.mailboxId,
            slug: m.slug,
            email: m.email,
            name: m.email,
            aiEnabled:
              scope.mailboxes.find((box) => box.mailboxId === m.mailboxId)?.aiEnabled ?? false,
          })),
          calendars: scope.calendars.map((c) => ({
            id: c.accountId,
            slug: c.slug,
            email: c.email,
            name: c.name,
            aiEnabled: c.aiEnabled,
          })),
          drives: scope.drives.map((d) => ({
            id: d.driveId,
            slug: d.slug,
            email: d.email,
            name: d.name,
            aiEnabled: d.aiEnabled,
          })),
          addressBooks: scope.addressBooks.map((a) => ({
            id: a.addressBookId,
            slug: a.slug,
            email: a.email,
            name: a.name,
            aiEnabled: a.aiEnabled,
          })),
          members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email })),
        },
      };
    }),

  create: workspaceSession(createWorkflowInputSchema)
    .output(workflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      return {
        workflow: orThrow(
          await createUserWorkflow(
            scope,
            input.workflow,
            appActor(context.appUser, context.headers),
          ),
        ),
      };
    }),

  update: workspaceSession(updateWorkflowInputSchema)
    .output(workflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      return {
        workflow: orThrow(
          await updateUserWorkflow(
            scope,
            input.id,
            input.workflow,
            appActor(context.appUser, context.headers),
          ),
        ),
      };
    }),

  toggle: workspaceSession(toggleWorkflowInputSchema)
    .output(toggleWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      if (
        !(await toggleUserWorkflow(
          scope,
          input.id,
          input.enabled,
          appActor(context.appUser, context.headers),
        ))
      )
        throw notFound();
      return { success: true as const };
    }),

  delete: workspaceSession(deleteWorkflowInputSchema)
    .output(deleteWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (appUser.workspaceRole !== "owner" && appUser.workspaceRole !== "admin") {
        throw new ORPCError("FORBIDDEN", { message: "Only an admin can delete workflows" });
      }
      const scope = await workflowScopeFor(appUser);
      if (!(await deleteUserWorkflow(scope, input.id, appActor(appUser, context.headers))))
        throw notFound();
      return { success: true as const };
    }),

  run: workspaceSession(runWorkflowInputSchema)
    .output(runWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const requested = await requestWorkflowRun(scope, input.id, input.inputs);
      if (typeof requested === "string") throw new ORPCError("BAD_REQUEST", { message: requested });
      return { runId: requested.runId, status: "queued" as const };
    }),

  runs: workspaceSession(listWorkflowRunsInputSchema)
    .output(listWorkflowRunsOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      return {
        runs: await listWorkspaceRuns({ scope, workflowId: input.workflowId, limit: input.limit }),
      };
    }),

  getRun: workspaceSession(getWorkflowRunInputSchema)
    .output(getWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const run = await getWorkspaceRun(scope, input.runId);
      if (!run) throw notFound();
      return { run };
    }),

  cancelRun: workspaceSession(cancelWorkflowRunInputSchema)
    .output(cancelWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await cancelWorkspaceRun(scope, input.runId);
      if (!result) throw notFound();
      return result;
    }),

  resumeRun: workspaceSession(resumeWorkflowRunInputSchema)
    .output(resumeWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await resumeWorkspaceRun(scope, input.runId);
      if (!result) throw notFound();
      return result;
    }),

  unconfirmedStep: workspaceSession(dispatchStepInputSchema)
    .output(inspectDispatchOutputSchema)
    .handler(async ({ input, context }) => {
      await limitResolve(context.appUser.userId);
      const scope = await workflowScopeFor(context.appUser);
      const view = await inspectWorkspaceDispatch(scope, input.runId, input.stepRunId);
      if (!view) throw notFound();
      return view;
    }),

  resolveStep: workspaceSession(resolveDispatchInputSchema)
    .output(resolveDispatchOutputSchema)
    .handler(async ({ input, context }) => {
      await limitResolve(context.appUser.userId);
      const scope = await workflowScopeFor(context.appUser);
      const result = await resolveWorkspaceDispatch({
        scope,
        runId: input.runId,
        stepRunId: input.stepRunId,
        decision: input.decision,
      });
      if (!result) throw notFound();
      if (result.state === "refused") {
        throw new ORPCError("CONFLICT", { message: result.message });
      }
      console.log(
        `[workflow] step run ${input.stepRunId} of run ${input.runId} resolved as ${input.decision.outcome}`,
      );
      return { message: result.message };
    }),

  previewDecision: workspaceSession(previewDecisionInputSchema)
    .output(previewDecisionOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const scope = await workflowScopeFor(appUser);
      const mailbox = scope.directory.find((m) => m.mailboxId === input.mailboxId);
      if (!mailbox)
        throw new ORPCError("NOT_FOUND", { message: "That mailbox is not in this workspace" });
      const preview = await previewDecision({
        userId: appUser.userId,
        mail: await mailSessionFor(appUser, mailbox.slug),
        node: input.node,
        limit: input.limit,
      });
      if (!preview.ok) throw new ORPCError("BAD_REQUEST", { message: preview.message });
      return { items: preview.items };
    }),

  test: workspaceSession(testWorkflowInputSchema)
    .output(testWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await testRunGraph({
        scope,
        graph: input.graph,
        triggerNodeId: input.triggerNodeId,
        sampleId: input.sampleId,
        event: input.event,
        inputs: input.inputs,
        replayRunId: input.replayRunId,
        fromNodeId: input.fromNodeId,
      });
      if (typeof result === "string") throw new ORPCError("BAD_REQUEST", { message: result });
      return result;
    }),

  testSamples: workspaceSession(testSamplesInputSchema)
    .output(testSamplesOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const samples = await listTestSamples(scope, input.graph, input.triggerNodeId);
      if (typeof samples === "string") throw new ORPCError("BAD_REQUEST", { message: samples });
      return { samples };
    }),

  samples: workspaceSession(workflowSamplesInputSchema)
    .output(workflowSamplesOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      if (!(await getWorkspaceWorkflow(scope, input.id))) throw notFound();
      const loaded = await loadDefinition(input.id);
      return { samples: loaded?.definition.samples ?? {} };
    }),

  pinSample: workspaceSession(pinSampleInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      if (!(await getWorkspaceWorkflow(scope, input.id))) throw notFound();
      if (input.event === null) {
        await unpinSample(input.id, input.triggerNodeId);
      } else if (!(await pinSample(input.id, input.triggerNodeId, input.event))) {
        throw new ORPCError("BAD_REQUEST", { message: "That sample is larger than 64 KB" });
      }
      return { success: true as const };
    }),

  revisions: workspaceSession(workflowRevisionsInputSchema)
    .output(workflowRevisionsOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const revisions = await listWorkflowRevisions(scope, input.id, input.limit);
      if (!revisions) throw notFound();
      return { revisions };
    }),

  approvals: workspaceSession(workspaceScopeSchema)
    .output(listApprovalsOutputSchema)
    .handler(async ({ context }) => {
      const scope = await workflowScopeFor(context.appUser);
      return { approvals: await listPendingApprovals(scope) };
    }),

  decide: workspaceSession(decideApprovalInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await decideApproval(scope, {
        waitId: input.waitId,
        decision: input.decision,
        note: input.note,
      });
      if (!result.ok) throw new ORPCError("CONFLICT", { message: result.message });
      return { success: true as const };
    }),

  webhookSecret: workspaceSession(webhookSecretInputSchema)
    .output(webhookSecretOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const workflow = await getWorkspaceWorkflow(scope, input.id);
      const endpoint = await getEndpoint(input.endpointId);
      if (!workflow || endpoint?.workflowId !== input.id || endpoint.kind !== "webhook")
        throw notFound();
      const owner = (await loadDefinition(input.id))?.definition.principalUserId;
      if (scope.role !== "owner" && scope.role !== "admin" && owner !== scope.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the workflow's owner or an admin can see its webhook secret",
        });
      }
      let secret = endpoint.secret;
      if (input.rotate) {
        secret = newSecret();
        await rotateEndpointSecret(endpoint.id, secret);
      }
      return { url: endpointUrl(endpoint.id), secret };
    }),
};

async function limitResolve(userId: string): Promise<void> {
  const rl = await rateLimit(userId, {
    scope: "resolve-send",
    limit: 20,
    windowSec: 60,
  });
  if (!rl.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many requests. Please slow down.",
      data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
    });
  }
}
