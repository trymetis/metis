"use client";

import { Button } from "@metis/ui/components/button";
import { useState } from "react";

import { McpToolPicker } from "@/components/mcp-tool-picker";
import { orpc } from "@/lib/orpc";
import { isMcpToolEnabled, type McpToolKey, type McpToolPrefs, mcpToolsFor } from "@/mcp/tools";
import type { InstanceRole } from "@/types/instance-role";

type Manifest = ReturnType<typeof mcpToolsFor>;

function toDraft(manifest: Manifest, prefs: McpToolPrefs): Partial<Record<McpToolKey, boolean>> {
  return Object.fromEntries(manifest.map((t) => [t.key, isMcpToolEnabled(prefs, t.key)]));
}

export function ClientTools({
  clientId,
  tools,
  instanceRole,
  onSaved,
}: {
  clientId: string;
  tools: McpToolPrefs;
  instanceRole: InstanceRole | null;
  onSaved: () => void;
}) {
  const [manifest] = useState(() => mcpToolsFor({ instanceRole }));
  const [saved, setSaved] = useState(() => toDraft(manifest, tools));
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = manifest.some((t) => draft[t.key] !== saved[t.key]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await orpc.mcp.setTools({ clientId, tools: { ...tools, ...draft } });
      setSaved(draft);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] text-faint">
          Unchecking a tool blocks this client from using it at all. Other clients you&rsquo;ve
          added aren&rsquo;t affected.
        </p>
        <Button size="sm" onClick={save} disabled={saving || !dirty} className="shrink-0">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && <p className="mt-2 text-[13px] text-destructive-text">{error}</p>}

      <div className="mt-4">
        <McpToolPicker
          tools={manifest}
          value={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          disabled={saving}
        />
      </div>
    </div>
  );
}
