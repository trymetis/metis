"use client";

import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { keepPreviousData } from "@tanstack/react-query";
import { Loader2, Mail, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { ALL, FilterSelect, orUndefined } from "@/components/dashboard/filter-select";
import { RoleBadge } from "@/components/dashboard/role-badge";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { InviteLinks } from "@/components/invite-rows";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import {
  DASHBOARD_INVITE_ROLES,
  DASHBOARD_INVITE_STATUSES,
  type DashboardInvitesInput,
} from "@/server/schema";
import {
  canGrantInstanceRole,
  type GrantedInstanceRole,
  type InstanceRole,
} from "@/types/instance-role";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type InviteRole = (typeof DASHBOARD_INVITE_ROLES)[number];
type InviteStatus = (typeof DASHBOARD_INVITE_STATUSES)[number];

const INVITE_ROLE_LABELS: Record<InviteRole, string> = {
  none: "No role",
  observer: "Observer",
  admin: "Admin",
};

const ROLE_FILTERS: { value: InviteRole | typeof ALL; label: string }[] = [
  { value: ALL, label: "All roles" },
  ...DASHBOARD_INVITE_ROLES.map((role) => ({ value: role, label: INVITE_ROLE_LABELS[role] })),
];

const STATUS_FILTERS: { value: InviteStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "expired", label: "Expired" },
];

function grantedOf(role: InviteRole): GrantedInstanceRole | null {
  return role === "none" ? null : role;
}

function refresh() {
  return refreshQueries(rpc.dashboard.invites.list.key());
}

function InviteForm({
  actor,
  onInvited,
}: {
  actor: InstanceRole | null;
  onInvited: (link: { email: string; link: string } | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("none");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const items = DASHBOARD_INVITE_ROLES.filter(
    (item) => actor !== null && canGrantInstanceRole(actor, grantedOf(item)),
  ).map((item) => ({ value: item, label: INVITE_ROLE_LABELS[item] }));

  async function send(code?: string) {
    const sent = await orpc.dashboard.invites.create({
      email,
      instanceRole: grantedOf(role),
      code,
    });
    setEmail("");
    setRole("none");
    await refresh();
    if (sent.link) {
      onInvited({ email: sent.invite.email, link: sent.link });
    } else {
      onInvited(null);
      toast.success(`Invite sent to ${sent.invite.email}`);
    }
  }

  async function sendWithoutRole() {
    setSending(true);
    try {
      await send();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invite");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-[13px] font-medium text-foreground">Invite someone</h2>
      <p className="mt-0.5 text-[11px] text-faint">
        Emails a link to create an account. The account also gets its own workspace.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!email.trim()) return;
          if (role === "none") void sendWithoutRole();
          else setConfirming(true);
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@example.com"
          aria-label="Invite email"
          className="min-w-0 flex-1 basis-56"
        />
        <Select
          items={items}
          value={role}
          onValueChange={(value) => {
            const picked = items.find((item) => item.value === value);
            if (picked) setRole(picked.value);
          }}
        >
          <SelectTrigger className="w-32" aria-label="Instance role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!email.trim() || sending}>
          <Mail strokeWidth={1.75} />
          Invite
        </Button>
      </form>
      <TotpConfirmDialog
        open={confirming}
        title="Send invite"
        body={`Enter your authenticator code to invite ${email.trim()} as an instance ${INVITE_ROLE_LABELS[role].toLowerCase()}.`}
        confirmLabel="Send invite"
        onOpenChange={setConfirming}
        onConfirm={(code) => send(code)}
      />
    </section>
  );
}

export function InvitesView() {
  const { role: actor, canOperate } = useDashboardRole();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<InviteRole | typeof ALL>(ALL);
  const [status, setStatus] = useState<InviteStatus | typeof ALL>(ALL);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const filter: DashboardInvitesInput = {
    search: deferredSearch || undefined,
    role: orUndefined(role),
    status: orUndefined(status),
  };
  const data = useSystemData(
    rpc.dashboard.invites.list.queryOptions({ input: filter, placeholderData: keepPreviousData }),
    "Could not load invites",
  );

  async function revoke(inviteId: string) {
    setBusy(inviteId);
    try {
      await orpc.dashboard.invites.revoke({ inviteId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the invite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {canOperate && <InviteForm actor={actor} onInvited={setLink} />}
      {link && <InviteLinks links={[link]} />}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Pending account invites</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          Invites expire after 7 days. Workspace invites are under each workspace&apos;s Members.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-faint"
              strokeWidth={1.75}
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by email"
              aria-label="Search invites"
              className="h-8 pl-8"
            />
          </div>
          <FilterSelect label="Role" value={role} items={ROLE_FILTERS} onChange={setRole} />
          <FilterSelect label="Status" value={status} items={STATUS_FILTERS} onChange={setStatus} />
        </div>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.invites.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No invites match.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>Expires</TableHead>
                  {canOperate && <TableHead className="text-right" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-mono text-[12px]">{invite.email}</TableCell>
                    <TableCell>
                      {invite.instanceRole ? (
                        <RoleBadge role={invite.instanceRole} />
                      ) : (
                        <span className="text-faint">{INVITE_ROLE_LABELS.none}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-faint">
                      {invite.invitedBy ?? "Deleted account"}
                    </TableCell>
                    <TableCell className="text-faint">
                      {invite.expired ? (
                        <Badge variant="outline">Expired</Badge>
                      ) : (
                        dateTime.format(new Date(invite.expiresAt))
                      )}
                    </TableCell>
                    {canOperate && (
                      <TableCell className="text-right">
                        {actor && canGrantInstanceRole(actor, invite.instanceRole) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Revoke the invite for ${invite.email}`}
                            disabled={busy === invite.id}
                            onClick={() => void revoke(invite.id)}
                          >
                            <Trash2 strokeWidth={1.75} />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          )}
        </div>
      </section>
    </div>
  );
}
