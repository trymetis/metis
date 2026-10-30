import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { uniqueName } from "../support/poll";
import { ana } from "../support/session";

interface Entry {
  id: string;
  name: string;
  kind: string;
}

async function list(rpc: Rpc, account: Account, parentId: string | null): Promise<Entry[]> {
  const { entries } = await rpc<{ entries: Entry[] }>("drive.list", {
    workspaceSlug: account.workspaceSlug,
    driveSlug: "all",
    parentId,
  });
  return entries;
}

test("a move across drives on /d/all is refused", async () => {
  const { rpc, account } = await ana();
  const scope = { workspaceSlug: account.workspaceSlug, driveSlug: "all" };
  const drives = await list(rpc, account, null);
  expect(drives.length).toBeGreaterThan(1);
  const [from, to] = drives;
  const name = uniqueName();
  await rpc("drive.createFolder", { ...scope, parentId: from?.id, name });
  try {
    const source = (await list(rpc, account, from?.id ?? null)).find((e) => e.name === name);
    const target = (await list(rpc, account, to?.id ?? null)).find((e) => e.name === "Clients");
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    await expect(
      rpc("drive.move", { ...scope, fileId: source?.id, parentId: target?.id }),
    ).rejects.toBeInstanceOf(RpcError);
    expect((await list(rpc, account, from?.id ?? null)).map((e) => e.name)).toContain(name);
  } finally {
    const leftover = (await list(rpc, account, from?.id ?? null)).find((e) => e.name === name);
    if (leftover) await rpc("drive.delete", { ...scope, fileId: leftover.id });
  }
});
