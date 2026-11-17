import { Button } from "@metis/ui/components/button";
import { BotOff } from "lucide-react";
import Link from "next/link";

import { workspaceSettingsPath } from "@/workspace/path";

export function AssistantUnavailable({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-hover">
          <BotOff className="h-7 w-7 text-faint" strokeWidth={1.6} />
        </div>

        <h1 className="mt-5 text-[22px] font-medium tracking-tight text-foreground">
          Assistant turned off
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted-foreground">
          This workspace has AI turned off, so the assistant is unavailable here. An owner or admin
          can turn it back on.
        </p>

        <Button
          className="mt-6"
          nativeButton={false}
          render={
            <Link href={workspaceSettingsPath(workspaceSlug, "general")}>Workspace settings</Link>
          }
        />
      </div>
    </div>
  );
}
