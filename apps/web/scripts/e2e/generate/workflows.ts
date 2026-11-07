import { createUserWorkflow } from "../../../src/workflow";
import { scheduleSend } from "../../../src/workflow/builtins/scheduled-send";
import { workspaceScope } from "../workspace-scope";
import type { Account } from "./account";
import type { Resources } from "./connections";
import { calledWorkflow, seededWorkflows } from "./workflow-graphs";

export async function seedWorkflows(account: Account, resources: Resources): Promise<void> {
  const scope = await workspaceScope(account.userId, account.workspaceId);
  const by = { userId: account.userId, email: account.email, via: "app" as const };
  const [box] = scope.mailboxes;
  if (!box) throw new Error("the seeded mailbox is not in the workspace");
  const calendar = scope.calendars.find((c) => c.slug === resources.calendarSlug);
  if (!calendar) throw new Error("the seeded calendar is not in the workspace");
  const drive = scope.drives.find((d) => d.slug === resources.driveSlugs.s3);
  if (!drive) throw new Error("the seeded S3 drive is not in the workspace");

  const called = await createUserWorkflow(scope, calledWorkflow(), by);
  if (typeof called === "string") throw new Error(`workflow "${calledWorkflow().name}": ${called}`);

  const seeded = seededWorkflows({
    mailboxId: box.mailboxId,
    userId: account.userId,
    calendarId: calendar.accountId,
    driveId: drive.driveId,
    calledWorkflowId: called.id,
  });
  for (const workflow of seeded) {
    const created = await createUserWorkflow(scope, workflow, by);
    if (typeof created === "string") {
      throw new Error(`workflow "${workflow.name}": ${created}`);
    }
  }

  await scheduleSend({
    userId: account.userId,
    workspaceId: account.workspaceId,
    mailboxId: box.mailboxId,
    linkId: box.linkId,
    payload: {
      to: [account.email],
      subject: "Moodboard for the rebrand",
      bodyHtml: "<p>The moodboard is in the Rebrand folder.</p>",
      bodyText: "The moodboard is in the Rebrand folder.",
    },
    at: new Date("2099-01-05T09:00:00Z"),
  });
  console.log(`[generate] seeded ${seeded.length + 1} workflows and a scheduled send`);
}
