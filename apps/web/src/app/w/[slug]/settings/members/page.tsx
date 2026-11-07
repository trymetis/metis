"use client";

import { Button } from "@metis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

import { useMemberAdmin } from "@/components/members/member-admin";
import { PageHeader } from "@/components/page-header";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";

import { InviteMembersDialog } from "./_components/invite-members-dialog";

const ROLE_ITEMS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
] as const;

export default function WorkspaceMembersPage() {
  const workspaceSlug = useWorkspaceSlug();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.slug === workspaceSlug);
  const access = useWorkspaceAccess();
  const isAdmin = access.role === "owner" || access.role === "admin";
  const membersOptions = rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug } });
  const query = useQuery(membersOptions);
  const members = query.data ? query.data.members : query.isError ? [] : null;
  const invites = query.data?.pendingInvites ?? [];

  async function load() {
    await refreshQuery(membersOptions.queryKey);
  }

  const admin = useMemberAdmin({
    workspaceSlug,
    workspaceName: workspace?.name ?? "this workspace",
    role: access.role,
    selfUserId: access.userId,
    onChange: load,
  });

  return (
    <div>
      <PageHeader
        title="Members"
        description={`Everyone in ${workspace?.name ?? "this workspace"}.`}
        action={
          isAdmin &&
          workspace && (
            <InviteMembersDialog
              workspaceSlug={workspaceSlug}
              workspaceName={workspace.name}
              onInvited={load}
            />
          )
        }
      />

      {query.isError && (
        <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {query.error.message || "Could not load members"}
        </p>
      )}
      {admin.error && <p className="mt-4 text-xs text-destructive-text">{admin.error}</p>}

      {members === null ? (
        <div className="mt-8 flex items-center gap-2 text-[13px] text-faint">
          <Loader2 className="size-3.5 animate-spin" />
          Loading members…
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2" aria-label="Members">
          {members.map((m) => {
            const busy = admin.busy === m.memberId;
            return (
              <li
                key={m.memberId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface text-xs font-medium text-muted-foreground">
                  {(m.name || m.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.name || m.email}
                  </p>
                  <p className="truncate text-xs text-faint">
                    {m.email} · joined {new Date(m.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                {admin.canChangeRole(m) ? (
                  <Select
                    items={[...ROLE_ITEMS]}
                    value={m.role}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (value === "admin" || value === "member") admin.setRole(m, value);
                    }}
                  >
                    <SelectTrigger className="w-28" aria-label={`Role of ${m.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ROLE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[1px] text-muted-foreground">
                    {m.role}
                  </span>
                )}
                {admin.canTransfer(m) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => admin.transfer(m)}
                  >
                    Transfer ownership
                  </Button>
                )}
                {admin.canRemove(m) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    onClick={() => admin.remove(m)}
                    className="text-faint hover:bg-destructive/10 hover:text-destructive-text"
                    aria-label={`Remove ${m.email} from the workspace`}
                  >
                    {busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && invites.length > 0 && (
        <>
          <h2 className="mt-8 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
            Pending invites
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5" aria-label="Pending invites">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs"
              >
                <span className="text-muted-foreground">
                  {i.email} <span className="text-faint">· {i.role}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-faint">
                    expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={admin.busy === i.id}
                    onClick={() => admin.revoke(i)}
                    className="text-faint hover:bg-destructive/10 hover:text-destructive-text"
                    aria-label={`Revoke invite to ${i.email}`}
                  >
                    {admin.busy === i.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {admin.dialogs}
    </div>
  );
}
