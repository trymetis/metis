import { expect } from "vitest";

import type { Rpc } from "../../clients/rpc";
import { withTotp } from "../../clients/totp";

type Values = Record<string, unknown>;

interface ConfigEntry {
  id: string;
  values: Values;
}

export interface ConfigForm {
  version: number;
  values: Values;
  blank: Values;
  entries: ConfigEntry[];
}

interface SectionValues {
  values: Values;
  entries: ConfigEntry[];
}

export interface ResetView {
  updated: boolean;
  version: number;
  check: { results: CheckResult[] } | null;
  current: SectionValues;
  environment: SectionValues;
  inUse: { provider: string; label: string; server: string | null; connections: number }[];
}

interface CheckResult {
  label: string;
  status: string;
  message: string | null;
}

export interface Saved {
  saved: boolean;
  version: number;
  check: { results: CheckResult[] } | null;
}

export function sectionForm(rpc: Rpc, section: string): Promise<ConfigForm> {
  return rpc<ConfigForm>("dashboard.system.form", { section });
}

export function setSection(
  rpc: Rpc,
  section: string,
  values: Values,
  options: { force?: boolean } = {},
): Promise<Saved> {
  return withTotp(async (code) => {
    const form = await sectionForm(rpc, section);
    const saved = await rpc<Saved>("dashboard.system.update", {
      expectedVersion: form.version,
      sections: [{ section, values: { ...form.values, ...values }, entries: null }],
      code,
      force: options.force ?? false,
    });
    expect(saved.saved, `${section} was not saved: ${JSON.stringify(saved.check)}`).toBe(true);
    return saved;
  });
}

export function addServer(rpc: Rpc, section: string, values: Values): Promise<Saved> {
  return withTotp(async (code) => {
    const form = await sectionForm(rpc, section);
    const saved = await rpc<Saved>("dashboard.system.update", {
      expectedVersion: form.version,
      sections: [
        {
          section,
          values: {},
          entries: [
            ...form.entries.map((entry) => ({ id: entry.id, values: entry.values })),
            { id: null, values: { ...form.blank, ...values } },
          ],
        },
      ],
      code,
    });
    expect(saved.saved, `${section} was not saved: ${JSON.stringify(saved.check)}`).toBe(true);
    return saved;
  });
}

export async function resetSection(
  rpc: Rpc,
  section: string,
  options: { apply?: boolean; force?: boolean } = {},
): Promise<ResetView> {
  const reset = async (code?: string) => {
    const { version } = await sectionForm(rpc, section);
    return rpc<ResetView>("dashboard.system.reset", {
      section,
      expectedVersion: version,
      ...(code === undefined ? {} : { code, force: options.force ?? false }),
    });
  };
  return options.apply ? withTotp(reset) : reset();
}

export async function checkDriver(rpc: Rpc, driver: string): Promise<CheckResult[]> {
  const { results } = await rpc<{ results: CheckResult[] }>("dashboard.system.check", {
    kind: "driver",
    driver,
  });
  return results;
}

export function allOk(results: CheckResult[]): void {
  expect(results.length).toBeGreaterThan(0);
  for (const result of results) {
    expect(result.status, `${result.label}: ${result.message}`).toBe("ok");
  }
}
