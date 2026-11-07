"use client";

import { Button } from "@metis/ui/components/button";
import { Spinner } from "@metis/ui/components/spinner";
import { cn } from "@metis/ui/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  AlertTriangle,
  CalendarPlus,
  CircleSlash,
  Clock3,
  FolderInput,
  FolderPlus,
  Inbox,
  type LucideIcon,
  Mail,
  MailMinus,
  Palette,
  PenLine,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  UserMinus,
  UserPen,
  UserPlus,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { type MailboxEmailMap, useMailboxEmails } from "@/hooks/use-mailbox-emails";
import { isRecord } from "@/lib/guards";

export type ApprovalResponder = (args: { id: string; approved: boolean; reason?: string }) => void;

type AnyToolPart = ToolUIPart | DynamicToolUIPart;
type ToolState = AnyToolPart["state"];
type JsonRecord = Record<string, unknown>;

type ToolCopy = {
  icon: LucideIcon;
  loading: ReactNode;
  success: ReactNode;
  approval?: ReactNode;
};

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function titleizeToolName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getToolName(part: AnyToolPart) {
  return part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");
}

function getErrorText(part: AnyToolPart) {
  const output = asRecord(part.output);
  return part.errorText ?? asString(output?.error);
}

function outputCount(output: JsonRecord | null, key: string) {
  return asNumber(output?.count) ?? asArray(output?.[key]).length;
}

function shortList(values: unknown[], key: string, fallbackKey?: string) {
  const names = values
    .slice(0, 3)
    .map((value) => {
      const record = asRecord(value);
      return asString(record?.[key]) ?? asString(record?.[fallbackKey ?? key]);
    })
    .filter(Boolean);

  return names.length ? `: ${names.join(", ")}` : "";
}

function recipients(value: unknown) {
  const list = asArray(value);
  if (list.length === 0) return "recipient";
  if (list.length === 1) return asString(list[0]) ?? "1 recipient";
  return plural(list.length, "recipient");
}

