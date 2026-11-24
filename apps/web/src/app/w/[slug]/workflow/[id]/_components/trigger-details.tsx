"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, Eye, Loader2, Pin, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { JsonBlock } from "@/components/workflow-history/json-block";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { GraphNode } from "@/workflow/schema";
import { stepDef } from "@/workflow/steps";

import { useEditorEnv } from "./editor-context";

function ago(iso: string | null): string | null {
  return iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : null;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`);
  }
}

function WebhookEndpoint({ node }: { node: GraphNode }) {
  const scope = useWorkspaceScope();
  const { workflow } = useEditorEnv();
  const endpoint = workflow?.endpoints.find((entry) => entry.triggerNodeId === node.id);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!workflow || !endpoint) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Save the workflow to get the address this trigger listens on.
      </p>
    );
  }

  async function reveal(rotate: boolean) {
    if (!workflow || !endpoint) return;
    setBusy(true);
    try {
      const result = await orpc.workflows.webhookSecret({
        ...scope,
        id: workflow.id,
        endpointId: endpoint.endpointId,
        rotate,
      });
      setSecret(result.secret);
      if (rotate) toast.success("New secret made; the old one stops working now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the secret");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {endpoint.url ? (
        <div className="flex items-center gap-1">
          <Input
            readOnly
            value={endpoint.url}
            aria-label="Webhook address"
            className="font-mono text-[12px]"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy the address"
            onClick={() => void copy(endpoint.url ?? "", "Address")}
          >
            <Copy />
          </Button>
        </div>
      ) : (
        <p className="text-[12px] text-brand-text">
          This instance has no public address yet. The owner sets it in the dashboard.
        </p>
      )}
      {secret ? (
        <div className="flex items-center gap-1">
          <Input
            readOnly
            value={secret}
            aria-label="Webhook secret"
            className="font-mono text-[12px]"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy the secret"
            onClick={() => void copy(secret, "Secret")}
          >
            <Copy />
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {!secret && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void reveal(false)}>
            {busy ? <Loader2 className="animate-spin" /> : <Eye />} Show secret
          </Button>
        )}
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => void reveal(true)}>
          <RefreshCw /> New secret
        </Button>
      </div>
      <p className="text-[11px] text-faint">
        {endpoint.lastSeenAt ? `Last request ${ago(endpoint.lastSeenAt)}` : "No request yet"}
        {endpoint.lastError && ` · ${endpoint.lastError}`}
      </p>
    </div>
  );
}

function SourceState({ node }: { node: GraphNode }) {
  const { sources } = useEditorEnv();
  const state = sources.get(node.id);
  if (!state) return null;
  return (
    <p className="text-[12px] text-muted-foreground">
      {state.paused
        ? "Paused while the workflow is off."
        : state.push
          ? "Changes are pushed by the provider."
          : "Checks for changes every few minutes."}
      {state.lastScanAt && ` Last checked ${ago(state.lastScanAt)}.`}
      {state.error && <span className="block text-destructive-text">{state.error}</span>}
    </p>
  );
}

function PinnedSample({ node }: { node: GraphNode }) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const { workflowId } = useEditorEnv();
  const samples = useQuery({
    ...rpc.workflows.samples.queryOptions({ input: { ...scope, id: workflowId ?? "" } }),
    enabled: !!workflowId,
  });
  const pinned = samples.data?.samples[node.id];
  if (!workflowId || pinned === undefined) return null;

  async function unpin() {
    if (!workflowId) return;
    try {
      await orpc.workflows.pinSample({
        ...scope,
        id: workflowId,
        triggerNodeId: node.id,
        event: null,
      });
      await queryClient.invalidateQueries({ queryKey: rpc.workflows.samples.key() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unpin the sample");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Pin className="size-3.5" />
        <span className="flex-1">A pinned sample event is used by test runs.</span>
        <Button size="xs" variant="ghost" onClick={() => void unpin()}>
          Unpin
        </Button>
      </div>
      <JsonBlock label="Pinned event" value={pinned} />
    </div>
  );
}

export function TriggerDetails({ node }: { node: GraphNode }) {
  const source = stepDef(node.step)?.trigger;
  if (!source) return null;
  return (
    <section aria-label="Trigger" className="flex flex-col gap-3">
      {source.kind === "inbound" && <WebhookEndpoint node={node} />}
      {(source.kind === "feed" || source.kind === "inbound") && <SourceState node={node} />}
      <PinnedSample node={node} />
    </section>
  );
}
