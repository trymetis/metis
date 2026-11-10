"use client";

import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@metis/ui/components/field";
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
import { Textarea } from "@metis/ui/components/textarea";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Ban,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserCog,
  UserMinus,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { ALL, FilterSelect, orUndefined } from "@/components/dashboard/filter-select";
import { RoleBadge } from "@/components/dashboard/role-badge";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import {
  DASHBOARD_TWO_FACTOR_FILTERS,
  DASHBOARD_USER_STATUSES,
  type DashboardUser,
  type DashboardUsersInput,
} from "@/server/schema";
import { BAN_DURATION_LABELS, BAN_DURATIONS, BAN_REASON_MAX, type BanDuration } from "@/types/ban";
import {
  ASSIGNABLE_USER_ROLES,
  type AssignableUserRole,
  canGrantInstanceRole,
  canManageUser,
  grantedRoleOf,
  type InstanceRole,
  USER_ROLE_LABELS,
  USER_ROLES,
  type UserRole,
} from "@/types/instance-role";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type UserStatus = (typeof DASHBOARD_USER_STATUSES)[number];
type TwoFactorFilter = (typeof DASHBOARD_TWO_FACTOR_FILTERS)[number];

const ROLE_FILTERS: { value: UserRole | typeof ALL; label: string }[] = [
  { value: ALL, label: "All roles" },
  ...USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] })),
];

const STATUS_FILTERS: { value: UserStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Any status" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
];

const TWO_FACTOR_FILTERS: { value: TwoFactorFilter | typeof ALL; label: string }[] = [
  { value: ALL, label: "Any 2FA" },
  { value: "on", label: "2FA on" },
  { value: "off", label: "2FA off" },
];

const DURATION_ITEMS = BAN_DURATIONS.map((duration) => ({
  value: duration,
  label: BAN_DURATION_LABELS[duration],
}));

function refresh() {
  return refreshQueries(rpc.dashboard.users.list.key());
}

function roleChoices(actor: InstanceRole | null): AssignableUserRole[] {
  return ASSIGNABLE_USER_ROLES.filter(
    (role) => actor !== null && canGrantInstanceRole(actor, grantedRoleOf(role)),
  );
}

function StatusBadge({ user }: { user: DashboardUser }) {
  if (!user.banned) return <span className="text-faint">Active</span>;
  return (
    <Badge variant="destructive">
      {user.banExpiresAt
        ? `Banned until ${dateTime.format(new Date(user.banExpiresAt))}`
        : "Banned"}
    </Badge>
  );
}

