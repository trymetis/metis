"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";

export function ApprovalActions({ waitId, onDone }: { waitId: string; onDone?: () => void }) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "denied" | null>(null);

  async function decide(decision: "approved" | "denied") {
    setBusy(decision);
    try {
      await orpc.workflows.decide({ ...scope, waitId, decision, note: note.trim() || null });
      toast.success(decision === "approved" ? "Approved" : "Denied");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rpc.workflows.approvals.key() }),
        queryClient.invalidateQueries({ queryKey: rpc.workflows.getRun.key() }),
        queryClient.invalidateQueries({ queryKey: rpc.workflows.runs.key() }),
      ]);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That decision did not go through");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Note"
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        className="h-8 min-w-40 flex-1 text-[13px]"
      />
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" disabled={busy !== null} onClick={() => void decide("approved")}>
          {busy === "approved" ? <Loader2 className="animate-spin" /> : <Check />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void decide("denied")}
        >
          {busy === "denied" ? <Loader2 className="animate-spin" /> : <X />}
          Deny
        </Button>
      </div>
    </div>
  );
}
