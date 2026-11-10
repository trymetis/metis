"use client";

import { Badge } from "@metis/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

import { ACCOUNTS_NAV } from "@/components/dashboard/accounts-nav";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { rpc } from "@/lib/orpc";
import type { DashboardAccounts } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function AccountsView() {
  const data: DashboardAccounts | null = useSystemData(
    rpc.dashboard.accounts.queryOptions(),
    "Could not load accounts",
  );

  const totalCards = [
    { label: "Accounts", hint: "On this instance", value: data?.users },
    {
      label: "With 2FA",
      hint: "Second factor enabled",
      value: data?.withTwoFactor,
    },
    { label: "Banned", hint: "Can't sign in", value: data?.banned },
    {
      label: "Account invites",
      hint: "Pending, unexpired",
      value: data?.pendingSignupInvites,
    },
    {
      label: "Workspace invites",
      hint: "Pending, unexpired",
      value: data?.pendingWorkspaceInvites,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {ACCOUNTS_NAV.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-hover"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {label}
              </span>
              <span className="text-[12px] text-muted-foreground">{description}</span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {totalCards.map((card) => (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <CardDescription className="text-[11px] text-faint">{card.hint}</CardDescription>
            </CardHeader>
            <CardContent>
              {card.value === undefined ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              ) : (
                <span className="font-serif text-[28px] leading-none font-medium tracking-tight text-foreground tabular-nums">
                  {number.format(card.value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Newest accounts</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          The last {data?.recentUsers.length ?? 10} to sign up.
        </p>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.recentUsers.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No accounts yet.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentUsers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-foreground">{row.name}</TableCell>
                    <TableCell className="font-mono text-[12px]">{row.email}</TableCell>
                    <TableCell>
                      {row.twoFactorEnabled ? (
                        <Badge variant="secondary">Enabled</Badge>
                      ) : (
                        <Badge variant="destructive">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {dateTime.format(new Date(row.createdAt))}
                    </TableCell>
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
