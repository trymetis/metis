"use client";

import { Button } from "@metis/ui/components/button";
import { ButtonGroup } from "@metis/ui/components/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { cn } from "@metis/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AI_USAGE_FEATURE_LABELS } from "@/ai/usage-features";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { Section } from "@/components/dashboard/system-ui";
import { PageHeader } from "@/components/page-header";
import { rpc } from "@/lib/orpc";
import type { DashboardUsage, DashboardUsageRange } from "@/server/schema";

import { DailyTokensChart, FeatureTokensChart } from "./usage-charts";

const RANGES: { value: DashboardUsageRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const number = new Intl.NumberFormat("en-US");

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-center text-[13px] text-faint">{label}</p>;
}

export function UsageView() {
  const [range, setRange] = useState<DashboardUsageRange>("30d");
  const usage: DashboardUsage | null = useSystemData(
    rpc.dashboard.usage.queryOptions({ input: { range } }),
    "Could not load AI usage",
  );

  const totals = usage?.totals;

  const totalCards = [
    { label: "Calls", value: totals?.calls },
    { label: "Input tokens", value: totals?.inputTokens },
    { label: "Output tokens", value: totals?.outputTokens },
    { label: "Total tokens", value: totals?.totalTokens },
  ];

  return (
    <div>
      <PageHeader
        title="AI usage"
        description="Tokens recorded on every LLM surface, bucketed by UTC day."
        action={
          <ButtonGroup>
            {RANGES.map((r) => (
              <Button
                key={r.value}
                size="sm"
                variant="outline"
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn("text-[13px]", range === r.value && "bg-brand-soft text-primary")}
              >
                {r.label}
              </Button>
            ))}
          </ButtonGroup>
        }
      />

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                <span className="text-[28px] leading-none font-medium tracking-tight text-foreground tabular-nums">
                  {number.format(card.value)}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {[
          { label: "Cached read", value: totals?.cacheReadTokens },
          { label: "Cached write", value: totals?.cacheWriteTokens },
          { label: "Reasoning", value: totals?.reasoningTokens },
        ].map((card) => (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <CardDescription className="text-[11px] text-faint tabular-nums">
                {card.value === undefined ? "—" : `${number.format(card.value)} tokens`}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <Section title="Tokens per day" description="Input and output, stacked.">
          {usage === null ? (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : totals?.calls === 0 ? (
            <Empty label="No AI calls in this range." />
          ) : (
            <div className="chart-surface">
              <DailyTokensChart daily={usage.daily} />
            </div>
          )}
        </Section>

        <Section title="Tokens by feature">
          {usage === null ? (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : usage.byFeature.length === 0 ? (
            <Empty label="No AI calls in this range." />
          ) : (
            <div className="chart-surface">
              <FeatureTokensChart byFeature={usage.byFeature} />
            </div>
          )}
        </Section>

        <Section title="By model">
          {usage === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : usage.byModel.length === 0 ? (
            <Empty label="No models used in this range." />
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.byModel.map((m) => (
                  <TableRow key={`${m.provider}:${m.model}`}>
                    <TableCell className="font-mono text-[12px] text-foreground">
                      {m.model}
                    </TableCell>
                    <TableCell className="text-faint">{m.provider}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(m.calls)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(m.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(m.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {number.format(m.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          )}
        </Section>

        <Section title="Recent calls" description="The last 20 in this range.">
          {usage === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : usage.recent.length === 0 ? (
            <Empty label="No AI calls in this range." />
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Steps</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.recent.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="text-faint">
                      {dateTime.format(new Date(call.createdAt))}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {AI_USAGE_FEATURE_LABELS[call.feature]}
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">{call.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{call.steps}</TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {number.format(call.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          )}
        </Section>
      </div>
    </div>
  );
}
