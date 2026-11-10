"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Switch } from "@metis/ui/components/switch";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { McpGuideBlock } from "@/components/mcp-guide";
import { McpPresetIcon } from "@/components/mcp-preset-icon";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { orpc } from "@/lib/orpc";
import { MCP_PRESETS, SELF_REGISTERED_REMOVAL } from "@/mcp/presets";
import type { McpClient } from "@/server/schema";

export function McpClientEnableSwitch({
  client,
  onChange,
  onError,
}: {
  client: McpClient;
  onChange: (enabled: boolean) => void;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const code = useTwoFactorCode();
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(enabled: boolean) {
    if (enabled) {
      code.reset();
      setCodeError(null);
      setConfirming(true);
      return;
    }
    onChange(false);
    try {
      await orpc.mcp.setEnabled({ clientId: client.clientId, enabled: false });
    } catch (err) {
      onChange(true);
      onError(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function confirmEnable(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setCodeError(null);
    try {
      await orpc.mcp.setEnabled({
        clientId: client.clientId,
        enabled: true,
        code: code.value,
      });
      onChange(true);
      setConfirming(false);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Switch
        checked={client.enabled}
        onCheckedChange={toggle}
        aria-label={`${client.label} enabled`}
      />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Re-enable {client.label}</DialogTitle>
            <DialogDescription>
              Re-enabling lets this client sign back in on its own, even after you log out — so we
              need your authenticator code to confirm it&rsquo;s really you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmEnable} className="mt-1 flex flex-col gap-3">
            <TwoFactorInput autoFocus field={code.field} />
            {codeError && (
              <p className="text-center text-[13px] text-destructive-text">{codeError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !code.complete}>
                {busy ? "Verifying…" : "Enable"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function McpClientRemoveButton({
  client,
  onRemoved,
  onError,
}: {
  client: McpClient;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  const preset = client.preset ? MCP_PRESETS[client.preset] : null;
  const removal = preset?.removal ?? SELF_REGISTERED_REMOVAL;

  async function remove() {
    try {
      await orpc.mcp.deleteClient({ clientId: client.clientId });
      onRemoved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Remove client">
            <Trash2 className="size-4 text-destructive-text" />
          </Button>
        }
      />
      <AlertDialogContent size="lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {client.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its credentials stop working immediately and its tokens are deleted. Reconnecting means
            adding the client again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface p-1.5">
            <McpPresetIcon preset={client.preset} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{client.label}</p>
            <code className="block break-all font-mono text-[11px] text-faint select-all">
              {client.clientId}
            </code>
          </div>
          <CopyButton value={client.clientId} label="Copy client ID" className="shrink-0" />
        </div>

        <div className="mt-3">
          <McpGuideBlock guide={removal} heading="Also remove it locally" />
          <p className="mt-1.5 text-[12px] text-faint">
            Deleting here does not touch the client&rsquo;s own config — left behind, it will keep
            trying to reconnect and fail.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
