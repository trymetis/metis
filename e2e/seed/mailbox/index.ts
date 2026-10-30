import { anchors } from "./anchors";
import type { Folder, SeededMail } from "./build";
import { marketing } from "./marketing";
import { notices } from "./notices";
import { spam } from "./spam";
import { threads } from "./threads";

export type { Folder, SeededMail } from "./build";

export const MAILBOX_FOLDERS: Folder[] = ["Sent", "Drafts", "Archive", "Junk", "Trash"];

const ANCHOR_START = new Date("2026-09-21T00:00:00Z");

export function mailbox(): SeededMail[] {
  const pinned = anchors();
  const rest = [...threads(), ...notices(), ...marketing(), ...spam()];
  const late = rest.filter((m) => m.date >= ANCHOR_START);
  if (late.length > 0) {
    throw new Error(
      `seeded mail dated on or after the anchors: ${late.map((m) => m.subject).join(", ")}`,
    );
  }
  const all = [...rest, ...pinned].toSorted((a, b) => a.date.getTime() - b.date.getTime());
  const ids = new Set<string>();
  for (const m of all) {
    if (ids.has(m.messageId)) throw new Error(`duplicate Message-ID ${m.messageId} (${m.subject})`);
    ids.add(m.messageId);
  }
  return all;
}
