"use client";

import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Switch } from "@metis/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { ProviderBook } from "@/server/schema";

type Draft = Record<string, boolean>;

function toDraft(books: ProviderBook[], visible: string[]): Draft {
  return Object.fromEntries(books.map((c) => [c.id, visible.includes(c.id)]));
}

function sameSelection(a: Draft, b: Draft): boolean {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

export function AddressBookVisibility({
  linkId,
  visibleBookIds,
  canEdit,
  onSaved,
  onListed,
}: {
  linkId: string;
  visibleBookIds: string[];
  canEdit: boolean;
  onSaved: () => void;
  onListed: (linkId: string, selected: number) => void;
}) {
  const scope = useWorkspaceScope();
  const query = useQuery(
    rpc.workspaceAddressBooks.available.queryOptions({ input: { ...scope, linkId } }),
  );
  const books = query.data?.books ?? (query.isError ? [] : null);
  const visibleKey = visibleBookIds.join("\n");
  const [saved, setSaved] = useState<Draft>({});
  const [draft, setDraft] = useState<Draft>({});
  const [syncedFrom, setSyncedFrom] = useState<{
    data: typeof query.data;
    visibleKey: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const error =
    saveError ?? (query.error ? query.error.message || "Could not reach the provider" : null);

  if (query.data && (syncedFrom?.data !== query.data || syncedFrom.visibleKey !== visibleKey)) {
    const next = toDraft(query.data.books, visibleBookIds);
    setSyncedFrom({ data: query.data, visibleKey });
    setSaved(next);
    setDraft(next);
  }

  const listed = query.data
    ? Object.values(toDraft(query.data.books, visibleBookIds)).filter(Boolean).length
    : null;
  useEffect(() => {
    if (listed !== null) onListed(linkId, listed);
  }, [linkId, listed, onListed]);

  const dirty = !sameSelection(draft, saved);
  const enabled = Object.values(draft).filter(Boolean).length;
  const total = books?.length ?? 0;
  const allOn = total > 0 && enabled === total;

  async function save() {
    if (!books) return;
    setSaving(true);
    setSaveError(null);
    try {
      await orpc.workspaceAddressBooks.setVisibility({
        ...scope,
        linkId,
        visibleBookIds: books.filter((c) => draft[c.id]).map((c) => c.id),
      });
      setSaved(draft);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (books === null) {
    return (
      <div className="border-t border-border px-4 py-6 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="border-t border-border px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] text-faint">
          Turning an address book off here hides it in this workspace only — it stays visible in
          your other workspaces, and the connected account keeps full access at the provider. This
          isn&rsquo;t a security setting.
        </p>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={saving || !dirty} className="shrink-0">
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-[13px] text-destructive-text">{error}</p>}

      {books.length === 0 ? (
        <p className="mt-4 text-[13px] text-faint">No address books came back from this account.</p>
      ) : (
        <>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover">
            <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              All address books
            </span>
            <span className="flex items-center gap-3">
              <span className="text-[11px] text-faint">
                {enabled} of {total}
              </span>
              <Switch
                checked={allOn}
                disabled={saving || !canEdit}
                onCheckedChange={() =>
                  setDraft(Object.fromEntries(books.map((c) => [c.id, !allOn])))
                }
                aria-label="Toggle every address book"
              />
            </span>
          </label>

          <div className="mt-1 flex flex-col">
            {books.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-hover"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-[13px] text-foreground">{c.name}</span>
                  {c.primary && (
                    <Badge variant="secondary" className="shrink-0">
                      Primary
                    </Badge>
                  )}
                  {c.readOnly && (
                    <Badge variant="outline" className="shrink-0">
                      Read-only
                    </Badge>
                  )}
                </span>
                <Switch
                  checked={draft[c.id] === true}
                  disabled={saving || !canEdit}
                  onCheckedChange={(checked) => setDraft((d) => ({ ...d, [c.id]: checked }))}
                  aria-label={`Show ${c.name} in this workspace`}
                />
              </label>
            ))}
          </div>

          <p className="mt-2 px-2 text-[11px] text-faint">
            An address book added to this account later stays off until you switch it on here.
          </p>
        </>
      )}
    </div>
  );
}
