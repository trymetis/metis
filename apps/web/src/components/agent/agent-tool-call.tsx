"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { Spinner } from "@metis/ui/components/spinner";
import { cn } from "@metis/ui/lib/utils";
import { type DynamicToolUIPart, isToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import {
  AlertTriangle,
  CalendarPlus,
  ChevronRight,
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
  Signature,
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
import { Fragment, type ReactNode, useState } from "react";

import type { MailboxEmailMap } from "@/hooks/use-mailbox-emails";
import { isOneOf, isRecord, keysOf } from "@/lib/guards";

import { type ResourceNames, useResourceNames } from "./resource-names";

export type AnyToolPart = ToolUIPart | DynamicToolUIPart;
type JsonRecord = Record<string, unknown>;

export type ToolCopy = {
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

export function toolCopy(part: AnyToolPart, mailboxEmails: MailboxEmailMap): ToolCopy {
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
    case "updateLabel": {
      const label = asString(input?.label);
      return {
        icon: Tag,
        loading: "Updating the label...",
        success: label ? `Updated the label "${label}"` : "Updated the label",
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
    case "saveSignature":
    case "deleteSignature": {
      const scope = asString(input?.scope);
      const owner =
        scope === "workspace"
          ? "workspace signature"
          : scope === "personal"
            ? "personal signature"
            : "mailbox signature";
      const where = scope !== "workspace" && mailboxEmail ? ` for ${mailboxEmail}` : "";
      if (name === "deleteSignature") {
        return {
          icon: Signature,
          loading: "Deleting the signature...",
          approval: `Approve deleting a ${owner}${where}`,
          success: "Deleted the signature",
        };
      }
      const label = asString(input?.name);
      const verb = asString(input?.signatureId) ? "editing" : "adding";
      return {
        icon: Signature,
        loading: "Saving the signature...",
        approval: label
          ? `Approve ${verb} the ${owner} "${label}"${where}`
          : `Approve ${verb} a ${owner}${where}`,
        success: label ? `Saved the signature "${label}"` : "Saved the signature",
      };
    }
    case "setMailFooter": {
      const off = input?.enabled === false;
      return {
        icon: Signature,
        loading: "Updating the mail footer...",
        approval: off
          ? "Approve turning off the workspace mail footer"
          : "Approve changing the workspace mail footer",
        success: off ? "Turned off the mail footer" : "Updated the mail footer",
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

type RowStatus = "running" | "approval" | "error" | "denied" | "done";

function rowStatus(part: AnyToolPart): RowStatus {
  if (part.state === "approval-requested") return "approval";
  if (part.state === "output-denied") return "denied";
  if (part.state === "output-error" || getErrorText(part)) return "error";
  if (part.state === "output-available") return "done";
  return "running";
}

const HIDDEN_FIELDS = /^(summary|workspaceId)$/;
const HTML_FIELD = /html/i;

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function clip(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function describeValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    return clip(HTML_FIELD.test(key) ? value.replace(/<[^>]*>/g, " ") : value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.some((item) => typeof item === "object" && item !== null)) {
      return plural(value.length, "item");
    }
    const shown = value
      .slice(0, 3)
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : clip(JSON.stringify(item), 60),
      );
    const more = value.length > 3 ? ` +${value.length - 3} more` : "";
    return `${shown.join(", ")}${more}`;
  }
  return clip(JSON.stringify(value));
}

const RESOLVED_IDS = {
  mailboxId: { label: "Mailbox", names: "mailboxes" },
  driveId: { label: "Drive", names: "drives" },
} as const satisfies Record<string, { label: string; names: keyof ResourceNames }>;

const RESOLVED_ID_KEYS = keysOf(RESOLVED_IDS);

const ID_KEY = /(^ids?|Ids?)$/;

function describeId(key: string, raw: unknown): { label: string; value: string } | null {
  const label = humanizeKey(key.replace(ID_KEY, "")) || "Items";
  if (Array.isArray(raw))
    return raw.length > 0 ? { label, value: plural(raw.length, "item") } : null;
  if (typeof raw === "string" && raw.includes("/") && !raw.includes("://")) {
    return { label, value: raw.replace(/\/+$/, "") || "Top level" };
  }
  return null;
}

export function describeFields(
  value: unknown,
  names: ResourceNames,
): { label: string; value: string }[] {
  const record = asRecord(value);
  if (!record) return [];
  const fields: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (HIDDEN_FIELDS.test(key)) continue;
    if (isOneOf(RESOLVED_ID_KEYS, key)) {
      const { label, names: kind } = RESOLVED_IDS[key];
      const name = typeof raw === "string" ? names[kind][raw] : undefined;
      if (name) fields.push({ label, value: name });
      continue;
    }
    if (ID_KEY.test(key)) {
      const field = describeId(key, raw);
      if (field) fields.push(field);
      continue;
    }
    const text = describeValue(key, raw);
    if (text) fields.push({ label: humanizeKey(key), value: text });
  }
  return fields;
}

export function FieldList({ fields }: { fields: { label: string; value: string }[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
      {fields.map((field) => (
        <Fragment key={field.label}>
          <dt className="text-faint">{field.label}</dt>
          <dd className="wrap-anywhere text-foreground select-text">{field.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function StatusIcon({ status, icon: Icon }: { status: RowStatus; icon: LucideIcon }) {
  if (status === "running") return <Spinner className="size-3.5 shrink-0" />;
  if (status === "approval") return <ShieldCheck className="size-3.5 shrink-0" />;
  if (status === "error") return <AlertTriangle className="size-3.5 shrink-0" />;
  if (status === "denied") return <XCircle className="size-3.5 shrink-0" />;
  return <Icon className="size-3.5 shrink-0" />;
}

function rowText(part: AnyToolPart, copy: ToolCopy, status: RowStatus): ReactNode {
  if (status === "running") {
    if (part.state !== "approval-responded") return copy.loading;
    return part.approval.approved ? "Approved, running..." : "Declined, nothing changed";
  }
  if (status === "approval") return "Waiting for your approval";
  if (status === "error") return getErrorText(part) ?? "That step didn't work";
  if (status === "denied") return "Declined, nothing changed";
  return copy.success;
}

function ToolRow({ part, names }: { part: AnyToolPart; names: ResourceNames }) {
  const [open, setOpen] = useState(false);
  const copy = toolCopy(part, names.mailboxes);
  const status = rowStatus(part);
  const input = describeFields(part.input, names);
  const output = status === "done" ? describeFields(part.output, names) : [];
  const hasDetail = input.length > 0 || output.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!hasDetail}
        className={cn(
          "group/row inline-flex max-w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors enabled:hover:bg-hover",
          (status === "error" || status === "denied") && "text-destructive-text",
        )}
      >
        <StatusIcon icon={copy.icon} status={status} />
        <span className={cn("min-w-0 truncate", status === "running" && "animate-pulse")}>
          {rowText(part, copy, status)}
        </span>
        {hasDetail && (
          <ChevronRight className="size-3 shrink-0 text-faint transition-transform group-data-panel-open/row:rotate-90" />
        )}
      </CollapsibleTrigger>
      {hasDetail && (
        <CollapsibleContent>
          <div className="mt-0.5 mb-1 ml-6 flex max-h-64 flex-col gap-2 overflow-auto rounded-md border border-border-soft bg-panel px-2.5 py-2">
            {input.length > 0 && <FieldList fields={input} />}
            {output.length > 0 && (
              <div className="border-border-soft border-t pt-2">
                <FieldList fields={output} />
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

const INTERNAL_TOOLS = new Set(["search_tools", "load_tool"]);

export function isInternalTool(part: AnyToolPart): boolean {
  return INTERNAL_TOOLS.has(getToolName(part));
}

export function AgentToolGroup({ parts }: { parts: AnyToolPart[] }) {
  const names = useResourceNames();
  const [open, setOpen] = useState(false);
  const last = parts.at(-1);
  if (!last) return null;
  if (parts.length === 1) {
    return (
      <div className="not-prose my-1">
        <ToolRow names={names} part={last} />
      </div>
    );
  }
  const running = parts.some((p) => rowStatus(p) === "running");
  const failed = parts.filter((p) => rowStatus(p) === "error").length;

  return (
    <div className="not-prose my-1">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group/group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-faint transition-colors hover:bg-hover hover:text-muted-foreground">
          <ChevronRight className="size-3 transition-transform group-data-panel-open/group:rotate-90" />
          {plural(parts.length, "tool call")}
          {failed > 0 && <span className="text-destructive-text">· {failed} failed</span>}
          {running && <Spinner className="size-3" />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {parts.slice(0, -1).map((part) => (
            <ToolRow key={part.toolCallId} names={names} part={part} />
          ))}
        </CollapsibleContent>
      </Collapsible>
      <ToolRow names={names} part={last} />
    </div>
  );
}

export type PendingApproval = AnyToolPart & {
  state: "approval-requested";
  approval: { id: string };
};

export function inputSummary(part: AnyToolPart): string | undefined {
  return asString(asRecord(part.input)?.summary);
}

export function pendingApproval(messages: readonly UIMessage[]): PendingApproval | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;
  return (
    last.parts.find(
      (part): part is PendingApproval =>
        isToolUIPart(part) && part.state === "approval-requested" && !!part.approval,
    ) ?? null
  );
}
