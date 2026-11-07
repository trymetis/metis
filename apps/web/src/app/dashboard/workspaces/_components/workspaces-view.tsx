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
import type { DashboardWorkspaces } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

export function WorkspacesView() {
  const data: DashboardWorkspaces | null = useSystemData(
    rpc.dashboard.workspaces.queryOptions(),
    "Could not load workspaces",
  );

  const totalCards = [
    { label: "Workspaces", hint: "All of them", value: data?.total },
    { label: "Shared", hint: "More than one member", value: data?.shared },
    { label: "Personal", hint: "Single member", value: data?.personal },
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
                <span className="font-serif text-[28px] leading-none font-medium tracking-tight text-foreground tabular-nums">
                  {number.format(card.value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">All workspaces</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          Newest first, with what each one has attached.
        </p>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.list.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No workspaces yet.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Mailboxes</TableHead>
                  <TableHead className="text-right">Calendars</TableHead>
                  <TableHead className="text-right">Drives</TableHead>
                  <TableHead className="text-right">Address books</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.list.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="text-foreground">{row.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-faint">/{row.slug}</span>
                    </TableCell>
                    <TableCell>
                      {row.aiPolicy === "disabled" ? (
                        <Badge variant="outline">Off</Badge>
                      ) : (
                        <Badge variant="secondary">{row.aiPolicy}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(row.members)}
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
        </div>
      </section>
    </div>
  );
}
