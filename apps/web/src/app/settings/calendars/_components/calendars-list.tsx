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
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountIdentity } from "@/components/account-identity";
import { CalendarDialog } from "@/components/calendar-dialog";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import {
  type ResourceWorkspaceRow,
  ResourceWorkspacesDialog,
} from "@/components/resource-workspaces-dialog";
import type { CalendarProvider } from "@/connections/types";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { UserCalendar } from "@/server/schema";

function connectHref(provider: CalendarProvider) {
  return `/api/connections/start/${provider}/calendar?callbackURL=${encodeURIComponent("/settings/calendars")}`;
}

function refresh() {
  return refreshQuery(rpc.calendars.list.queryKey());
}

export function CalendarsList() {
  const platform = usePlatformPolicy();
  const query = useQuery(rpc.calendars.list.queryOptions());
  const calendars = query.data?.calendars ?? null;
  const loadError = query.error ? query.error.message || "Could not load your calendars" : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<{
    calendar: UserCalendar;
    workspace: ResourceWorkspaceRow;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserCalendar | null>(null);

  async function setPolicy(linkId: string, patch: { aiEnabled?: boolean }, code?: string) {
    if (patch.aiEnabled === undefined) return;
    setBusy(linkId);
    try {
      await orpc.calendars.setPolicy({
        linkId,
        aiEnabled: patch.aiEnabled,
        code,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    } finally {
      setBusy(null);
    }
  }

  async function setAiEverywhere(
    calendarId: string,
    patch: { aiEnabled?: boolean },
    code?: string,
  ) {
    if (patch.aiEnabled === undefined) return;
    setBusy(calendarId);
    try {
      await orpc.calendars.setPolicyEverywhere({
        calendarId,
        aiEnabled: patch.aiEnabled,
        code,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    } finally {
      setBusy(null);
    }
  }

  async function detach(linkId: string) {
    setBusy(linkId);
    setConfirmDetach(null);
    try {
      await orpc.calendars.detach({ linkId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(calendarId: string) {
    setBusy(calendarId);
    setConfirmDelete(null);
    try {
      await orpc.calendars.delete({ calendarId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Calendars"
        description="Every calendar connected to your account, and which workspaces use it."
        action={
          <CalendarDialog connectHref={connectHref}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Connect calendar
            </Button>
          </CalendarDialog>
        }
      />

      <div className="mt-6 flex flex-col gap-2">
        {calendars === null && loadError ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-destructive-text">{loadError}</p>
          </div>
        ) : calendars === null ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : calendars.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-faint">No calendars connected yet.</p>
          </div>
        ) : (
          calendars.map((c) => {
            const meta = RESOURCE_PROVIDER_META.calendar[c.provider];
            const count = c.workspaces.length;
            return (
              <div
                key={c.calendarId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                  <meta.Mark className="h-5 w-5" />
                </div>
                <AccountIdentity email={c.email} label={meta.label} server={c.server} />

                <ResourceWorkspacesDialog
                  busy={busy}
                  onRemove={(w) => setConfirmDetach({ calendar: c, workspace: w })}
                  onSetEverywhere={(patch, code) => setAiEverywhere(c.calendarId, patch, code)}
                  onSetPolicy={setPolicy}
                  platform={platform}
                  resourceLabel="This calendar"
                  showPhishing={false}
                  title={c.email}
                  workspaces={c.workspaces}
                >
                  <Button variant="outline" size="sm" disabled={count === 0}>
                    In {count} {count === 1 ? "workspace" : "workspaces"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </ResourceWorkspacesDialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(c)}
                  disabled={busy === c.calendarId}
                  className="text-destructive-text hover:text-destructive-text"
                  aria-label={`Delete calendar for ${c.email}`}
                >
                  {busy === c.calendarId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={confirmDetach !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDetach(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmDetach?.calendar.email} from {confirmDetach?.workspace.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              That workspace loses this calendar along with the visibility choices it had for it.
              The account stays connected and keeps working in your other workspaces.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDetach && detach(confirmDetach.workspace.linkId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the calendar for {confirmDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the calendar from every workspace using it. If you have no mailbox, drive
              or address book on this account either, we disconnect it completely; otherwise it
              stays connected for those, since calendar access can&rsquo;t be removed on its own.
              Your events are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-white")}
              onClick={() => confirmDelete && remove(confirmDelete.calendarId)}
            >
              Remove calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
