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
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  Bookmark,
  Clock,
  FileText,
  Inbox,
  MailX,
  Pencil,
  Moon,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  addCustomLabel,
  removeCustomLabel,
  replaceCustomLabel,
  useCustomLabels,
} from "@/hooks/use-custom-labels";
import { useMailboxScope, useWorkspacePath } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { customLabelMark, LABEL_OPTIONS } from "@/mail/label-meta";
import type { ScheduledSendItem } from "@/server/schema";
import { useMailStore } from "@/store/mail-store";
import type { LabelColor, MailFolder } from "@/types/mail";
import { mailPath, workspaceRootPath } from "@/workspace/path";

import { LabelForm } from "./label-form";
import { MailboxSwitcher } from "./mailbox-switcher";

const MAILBOXES: {
  label: string;
  folder: MailFolder;
  icon: React.ElementType;
}[] = [
  { label: "Inbox", folder: "inbox", icon: Inbox },
  { label: "Sent", folder: "sent", icon: Send },
  { label: "Drafts", folder: "drafts", icon: FileText },
  { label: "Starred", folder: "starred", icon: Star },
  { label: "Trash", folder: "trash", icon: Trash2 },
];

const DUE_GRACE_MS = 5_000;
const OVERDUE_POLL_MS = 30_000;
const MAX_WAIT_MS = 5 * 60_000;

