import { cn } from "@metis/ui/lib/utils";

import type { ConnectionResource } from "@/connections/types";
import type { WorkspacePolicySettings } from "@/server/schema";

export function PolicyBadge({
  on,
  label,
  className,
}: {
  on: boolean;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        on ? "bg-status-success/15 text-status-success" : "bg-hover text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function overrideLabel(enabled: boolean, resolved: boolean): string | null {
  if (enabled === resolved) return null;
  return resolved ? "Required here" : "Off here";
}

export function attachPolicyNotice(
  policy: WorkspacePolicySettings | null,
  resource: ConnectionResource,
): string | null {
  if (!policy) return null;

  const rules: string[] = [];
  if (policy.aiPolicy === "off") rules.push("has AI turned off");
  if (resource === "mailbox") {
    if (policy.phishingDetectionPolicy === "required") {
      rules.push("requires phishing detection");
    } else if (policy.phishingDetectionPolicy === "off") {
      rules.push("has phishing detection turned off");
    }
  }
  if (rules.length === 0) return null;

  const noun = {
    mailbox: "Mailboxes",
    calendar: "Calendars",
    drive: "Drives",
    addressbook: "Address books",
  }[resource];
  return `This workspace ${rules.join(" and ")}. ${noun} you add here follow that, whatever they are set to in your other workspaces.`;
}
