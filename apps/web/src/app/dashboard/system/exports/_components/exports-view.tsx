"use client";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";

import { ScrollTable } from "@/components/dashboard/scroll-table";
import { Loading, useSystemData } from "@/components/dashboard/system-client";
import { Mono, Note, Section, Sections } from "@/components/dashboard/system-ui";
import { rpc } from "@/lib/orpc";
import { formatBytes } from "@/lib/utils";
import type { DashboardExport } from "@/server/schema";
import type { ExportLocationKind } from "@/types/export";

const LOCATION_LABEL: Record<ExportLocationKind, string> = {
  instance: "On the server",
  local: "On a computer",
  s3: "In S3",
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function Small({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-faint">{children}</span>;
}

function ExportRow({ entry }: { entry: DashboardExport }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span>{when(entry.createdAt)}</span>
          <Small>From {entry.instanceUrl}</Small>
          <Small>Maintenance since {when(entry.maintenanceSince)}</Small>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <Mono>{entry.appVersion}</Mono>
          <Small>{entry.migration}</Small>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <Mono>{entry.fileName}</Mono>
          <Small>
            {formatBytes(entry.size)} · SHA-256 {entry.sha256.slice(0, 12)}…
          </Small>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {entry.locations.map((location) => (
            <div key={`${location.kind}:${location.location}`} className="flex flex-col">
              <span>{LOCATION_LABEL[location.kind]}</span>
              <Mono>{location.location}</Mono>
              {location.host && <Small>Host {location.host}</Small>}
              {location.endpoint && <Small>Endpoint {location.endpoint}</Small>}
            </div>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          {entry.recipients.map((recipient) => (
            <Mono key={recipient.fingerprint}>
              {recipient.fingerprint}
              {recipient.passphrase ? " (passphrase)" : ""}
            </Mono>
          ))}
        </div>
      </TableCell>
    </TableRow>
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
        description="Newest first. The metis CLI records each export when it makes it: sudo metis db export on a server, or metis db export --env-file from any machine."
      >
        {data.exports.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No exports yet.</p>
        ) : (
          <ScrollTable className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Metis version</TableHead>
                <TableHead>Archive</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.exports.map((entry) => (
                <ExportRow key={entry.id} entry={entry} />
              ))}
            </TableBody>
          </ScrollTable>
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
