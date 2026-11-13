import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stringify } from "yaml";

import {
  CHANGELOGS,
  compareVersions,
  parseTag,
  publishedNotes,
  readRelease,
  readReleases,
  RELEASES_DIR,
  type Release,
  TRACKS,
  type Track,
} from "./index";

const UNRELEASED = "## Unreleased";
const RELEASES = "## Releases";

const root = join(import.meta.dirname, "../../..");

function listLine(release: Pick<Release, "tag" | "version" | "date">) {
  return `- [${release.version}](../../${RELEASES_DIR}/${release.tag}.md) - ${release.date}`;
}

function sections(track: Track, text: string) {
  const lines = text.split("\n");
  const unreleased = lines.filter((line) => line === UNRELEASED).length;
  const releases = lines.filter((line) => line === RELEASES).length;
  if (unreleased !== 1 || releases !== 1) {
    throw new Error(
      `${CHANGELOGS[track]} needs exactly one ${UNRELEASED} and one ${RELEASES} heading`,
    );
  }
  const start = lines.indexOf(UNRELEASED);
  const end = lines.indexOf(RELEASES);
  if (start > end) throw new Error(`${CHANGELOGS[track]} has ${RELEASES} before ${UNRELEASED}`);
  return { lines, start, end };
}

function dropLeadingBlank(lines: string[]) {
  const first = lines.findIndex((line) => line.trim() !== "");
  return first === -1 ? [] : lines.slice(first);
}

function cut(tag: string | undefined) {
  const parsed = tag ? parseTag(tag) : null;
  if (!tag || !parsed) {
    throw new Error(`${tag ?? "(none)"} is not <${TRACKS.join("|")}>-v<X.Y.Z or X.Y.Z-rc.N>`);
  }
  const { track, version } = parsed;
  const file = join(root, RELEASES_DIR, `${tag}.md`);
  if (existsSync(file)) throw new Error(`${RELEASES_DIR}/${tag}.md already exists`);

  const { releases, errors } = readReleases(root);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const newest = releases.find((release) => release.track === track);
  if (newest && compareVersions(version, newest.version) <= 0) {
    throw new Error(`${version} is not newer than the newest ${track} release, ${newest.version}`);
  }

  const changelog = join(root, CHANGELOGS[track]);
  const { lines, start, end } = sections(track, readFileSync(changelog, "utf8"));
  const body = dropLeadingBlank(lines.slice(start + 1, end))
    .join("\n")
    .trimEnd();
  if (!body) throw new Error(`${CHANGELOGS[track]} has nothing under ${UNRELEASED}`);

  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(file, `---\n${stringify({ date })}---\n\n${body}\n`);

  const updated = [
    ...lines.slice(0, start + 1),
    "",
    RELEASES,
    "",
    listLine({ tag, version, date }),
    ...dropLeadingBlank(lines.slice(end + 1)),
  ];
  writeFileSync(changelog, `${updated.join("\n").trimEnd()}\n`);

  console.log(`[release] wrote ${RELEASES_DIR}/${tag}.md`);
  console.log(`[release] updated ${CHANGELOGS[track]}`);
}

function check() {
  const { releases, errors } = readReleases(root);
  for (const track of TRACKS) {
    const name = CHANGELOGS[track];
    try {
      const { lines, end } = sections(track, readFileSync(join(root, name), "utf8"));
      const other = lines.filter(
        (line) => line.startsWith("## ") && line !== UNRELEASED && line !== RELEASES,
      );
      if (other.length > 0)
        errors.push(
          `${name} has ## headings other than Unreleased and Releases: ${other.join(", ")}`,
        );
      const actual = lines.slice(end + 1).filter((line) => line.trim() !== "");
      const expected = releases.filter((release) => release.track === track).map(listLine);
      if (actual.join("\n") !== expected.join("\n")) {
        const missing = expected.filter((line) => !actual.includes(line));
        const extra = actual.filter((line) => !expected.includes(line));
        errors.push(
          [
            `${name}'s Releases list does not match ${RELEASES_DIR}/${track}-v*.md (newest first, each file's date)`,
            ...missing.map((line) => `  missing: ${line}`),
            ...extra.map((line) => `  unexpected: ${line}`),
            ...(missing.length === 0 && extra.length === 0 ? ["  the lines are out of order"] : []),
          ].join("\n"),
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log("[release] release files and changelogs are consistent");
}

function notes(tag: string | undefined) {
  if (!tag || !parseTag(tag)) {
    throw new Error(`${tag ?? "(none)"} is not <${TRACKS.join("|")}>-v<version>`);
  }
  process.stdout.write(`${publishedNotes(readRelease(root, tag))}\n`);
}

function meta(tag: string | undefined) {
  if (parseTag(tag ?? "")?.track !== "app") {
    throw new Error(`${tag ?? "(none)"} is not app-v<version>`);
  }
  const release = readRelease(root, tag ?? "");
  if (!release.cli) {
    throw new Error(
      `${RELEASES_DIR}/${release.tag}.md sets no cli, the oldest Metis CLI it runs on`,
    );
  }
  process.stdout.write(`${JSON.stringify({ version: release.version, minCli: release.cli })}\n`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === "cut") cut(argument);
  else if (command === "check") check();
  else if (command === "notes") notes(argument);
  else if (command === "meta") meta(argument);
  else {
    throw new Error(
      "usage: cli.ts cut <app|cli|desktop|mobile>-v<version> | check | notes <app|cli|desktop|mobile>-v<version> | meta app-v<version>",
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const line of message.split("\n")) console.error(`[release] ${line}`);
  process.exit(1);
}
