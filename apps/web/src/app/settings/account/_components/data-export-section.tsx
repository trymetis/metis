"use client";

import { Button } from "@metis/ui/components/button";
import { Download } from "lucide-react";
import { useState } from "react";

import { orpc } from "@/lib/orpc";

export function DataExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadExport() {
    setBusy(true);
    setError(null);
    try {
      const data = await orpc.user.exportData();
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(data, null, 2)}\n`], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `metis-suite-export-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export your data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Download className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-medium text-foreground">Export your data</h2>
      </div>
      <p className="mt-1 text-[12px] text-faint">
        Downloads a JSON file with your preferences, workspaces, labels, workflows, Workspace
        Assistant chats and security activity.
      </p>
      <p className="mt-2 text-[12px] text-faint">
        This is not a mailbox archive. Your mail, calendar events, files and contacts stay with the
        provider you connected, so export those from the provider.
      </p>
      <Button className="mt-3" variant="outline" disabled={busy} onClick={downloadExport}>
        <Download data-icon="inline-start" />
        {busy ? "Preparing…" : "Download export"}
      </Button>
      {error && <p className="mt-2 text-[12px] text-destructive-text">{error}</p>}
    </section>
  );
}
