"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { Loading } from "@/components/dashboard/system-client";
import { Count, Note, Section, Sections, ToneBadge } from "@/components/dashboard/system-ui";
import { acknowledgePreflight, preflightQuery } from "@/store/preflight-store";
import { PREFLIGHT_WARNING_KINDS, PREFLIGHT_WARNING_LABELS } from "@/types/preflight";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function PreflightView() {
  const query = useQuery(preflightQuery);
  const data = query.data;
  const acknowledge = acknowledgePreflight;
  const { canOperate } = useDashboardRole();
  const [acknowledging, setAcknowledging] = useState(false);

  const loadError = query.error;
  useEffect(() => {
    if (loadError) toast.error(loadError.message || "Could not load deploy checks");
  }, [loadError]);

  if (!data) return <Loading />;

  const run = data.run;
  if (!run) {
    return (
      <Sections>
        <Section title="No preflight run yet">
          <Note>Preflight records its warnings here on every deploy. Run it once to see them.</Note>
        </Section>
      </Sections>
    );
  }

  const stale = data.currentVersion !== run.configVersion;
  const groups = PREFLIGHT_WARNING_KINDS.map((kind) => ({
    kind,
    messages: run.warnings
      .filter((warning) => warning.kind === kind)
      .map((warning) => warning.message),
  })).filter((group) => group.messages.length > 0);

  async function onAcknowledge(id: number) {
    setAcknowledging(true);
    try {
      await acknowledge(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not acknowledge the run");
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <Sections>
      <Section
        title="Last run"
        description={`Ran ${dateTime.format(new Date(run.ranAt))} against configuration version ${run.configVersion}.`}
        badge={
          run.warnings.length === 0 ? (
            <ToneBadge tone="ok">No warnings</ToneBadge>
          ) : run.acknowledgedAt ? (
            <ToneBadge tone="neutral">
              Acknowledged
              {run.acknowledgedBy ? ` by ${run.acknowledgedBy.name}` : ""}
            </ToneBadge>
          ) : !canOperate ? (
            <ToneBadge tone="warning">Not acknowledged</ToneBadge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={acknowledging}
              onClick={() => onAcknowledge(run.id)}
            >
              <Check strokeWidth={1.75} />
              Acknowledge
            </Button>
          )
        }
      >
        <p className="text-[13px] text-muted-foreground">
          {run.warnings.length === 0
            ? "The last deploy reported nothing to fix."
            : `${run.warnings.length} warning${run.warnings.length === 1 ? "" : "s"} from the last deploy.`}
        </p>
        {stale && (
          <Note>
            The configuration has changed since this run (it is now version {data.currentVersion}),
            so some of these may no longer apply. The next deploy checks again.
          </Note>
        )}
      </Section>
      {groups.map((group) => (
        <Section
          key={group.kind}
          title={PREFLIGHT_WARNING_LABELS[group.kind]}
          badge={<Count value={group.messages.length} singular="warning" plural="warnings" />}
        >
          <ul className="flex flex-col divide-y divide-border">
            {group.messages.map((message, index) => (
              <li
                // oxlint-disable-next-line react/no-array-index-key --messages can repeat
                key={index}
                className="py-2 text-[13px] text-foreground first:pt-0 last:pb-0"
              >
                {message}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </Sections>
  );
}