function toolCopy(part: AnyToolPart, mailboxEmails: MailboxEmailMap): ToolCopy {
  const name = getToolName(part);
  const input = asRecord(part.input);
  const output = asRecord(part.output);
  const mailboxId = asString(input?.mailboxId);
  const mailboxEmail = mailboxId ? mailboxEmails[mailboxId] : undefined;

  switch (name) {
    case "listMailboxes": {
      const mailboxes = asArray(output?.mailboxes);
      const count = outputCount(output, "mailboxes");
      return {
        icon: Users,
        loading: "Listing connected mailboxes...",
        success: `Found ${plural(count, "connected mailbox", "connected mailboxes")}${shortList(mailboxes, "email")}`,
      };
    }
    case "aggregateInbox": {
      const count = outputCount(output, "emails");
      const mailboxes = asNumber(output?.mailboxes);
      return {
        icon: Inbox,
        loading: "Checking every inbox...",
        success: mailboxes
          ? `Found ${plural(count, "email")} across ${plural(mailboxes, "mailbox", "mailboxes")}`
          : `Found ${plural(count, "email")} across the workspace`,
      };
    }
    case "listEmails": {
      const folder = asString(input?.folder) ?? "mailbox";
      const mailbox = asString(output?.mailbox);
      const emails = asArray(output?.emails);
      const count = outputCount(output, "emails");
      return {
        icon: Inbox,
        loading: `Listing ${folder}...`,
        success: `Found ${plural(count, "email")} in ${folder}${mailbox ? ` for ${mailbox}` : ""}${shortList(emails, "subject")}`,
      };
    }
    case "searchMail": {
      const query = asString(input?.query);
      const emails = asArray(output?.emails);
      const count = outputCount(output, "emails");
      return {
        icon: Search,
        loading: query ? `Searching for "${query}"...` : "Searching mail...",
        success: `Found ${plural(count, "match", "matches")}${shortList(emails, "subject")}`,
      };
    }
    case "getEmail": {
      const hasContent = output?.hasContent === true;
      return {
        icon: Mail,
        loading: "Fetching email body...",
        success: hasContent ? "Fetched email body" : "No email body content found",
      };
    }
    case "getThread": {
      const count = outputCount(output, "emails");
      return {
        icon: Mail,
        loading: "Fetching the conversation...",
        success: `Fetched ${plural(count, "email")} in the thread`,
      };
    }
    case "markRead": {
      const read = input?.read === true;
      const count = asArray(input?.ids).length;
      return {
        icon: Mail,
        loading: read ? "Marking as read..." : "Marking as unread...",
        success: read
          ? `Marked ${plural(count, "email")} read`
          : `Marked ${plural(count, "email")} unread`,
      };
    }
    case "archiveEmail": {
      return {
        icon: Inbox,
        loading: "Archiving email...",
        success: "Archived email",
      };
    }
    case "restoreEmail": {
      return {
        icon: Inbox,
        loading: "Restoring email...",
        success: "Restored email to the inbox",
      };
    }
    case "createDraft": {
      return {
        icon: Mail,
        loading: "Saving draft...",
        success: "Saved a draft — nothing was sent",
      };
    }
    case "updateDraft": {
      return {
        icon: Mail,
        loading: "Updating draft...",
        success: "Updated the draft — nothing was sent",
      };
    }
    case "clearLabel": {
      return {
        icon: Tag,
        loading: "Removing label...",
        success: "Removed the label",
      };
    }
    case "starEmail": {
      const requestedStar = input?.starred === true;
      const confirmedStar = output?.starred;
      return {
        icon: Star,
        loading: requestedStar ? "Starring email..." : "Unstarring email...",
        success:
          typeof confirmedStar === "boolean"
            ? confirmedStar
              ? "Starred email"
              : "Unstarred email"
            : "Star update finished",
      };
    }
    case "setLabel": {
      const requestedLabel = asString(input?.label);
      const confirmedLabel = asString(output?.label);
      return {
        icon: Tag,
        loading: requestedLabel ? `Setting label to "${requestedLabel}"...` : "Setting label...",
        success: confirmedLabel ? `Set label to "${confirmedLabel}"` : "Label update finished",
      };
    }
    case "deleteEmails": {
      const ids = asArray(input?.ids);
      const requested = ids.length || 1;
      const deleted = asNumber(output?.deleted);
      const from = mailboxEmail ? ` from ${mailboxEmail}` : "";
      return {
        icon: Trash2,
        loading: `Deleting ${plural(requested, "email")}...`,
        approval: `Approve deleting ${plural(requested, "email")}${from}`,
        success:
          deleted === undefined ? "Delete completed" : `Deleted ${plural(deleted, "email")}${from}`,
      };
    }
    case "sendEmail": {
      const subject = asString(input?.subject);
      const from = mailboxEmail ? ` from ${mailboxEmail}` : "";
      return {
        icon: Send,
        loading: subject ? `Sending "${subject}"...` : "Sending email...",
        approval: subject
          ? `Approve sending "${subject}" to ${recipients(input?.to)}${from}`
          : `Approve sending email to ${recipients(input?.to)}${from}`,
        success:
          output?.sent === true
            ? subject
              ? `Sent "${subject}" to ${recipients(output?.to ?? input?.to)}`
              : `Sent email to ${recipients(output?.to ?? input?.to)}`
            : "Send finished",
      };
    }
    case "analyzePhishing": {
      const classification = asString(output?.classification);
      return {
        icon: ShieldAlert,
        loading: "Checking this email for phishing...",
        success: classification
          ? `Phishing check: ${classification}`
          : "Finished checking for phishing",
      };
    }
    case "createEvent": {
      const title = asString(input?.title);
      return {
        icon: CalendarPlus,
        loading: title ? `Creating "${title}"...` : "Creating the event...",
        approval: title
          ? `Approve adding "${title}" to your calendar`
          : "Approve adding this event to your calendar",
        success: title ? `Added "${title}"` : "Added the event",
      };
    }
    case "updateEvent": {
      const title = asString(input?.title) ?? asString(input?.summary);
      return {
        icon: CalendarPlus,
        loading: "Updating the event...",
        approval: title ? `Approve changing "${title}"` : "Approve changing this event",
        success: title ? `Updated "${title}"` : "Updated the event",
      };
    }
    case "deleteEvent": {
      const what = asString(input?.summary);
      return {
        icon: Trash2,
        loading: "Deleting the event...",
        approval: what ? `Approve deleting ${what}` : "Approve deleting this event",
        success: "Deleted the event",
      };
    }
    case "respondToEvent": {
      const answer = asString(input?.response);
      const reply =
        answer === "accepted"
          ? "Yes"
          : answer === "declined"
            ? "No"
            : answer === "tentative"
              ? "Maybe"
              : undefined;
      return {
        icon: CalendarPlus,
        loading: "Replying to the invite...",
        approval: reply
          ? `Approve replying "${reply}" to this invite`
          : "Approve replying to this invite",
        success: reply ? `Replied "${reply}"` : "Replied to the invite",
      };
    }
    case "createContact": {
      const person = asString(input?.name) ?? asString(input?.givenName);
      return {
        icon: UserPlus,
        loading: person ? `Saving ${person}...` : "Saving the contact...",
        approval: person ? `Approve saving ${person} as a contact` : "Approve saving this contact",
        success: person ? `Saved ${person}` : "Saved the contact",
      };
    }
    case "updateContact": {
      const what = asString(input?.summary);
      return {
        icon: UserPen,
        loading: "Updating the contact...",
        approval: what ? `Approve changing ${what}` : "Approve changing this contact",
        success: "Updated the contact",
      };
    }
    case "deleteContact": {
      const what = asString(input?.summary);
      return {
        icon: Trash2,
        loading: "Deleting the contact...",
        approval: what
          ? `Approve deleting ${what} — it can't be undone`
          : "Approve deleting this contact — it can't be undone",
        success: "Deleted the contact",
      };
    }
    case "createFolder": {
      const folder = asString(input?.name);
      return {
        icon: FolderPlus,
        loading: "Creating the folder...",
        approval: folder
          ? `Approve creating the folder "${folder}"`
          : "Approve creating this folder",
        success: folder ? `Created "${folder}"` : "Created the folder",
      };
    }
    case "renameFile": {
      const next = asString(input?.name);
      return {
        icon: PenLine,
        loading: "Renaming...",
        approval: next ? `Approve renaming this to "${next}"` : "Approve renaming this item",
        success: next ? `Renamed to "${next}"` : "Renamed",
      };
    }
    case "moveFile": {
      const what = asString(input?.summary);
      return {
        icon: FolderInput,
        loading: "Moving...",
        approval: what ? `Approve moving ${what}` : "Approve moving this item",
        success: "Moved",
      };
    }
    case "deleteFile": {
      const what = asString(input?.summary);
      return {
        icon: Trash2,
        loading: "Deleting...",
        approval: what
          ? `Approve deleting ${what} — it can't be undone`
          : "Approve deleting this item — it can't be undone",
        success: "Deleted",
      };
    }
    case "snoozeEmail": {
      return {
        icon: Clock3,
        loading: "Snoozing email...",
        success: "Snoozed email",
      };
    }
    case "scheduleEmail": {
      const subject = asString(input?.subject);
      const from = mailboxEmail ? ` from ${mailboxEmail}` : "";
      return {
        icon: Clock3,
        loading: "Scheduling email...",
        approval: subject
          ? `Approve scheduling "${subject}" to ${recipients(input?.to)}${from}`
          : `Approve scheduling an email to ${recipients(input?.to)}${from}`,
        success: output?.scheduled === true ? "Scheduled the email" : "Schedule finished",
      };
    }
    case "cancelScheduled": {
      return {
        icon: CircleSlash,
        loading: "Calling back the scheduled email...",
        approval: "Approve calling back this scheduled email",
        success: "Called back the scheduled email",
      };
    }
    case "retryScheduled": {
      return {
        icon: RotateCcw,
        loading: "Retrying the scheduled email...",
        approval: "Approve retrying this scheduled email — a send that went out won't repeat",
        success: "Scheduled email retry handled",
      };
    }
    case "unsubscribe": {
      const count = asArray(input?.items).length || 1;
      const from = mailboxEmail ? ` for ${mailboxEmail}` : "";
      return {
        icon: MailMinus,
        loading: `Unsubscribing from ${plural(count, "sender")}...`,
        approval: `Approve unsubscribing from ${plural(count, "sender")}${from}`,
        success: `Unsubscribe handled for ${plural(count, "sender")}`,
      };
    }
    case "deleteLabel": {
      const label = asString(input?.label);
      return {
        icon: Tag,
        loading: "Deleting the label...",
        approval: label ? `Approve deleting the label "${label}"` : "Approve deleting this label",
        success: label ? `Deleted the label "${label}"` : "Deleted the label",
      };
    }
    case "deleteDraft": {
      const from = mailboxEmail ? ` from ${mailboxEmail}` : "";
      return {
        icon: Trash2,
        loading: "Deleting the draft...",
        approval: `Approve deleting this draft${from}`,
        success: "Deleted the draft",
      };
    }
    case "pinFolder": {
      const label = asString(input?.label);
      return {
        icon: Pin,
        loading: "Pinning the folder...",
        approval: label ? `Approve pinning "${label}"` : "Approve pinning this folder",
        success: label ? `Pinned "${label}"` : "Pinned the folder",
      };
    }
    case "unpinFolder": {
      return {
        icon: PinOff,
        loading: "Removing the pin...",
        approval: "Approve removing this folder pin",
        success: "Removed the pin",
      };
    }
    case "removeMember": {
      return {
        icon: UserMinus,
        loading: "Removing the member...",
        approval:
          "Approve removing this member — their mailboxes, calendars, drives and address books leave the workspace",
        success: "Removed the member",
      };
    }
    case "revokeInvite": {
      return {
        icon: CircleSlash,
        loading: "Revoking the invite...",
        approval: "Approve revoking this workspace invite",
        success: "Revoked the invite",
      };
    }
    case "setWorkspaceTheme": {
      const brand = asString(input?.themeBrand);
      return {
        icon: Palette,
        loading: "Changing the accent color...",
        approval: brand
          ? `Approve changing the workspace accent color to ${brand} for everyone`
          : "Approve changing the workspace accent color for everyone",
        success: brand ? `Changed the accent color to ${brand}` : "Changed the accent color",
      };
    }
    case "createWorkflow":
    case "updateWorkflow": {
      const payload = asRecord(input?.workflow);
      const wfName = asString(payload?.name);
      const verb = name === "createWorkflow" ? "creating" : "changing";
      return {
        icon: Wrench,
        loading: `Saving the workflow...`,
        approval: wfName
          ? `Approve ${verb} the workflow "${wfName}"`
          : `Approve ${verb} this workflow`,
        success: wfName ? `Saved "${wfName}"` : "Saved the workflow",
      };
    }
    case "toggleWorkflow": {
      const on = input?.enabled === true;
      return {
        icon: Wrench,
        loading: on ? "Turning the workflow on..." : "Turning it off...",
        approval: on ? "Approve turning this workflow on" : "Approve turning this workflow off",
        success: on ? "Workflow turned on" : "Workflow turned off",
      };
    }
    case "deleteWorkflow": {
      return {
        icon: Trash2,
        loading: "Deleting the workflow...",
        approval: "Approve deleting this workflow — it can't be undone",
        success: "Deleted the workflow",
      };
    }
    case "cancelWorkflowRun": {
      return {
        icon: CircleSlash,
        loading: "Cancelling the workflow run...",
        approval:
          "Approve cancelling this workflow run — a step already in progress can't be called back",
        success: "Workflow run cancellation recorded",
      };
    }
    case "resumeWorkflowRun": {
      return {
        icon: RotateCcw,
        loading: "Retrying the workflow run...",
        approval:
          "Approve retrying the failed steps of this workflow run — completed steps won't run again",
        success: "Workflow run retry handled",
      };
    }
    case "applyWorkflows": {
      return {
        icon: Wrench,
        loading: "Queueing the workflow run...",
        approval:
          "Approve running this workflow now — its steps may change or send mail, events or files",
        success: "Workflow run queued",
      };
    }
    default: {
      const title = titleizeToolName(name);
      return {
        icon: Wrench,
        loading: `Running ${title}...`,
        success: `${title} completed`,
      };
    }
  }
}

