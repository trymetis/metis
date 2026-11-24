"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@metis/ui/components/sheet";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import {
  diffGraphs,
  type FieldChange,
  type GraphDiff,
  isEmptyDiff,
} from "@/workflow/revision-diff";
import type { WorkflowGraph } from "@/workflow/schema";

function Fields({ fields }: { fields: FieldChange[] }) {
  return (
    <dl className="flex flex-col gap-1">
      {fields.map((change) => (
        <div key={change.field} className="text-[12px]">
          <dt className="text-muted-foreground">{change.field}</dt>
          <dd className="flex flex-col font-mono text-[11px]">
            <span className="break-words text-destructive-text line-through">{change.before}</span>
            <span className="break-words text-status-success">{change.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function List({ label, entries }: { label: string; entries: string[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-[11px] uppercase tracking-wide text-faint">{label}</h4>
      <ul className="flex flex-col gap-0.5 text-[12px] text-foreground">
        {entries.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}

function DiffView({ diff }: { diff: GraphDiff }) {
  if (isEmptyDiff(diff)) {
    return <p className="text-[12px] text-faint">Nothing changed in the steps or settings.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <List label="Steps added" entries={diff.added.map((node) => node.title)} />
      <List label="Steps removed" entries={diff.removed.map((node) => node.title)} />
      {diff.changed.map((node) => (
        <section key={node.nodeId} className="flex flex-col gap-1">
          <h4 className="text-[11px] uppercase tracking-wide text-faint">{node.title}</h4>
          <Fields fields={node.fields} />
        </section>
      ))}
      <List label="Connected" entries={diff.connected} />
      <List label="Disconnected" entries={diff.disconnected} />
      {diff.settings.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-[11px] uppercase tracking-wide text-faint">Settings</h4>
          <Fields fields={diff.settings} />
        </section>
      )}
    </div>
  );
}

interface Entry {
  key: string;
  label: string;
  when: string | null;
  author: string | null;
  diff: GraphDiff | null;
}

export function RevisionsSheet({
  workflowId,
  current,
  open,
  onOpenChange,
}: {
  workflowId: string;
  current: WorkflowGraph;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const scope = useWorkspaceScope();
  const query = useQuery({
    ...rpc.workflows.revisions.queryOptions({ input: { ...scope, id: workflowId, limit: 20 } }),
    enabled: open,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const revisions = (query.data?.revisions ?? []).toSorted((a, b) => b.revision - a.revision);
    const latest = revisions[0];
    const unsaved = latest ? diffGraphs(latest.graph, current) : null;
    return [
      ...(unsaved && !isEmptyDiff(unsaved)
        ? [{ key: "unsaved", label: "Unsaved changes", when: null, author: null, diff: unsaved }]
        : []),
      ...revisions.map((revision, index) => {
        const previous = revisions[index + 1];
        return {
          key: String(revision.revision),
          label: `Revision ${revision.revision}`,
          when: revision.createdAt,
          author: revision.author?.name ?? null,
          diff: previous ? diffGraphs(previous.graph, revision.graph) : null,
        };
      }),
    ];
  }, [query.data, current]);

  const active = entries.find((entry) => entry.key === selected) ?? entries[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Revisions</SheetTitle>
          <SheetDescription>
            Each save makes a revision. Pick one to see what it changed from the one before.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {query.isPending ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin opacity-50" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">This workflow has no revisions yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {entries.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(entry.key)}
                      className={cn(
                        "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover",
                        active?.key === entry.key && "bg-hover",
                      )}
                    >
                      <span className="flex-1 text-foreground">{entry.label}</span>
                      {entry.when && (
                        <span className="text-[11px] text-faint">
                          {format(new Date(entry.when), "PPp")}
                          {entry.author && ` · ${entry.author}`}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {active && (
                <section
                  aria-label={`Changes in ${active.label}`}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  {active.diff ? (
                    <DiffView diff={active.diff} />
                  ) : (
                    <p className="text-[12px] text-faint">
                      The first revision shown; nothing older to compare it with.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