function untilNextDue(scheduled: ScheduledSendItem[] | undefined): number | false {
  const due = (scheduled ?? [])
    .filter((s) => s.status === "pending")
    .map((s) => new Date(s.scheduledFor).getTime());
  if (due.length === 0) return false;
  const wait = Math.min(...due) - Date.now();
  return wait > 0 ? Math.min(MAX_WAIT_MS, wait + DUE_GRACE_MS) : OVERDUE_POLL_MS;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceSlug, mailboxSlug, folder } = useWorkspacePath();
  const activeLabel = searchParams.get("label") ?? null;
  const scope = useMailboxScope();
  const leafHref = (leaf: string, search = ""): Route =>
    workspaceSlug && mailboxSlug
      ? mailPath(workspaceSlug, mailboxSlug, leaf, search)
      : workspaceRootPath();

  const { setComposeOpen } = useMailStore();
  const customLabels = useCustomLabels();
  const scheduledCount =
    useQuery(
      rpc.mail.scheduledSend.list.queryOptions({
        input: scope,
        refetchInterval: (query) => untilNextDue(query.state.data?.scheduled),
        select: (data) => (data.scheduled ?? []).filter((s) => s.status === "pending").length,
      }),
    ).data ?? null;
  const [addingLabel, setAddingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const currentFolder = folder ?? pathname.split("/").pop();

  async function createLabel(label: { name: string; color: LabelColor }) {
    try {
      const data = await orpc.mail.customLabels.create({ ...scope, ...label });
      addCustomLabel(scope, data);
      setAddingLabel(false);
    } catch {}
  }

  async function updateLabel(id: string, label: { name: string; color: LabelColor }) {
    try {
      const data = await orpc.mail.customLabels.update({ ...scope, id, ...label });
      replaceCustomLabel(scope, data);
      setEditingLabelId(null);
    } catch {}
  }

  async function confirmDeleteLabel() {
    const target = pendingDeleteLabel;
    if (!target) return;
    setPendingDeleteLabel(null);
    await orpc.mail.customLabels.delete({ ...scope, id: target.id });
    removeCustomLabel(scope, target.id);
  }

  return (
    <aside
      className="flex h-full w-full flex-col overflow-y-auto border-r py-5 bg-panel border-border"
      aria-label="Folders"
    >
      <MailboxSwitcher />

      <Button
        onClick={() => setComposeOpen(true)}
        className="mx-3 mb-5 h-10 rounded-[10px] tracking-[0.2px]"
      >
        <Plus strokeWidth={2.2} />
        Compose
      </Button>

      <SidebarSection label="Mailboxes">
        {MAILBOXES.map(({ label, folder: f, icon: Icon }) => (
          <FolderButton
            key={f}
            label={label}
            icon={<Icon className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
            active={currentFolder === f && !activeLabel}
            href={leafHref(f)}
          />
        ))}
        <FolderButton
          label="Read later"
          icon={<Bookmark className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "read-later"}
          href={leafHref("read-later")}
        />
        <FolderButton
          label="Snoozed"
          icon={<Moon className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "snoozed"}
          href={leafHref("snoozed")}
        />
        <FolderButton
          label="Scheduled"
          icon={<Clock className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "scheduled"}
          count={scheduledCount ?? undefined}
          href={leafHref("scheduled")}
        />
        <FolderButton
          label="Subscriptions"
          icon={<MailX className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "subscriptions"}
          href={leafHref("subscriptions")}
        />
        <FolderButton
          label="Archive"
          icon={<Archive className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "archive" && !activeLabel}
          href={leafHref("archive")}
        />
        <FolderButton
          label="Spam"
          icon={<ShieldAlert className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "spam" && !activeLabel}
          href={leafHref("spam")}
        />
      </SidebarSection>

      <div className="mb-6 px-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <div className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
            Labels
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingLabelId(null);
              setAddingLabel((v) => !v);
            }}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-hover text-faint"
            title={addingLabel ? "Cancel" : "Add custom label"}
          >
            {addingLabel ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>

        <div className="space-y-px">
          {LABEL_OPTIONS.map(({ key, name, mark }) => (
            <LabelButton
              key={key}
              name={name}
              color={mark}
              active={activeLabel === key}
              href={leafHref("inbox", `?label=${encodeURIComponent(key)}`)}
            />
          ))}

          {customLabels.map((l) =>
            editingLabelId === l.id ? (
              <LabelForm
                key={l.id}
                initialName={l.name}
                initialColor={l.color}
                submitLabel="Save"
                onSubmit={(label) => updateLabel(l.id, label)}
                onCancel={() => setEditingLabelId(null)}
              />
            ) : (
              <LabelButton
                key={l.id}
                name={l.name}
                color={customLabelMark(l.color)}
                active={activeLabel === l.key}
                href={leafHref("inbox", `?label=${encodeURIComponent(l.key)}`)}
                onEdit={() => {
                  setAddingLabel(false);
                  setEditingLabelId(l.id);
                }}
                onDelete={() => setPendingDeleteLabel({ id: l.id, name: l.name })}
              />
            ),
          )}

          {addingLabel && (
            <LabelForm
              submitLabel="Add label"
              onSubmit={createLabel}
              onCancel={() => setAddingLabel(false)}
            />
          )}
        </div>
      </div>

      <AlertDialog
        open={pendingDeleteLabel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteLabel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this label?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteLabel
                ? `"${pendingDeleteLabel.name}" will be removed from your sidebar. Existing emails keep their other labels.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteLabel}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 px-3">
      <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
        {label}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function FolderButton({
  label,
  icon,
  active,
  count,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  count?: number;
  href: Route;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.75 text-left text-[13px] transition-colors",
        active
          ? "bg-brand-soft text-primary"
          : "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-auto min-w-5.5 rounded-full px-1.5 text-center text-[11px] tabular-nums",
            active ? "bg-primary/20 text-primary" : "bg-active text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function LabelButton({
  name,
  color,
  active,
  href,
  onEdit,
  onDelete,
}: {
  name: string;
  color: string;
  active?: boolean;
  href: Route;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.75 text-left text-[13px] transition-colors",
          active
            ? "bg-brand-soft text-primary"
            : "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
        )}
      >
        <Tag className="h-3.75 w-3.75 opacity-90" strokeWidth={1.8} style={{ color }} />
        <span className="flex-1 truncate">{name}</span>
      </Link>
      {onEdit && onDelete && (
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex group-focus-within:flex pointer-coarse:flex">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-hover"
            aria-label={`Edit label ${name}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-hover"
            aria-label={`Delete label ${name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
