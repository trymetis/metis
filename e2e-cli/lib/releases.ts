import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const ROOT = join(import.meta.dirname, "../..");

export interface Releases {
  previous: string;
  current: string;
  preflightFails: string;
  neverReady: string;
  needsCli: string;
  needsCliMin: string;
  next: string;
  cli: string;
  cliNext: string;
  gateways: { "gateway-resend": string; "gateway-cloudflare": string; "gateway-ses": string };
}

type Triple = [number, number, number];

function parse(version: string): Triple {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return [major, minor, patch];
}

function compare(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function format([major, minor, patch]: Triple): string {
  return `${major}.${minor}.${patch}`;
}

function released(track: string): string[] {
  const pattern = new RegExp(`^${track}-v(\\d+\\.\\d+\\.\\d+)\\.md$`);
  return readdirSync(join(ROOT, "releases"))
    .flatMap((name) => pattern.exec(name)?.[1] ?? [])
    .toSorted(compare);
}

function newest(track: string): string {
  const last = released(track).at(-1);
  if (!last) throw new Error(`[releases] releases/ has no ${track}-v*.md`);
  return last;
}

let cached: Releases | null = null;

export function releases(): Releases {
  if (cached) return cached;
  const { version: tree } = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")));
  const previous = newest("app");
  const [publishedMajor, publishedMinor, publishedPatch] = parse(previous);
  const current =
    compare(tree, previous) > 0
      ? tree
      : format([publishedMajor, publishedMinor, publishedPatch + 1]);
  const [major, minor, patch] = parse(current);
  const cli = newest("cli");
  const [cliMajor, cliMinor, cliPatch] = parse(cli);
  cached = {
    previous,
    current,
    preflightFails: format([major, minor, patch + 1]),
    neverReady: format([major, minor, patch + 2]),
    needsCli: format([major, minor, patch + 3]),
    needsCliMin: format([cliMajor, cliMinor + 1, 0]),
    next: format([major, minor + 1, 0]),
    cli,
    cliNext: format([cliMajor, cliMinor, cliPatch + 1]),
    gateways: {
      "gateway-resend": newest("gateway-resend"),
      "gateway-cloudflare": newest("gateway-cloudflare"),
      "gateway-ses": newest("gateway-ses"),
    },
  };
  return cached;
}
