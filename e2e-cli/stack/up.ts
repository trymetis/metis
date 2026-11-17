import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APP,
  compose,
  SUITE_DIR,
  INSTALL_DIR,
  install,
  metis,
  shell,
  waitReady,
} from "../clients/hosts";
import type { Releases } from "../lib/releases";
import { buildStack, HARNESS_IMAGE } from "./build";

const STACK_ONLY = /^(E2E_|LLM_UPSTREAM_|TYPESAFE_UPSTREAM_|SQLD_AUTH_JWT_KEY=)/;

export const SERVICES = [
  "mail",
  "caldav",
  "s3",
  "webdav",
  "ftp",
  "sftp",
  "gateway-cloudflare",
  "cache-redis",
  "srh",
  "gateway-resend",
  "gateway-ses",
  "replay",
  "sqld-external",
  "cli-host",
  "proxy",
];

function step(message: string): void {
  console.log(`[stack] ${message}`);
}

function composeUp(services: string[]): void {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", ".env.fixture", "up", "--build", "--wait", ...services],
    { cwd: SUITE_DIR, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("[stack] docker compose up failed");
}

function fixture(): string {
  return readFileSync(join(SUITE_DIR, ".env.fixture"), "utf8");
}

function fixtureValue(key: string): string {
  const line = fixture()
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  if (line === undefined) throw new Error(`[stack] .env.fixture has no ${key}`);
  return line.slice(key.length + 1);
}

function stackEnv(screenshots: boolean): string {
  const lines = fixture()
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#") && !STACK_ONLY.test(line));
  if (screenshots) lines.push("METIS_WORKFLOW_CADENCE_SEC=60");
  return `${lines.join("\n")}\n`;
}

function echo(run: { stdout: string; stderr: string }): void {
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
}

export async function installStack(r: Releases, screenshots = false): Promise<void> {
  step(`installing Metis ${r.current} on cli-host with Metis CLI ${r.cli}`);
  const env = await shell("cli-host", "cat > /opt/e2e/stack.env", { input: stackEnv(screenshots) });
  if (env.code !== 0) throw new Error(`[stack] writing stack.env on cli-host: ${env.stderr}`);
  const run = await install(
    "cli-host",
    [
      "--owner-email",
      fixtureValue("METIS_OWNER_EMAIL"),
      "--with",
      "updater,worker",
      "--version",
      r.current,
      "--env-file",
      "/opt/e2e/stack.env",
    ],
    { METIS_CLI_VERSION: r.cli },
  );
  echo(run);
  if (run.code !== 0) throw new Error(`[stack] metis setup on cli-host exited ${run.code}`);
}

export async function seed({ screenshots = false } = {}): Promise<void> {
  step("seeding the install's databases and the test servers");
  const stopped = await shell(
    "cli-host",
    "docker ps --format '{{.Names}}' | grep -E '^metis-(app$|worker-)' | xargs -r docker stop",
  );
  if (stopped.code !== 0)
    throw new Error(`[stack] stopping the app for the seed: ${stopped.stderr}`);
  const run = await shell(
    "cli-host",
    [
      "docker run --rm --network metis",
      "--env-file /opt/e2e/fixture.env",
      `--env-file ${INSTALL_DIR}/.env`,
      "-v /opt/e2e/ca.crt:/etc/metis-e2e/ca.crt:ro",
      "-e NODE_EXTRA_CA_CERTS=/etc/metis-e2e/ca.crt",
      screenshots ? "-e E2E_EDGE=0" : "",
      HARNESS_IMAGE,
      "bun run harness/seed.ts",
    ]
      .filter(Boolean)
      .join(" "),
  );
  echo(run);
  if (run.code !== 0) throw new Error(`[stack] seeding exited ${run.code}`);
  for (const component of ["app", "worker"]) {
    const restarted = await metis("cli-host", ["restart", component]);
    if (restarted.code !== 0) {
      throw new Error(`[stack] metis restart ${component}: ${restarted.stderr}`);
    }
  }
  await waitReady(APP);
}

export async function up({ screenshots = false } = {}): Promise<void> {
  step("starting the stand-ins and the proxy");
  composeUp(["fakes", "proxy"]);
  const r = await buildStack();
  step("starting the test servers and the host");
  composeUp(SERVICES);
  await installStack(r, screenshots);
  await seed({ screenshots });
  const ps = await compose(["ps", "--format", "{{.Service}} {{.State}}"]);
  step(`up\n${ps.stdout.trim()}`);
}

if (import.meta.main) await up({ screenshots: process.argv.includes("--screenshots") });
