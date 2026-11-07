import "server-only";
import { getInstanceConfig } from "@/config/runtime";

import { authorizeConnected, authorizeMailboxAccess, resolvePrincipal } from "./authorization";
import type { RunStatus } from "./schema";
import { isResumableStatus, loadRunScope, type ResumeRefusal, resumeRun } from "./store";
import { firstError, graphResources, validateGraph } from "./validation";

export type RunResume =
  | { state: "resumed"; retrying: number; kept: number; message: string }
  | { state: "refused"; status: RunStatus; message: string };

function windowDays(): number {
  return getInstanceConfig().workflowRunner.stepDataDays;
}

const REFUSALS: Record<ResumeRefusal, string> = {
  "in-progress": "This run is already queued or running — wait for it to finish before retrying.",
  completed: "This run completed — there is nothing to retry.",
  cancelled: "This run was cancelled, and a cancelled run cannot be resumed.",
  unsupported: "This kind of run cannot be retried.",
  deleted: "This was deleted, so its runs can no longer be retried.",
  disabled: "This workflow is turned off. Turn it back on, then retry the run.",
  expired:
    "This run finished longer ago than step results are kept, and they have been discarded, so it can no longer be retried.",
  upgraded:
    "This run started before the upgrade to the new workflow engine, and its saved step results are in the old format, so it can no longer be retried. Run the workflow again instead.",
  "ambiguous-send":
    "A send in this run has an unconfirmed outcome. Retrying could send the message twice, so resolve it first: confirm it from the Sent folder, or close it without resending.",
  "send-closed":
    "The unconfirmed send in this run was closed without resending, so nothing after it will run. To send the message again, write a new one.",
  "outputs-missing":
    "The results this run's completed steps produced are no longer stored, so retrying would skip the steps that depend on them.",
  "payload-missing":
    "The message this run was going to send is no longer stored, so there is nothing to send.",
  "nothing-to-retry":
    "Nothing in this run can be retried: every step either completed or has an unconfirmed outcome that needs review.",
};

function describe(retrying: number, kept: number): string {
  const redo =
    retrying > 0
      ? `${retrying} failed or blocked step(s) will be retried`
      : "The run will be retried";
  const skip =
    kept > 0 ? ` ${kept} completed step(s) keep their results and will not run again.` : "";
  return `Queued — ${redo} on the next tick, using the revision that originally ran.${skip}`;
}

export async function resumeCheckedRun(runId: string): Promise<RunResume | null> {
  const row = await loadRunScope(runId);
  if (!row) return null;

  const refuse = (message: string): RunResume => ({
    state: "refused",
    status: row.status,
    message,
  });

  if (isResumableStatus(row.status) && !row.definition.deletedAt) {
    const validation = validateGraph(row.graph, { kind: row.definition.kind });
    if (!validation.ok) {
      return refuse(
        `This run's revision is no longer valid (${firstError(validation) ?? "invalid graph"}), so retrying would fail the same way.`,
      );
    }
    const principal = await resolvePrincipal(row.definition);
    if (!principal.ok) {
      return refuse(`${principal.reason}. Retrying would be blocked again.`);
    }
    const checks = await Promise.all(
      graphResources(row.graph).map((resource) =>
        resource.kind === "mailbox"
          ? authorizeMailboxAccess({
              definition: row.definition,
              principal: principal.value,
              mailboxId: resource.id,
            })
          : authorizeConnected({
              principal: principal.value,
              kind: resource.kind,
              id: resource.id,
            }),
      ),
    );
    for (const access of checks) {
      if (!access.ok) {
        return refuse(`${access.reason}. Restore access to it before retrying.`);
      }
    }
  }

  const result = await resumeRun(runId, new Date(), Math.max(1, windowDays()) * 86_400_000);
  if (!result) return null;
  if (result.state === "refused") return refuse(REFUSALS[result.reason]);
  return { ...result, message: describe(result.retrying, result.kept) };
}
