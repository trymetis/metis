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
} from "@metis/ui/components/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { isOneOf } from "@/lib/guards";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import {
  WORKSPACE_AI_POLICIES,
  WORKSPACE_PHISHING_DETECTION_POLICIES,
  type WorkspaceAiPolicy,
  type WorkspacePhishingDetectionPolicy,
} from "@/types/workspace";

const AI_ITEMS = [
  {
    value: "optional",
    label: "Allowed — each mailbox, calendar, drive and address book decides",
  },
  { value: "off", label: "Off — no AI anywhere in this workspace" },
];

const PHISHING_ITEMS = [
  { value: "optional", label: "Allowed — each mailbox decides" },
  { value: "required", label: "Required — every mailbox must have it on" },
  { value: "off", label: "Off — no phishing detection in this workspace" },
];

interface PendingChange {
  patch: {
    aiPolicy?: WorkspaceAiPolicy;
    phishingDetectionPolicy?: WorkspacePhishingDetectionPolicy;
  };
  title: string;
  body: string;
  affected: string[];
}

export function PolicySection({ canEdit }: { canEdit: boolean }) {
  const scope = useWorkspaceScope();
  const policyOptions = rpc.workspaces.getPolicy.queryOptions({ input: scope });
  const query = useQuery(policyOptions);
  const policy = query.data ?? null;
  const [saving, setSaving] = useState(false);
  const [saveError, setError] = useState<string | null>(null);
  const error = saveError ?? (query.error ? query.error.message || "Could not load" : null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const code = useTwoFactorCode();

  function affected(next: "required" | "off") {
    if (!policy) return [];
    return (
      next === "required"
        ? policy.mailboxes.filter((m) => !m.phishingDetectionEnabled)
        : policy.mailboxes.filter((m) => m.phishingDetectionEnabled)
    ).map((m) => m.email);
  }

  function askAi(next: WorkspaceAiPolicy) {
    code.reset();
    setPending({
      patch: { aiPolicy: next },
      title: next === "off" ? "Turn AI off for this workspace?" : "Allow AI in this workspace?",
      body:
        next === "off"
          ? "The assistants stop working here, and no MCP client can reach this workspace. Clients keep working in their owners' other workspaces, and reach this one again once AI is allowed."
          : "Each mailbox, calendar, drive and address book here then decides for itself. Nothing turns on until its owner turns it on.",
      affected: [],
    });
  }

  function askPhishing(next: WorkspacePhishingDetectionPolicy) {
    code.reset();
    const emails = next === "optional" ? [] : affected(next);
    setPending({
      patch: { phishingDetectionPolicy: next },
      title:
        next === "required"
          ? "Turn detection on for every mailbox here?"
          : next === "off"
            ? "Turn detection off for every mailbox here?"
            : "Let each mailbox decide?",
      body:
        next === "required"
          ? "These mailboxes have detection off, and it will run for them in this workspace anyway. Their own setting is unchanged, and other workspaces are unaffected."
          : next === "off"
            ? "These mailboxes have detection on, and it will stop in this workspace. Their own setting is unchanged, and other workspaces are unaffected."
            : "Each mailbox here follows its own setting again.",
      affected: emails,
    });
  }

  async function confirm() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      await orpc.workspaces.setPolicy({
        ...scope,
        ...pending.patch,
        code: code.value,
      });
      await refreshQuery(policyOptions.queryKey);
      setPending(null);
      code.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return (
      <section className="mt-8">
        <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
          AI &amp; privacy
        </h2>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-faint">
          <Loader2 className="size-3.5 animate-spin" />
          Loading…
        </div>
      </section>
    );
  }

  if (!policy.platform.ai && !policy.platform.phishingDetection) return null;

  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
        AI &amp; privacy
      </h2>
      <p className="mt-2 text-[13px] text-muted-foreground">
        What this workspace allows. A mailbox, calendar, drive or address book can always be more
        restrictive than the workspace, never less.
      </p>

      {error && !pending && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {policy.platform.ai && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[13px] font-medium text-foreground">AI features</div>
            <p className="mt-1 mb-2.5 text-[12px] text-faint">
              Summaries, smart replies, labelling, the assistants, and MCP clients.
            </p>
            <Select
              disabled={!canEdit || saving}
              items={AI_ITEMS}
              onValueChange={(value) => {
                if (isOneOf(WORKSPACE_AI_POLICIES, value)) askAi(value);
              }}
              value={policy.aiPolicy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {policy.aiPolicy === "off" && (
              <p className="mt-2 text-[12px] text-faint">
                No MCP client can reach this workspace while AI is off.
              </p>
            )}
          </div>
        )}

        {policy.platform.phishingDetection && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[13px] font-medium text-foreground">Phishing detection</div>
            <p className="mt-1 mb-2.5 text-[12px] text-faint">
              Scans incoming mail and flags suspicious messages.
            </p>
            <Select
              disabled={!canEdit || saving}
              items={PHISHING_ITEMS}
              onValueChange={(value) => {
                if (isOneOf(WORKSPACE_PHISHING_DETECTION_POLICIES, value)) {
                  askPhishing(value);
                }
              }}
              value={policy.phishingDetectionPolicy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHISHING_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.body}
              {pending?.affected.length ? (
                <span className="mt-2 block font-mono text-[12px]">
                  {pending.affected.join(", ")}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <TwoFactorInput autoFocus field={code.field} />
          {error && <p className="text-center text-[12px] text-destructive-text">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(pending?.patch.aiPolicy === "off" && "bg-destructive text-white")}
              disabled={saving || !code.complete}
              onClick={confirm}
            >
              {saving ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
