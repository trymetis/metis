import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse } from "yaml";
import { z } from "zod";

export const TRACKS = ["app", "cli", "desktop", "mobile"] as const;

export type Track = (typeof TRACKS)[number];

export const CHANGELOGS: Record<Track, string> = {
  app: "apps/web/CHANGELOG.md",
  cli: "apps/cli/CHANGELOG.md",
  desktop: "apps/desktop/CHANGELOG.md",
  mobile: "apps/mobile/CHANGELOG.md",
};

export const RELEASES_DIR = "releases";

export const releaseFieldsSchema = z.strictObject({
  date: z.iso.date(),
  cli: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "must be an X.Y.Z version")
    .optional(),
});

export type ReleaseFields = z.infer<typeof releaseFieldsSchema>;

export type Release = ReleaseFields & {
  tag: string;
  track: Track;
  version: string;
  body: string;
};

const TAG = /^(app|cli|desktop|mobile)-v(\d+\.\d+\.\d+(?:-rc\.\d+)?)$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export function parseTag(tag: string): { track: Track; version: string } | null {
  const match = TAG.exec(tag);
  const track = TRACKS.find((entry) => entry === match?.[1]);
  if (!track || !match?.[2]) return null;
  return { track, version: match[2] };
}

function versionKey(version: string) {
  const [core = "", rc] = version.split("-rc.");
  return [...core.split(".").map(Number), rc === undefined ? Number.POSITIVE_INFINITY : Number(rc)];
}

export function compareVersions(a: string, b: string) {
  const left = versionKey(a);
  const right = versionKey(b);
  for (const [index, value] of left.entries()) {
    const other = right[index] ?? 0;
    if (value !== other) return value < other ? -1 : 1;
  }
  return 0;
}

export function findRoot(from: string) {
  let dir = from;
  while (!existsSync(join(dir, RELEASES_DIR)) || !existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error(`[release] no repository root with releases/ above ${from}`);
    dir = parent;
  }
  return dir;
}

export function parseRelease(name: string, source: string): Release {
  const tag = name.replace(/\.md$/, "");
  const parsed = name.endsWith(".md") ? parseTag(tag) : null;
  if (!parsed)
    throw new Error(`releases/${name} is not named <app|cli|desktop|mobile>-v<version>.md`);
  const frontmatter = FRONTMATTER.exec(source);
  if (!frontmatter) throw new Error(`releases/${name} has no frontmatter block`);
  let data: unknown;
  try {
    data = parse(frontmatter[1] ?? "");
  } catch (error) {
    throw new Error(`releases/${name} frontmatter is not valid YAML: ${String(error)}`, {
      cause: error,
    });
  }
  const fields = releaseFieldsSchema.safeParse(data);
  if (!fields.success) {
    throw new Error(`releases/${name} frontmatter: ${z.prettifyError(fields.error)}`);
  }
  if (fields.data.cli !== undefined && parsed.track !== "app") {
    throw new Error(`releases/${name} sets cli, which only app releases may set`);
  }
  const body = source
    .slice(frontmatter[0].length)
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .replace(/\s+$/, "");
  if (!body) throw new Error(`releases/${name} has no notes`);
  return { ...fields.data, tag, ...parsed, body };
}

export function readReleases(root: string): { releases: Release[]; errors: string[] } {
  const dir = join(root, RELEASES_DIR);
  const releases: Release[] = [];
  const errors: string[] = [];
  for (const name of readdirSync(dir).toSorted()) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) {
      errors.push(`releases/${name} is not a file`);
      continue;
    }
    try {
      releases.push(parseRelease(name, readFileSync(path, "utf8")));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  releases.sort(
    (a, b) =>
      TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track) || compareVersions(b.version, a.version),
  );
  return { releases, errors };
}

export function loadReleases(root: string): Release[] {
  const { releases, errors } = readReleases(root);
  if (errors.length > 0) throw new Error(`[release] ${errors.join("; ")}`);
  return releases;
}

export function readRelease(root: string, tag: string): Release {
  const name = `${tag}.md`;
  const path = join(root, RELEASES_DIR, name);
  if (!existsSync(path)) throw new Error(`releases/${name} is missing`);
  return parseRelease(name, readFileSync(path, "utf8"));
}

export function publishedNotes(release: Release): string {
  return release.body;
}
