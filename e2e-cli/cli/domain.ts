import { expect, test } from "vitest";

import {
  APP,
  docker,
  envValue,
  INSTALL_DIR,
  metis,
  readFile,
  shell,
  status,
  waitReady,
} from "../clients/hosts";
import { output } from "./support/output";

const CADDY_ROOT = "/data/caddy/pki/authorities/local/root.crt";

export async function setDomain(host: string): Promise<string> {
  const run = await metis("cli-host", ["domain", "set", host, "--yes"]);
  expect(run.code, output(run)).toBe(0);
  await waitReady(APP);
  return output(run);
}

export async function removeDomain(): Promise<void> {
  const run = await metis("cli-host", ["domain", "remove", "--yes"]);
  expect(run.code, output(run)).toBe(0);
  await waitReady(APP);
}

export async function trustCaddy(hosts: string[]): Promise<void> {
  await expect
    .poll(
      async () =>
        (await docker("cli-host", ["exec", "metis-caddy", "test", "-f", CADDY_ROOT])).code,
      {
        timeout: 60_000,
      },
    )
    .toBe(0);
  const trusted = await shell(
    "cli-host",
    [
      "set -euo pipefail",
      `docker cp metis-caddy:${CADDY_ROOT} /usr/local/share/ca-certificates/metis-caddy-local.crt`,
      "update-ca-certificates > /dev/null 2>&1",
      ...hosts.map(
        (host) => `grep -q " ${host}$" /etc/hosts || echo "127.0.0.1 ${host}" >> /etc/hosts`,
      ),
    ].join("\n"),
  );
  expect(trusted.code, output(trusted)).toBe(0);
}

export default function domainTests() {
  test("domain set serves the app over HTTPS through Caddy on that host", async () => {
    expect(await setDomain("cli.localhost")).toContain(
      "Metis is served on https://cli.localhost once its DNS points at this server",
    );
    expect(await envValue("cli-host", "BETTER_AUTH_URL")).toBe("https://cli.localhost");
    expect(await envValue("cli-host", "METIS_DOMAIN")).toBe("cli.localhost");
    expect(await readFile("cli-host", `${INSTALL_DIR}/caddy/Caddyfile`)).toContain("cli.localhost");
    const installed = await status("cli-host");
    expect(installed.components.map((c) => c.name)).toContain("caddy");
    expect(installed.containers.map((c) => c.name)).toContain("metis-caddy");

    await trustCaddy(["cli.localhost"]);
    await expect
      .poll(
        async () =>
          (
            await shell(
              "cli-host",
              "curl -fsS -o /dev/null -w '%{http_code}' https://cli.localhost/api/readyz",
            )
          ).stdout,
        { timeout: 120_000, interval: 2_000 },
      )
      .toBe("200");
  });

  test("domain remove goes back to the loopback address", async () => {
    await removeDomain();
    expect(await envValue("cli-host", "BETTER_AUTH_URL")).toBe(APP);
    expect(await envValue("cli-host", "METIS_DOMAIN")).toBeUndefined();
    const installed = await status("cli-host");
    expect(installed.components.map((c) => c.name)).not.toContain("caddy");
    expect(installed.containers.map((c) => c.name)).not.toContain("metis-caddy");
  });
}
