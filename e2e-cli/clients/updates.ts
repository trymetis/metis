import type { Rpc } from "@metis/e2e/clients/rpc";
import { withTotp } from "@metis/e2e/clients/totp";
import { z } from "zod";

const upgradeSchema = z.object({
  id: z.string(),
  kind: z.enum(["upgrade", "rollback"]),
  fromVersion: z.string().nullable(),
  toVersion: z.string(),
  state: z.enum(["running", "succeeded", "failed", "rollback-failed"]),
  step: z.string().nullable(),
  restored: z.boolean(),
  error: z.string().nullable(),
});
export type Upgrade = z.infer<typeof upgradeSchema>;

const updatesSchema = z.object({
  reachable: z.boolean(),
  error: z.string().nullable(),
  currentVersion: z.string().nullable(),
  releases: z.array(z.object({ version: z.string(), newer: z.boolean() })),
  snapshots: z.boolean(),
  rollbackVersion: z.string().nullable(),
  upgrade: upgradeSchema.nullable(),
});
export type Updates = z.infer<typeof updatesSchema>;

export const UPGRADE_TIMEOUT = 6 * 60_000;

export async function updates(rpc: Rpc): Promise<Updates> {
  return updatesSchema.parse(await rpc("dashboard.system.updates"));
}

export async function settled(rpc: Rpc, timeoutMs = UPGRADE_TIMEOUT): Promise<Updates> {
  const deadline = Date.now() + timeoutMs;
  let last: Updates | null = null;
  while (Date.now() < deadline) {
    last = await updates(rpc).catch(() => null);
    if (last && last.upgrade?.state !== "running") return last;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`[updates] still running after ${timeoutMs} ms: ${JSON.stringify(last)}`);
}

export async function backTo(rpc: Rpc, version: string): Promise<void> {
  const status = await settled(rpc);
  if (status.currentVersion === version) return;
  if (status.rollbackVersion !== version) {
    throw new Error(
      `[updates] ${status.currentVersion ?? "nothing"} runs and undo goes to ${status.rollbackVersion ?? "nothing"}, not ${version}`,
    );
  }
  await withTotp((code) => rpc("dashboard.system.rollback", { code }));
  const after = await settled(rpc);
  if (after.currentVersion !== version) {
    throw new Error(`[updates] the undo left ${after.currentVersion ?? "nothing"} running`);
  }
}