function ToolIndication({
  state,
  icon: Icon,
  loading,
  success,
  approval,
  errorText,
}: ToolCopy & {
  state: ToolState;
  errorText?: string;
}) {
  const isLoading =
    state === "input-streaming" || state === "input-available" || state === "approval-responded";
  const isApproval = state === "approval-requested";
  const isDenied = state === "output-denied";
  const isError = state === "output-error" || !!errorText;

  return (
    <div
      className={cn(
        "my-1 flex items-center gap-2 font-mono text-muted-foreground text-xs",
        (isError || isDenied) && "text-destructive-text",
        isApproval && "text-amber-700 dark:text-amber-400",
      )}
    >
      {isLoading ? (
        <>
          <Spinner className="size-3 shrink-0" />
          <span className="min-w-0 animate-pulse">
            {state === "approval-responded" ? "Approval submitted..." : loading}
          </span>
        </>
      ) : isApproval ? (
        <>
          <Clock3 className="size-3 shrink-0" />
          <span className="min-w-0">{approval ?? "Approve this before it runs"}</span>
        </>
      ) : isError ? (
        <>
          <AlertTriangle className="size-3 shrink-0" />
          <span className="min-w-0">{errorText ?? "That step didn't work"}</span>
        </>
      ) : isDenied ? (
        <>
          <XCircle className="size-3 shrink-0" />
          <span className="min-w-0">You declined — nothing changed</span>
        </>
      ) : (
        <>
          <Icon className="size-3 shrink-0" />
          <span className="min-w-0">{success}</span>
        </>
      )}
    </div>
  );
}

