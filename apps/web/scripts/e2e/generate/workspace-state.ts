import { CLIENTS_FOLDER, REBRAND_FOLDER } from "@metis/e2e/lib/cast";
import { eq } from "drizzle-orm";

import { setDriveVisibility } from "../../../src/connections";
import { db } from "../../../src/db";
import { drivePin, driveWorkspace, mailboxLabel, workspace } from "../../../src/db/schema";
import { workspaceScope } from "../workspace-scope";
import type { Account } from "./account";
import type { Resources } from "./connections";

export async function seedWorkspaceState(account: Account, resources: Resources): Promise<void> {
  const { userId, workspaceId } = account;
  const [box] = (await workspaceScope(userId, workspaceId)).mailboxes;
  if (!box) throw new Error("the seeded mailbox is not in the workspace");

  const driveLinks = new Map(
    (
      await db
        .select({
          slug: driveWorkspace.slug,
          linkId: driveWorkspace.id,
          driveId: driveWorkspace.driveId,
        })
        .from(driveWorkspace)
        .where(eq(driveWorkspace.workspaceId, workspaceId))
    ).map((link) => [link.slug, link]),
  );
  function driveLink(kind: string) {
    const link = driveLinks.get(resources.driveSlugs[kind] ?? "");
    if (!link) throw new Error(`drive ${kind} is not linked`);
    return link;
  }

  await db.insert(mailboxLabel).values({
    id: crypto.randomUUID(),
    mailboxId: box.mailboxId,
    createdByUserId: userId,
    key: "custom:clients",
    name: "Clients",
    color: "blue",
    createdAt: new Date(),
  });

  for (const kind of ["s3", "webdav"]) {
    await db.insert(drivePin).values({
      id: crypto.randomUUID(),
      userId,
      driveId: driveLink(kind).driveId,
      folderId: REBRAND_FOLDER,
      label: "Rebrand",
      createdAt: new Date(),
    });
  }

  await setDriveVisibility({
    linkId: driveLink("ftp").linkId,
    workspaceId,
    visibleRootIds: [CLIENTS_FOLDER],
  });

  await db
    .update(workspace)
    .set({ branding: { themeBrand: "blue" } })
    .where(eq(workspace.id, workspaceId));
  console.log(
    "[generate] seeded a custom label, two drive pins, a root restriction on the ftp drive and the blue brand",
  );
}
