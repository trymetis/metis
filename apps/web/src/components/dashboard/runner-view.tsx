"use client";

import { rpc } from "@/lib/orpc";
import type { DashboardSystemRunner, SystemTone } from "@/server/schema";

import { ConfigForm } from "./config-form";
import { GuardedLink } from "./guarded-link";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Mono, Note, Row, Rows, Section, Sections, ToneBadge } from "./system-ui";

const load = rpc.dashboard.system.runner.queryOptions();

const STATUS: Record<
  DashboardSystemRunner["status"]["status"],
  { tone: SystemTone; label: string }
> = {
  never: { tone: "danger", label: "Never ticked" },
  failing: { tone: "danger", label: "Failing" },
  delayed: { tone: "warning", label: "Delayed" },
  busy: { tone: "ok", label: "Busy" },
  idle: { tone: "ok", label: "Idle" },
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "never";
}

export function RunnerView() {
  const [runner, reload] = useSystemResource(load);
  if (!runner) return <Loading />;

  const { status } = runner;
  const badge = STATUS[status.status];

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "runner" }}
        hint="Derived from the database, so it reads the same whichever driver ticks."
      />

      <Section
        title="Status"
        hint="From the last ticks recorded in the database."
        badge={<ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>}
      >
        <Rows>
          <Row label="Last tick">
            <Mono>{when(status.lastTickAt)}</Mono>
          </Row>
          <Row label="Last success">
            <Mono>{when(status.lastSuccessAt)}</Mono>
          </Row>
          {status.lastError && (
            <Row label="Last error">
              <Mono>{status.lastError}</Mono>
            </Row>
          )}
          <Row label="Due runs">
            <Mono>{status.backlog}</Mono>
          </Row>
          <Row label="Due triggers">
            <Mono>{status.dueTriggers}</Mono>
          </Row>
        </Rows>
        <Note>
          Runs, retries and the scheduled queue are on{" "}
          <GuardedLink href="/dashboard/automation" className="underline-offset-4 hover:underline">
            Automation
          </GuardedLink>
          .
        </Note>
      </Section>

      <ConfigForm
        config={runner.config}
        onSaved={reload}
        cards={{
          workflowRunner: {
            hint: "The driver decides what wakes the runner. Before switching, start the processes the new driver needs: a scheduler for cron, Redis and the worker for BullMQ. The rest sets how much each tick does.",
          },
        }}
      />
    </Sections>
  );
}
