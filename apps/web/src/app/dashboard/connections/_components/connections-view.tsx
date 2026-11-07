"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@metis/ui/components/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { cn } from "@metis/ui/lib/utils";
import { Loader2 } from "lucide-react";

import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { ACCOUNT_PROVIDER_META } from "@/components/provider-meta";
import { CONNECTION_PROVIDERS } from "@/connections/types";
import { isOneOf } from "@/lib/guards";
import { rpc } from "@/lib/orpc";
import type { DashboardConnections } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-[11px] text-faint">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-center text-[13px] text-faint">{label}</p>;
}

function Pending() {
  return (
    <div className="py-6 text-center">
      <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
    </div>
  );
}

function ProviderCell({ provider }: { provider: string }) {
  if (!isOneOf(CONNECTION_PROVIDERS, provider)) return <span>{provider}</span>;
  const { label, Mark } = ACCOUNT_PROVIDER_META[provider];
  return (
    <span className="flex items-center gap-2 text-foreground">
      <Mark className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

export function ConnectionsView() {
  const data: DashboardConnections | null = useSystemData(
    rpc.dashboard.connections.queryOptions(),
    "Could not load connections",
  );

  const totalCards = [
    { label: "Grants", value: data?.total, alert: false },
    {
      label: "Quarantined",
      value: data?.quarantined,
      alert: (data?.quarantined ?? 0) > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {totalCards.map((card) => (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {card.value === undefined ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              ) : (
                <span
                  className={cn(
                    "font-serif text-[28px] leading-none font-medium tracking-tight tabular-nums",
                    card.alert ? "text-destructive-text" : "text-foreground",
                  )}
                >
                  {number.format(card.value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Section
        title="By provider"
        description="Grants and the mailboxes, calendars, drives and address books they carry."
      >
        {data === null ? (
          <Pending />
        ) : data.byProvider.length === 0 ? (
          <Empty label="No connections yet." />
        ) : (
          <ScrollTable className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Grants</TableHead>
                <TableHead className="text-right">Mailboxes</TableHead>
                <TableHead className="text-right">Calendars</TableHead>
                <TableHead className="text-right">Drives</TableHead>
                <TableHead className="text-right">Address books</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProvider.map((row) => (
                <TableRow key={row.provider}>
                  <TableCell>
                    <ProviderCell provider={row.provider} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(row.connections)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(row.mailboxes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(row.calendars)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(row.drives)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(row.addressBooks)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
      </Section>

      <Section
        title="Quarantined"
        description="Grants whose provider is no longer configured. They come back when the config does."
      >
        {data === null ? (
          <Pending />
        ) : data.quarantinedList.length === 0 ? (
          <Empty label="Nothing is quarantined." />
        ) : (
          <ScrollTable className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quarantinedList.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    {row.email}
                  </TableCell>
                  <TableCell>
                    <ProviderCell provider={row.provider} />
                  </TableCell>
                  <TableCell className="text-right text-faint">
                    {dateTime.format(new Date(row.quarantinedAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ScrollTable>
        )}
      </Section>
    </div>
  );
}