function ApprovalActions({
  part,
  onApproval,
  mailboxEmails,
}: {
  part: AnyToolPart;
  onApproval: ApprovalResponder;
  mailboxEmails: MailboxEmailMap;
}) {
  if (part.state !== "approval-requested" || !part.approval) return null;
  const id = part.approval.id;
  const summary = asString(asRecord(part.input)?.summary);
  const copy = toolCopy(part, mailboxEmails);

  return (
    <div className="mt-2 flex max-w-xl flex-col gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 font-medium text-amber-700 text-sm dark:text-amber-400">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="min-w-0">{copy.approval ?? "Approval required"}</span>
      </div>
      {summary && <p className="text-muted-foreground text-sm">{summary}</p>}
      <div className="flex gap-2">
        <Button onClick={() => onApproval({ id, approved: true })} size="sm" type="button">
          <ShieldCheck data-icon="inline-start" />
          Approve
        </Button>
        <Button
          onClick={() => onApproval({ id, approved: false })}
          size="sm"
          type="button"
          variant="outline"
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

export function AgentToolCall({
  part,
  onApproval,
}: {
  part: AnyToolPart;
  onApproval: ApprovalResponder;
}) {
  const mailboxEmails = useMailboxEmails();
  const copy = toolCopy(part, mailboxEmails);
  const errorText = getErrorText(part);

  return (
    <div className="not-prose">
      <ToolIndication {...copy} errorText={errorText} state={part.state} />
      <ApprovalActions mailboxEmails={mailboxEmails} onApproval={onApproval} part={part} />
    </div>
  );
}
