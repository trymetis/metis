import { setTimeout as sleep } from "node:timers/promises";

import { env } from "@metis/e2e/lib/env";
import {
  appendLateArrival,
  deleteLateArrival,
  LATE_ARRIVAL_SUBJECT,
  LATE_ARRIVAL_WORKFLOW,
} from "@metis/e2e/lib/late-arrival";
import { eq } from "drizzle-orm";

import { db } from "../../../../src/db";
import { workflowRun } from "../../../../src/db/schema";
import { classifyMessages } from "../../../../src/mail/classify";
import { listWorkspaceWorkflows, toggleUserWorkflow } from "../../../../src/workflow";
import { runWorkflowTick } from "../../../../src/workflow/tick";
import { workspaceScope } from "../../workspace-scope";
import type { StepContext } from "./context";

const SETTLED = new Set(["completed", "failed", "partial", "blocked", "cancelled"]);
const TICK_GAP_MS = 2_500;

async function tickUntil(done: () => Promise<boolean>, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    await runWorkflowTick();
    if (await done()) return true;
    await sleep(TICK_GAP_MS);
  }
  return false;
}

export async function run(ctx: StepContext): Promise<void> {
  const { appUser, mail } = ctx.session;
  const scope = await workspaceScope(appUser.userId, appUser.workspaceId);
  const workflow = (await listWorkspaceWorkflows(scope)).find(
    (w) => w.name === LATE_ARRIVAL_WORKFLOW,
  );
  if (!workflow) throw new Error(`workflow "${LATE_ARRIVAL_WORKFLOW}" not seeded`);

  await toggleUserWorkflow(scope, workflow.id, true, {
    userId: appUser.userId,
    email: appUser.user.email,
    via: "app",
  });
  await tickUntil(async () => false, 3);
  await appendLateArrival(env.imap);
  try {
    const settled = await tickUntil(async () => {
      const runs = await db
        .select({ status: workflowRun.status })
        .from(workflowRun)
        .where(eq(workflowRun.workflowId, workflow.id));
      return runs.some((r) => SETTLED.has(r.status));
    }, 30);

    const listed = await mail.adapter.listMessages("inbox", undefined, 20);
    const arrived = (listed.emails ?? []).find((e) => e.subject === LATE_ARRIVAL_SUBJECT);
    if (!arrived) throw new Error(`"${LATE_ARRIVAL_SUBJECT}" never listed`);
    await classifyMessages(mail, [
      {
        id: arrived.id,
        sender: arrived.fromName || arrived.from,
        subject: arrived.subject,
        snippet: arrived.snippet,
      },
    ]);
    console.log("[record] classified the late arrival like the list does");
    if (!settled) {
      throw new Error(`"${LATE_ARRIVAL_WORKFLOW}" never settled its run`);
    }
    console.log(`[record] late arrival settled through "${LATE_ARRIVAL_WORKFLOW}"`);
  } finally {
    await deleteLateArrival(env.imap);
  }
}
