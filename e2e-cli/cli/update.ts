import { expect, test } from "vitest";
import { z } from "zod";

import { APP, INSTALL_DIR, metis, shell, waitReady } from "../clients/hosts";
import { settled } from "../clients/updates";
import { releases } from "../lib/releases";
import { removeDomain, setDomain, trustCaddy } from "./domain";
import { output } from "./support/output";
import { anaRpc, forgetSession } from "./support/session";

const HOST = "cli.localhost";
const MARK = "----metis-e2e----";
const SNAPSHOT = "UPGRADE_STEP_SNAPSHOT";
const PREFLIGHT = "UPGRADE_STEP_PREFLIGHT";
const SWITCH = "UPGRADE_STEP_SWITCH";

type Sample = { step: string; status: number; maintenance: boolean };

const recordSchema = z.object({
  updater: z.object({
    last: z
      .object({
        toVersion: z.string().optional(),
        state: z.string().optional(),
        step: z.string().optional(),
      })
      .nullish(),
  }),
});

function runningStep(file: string, version: string): string | null {
  const parsed = recordSchema.safeParse(JSON.parse(file));
  const last = parsed.success ? parsed.data.updater.last : null;
  if (last?.toVersion !== version || last.state !== "UPGRADE_STATE_RUNNING") return null;
  return last.step ?? null;
}

const PROBE = `curl -s -o /dev/null -m 2 -H 'accept: application/json' -w '%{http_code} %header{metis-maintenance}' https://${HOST}/ || true`;

function answer(line: string): { status: number; maintenance: boolean } {
  const [code = "", since = ""] = line.trim().split(" ");
  return { status: Number(code) || 0, maintenance: since !== "" };
}

async function probe(): Promise<{ status: number; maintenance: boolean }> {
  return answer((await shell("cli-host", PROBE)).stdout);
}

async function takeSample(version: string): Promise<Sample | null> {
  const run = await shell(
    "cli-host",
    [
      `cat ${INSTALL_DIR}/metis.json`,
      `printf '\\n%s\\n' '${MARK}'`,
      PROBE,
      `printf '\\n%s\\n' '${MARK}'`,
      `cat ${INSTALL_DIR}/metis.json`,
    ].join("\n"),
  );
  const [first = "", line = "", second = ""] = run.stdout.split(`\n${MARK}\n`);
  if (run.code !== 0 || !first.trim() || !second.trim()) return null;
  const before = runningStep(first, version);
  if (before === null || before !== runningStep(second, version)) return null;
  return { step: before, ...answer(line) };
}

function poll(version: string): { stop: () => Promise<Sample[]> } {
  const samples: Sample[] = [];
  const state = { running: true };
  const loop = (async () => {
    while (state.running) {
      const taken = await takeSample(version).catch(() => null);
      if (taken) samples.push(taken);
    }
  })();
  return {
    stop: async () => {
      state.running = false;
      await loop;
      return samples;
    },
  };
}

function frozen(sample: Sample): boolean {
  return sample.status === 503 && sample.maintenance;
}

function serving(sample: Sample): boolean {
  return sample.status === 200 && !sample.maintenance;
}

function unanswered(sample: Sample): boolean {
  return sample.status === 0;
}

export default function updateTests() {
  const r = releases();

  test("behind Caddy, metis update answers every request, with the maintenance 503 while it snapshots, runs preflight and switches, then serves the new release", async () => {
    await setDomain(HOST);
    await trustCaddy([HOST]);
    await expect
      .poll(async () => serving({ step: "", ...(await probe()) }), { timeout: 120_000 })
      .toBe(true);

    const poller = poll(r.next);
    const result = await metis("cli-host", ["update", r.next]);
    const samples = await poller.stop();
    expect(result.code, output(result)).toBe(0);

    const during = (step: string) => samples.filter((taken) => taken.step === step);
    const seen = JSON.stringify(samples);
    expect(samples.filter(unanswered), `requests Caddy did not answer: ${seen}`).toEqual([]);
    expect(during(SNAPSHOT).some(frozen), `a 503 during ${SNAPSHOT}: ${seen}`).toBe(true);
    expect(during(PREFLIGHT).some(frozen), `a 503 during ${PREFLIGHT}: ${seen}`).toBe(true);
    expect(during(PREFLIGHT).filter(serving), `served during ${PREFLIGHT}`).toEqual([]);
    expect(during(SWITCH).filter(serving), `served during ${SWITCH}`).toEqual([]);
    expect(
      during("UPGRADE_STEP_PULL").filter(frozen),
      "in maintenance before the snapshot",
    ).toEqual([]);
    expect(serving({ step: "", ...(await probe()) }), "serving again after the upgrade").toBe(true);

    await removeDomain();
    await waitReady(APP);
    forgetSession();
    const status = await settled(await anaRpc());
    expect(status.currentVersion).toBe(r.next);
    expect(status.rollbackVersion).toBe(r.current);
    expect(status.upgrade).toMatchObject({
      kind: "upgrade",
      toVersion: r.next,
      state: "succeeded",
    });
  });

  test("metis undo returns to the previous release with its snapshot, once, and the dashboard and audit log show it", async () => {
    const undone = await metis("cli-host", ["undo"]);
    expect(undone.code, output(undone)).toBe(0);
    await waitReady(APP);

    const again = await metis("cli-host", ["undo"]);
    expect(again.code).not.toBe(0);
    expect(output(again)).toContain("There is no upgrade to undo");

    forgetSession();
    const rpc = await anaRpc();
    const status = await settled(rpc);
    expect(status.currentVersion).toBe(r.current);
    expect(status.upgrade).toMatchObject({
      kind: "rollback",
      fromVersion: r.next,
      toVersion: r.current,
      state: "succeeded",
    });
    const { events } = await rpc<{ events: { action: string; targetLabel: string | null }[] }>(
      "audit.mine",
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "instance.upgrade_undone",
        targetLabel: `${r.next} → ${r.current}`,
      }),
    );
  });
}