function RowMenu({
  user,
  actor,
  onRole,
  onBan,
  onUnban,
  onRemove,
}: {
  user: DashboardUser;
  actor: InstanceRole | null;
  onRole: (role: AssignableUserRole) => void;
  onBan: () => void;
  onUnban: () => void;
  onRemove: () => void;
}) {
  const choices = roleChoices(actor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserCog strokeWidth={1.75} />
            Change role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={user.role}
              onValueChange={(value: UserRole) => {
                const picked = choices.find((role) => role === value);
                if (picked && picked !== user.role) onRole(picked);
              }}
            >
              {choices.map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {USER_ROLE_LABELS[role]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {user.banned ? (
          <DropdownMenuItem onClick={onUnban}>
            <ShieldCheck strokeWidth={1.75} />
            Unban
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onBan}>
            <Ban strokeWidth={1.75} />
            Ban…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <UserMinus strokeWidth={1.75} />
          Remove…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BanDialog({ user, onClose }: { user: DashboardUser | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<BanDuration>("permanent");

  return (
    <TotpConfirmDialog
      open={user !== null}
      title="Ban user"
      body={
        user
          ? `Sign ${user.email} out everywhere within 2 minutes and stop them signing in, their MCP clients and the workflows that run as them. What they linked to workspaces stays linked. Enter your authenticator code to confirm.`
          : ""
      }
      confirmLabel="Ban user"
      onOpenChange={(open) => {
        if (open) return;
        setReason("");
        setDuration("permanent");
        onClose();
      }}
      onConfirm={async (code) => {
        if (!user) return;
        await orpc.dashboard.users.ban({
          userId: user.id,
          reason: reason.trim() || undefined,
          duration,
          code,
        });
        toast.success(`Banned ${user.email}. They're signed out everywhere within 2 minutes.`);
        await refresh();
      }}
    >
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="ban-duration">Duration</FieldLabel>
          <Select
            items={DURATION_ITEMS}
            value={duration}
            onValueChange={(value) => {
              const picked = DURATION_ITEMS.find((item) => item.value === value);
              if (picked) setDuration(picked.value);
            }}
          >
            <SelectTrigger id="ban-duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DURATION_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ban-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="ban-reason"
            value={reason}
            maxLength={BAN_REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Shown in the audit log"
          />
        </Field>
      </div>
    </TotpConfirmDialog>
  );
}

export function UsersView() {
  const { role: actor, canOperate } = useDashboardRole();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | typeof ALL>(ALL);
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [twoFactor, setTwoFactor] = useState<TwoFactorFilter | typeof ALL>(ALL);
  const deferredSearch = useDeferredValue(search.trim());
  const filter: DashboardUsersInput = {
    search: deferredSearch || undefined,
    role: orUndefined(role),
    status: orUndefined(status),
    twoFactor: orUndefined(twoFactor),
  };
  const data = useSystemData(
    rpc.dashboard.users.list.queryOptions({ input: filter, placeholderData: keepPreviousData }),
    "Could not load users",
  );
  const [roleChange, setRoleChange] = useState<{
    user: DashboardUser;
    role: AssignableUserRole;
  } | null>(null);
  const [banning, setBanning] = useState<DashboardUser | null>(null);
  const [unbanning, setUnbanning] = useState<DashboardUser | null>(null);
  const [removing, setRemoving] = useState<DashboardUser | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Accounts</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          Instance roles reach the dashboard only, never anyone&apos;s mail, calendars, drives or
          contacts. The owner is set by METIS_OWNER_EMAIL.
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
              placeholder="Search by name or email"
              aria-label="Search users"
              className="h-8 pl-8"
            />
          </div>
          <FilterSelect label="Role" value={role} items={ROLE_FILTERS} onChange={setRole} />
          <FilterSelect label="Status" value={status} items={STATUS_FILTERS} onChange={setStatus} />
          <FilterSelect
            label="Two-factor"
            value={twoFactor}
            items={TWO_FACTOR_FILTERS}
            onChange={setTwoFactor}
          />
        </div>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.users.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No users match.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Workspaces owned</TableHead>
                  {canOperate && <TableHead className="text-right" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => {
                  const editable =
                    canOperate &&
                    user.role !== "owner" &&
                    canManageUser(actor, user.role === "user" ? null : user.role);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="text-foreground">
                        {user.name}
                        {!user.twoFactorEnabled && (
                          <Badge variant="destructive" className="ml-2">
                            No 2FA
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[12px]">{user.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge user={user} />
                      </TableCell>
                      <TableCell className="text-faint">
                        {dateTime.format(new Date(user.createdAt))}
                      </TableCell>
                      <TableCell className="text-faint">
                        {user.lastSignInAt ? dateTime.format(new Date(user.lastSignInAt)) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {user.workspacesOwned}
                      </TableCell>
                      {canOperate && (
                        <TableCell className="text-right">
                          {editable && (
                            <RowMenu
                              user={user}
                              actor={actor}
                              onRole={(next) => setRoleChange({ user, role: next })}
                              onBan={() => setBanning(user)}
                              onUnban={() => setUnbanning(user)}
                              onRemove={() => setRemoving(user)}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </ScrollTable>
          )}
        </div>
      </section>

      <TotpConfirmDialog
        open={roleChange !== null}
        title="Change instance role"
        body={
          roleChange
            ? roleChange.role === "user"
              ? `Make ${roleChange.user.email} a plain user, so they no longer reach the dashboard. Enter your authenticator code to confirm.`
              : `Make ${roleChange.user.email} an instance ${USER_ROLE_LABELS[roleChange.role].toLowerCase()}. Enter your authenticator code to confirm.`
            : ""
        }
        confirmLabel="Change role"
        onOpenChange={(open) => {
          if (!open) setRoleChange(null);
        }}
        onConfirm={async (code) => {
          if (!roleChange) return;
          await orpc.dashboard.users.setRole({
            userId: roleChange.user.id,
            role: roleChange.role,
            code,
          });
          await refresh();
        }}
      />

      <BanDialog user={banning} onClose={() => setBanning(null)} />

      <TotpConfirmDialog
        open={unbanning !== null}
        title="Unban user"
        body={
          unbanning
            ? `Let ${unbanning.email} sign in again. Their MCP clients and workflows work again too. Enter your authenticator code to confirm.`
            : ""
        }
        confirmLabel="Unban user"
        onOpenChange={(open) => {
          if (!open) setUnbanning(null);
        }}
        onConfirm={async (code) => {
          if (!unbanning) return;
          await orpc.dashboard.users.unban({ userId: unbanning.id, code });
          toast.success(`Unbanned ${unbanning.email}`);
          await refresh();
        }}
      />

      <TotpConfirmDialog
        open={removing !== null}
        title="Remove user"
        body={
          removing
            ? `Delete ${removing.email}'s account, their workspaces that have no other members, and their connected accounts. Workspaces they share with others must be transferred first. This can't be undone.`
            : ""
        }
        confirmLabel="Remove user"
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        onConfirm={async (code) => {
          if (!removing) return;
          await orpc.dashboard.users.remove({ userId: removing.id, code });
          toast.success(`Removed ${removing.email}`);
          await refresh();
        }}
      />
    </div>
  );
}
