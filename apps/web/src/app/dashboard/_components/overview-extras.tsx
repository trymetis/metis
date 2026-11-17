"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import { cn } from "@metis/ui/lib/utils";
import { areaY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { AlertTriangle, Clock, Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useSystemData } from "@/components/dashboard/system-client";
import { rpc } from "@/lib/orpc";
import type { DashboardOverview } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

function TokenSparkline({ tokens7d }: { tokens7d: DashboardOverview["tokens7d"] }) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(tokens7d, {
            id: "tokens-sparkline",
            x: "date",
            y: "totalTokens",
            fill: "var(--chart-1)",
            fillOpacity: 0.2,
            stroke: "var(--chart-1)",
            strokeWidth: 1.5,
          }),
        ],
        scales: {
          x: { scale: scalePoint, axis: false },
          y: { scale: scaleLinear, axis: false },
        },
        margin: 2,
        theme: { background: "transparent" },
        focus: false,
      }),
    [tokens7d],
  );

  return (
    <Chart
      definition={definition}
      height={56}
      initialWidth={480}
      ariaLabel="Total AI tokens over the last 7 days"
    />
  );
}

export function OverviewExtras() {
  const overview: DashboardOverview | null = useSystemData(
    rpc.dashboard.overview.queryOptions(),
    "Could not load the overview",
  );

  const healthCards: {
    label: string;
    hint: string;
    icon: LucideIcon;
    value: number | undefined;
    alert: boolean;
  }[] = [
    {
      label: "Quarantined connections",
      hint: "Grants whose provider left the config",
      icon: AlertTriangle,
      value: overview?.quarantinedConnections,
      alert: (overview?.quarantinedConnections ?? 0) > 0,
    },
    {
      label: "Scheduled mail pending",
      hint:
        overview === null
          ? "Snoozes and sends waiting on the scheduler"
          : `${number.format(overview.scheduledOverdue)} overdue`,
      icon: Clock,
      value: overview?.scheduledPending,
      alert: (overview?.scheduledOverdue ?? 0) > 0,
    },
    {
      label: "Scheduled mail failed",
      hint: "Rows the scheduler gave up on",
      icon: AlertTriangle,
      value: overview?.scheduledFailed,
      alert: (overview?.scheduledFailed ?? 0) > 0,
    },
  ];

  const tokens7dTotal = overview?.tokens7d.reduce((acc, d) => acc + d.totalTokens, 0);

  return (
    <>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {healthCards.map(({ label, hint, icon: Icon, value, alert }) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
              </CardTitle>
              <CardDescription className="text-[11px] text-faint">{hint}</CardDescription>
            </CardHeader>
            <CardContent>
              {value === undefined ? (
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
              ) : (
                <span
                  className={cn(
                    "text-[28px] leading-none font-medium tracking-tight tabular-nums",
                    alert ? "text-destructive-text" : "text-foreground",
                  )}
                >
                  {number.format(value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[13px] font-medium text-foreground">AI tokens, last 7 days</h2>
            <p className="mt-0.5 text-[11px] text-faint">
              {tokens7dTotal === undefined
                ? "Every LLM surface, bucketed by UTC day."
                : `${number.format(tokens7dTotal)} tokens total`}
            </p>
          </div>
          <Link
            href="/dashboard/usage"
            className="text-[13px] text-faint transition-colors hover:text-muted-foreground"
          >
            Full usage
          </Link>
        </div>
        <div className="mt-3">
          {overview === null ? (
            <div className="flex h-[56px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : (
            <div className="chart-surface">
              <TokenSparkline tokens7d={overview.tokens7d} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
