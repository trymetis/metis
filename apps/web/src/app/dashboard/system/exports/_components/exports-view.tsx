"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { cn } from "@metis/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Loading, useSystemData } from "@/components/dashboard/system-client";
import { Note, Section, Sections } from "@/components/dashboard/system-ui";
import { rpc } from "@/lib/orpc";
import { formatBytes } from "@/lib/utils";
import type { DashboardExport } from "@/server/schema";
import type { ExportLocationKind } from "@/types/export";

const LOCATION_LABEL: Record<ExportLocationKind, string> = {
  instance: "On the server",
  local: "On a computer",
  s3: "In S3",
};

function when(value: string | null): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

function Detail({
  label,
  value,
  note,
  copy,
}: {
  label: string;
  value: string | null;
  note?: string;
  copy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12px]">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn("min-w-0 truncate", value ? "text-foreground" : "text-faint")}
          title={value ?? undefined}
        >
          {value ?? "Not recorded"}
        </span>
        {note && <span className="shrink-0 text-faint">{note}</span>}
        {copy && value && (
          <CopyButton value={value} label={`Copy ${label}`} className="size-6 shrink-0" />
        )}
      </dd>
    </div>
  );
}

function ExportRow({ entry }: { entry: DashboardExport }) {
  const [open, setOpen] = useState(false);
  const where = [...new Set(entry.locations.map((location) => LOCATION_LABEL[location.kind]))];
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border last:border-b-0"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] text-foreground">
            {new Date(entry.createdAt).toLocaleString()} · {entry.appVersion} ·{" "}
            {formatBytes(entry.size)}
          </span>
          <span className="truncate text-[12px] text-faint">
            {entry.fileName} · {where.join(", ")}
          </span>
        </span>
        <ChevronRight
          className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="px-1 pb-3">
          <Detail label="SHA-256" value={entry.sha256} copy />
          <Detail label="Migration" value={entry.migration} copy />
          <Detail label="From" value={entry.instanceUrl} copy />
          <Detail label="Maintenance since" value={when(entry.maintenanceSince)} />
          {entry.locations.map((location) => (
            <div key={`${location.kind}:${location.location}`}>
              <Detail label={LOCATION_LABEL[location.kind]} value={location.location} copy />
              {location.host && <Detail label="Host" value={location.host} copy />}
              {location.endpoint && <Detail label="Endpoint" value={location.endpoint} copy />}
            </div>
          ))}
          {entry.recipients.map((recipient) => (
            <Detail
              key={recipient.fingerprint}
              label="Recipient"
              value={recipient.fingerprint}
              note={recipient.passphrase ? "passphrase key" : undefined}
              copy
            />
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ExportsView() {
  const data = useSystemData(
    rpc.dashboard.system.exports.queryOptions(),
    "Could not load the exports",
  );
  if (data === null) return <Loading />;
  return (
    <Sections>
      <Section
        title="Exports"
        hint="Newest first. The metis CLI records each export when it makes it: sudo metis db export on a server, or metis db export --env-file from any machine."
      >
        {data.exports.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No exports yet.</p>
        ) : (
          <ul aria-label="Exports" className="flex flex-col">
            {data.exports.map((entry) => (
              <li key={entry.id} className="border-b border-border last:border-b-0">
                <ExportRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
        <Note>
          These are the places each archive was written. Metis does not check that a file is still
          there, and an archive kept on the server&apos;s own disk does not survive losing that
          disk.
        </Note>
      </Section>
    </Sections>
  );
}
