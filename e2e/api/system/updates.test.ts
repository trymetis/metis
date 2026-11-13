import { afterAll, beforeEach, expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { updater } from "../../clients/updater";
import { withTotp } from "../support/config";
import { ana } from "../support/session";

let release = { current: "", next: "", previous: "" };

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

beforeEach(async () => {
  const { settings } = await updater.reset();
  const [next = ""] = settings.releases;
  release = { current: settings.current, next, previous: settings.rollback };
});

afterAll(async () => {
  await updater.reset();
});

test("an upgrade that is not a release version fails input validation", async () => {
  const { rpc } = await ana();
  await refused(
    async () => rpc("dashboard.system.upgrade", { version: "latest", code: await harness.totp() }),
    "BAD_REQUEST",
    "Input validation failed",
  );
  expect((await updater.state()).upgrade).toBeNull();
});

test("the updater's upgrade refusals reach the caller as oRPC errors and change nothing", async () => {
  const { rpc } = await ana();
  await refused(upgrade(rpc, release.current), "CONFLICT", `${release.current} is already running`);
  await refused(upgrade(rpc, "9.9.9"), "BAD_REQUEST", "9.9.9 is not a published release");
  await refused(
    upgrade(rpc, release.previous),
    "CONFLICT",
    `${release.previous} is older than the running ${release.current}; only newer releases can be installed`,
  );
  const state = await updater.state();
  expect(state.settings.current).toBe(release.current);
  expect(state.upgrade).toBeNull();
});

test("a release that needs a newer server CLI is refused with the self-update step", async () => {
  const { rpc } = await ana();
  await updater.reset({ minCli: { [release.next]: "0.3.0" } });
  await refused(
    upgrade(rpc, release.next),
    "CONFLICT",
    "This release needs Metis CLI 0.3.0 or later. Run sudo metis self-update on the server, then try again.",
  );
  const state = await updater.state();
  expect(state.settings.current).toBe(release.current);
  expect(state.upgrade).toBeNull();
});

test("an undo with nothing to undo is refused", async () => {
  const { rpc } = await ana();
  await updater.reset({ rollback: "" });
  await refused(
    () => withTotp((code) => rpc("dashboard.system.rollback", { code })),
    "CONFLICT",
    "there is no upgrade to undo",
  );
  expect((await updater.state()).upgrade).toBeNull();
});

test("an upgrade while another one runs is refused", async () => {
  const { rpc } = await ana();
  await updater.hold();
  await refused(
    upgrade(rpc, release.next),
    "CONFLICT",
    "an upgrade or rollback is already running",
  );
  expect((await updater.state()).settings.current).toBe(release.current);
});
