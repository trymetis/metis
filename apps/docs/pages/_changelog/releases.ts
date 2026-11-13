import {
  compareVersions,
  findRoot,
  loadReleases as readReleaseFiles,
  type Track,
  TRACKS,
} from "@metis/releases";
import { Marked } from "marked";

export const TRACK_LABELS: Record<Track, string> = {
  app: "App",
  cli: "Server CLI",
  desktop: "Desktop",
  mobile: "Mobile",
};

export type Release = {
  id: string;
  track: Track;
  label: string;
  version: string;
  date: string;
  displayDate: string;
  html: string;
};

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

export function loadReleases(): Release[] {
  return readReleaseFiles(findRoot(process.cwd()))
    .map((release) => ({
      id: `${release.track}-${release.version}`,
      track: release.track,
      label: TRACK_LABELS[release.track],
      version: release.version,
      date: release.date,
      displayDate: dateFormat.format(new Date(`${release.date}T00:00:00Z`)),
      html: markdown.parse(release.body, { async: false }),
    }))
    .toSorted(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track) ||
        compareVersions(b.version, a.version),
    );
}
