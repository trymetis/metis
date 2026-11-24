"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@metis/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";

import { ApprovalActions } from "@/components/workflow-history/approval-actions";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { workflowRunPath } from "@/workspace/path";

export function ApprovalsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const scope = useWorkspaceScope();
  const query = useQuery({
    ...rpc.workflows.approvals.queryOptions({ input: scope }),
    enabled: open,
  });
  const approvals = query.data?.approvals ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Approvals</SheetTitle>
          <SheetDescription>Workflow runs waiting for your decision.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {query.isPending ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin opacity-50" />
            </div>
          ) : approvals.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing is waiting for you.</p>
          ) : (
            approvals.map((approval) => (
              <section
                key={approval.id}
                aria-label={approval.workflowName}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-baseline gap-2">
                  <Link
                    href={workflowRunPath(scope.workspaceSlug, approval.runId)}
                    className="min-w-0 flex-1 truncate font-medium text-[13px] hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    {approval.workflowName}
                  </Link>
                  <span className="shrink-0 text-[11px] text-faint">
                    {formatDistanceToNowStrict(new Date(approval.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-foreground">
                  {approval.request}
                </p>
                {approval.deadlineAt && (
                  <p className="text-[11px] text-faint">
                    Times out {format(new Date(approval.deadlineAt), "PPp")}
                  </p>
                )}
                <ApprovalActions waitId={approval.id} />
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
