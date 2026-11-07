"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";

import { rpc } from "@/lib/orpc";

import { MemberDetails } from "./member-details";

export function MemberPreview({
  workspaceSlug,
  userId,
  label,
  onClose,
}: {
  workspaceSlug: string;
  userId: string;
  label: string;
  onClose: () => void;
}) {
  const query = useQuery(rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug } }));
  const member = query.data?.members.find((m) => m.userId === userId) ?? null;
  const name = member ? member.name || member.email : label;

  return (
    <aside
      aria-label={`Preview of ${name}`}
      className="flex w-[min(36rem,45%)] min-w-80 shrink-0 flex-col border-l border-border bg-background max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:min-w-0 max-md:border-l-0"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface text-xs font-medium text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground" title={name}>
            {name}
          </p>
          {member && <p className="truncate text-[11px] text-faint">{member.email}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close preview" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {query.isPending ? (
          <div className="flex items-center gap-2 text-[13px] text-faint">
            <Loader2 className="size-3.5 animate-spin" />
            Loading member…
          </div>
        ) : member ? (
          <MemberDetails
            workspaceSlug={workspaceSlug}
            email={member.email}
            role={member.role}
            joinedAt={member.joinedAt}
          />
        ) : (
          <p className="text-[13px] text-faint">This person is not a member of this workspace.</p>
        )}
      </div>
    </aside>
  );
}
