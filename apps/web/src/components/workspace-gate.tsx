"use client";

import { cn } from "@metis/ui/lib/utils";
import { Inbox, Sparkles, Workflow } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { getInitials } from "@/lib/utils";
import type { GateDestination, GateWorkspace } from "@/workspace/gate";
import { assistantPath, mailPath, onboardingPath, workflowPath } from "@/workspace/path";

const DESTINATIONS = {
  mail: { title: "Mail", icon: Inbox },
  assistant: { title: "Workspace AI", icon: Sparkles },
  workflow: { title: "Workflows", icon: Workflow },
} as const satisfies Record<GateDestination, unknown>;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function resourceSummary(destination: GateDestination, w: GateWorkspace): string {
  if (destination !== "assistant") {
    return w.mailboxes === 0 ? "no mailboxes" : plural(w.mailboxes, "mailbox", "mailboxes");
  }
  const parts = [
    w.mailboxes > 0 && plural(w.mailboxes, "mailbox", "mailboxes"),
    w.calendars > 0 && plural(w.calendars, "calendar", "calendars"),
    w.drives > 0 && plural(w.drives, "drive", "drives"),
    w.addressBooks > 0 && plural(w.addressBooks, "address book", "address books"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "nothing connected";
}

function destHref(destination: keyof typeof DESTINATIONS, w: GateWorkspace): Route {
  if (destination === "assistant") return assistantPath(w.slug);
  if (destination === "workflow") return workflowPath(w.slug);
  if (w.inboxMailboxSlug) return mailPath(w.slug, w.inboxMailboxSlug, "inbox");
  return onboardingPath(w.slug);
}

export function WorkspaceGate({
  destination,
  currentName,
  currentSlug,
  workspaces,
}: {
  destination: keyof typeof DESTINATIONS;
  currentName: string | null;
  currentSlug: string | null;
  workspaces: GateWorkspace[];
}) {
  const { title, icon: Icon } = DESTINATIONS[destination];
  const needs =
    destination === "assistant"
      ? "no connected mailboxes, calendars, drives or address books"
      : "no connected mailboxes";

  return (
    <main className="flex h-full min-w-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-surface">
          <Icon className="size-5 text-muted-foreground" strokeWidth={1.8} />
        </div>
        <h1 className="mt-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
          Continue to {title}
        </h1>
        <p className="mt-1 text-center text-[13px] text-faint">
          {currentName ? `“${currentName}” has` : "This workspace has"} {needs}. Choose a workspace
          to continue.
        </p>

        <ul className="mt-6 w-full overflow-hidden rounded-xl border border-border bg-surface">
          {workspaces.map((w) => {
            const empty = !w.usable;
            const href = destHref(destination, w);
            return (
              <li key={w.id} className="border-b border-border-soft last:border-b-0">
                {empty ? (
                  <div
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left opacity-45")}
                  >
                    <GateRow w={w} summary={resourceSummary(destination, w)} />
                  </div>
                ) : (
                  <Link
                    href={href}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
                  >
                    <GateRow w={w} summary={resourceSummary(destination, w)} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {currentSlug && (
          <Link
            href={onboardingPath(currentSlug)}
            className="mt-5 text-[12px] font-medium text-primary hover:underline"
          >
            …or connect{" "}
            {destination === "assistant"
              ? "a mailbox, calendar, drive or address book"
              : "a mailbox"}{" "}
            to {currentName ? `“${currentName}”` : "this workspace"}
          </Link>
        )}
      </div>
    </main>
  );
}

function GateRow({ w, summary }: { w: GateWorkspace; summary: string }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-soft text-[11px] font-medium text-primary">
        {w.logo ? (
          // oxlint-disable-next-line nextjs/no-img-element --tiny data-URL logo
          <img src={w.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          getInitials(w.name).slice(0, 2)
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {w.name}
      </span>
      <span className="shrink-0 text-[11px] text-faint">{summary}</span>
    </>
  );
}
