import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Marked } from "marked";

export type Platform = "app" | "desktop" | "mobile";

export const PLATFORMS: { id: Platform; label: string; file: string }[] = [
  { id: "app", label: "App", file: "CHANGELOG.md" },
  { id: "desktop", label: "Desktop", file: "apps/desktop/CHANGELOG.md" },
  { id: "mobile", label: "Mobile", file: "apps/mobile/CHANGELOG.md" },
];

export type Release = {
  id: string;
  platform: Platform;
  label: string;
  version: string;
  date: string;
  displayDate: string;
  html: string;
};

const HEADING = /^## (\d+\.\d+\.\d+\S*) - (\d{4}-\d{2}-\d{2})\s*$/;

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link: ({ href, raw, text }) => (href === `mailto:${raw}` ? escapeHtml(text) : false),
  },
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

function repoRoot() {
  let dir = process.cwd();
  while (!PLATFORMS.every((platform) => existsSync(join(dir, platform.file)))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `[changelog] no repository root with every CHANGELOG.md above ${process.cwd()}`,
      );
    }
    dir = parent;
  }
  return dir;
}

function parse(source: string, platform: (typeof PLATFORMS)[number]): Release[] {
  const releases: Release[] = [];
  let current: { version: string; date: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    if (body) {
      releases.push({
        id: `${platform.id}-${current.version}`,
        platform: platform.id,
        label: platform.label,
        version: current.version,
        date: current.date,
        displayDate: dateFormat.format(new Date(`${current.date}T00:00:00Z`)),
        html: markdown.parse(body, { async: false }),
      });
    }
    current = null;
  };
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      flush();
      const match = HEADING.exec(line);
      if (match) current = { version: match[1], date: match[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return releases;
}

export function loadReleases(): Release[] {
  const root = repoRoot();
  const order = PLATFORMS.map((platform) => platform.id);
  return PLATFORMS.flatMap((platform) =>
    parse(readFileSync(join(root, platform.file), "utf8"), platform),
  ).toSorted(
    (a, b) => b.date.localeCompare(a.date) || order.indexOf(a.platform) - order.indexOf(b.platform),
  );
}
