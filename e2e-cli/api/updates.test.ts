import { withTotp } from "@metis/e2e/api/support/config";
import { harness } from "@metis/e2e/clients/harness";
import { type Rpc, RpcError } from "@metis/e2e/clients/rpc";
import { afterAll, expect, test } from "vitest";

import { ana } from "../cli/support/session";
import { backTo, settled, UPGRADE_TIMEOUT, updates } from "../clients/updates";
import { releases } from "../lib/releases";

const r = releases();

async function rejection(run: () => Promise<unknown>): Promise<RpcError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof RpcError) return err;
    throw err;
  }
  throw new Error("expected an RpcError, got a result");
}

async function refused(run: () => Promise<unknown>, code: string, message: string) {
  const error = await rejection(run);
  expect(error.code).toBe(code);
  expect(error.message).toBe(message);
}

function upgrade(rpc: Rpc, version: string) {
  return () => withTotp((code) => rpc("dashboard.system.upgrade", { version, code }));
}

async function unchanged(rpc: Rpc) {
  const status = await updates(rpc);
  expect(status.currentVersion).toBe(r.current);
  return status;
}

afterAll(async () => {
  const { rpc } = await ana();
  await backTo(rpc, r.current, () => harness.totp());
}, UPGRADE_TIMEOUT);

test("an upgrade that is not a release version fails input validation", async () => {
  const { rpc } = await ana();
  const before = await unchanged(rpc);
  await refused(
    async () => rpc("dashboard.system.upgrade", { version: "latest", code: await harness.totp() }),
    "BAD_REQUEST",
    "Input validation failed",
  );
  expect((await unchanged(rpc)).upgrade?.id).toBe(before.upgrade?.id);
});

test("the updater's upgrade refusals reach the caller as oRPC errors and change nothing", async () => {
  const { rpc } = await ana();
  const before = await unchanged(rpc);
  await refused(upgrade(rpc, r.current), "CONFLICT", `${r.current} is already running`);
  await refused(upgrade(rpc, "9.9.9"), "BAD_REQUEST", "9.9.9 is not a published release");
  await refused(
    upgrade(rpc, r.previous),
    "CONFLICT",
    `${r.previous} is older than the running ${r.current}; only newer releases can be installed`,
  );
  expect((await unchanged(rpc)).upgrade?.id).toBe(before.upgrade?.id);
});

test("a release that needs a newer server CLI is refused with the self-update step", async () => {
  const { rpc } = await ana();
  const before = await unchanged(rpc);
  await refused(
    upgrade(rpc, r.needsCli),
    "CONFLICT",
    `This release needs Metis CLI ${r.needsCliMin} or later. Run sudo metis self-update on the server, then try again.`,
  );
  expect((await unchanged(rpc)).upgrade?.id).toBe(before.upgrade?.id);
});

test("an undo with nothing to undo is refused", async () => {
  const { rpc } = await ana();
  expect((await unchanged(rpc)).rollbackVersion).toBeNull();
  await refused(
    () => withTotp((code) => rpc("dashboard.system.rollback", { code })),
    "CONFLICT",
    "there is no upgrade to undo",
  );
  await unchanged(rpc);
});

test(
  "an upgrade while another one runs is refused, and the first one switches back when its release never becomes ready",
  async () => {
    const { rpc } = await ana();
    await unchanged(rpc);
    await withTotp((code) => rpc("dashboard.system.upgrade", { version: r.neverReady, code }));
    await refused(upgrade(rpc, r.next), "CONFLICT", "an upgrade or rollback is already running");
    const done = await settled(rpc);
    expect(done.upgrade).toMatchObject({
      kind: "upgrade",
      toVersion: r.neverReady,
      state: "failed",
      restored: true,
    });
    expect(done.currentVersion).toBe(r.current);
  },
  UPGRADE_TIMEOUT,
);
