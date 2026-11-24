import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { releases } from "@metis/e2e-cli/lib/releases";
import { type TerminalHost, ttyd } from "@metis/screenshots/terminal";

const SUITE = join(import.meta.dirname, "..", "..", "..", "e2e-cli");
const TTYD_PORT = 7681;
const TTYD_HOST_PORT = Number(process.env.DOCS_TTYD_PORT ?? 30054);
const HOME = "/root";

function promptFor(label: string | undefined): string {
  const who = label ?? String.raw`\u@\h`;
  const sign = label ? "$" : String.raw`\$`;
  return String.raw`\[\e[1;32m\]${who}\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]${sign} `;
}

export function releaseValues(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(releases()).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function compose(args: string[]) {
  const res = spawnSync("docker", ["compose", "--env-file", ".env.fixture", ...args], {
    cwd: SUITE,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `docker compose ${args.slice(0, 3).join(" ")}: ${res.stderr.trim() || res.status}`,
    );
  }
  return res.stdout;
}

export function hostShell(line: string): string {
  return compose(["exec", "-T", "cli-host", "bash", "-lc", line]);
}

export const cliHost: TerminalHost = {
  port: TTYD_HOST_PORT,
  start(prompt) {
    compose([
      "exec",
      "-d",
      "-w",
      HOME,
      "-e",
      `PS1=${promptFor(prompt)}`,
      "cli-host",
      ...ttyd(TTYD_PORT, ["bash", "--noprofile", "--norc"]),
    ]);
  },
  shell: hostShell,
};
