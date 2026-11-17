import { spawn } from "node:child_process";
import { join } from "node:path";

import { z } from "zod";

export type Host = "cli-host";

export const SUITE_DIR = join(import.meta.dirname, "..");
export const INSTALL_DIR = "/opt/metis-suite";

import { APP } from "@metis/e2e/clients/harness";

export { APP };

const APP_PORT = process.env.E2E_CLI_APP_PORT ?? new URL(APP).port;

export type Run = { code: number; stdout: string; stderr: string };

export type RunOptions = { input?: string; env?: Record<string, string>; check?: boolean };

function collect(command: string, args: string[], options: RunOptions): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: SUITE_DIR, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const run = { code: code ?? 1, stdout, stderr };
      if (options.check && run.code !== 0) {
        reject(new Error(`[hosts] ${args.join(" ")} exited ${run.code}\n${stdout}\n${stderr}`));
        return;
      }
      resolve(run);
    });
    child.stdin.end(options.input ?? "");
  });
}

export function compose(args: string[], options: RunOptions = {}): Promise<Run> {
  return collect("docker", ["compose", "--env-file", ".env.fixture", ...args], options);
}

export function shell(host: Host, script: string, options: RunOptions = {}): Promise<Run> {
  const env = Object.entries(options.env ?? {}).flatMap(([key, value]) => [
    "-e",
    `${key}=${value}`,
  ]);
  return compose(["exec", "-T", ...env, host, "bash", "-c", script], options);
}

export function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'"'"'`)}'`;
}

export function metis(host: Host, args: string[], options: RunOptions = {}): Promise<Run> {
  return shell(host, `metis ${args.map(quote).join(" ")}`, options);
}

export function docker(host: Host, args: string[], options: RunOptions = {}): Promise<Run> {
  return shell(host, `docker ${args.map(quote).join(" ")}`, options);
}

const statusSchema = z.object({
  version: z.string(),
  updater: z.string(),
  lastUpgrade: z.unknown(),
  components: z.array(z.object({ name: z.string(), detail: z.string(), healthy: z.boolean() })),
  containers: z.array(
    z.object({
      name: z.string(),
      component: z.string(),
      state: z.string(),
      health: z.string().optional(),
    }),
  ),
});
export type Status = z.infer<typeof statusSchema>;

export async function status(host: Host): Promise<Status> {
  const run = await metis(host, ["status", "--json"], { check: true });
  return statusSchema.parse(JSON.parse(run.stdout));
}

export async function readFile(host: Host, path: string): Promise<string> {
  return (await shell(host, `cat ${quote(path)}`, { check: true })).stdout;
}

export async function envValue(host: Host, key: string): Promise<string | undefined> {
  const line = (await readFile(host, `${INSTALL_DIR}/.env`))
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  return line === undefined ? undefined : line.slice(key.length + 1);
}

export async function waitReady(url: string, timeoutMs = 300_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/readyz`, { signal: AbortSignal.timeout(5_000) });
      if (res.status === 200) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`[hosts] ${url}/api/readyz was not ready within ${timeoutMs} ms (last: ${last})`);
}

export async function install(
  host: Host,
  flags: string[],
  env: Record<string, string> = {},
): Promise<Run> {
  return shell(
    host,
    [
      "set -euo pipefail",
      "curl -fsSL https://sh.trymetis.email/bootstrap -o /root/bootstrap.sh",
      `sh /root/bootstrap.sh --yes --app-port ${APP_PORT} ${flags.map(quote).join(" ")}`,
    ].join("\n"),
    { env },
  );
}

export async function fresh(host: Host): Promise<void> {
  await shell(
    host,
    [
      "set -e",
      'ids="$(docker ps -aq)"; [ -z "$ids" ] || docker rm -f $ids > /dev/null',
      "docker volume prune -af > /dev/null",
      "docker network prune -f > /dev/null",
      `rm -rf ${INSTALL_DIR} /etc/metis /usr/local/bin/metis`,
    ].join("\n"),
    { check: true },
  );
}
