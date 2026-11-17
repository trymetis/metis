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
import { Loader2 } from "lucide-react";

import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { rpc } from "@/lib/orpc";
import type { DashboardMcp } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function McpView() {
  const data: DashboardMcp | null = useSystemData(
    rpc.dashboard.mcp.queryOptions(),
    "Could not load MCP clients",
  );

  const totalCards = [
    { label: "Clients", hint: "Registered", value: data?.total },
    { label: "Enabled", hint: "Allowed to connect", value: data?.enabled },
    { label: "Via CIMD", hint: "Self-registered by URL", value: data?.cimd },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
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
                <span className="text-[28px] leading-none font-medium tracking-tight text-foreground tabular-nums">
                  {number.format(card.value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">All clients</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          Disabling or deleting one happens in its owner&rsquo;s account settings.
        </p>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.clients.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No MCP clients registered.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Hidden workspaces</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tools</TableHead>
                  <TableHead className="text-right">Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clients.map((row) => (
                  <TableRow key={row.clientId}>
                    <TableCell>
                      <span className="text-foreground">{row.label}</span>
                      {row.preset && (
                        <span className="ml-2 font-mono text-[11px] text-faint">{row.preset}</span>
                      )}
                      {row.cimd && (
                        <Badge variant="outline" className="ml-2">
                          CIMD
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-faint tabular-nums">
                      {row.hiddenWorkspaces === 0 ? "None" : number.format(row.hiddenWorkspaces)}
                    </TableCell>
                    <TableCell>
                      {row.enabled ? (
                        <Badge variant="secondary">Enabled</Badge>
                      ) : (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(row.toolsEnabled)}/{number.format(row.toolsTotal)}
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {row.lastUsedAt ? dateTime.format(new Date(row.lastUsedAt)) : "Never"}
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
