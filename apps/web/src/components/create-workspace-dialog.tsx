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
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { orpc } from "@/lib/orpc";

import { validateEmailRows } from "./email-rows";
import {
  EMPTY_INVITE_ROW,
  InviteLinks,
  type InviteResults,
  type InviteRow,
  InviteRows,
  sendInvites,
} from "./invite-rows";

export function CreateWorkspaceDialog({
  onCreated,
  trigger,
}: {
  onCreated: (created: { workspaceId: string; slug: string }) => Promise<void> | void;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<InviteRow[]>([EMPTY_INVITE_ROW]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<InviteResults["links"]>([]);

  function reset() {
    setName("");
    setRows([EMPTY_INVITE_ROW]);
    setCreatedId(null);
    setCreatedSlug("");
    setError(null);
    setLinks([]);
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const { rows: invites, error: validationError } = validateEmailRows(rows);
    if (validationError) return setError(validationError);

    const trimmed = name.trim();
    if (!createdId && trimmed.length < 2) {
      return setError("Name must be at least 2 characters");
    }

    setBusy(true);
    try {
      let workspaceId = createdId;
      let slug = createdSlug;
      if (!workspaceId) {
        const created = await orpc.workspaces.create({ name: trimmed });
        workspaceId = created.workspaceId;
        slug = created.slug;
        setCreatedId(workspaceId);
        setCreatedSlug(slug);
      }

      const sent = await sendInvites(slug, invites);
      await onCreated({ workspaceId, slug });
      setLinks(sent.links);
      if (sent.failed.length > 0) {
        setRows(sent.failed);
        setError(
          `Workspace created, but these invites failed. ${sent.errors.join(" ")} Retry or close.`,
        );
        return;
      }
      if (sent.links.length > 0) {
        setRows([EMPTY_INVITE_ROW]);
        return;
      }

      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
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
          trigger ?? (
            <Button variant="outline" size="sm">
              <Plus className="size-3.5" />
              New workspace
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>Optionally invite teammates right away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="workspace-name"
              className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint"
            >
              Name
            </label>
            <Input
              className="text-[13px]"
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              maxLength={60}
              disabled={busy || createdId !== null}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              Invites (optional)
            </span>
            <InviteRows rows={rows} onChange={setRows} disabled={busy} />
          </div>

          {error && <p className="text-xs text-destructive-text">{error}</p>}
          <InviteLinks links={links} />

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : createdId ? (
              "Retry invites"
            ) : (
              "Create workspace"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
