"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { AuditEventList, auditPages, useAuditFilter } from "@/components/audit-event-list";
import { InfoHint } from "@/components/info-hint";
import { rpc } from "@/lib/orpc";
import { USER_AUDIT_ACTIONS } from "@/types/audit";

export function SecurityActivitySection() {
  const filter = useAuditFilter();
  const pages = useInfiniteQuery(rpc.audit.mine.infiniteOptions(auditPages(filter.filter)));

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-medium text-foreground">Security activity</h2>
        <InfoHint label="Security activity">
          Security-relevant changes you made, and changes other people made to your membership. Your
          server&rsquo;s operator decides how long these are kept.
        </InfoHint>
      </div>
      <div className="mt-3">
        <AuditEventList
          pages={pages}
          filter={filter}
          actions={USER_AUDIT_ACTIONS}
          showWorkspace
          emptyText="No security activity yet."
        />
      </div>
    </section>
  );
}
