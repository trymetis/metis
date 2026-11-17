import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { env } from "../lib/env";
import { type Releases, releases, ROOT } from "../lib/releases";
import { tar } from "./tar";

export const PUSH = env.registry;
export const HARNESS_IMAGE = "registry.localhost/metis-e2e/harness:latest";

const SUITE_DIR = join(ROOT, "e2e-cli");
const CA_DIR = join(ROOT, "e2e", "tls");
const CA = join(CA_DIR, "ca.crt");
const CRANE =
  "gcr.io/go-containerregistry/crane@sha256:61bc716946c2779e1dc0fb8068d116edf8de10e5402262c17e8e4904ddcc14ac";
const PUBLISHED_REPO = "ghcr.io/trymetis/metis";
const APP_REPO = `${PUSH}/trymetis/metis`;
const RESEND_REPO = `${PUSH}/trymetis/metis-gateway-resend`;
const LOCAL = "metis-e2e-cli-build";
const SUFFIXES = ["", "-preflight", "-worker"];
const INTO_SH = ["compose", "--env-file", ".env.fixture", "cp", "-", "fakes:/srv/sh"];
const TRUST = [
  "COPY ca.crt /etc/metis-e2e/ca.crt",
  "ENV NODE_EXTRA_CA_CERTS=/etc/metis-e2e/ca.crt",
];
const NEXT_NOTES = [
  "### Added",
  "",
  "- Saved searches can be pinned to the sidebar.",
  "- Workflow runs show how long each step waited.",
].join("\n");

function run(command: string, args: string[], cwd = ROOT, input?: string | Buffer): void {
  console.log(`[stack] ${command} ${args.join(" ").slice(0, 300)}`);
  const result = spawnSync(command, args, {
    cwd,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`[stack] ${command} ${args[0] ?? ""} exited ${result.status ?? "by signal"}`);
  }
}

function exit(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[stack] ${name} exited ${code ?? "by signal"}`));
    });
  });
}

async function buildIntoSh(args: string[]): Promise<void> {
  console.log(`[stack] docker ${args.join(" ").slice(0, 300)} | docker ${INTO_SH.join(" ")}`);
  const build = spawn("docker", args, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
  const copy = spawn("docker", INTO_SH, { cwd: SUITE_DIR, stdio: ["pipe", "inherit", "inherit"] });
  copy.stdin.on("error", () => {});
  build.stdout.pipe(copy.stdin);
  await Promise.all([exit(build, "docker build"), exit(copy, "docker compose cp")]);
}

function image(tag: string, args: string[]): void {
  run("docker", ["build", "-t", tag, ...args, "."]);
}

function push(tag: string): void {
  run("docker", ["push", "-q", tag]);
}

function retag(from: string, to: string): void {
  run("docker", ["tag", from, to]);
  push(to);
}

function derive(tag: string, from: string, lines: string[]): void {
  const dockerfile = [`FROM ${from}`, ...lines, ""].join("\n");
  run("docker", ["build", "-q", "-t", tag, "-f", "-", "."], CA_DIR, dockerfile);
  push(tag);
}

function appImages(version: string): void {
  const standalone = ["--build-arg", "NEXT_BUILD_OUTPUT=standalone"];
  image(`${LOCAL}/app:${version}`, ["-f", "Dockerfile", "--target", "runner", ...standalone]);
  image(`${LOCAL}/app:${version}-preflight`, ["-f", "preflight.Dockerfile"]);
  image(`${LOCAL}/app:${version}-worker`, [
    "-f",
    "Dockerfile",
    "--target",
    "worker",
    ...standalone,
  ]);
  for (const suffix of SUFFIXES) {
    derive(`${APP_REPO}:${version}${suffix}`, `${LOCAL}/app:${version}${suffix}`, TRUST);
  }
}

function publishedImages(version: string): void {
  for (const suffix of SUFFIXES) {
    const published = `${PUBLISHED_REPO}:${version}${suffix}`;
    try {
      derive(`${APP_REPO}:${version}${suffix}`, published, TRUST);
    } catch (err) {
      throw new Error(
        `[stack] the stack installs the published ${version} as the previous release, and ${published} could not be pulled and rebuilt`,
        { cause: err },
      );
    }
  }
}

class Site {
  readonly files = new Map<string, Buffer>();

  write(path: string, content: string | Buffer): void {
    this.files.set(path, Buffer.from(content));
  }

  sums(folder: string, names: string[]): void {
    const lines = names.map((name) => {
      const content = this.files.get(`${folder}/${name}`);
      if (!content) throw new Error(`[stack] ${folder}/${name} is not written yet`);
      return `${createHash("sha256").update(content).digest("hex")}  ${name}\n`;
    });
    this.write(`${folder}/SHA256SUMS`, lines.join(""));
  }

  app(version: string, minCli: string, notes: string): void {
    this.write(`v${version}/metis.json`, `${JSON.stringify({ version, minCli })}\n`);
    this.write(`v${version}/release.md`, `${notes}\n`);
  }

  gateway(track: string, version: string): void {
    this.write(`${track}/v${version}/release.md`, `### Changed\n\n- ${track} ${version}.\n`);
    this.write(`${track}/version.txt`, `${version}\n`);
  }

  publish(): void {
    run("docker", INTO_SH, SUITE_DIR, tar(this.files));
  }
}

