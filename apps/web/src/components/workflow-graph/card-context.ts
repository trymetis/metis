import { resolveLabelName } from "@/mail/label-meta";
import type { WorkflowDirectory } from "@/server/schema";
import type { GraphShape } from "@/workflow/schema";
import type { CardContext } from "@/workflow/steps";

export interface CardDirectory {
  directory: WorkflowDirectory | null;
  workflows: readonly { id: string; name: string }[];
  labelName?: (key: string) => string;
}

export function cardContext(graph: GraphShape, source: CardDirectory): CardContext {
  const { directory, workflows } = source;
  return {
    graph,
    mailboxEmail: (id) => directory?.mailboxes.find((m) => m.id === id)?.email ?? null,
    calendarName: (id) => directory?.calendars.find((c) => c.id === id)?.name ?? null,
    driveName: (id) => directory?.drives.find((d) => d.id === id)?.name ?? null,
    addressBookName: (id) => directory?.addressBooks.find((a) => a.id === id)?.name ?? null,
    labelName: source.labelName ?? ((key) => resolveLabelName(key, [])),
    workflowName: (id) => workflows.find((w) => w.id === id)?.name ?? null,
    memberName: (id) => directory?.members.find((m) => m.userId === id)?.name ?? null,
  };
}
