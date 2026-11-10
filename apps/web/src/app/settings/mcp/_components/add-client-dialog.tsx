"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { McpGuideBlock } from "@/components/mcp-guide";
import { McpPresetIcon } from "@/components/mcp-preset-icon";
import { isOneOf } from "@/lib/guards";
import { orpc } from "@/lib/orpc";
import {
  MCP_PRESET_IDS,
  MCP_PRESET_LIST,
  MCP_PRESETS,
  type McpGuide,
  type McpPresetId,
} from "@/mcp/presets";

const DEFAULT_PRESET: McpPresetId = "claude-code";

const PRESET_ITEMS = MCP_PRESET_LIST.map((p) => ({
  value: p.id,
  label: (
    <span className="flex items-center gap-2">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <McpPresetIcon preset={p.id} />
      </span>
      {p.label}
    </span>
  ),
}));

export function AddClientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<McpPresetId>(DEFAULT_PRESET);
  const [label, setLabel] = useState(MCP_PRESETS[DEFAULT_PRESET].label);
  const [labelEdited, setLabelEdited] = useState(false);
  const [port, setPort] = useState(String(MCP_PRESETS[DEFAULT_PRESET].defaultPort));
  const [redirectUri, setRedirectUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    clientId: string;
    instructions: McpGuide;
  } | null>(null);

  const active = MCP_PRESETS[preset];

  function reset() {
    setPreset(DEFAULT_PRESET);
    setLabel(MCP_PRESETS[DEFAULT_PRESET].label);
    setLabelEdited(false);
    setPort(String(MCP_PRESETS[DEFAULT_PRESET].defaultPort));
    setRedirectUri("");
    setError(null);
    setResult(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function choosePreset(next: McpPresetId) {
    setPreset(next);
    const defaults = MCP_PRESETS[next];
    if (defaults.defaultPort) setPort(String(defaults.defaultPort));
    if (!labelEdited) setLabel(defaults.label);
  }

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await orpc.mcp.createClient({
        label: label.trim(),
        preset,
        port: active.needsPinnedPort ? Number(port) : undefined,
        redirectUris: preset === "custom" && redirectUri.trim() ? [redirectUri.trim()] : undefined,
      });
      setResult({
        clientId: created.client.clientId,
        instructions: created.instructions,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the client");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="shrink-0">
            <Plus className="size-3.5" />
            Add client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{label.trim()} is ready</DialogTitle>
              <DialogDescription>
                Set it up in your client. There is no secret key — the client ID is all you need.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-1">
              <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                Client ID
              </span>
              <div className="mt-1 flex items-center gap-2 rounded-lg bg-panel py-1 pr-1 pl-3">
                <p className="min-w-0 flex-1 break-all font-mono text-[12px] text-foreground select-all">
                  {result.clientId}
                </p>
                <CopyButton value={result.clientId} label="Copy client ID" className="shrink-0" />
              </div>
            </div>

            <div className="mt-3">
              <McpGuideBlock guide={result.instructions} heading="Setup" />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={close}>Done</Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add an MCP client</DialogTitle>
              <DialogDescription>
                Each client gets its own sign-in and its own tool permissions. It reaches every
                workspace you belong to that has AI turned on, unless you hide that workspace from
                it here. Removing it cuts off access immediately.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                  Client
                </span>
                <Select
                  value={preset}
                  items={PRESET_ITEMS}
                  onValueChange={(v) => {
                    if (isOneOf(MCP_PRESET_IDS, v)) choosePreset(v);
                  }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[12px] text-faint">{active.hint}</p>
              </div>

              <div>
                <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                  Name
                </span>
                <Input
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    setLabelEdited(e.target.value.trim().length > 0);
                  }}
                  placeholder="Claude Code — laptop"
                  className="mt-1 text-[13px]"
                  maxLength={60}
                  required
                />
              </div>

              {active.needsPinnedPort && (
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                    Sign-in port
                  </span>
                  <Input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    inputMode="numeric"
                    className="mt-1 text-[13px]"
                    required
                  />
                  <p className="mt-1.5 text-[12px] text-faint">
                    Pass the same port to the client with --callback-port.
                  </p>
                </div>
              )}

              {preset === "custom" && (
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                    Sign-in return URL
                  </span>
                  <Input
                    value={redirectUri}
                    onChange={(e) => setRedirectUri(e.target.value)}
                    placeholder="http://127.0.0.1/callback"
                    className="mt-1 text-[13px]"
                    required
                  />
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-[13px] text-destructive-text">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Add client
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