function releaseNotes(version: string): string {
  const file = join(ROOT, "releases", `app-v${version}.md`);
  if (!existsSync(file)) return `### Changed\n\n- Metis ${version}.`;
  return readFileSync(file, "utf8")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim();
}

export function pinnedImages(): string[] {
  const catalog = readFileSync(join(ROOT, "apps/cli/internal/catalog/services.yml"), "utf8");
  const images = [...catalog.matchAll(/^\s*image:\s*(\S+)\s*$/gm)]
    .map((match) => match[1] ?? "")
    .filter((ref) => ref.includes("@sha256:") && !ref.includes("$"));
  return [...new Set(images)];
}

export function registryPath(ref: string): string {
  const [name = ""] = ref.split("@");
  const parts = name.split("/");
  const first = parts[0] ?? "";
  const hosted = parts.length > 1 && (first.includes(".") || first.includes(":"));
  const path = hosted ? parts.slice(1).join("/") : name;
  const withNamespace = path.includes("/") ? path : `library/${path}`;
  return withNamespace.includes(":") ? withNamespace : `${withNamespace}:latest`;
}

function copyThirdPartyImages(): void {
  for (const ref of pinnedImages()) {
    run("docker", [
      "run",
      "--rm",
      "--network",
      "host",
      CRANE,
      "copy",
      "--insecure",
      ref,
      `${PUSH}/${registryPath(ref)}`,
    ]);
  }
}

async function publishArtifacts(r: Releases): Promise<void> {
  const args = {
    CLI_VERSION: r.cli,
    CLI_NEXT_VERSION: r.cliNext,
    E2E_CA: readFileSync(CA).toString("base64"),
    GATEWAY_CLOUDFLARE_VERSION: r.gateways["gateway-cloudflare"],
    GATEWAY_SES_VERSION: r.gateways["gateway-ses"],
  };
  await buildIntoSh([
    "build",
    "-f",
    "e2e-cli/stack/artifacts.Dockerfile",
    ...Object.entries(args).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]),
    "--output",
    "type=tar,dest=-",
    ".",
  ]);
}

function publishImages(r: Releases): void {
  appImages(r.current);
  publishedImages(r.previous);
  derive(`${APP_REPO}:${r.preflightFails}-preflight`, `${APP_REPO}:${r.current}-preflight`, [
    `ENTRYPOINT ["sh", "-c", "echo '[preflight] ${r.preflightFails} is an e2e release whose preflight fails' >&2; exit 1"]`,
    "CMD []",
  ]);
  retag(`${APP_REPO}:${r.current}`, `${APP_REPO}:${r.preflightFails}`);
  retag(`${APP_REPO}:${r.current}-worker`, `${APP_REPO}:${r.preflightFails}-worker`);
  derive(`${APP_REPO}:${r.neverReady}`, `${APP_REPO}:${r.current}`, [
    'ENTRYPOINT ["sleep", "infinity"]',
    "CMD []",
  ]);
  retag(`${APP_REPO}:${r.current}-preflight`, `${APP_REPO}:${r.neverReady}-preflight`);
  retag(`${APP_REPO}:${r.current}-worker`, `${APP_REPO}:${r.neverReady}-worker`);
  for (const version of [r.needsCli, r.next]) {
    for (const suffix of SUFFIXES) {
      retag(`${APP_REPO}:${r.current}${suffix}`, `${APP_REPO}:${version}${suffix}`);
    }
  }

  const resend = r.gateways["gateway-resend"];
  image(`${LOCAL}/gateway-resend:${resend}`, ["-f", "apps/gateway-resend/Dockerfile"]);
  derive(`${RESEND_REPO}:${resend}`, `${LOCAL}/gateway-resend:${resend}`, TRUST);

  const harness = `${PUSH}/metis-e2e/harness:latest`;
  image(harness, ["-f", "e2e/Dockerfile"]);
  push(harness);
}

function publishSite(r: Releases): void {
  const site = new Site();
  site.write("bootstrap", readFileSync(join(ROOT, "apps/cli/bootstrap.sh")));
  site.write("cli/version.txt", `${r.cliNext}\n`);

  site.app(r.previous, r.cli, releaseNotes(r.previous));
  site.app(r.current, r.cli, releaseNotes(r.current));
  site.app(r.preflightFails, r.cli, "### Changed\n\n- A release whose preflight fails.");
  site.app(r.neverReady, r.cli, "### Changed\n\n- A release whose app never becomes ready.");
  site.app(r.needsCli, r.needsCliMin, "### Changed\n\n- A release that needs a newer CLI.");
  site.app(r.next, r.cli, NEXT_NOTES);

  const resend = r.gateways["gateway-resend"];
  site.write(
    `gateway-resend/v${resend}/image.txt`,
    `ghcr.io/trymetis/metis-gateway-resend:${resend}\n`,
  );
  site.sums(`gateway-resend/v${resend}`, ["image.txt"]);
  site.gateway("gateway-resend", resend);
  site.gateway("gateway-cloudflare", r.gateways["gateway-cloudflare"]);
  site.gateway("gateway-ses", r.gateways["gateway-ses"]);
  site.publish();
}

export async function buildStack(): Promise<Releases> {
  const r = releases();
  copyThirdPartyImages();
  await publishArtifacts(r);
  publishImages(r);
  publishSite(r);
  console.log(`[stack] releases ${JSON.stringify(r)}`);
  return r;
}
