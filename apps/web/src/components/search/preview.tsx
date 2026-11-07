"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { parseUIMessages } from "@/ai/messages";
import { MemberDetails } from "@/components/members/member-details";
import { ACCOUNT_PROVIDER_META } from "@/components/provider-meta";
import { orpc, rpc } from "@/lib/orpc";
import type {
  EventSearchHitDto,
  FileSearchHitDto,
  LocalSearchHit,
  MailSearchHitDto,
} from "@/server/schema";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";

import type { SearchItem } from "./items";
import { bareMailId } from "./navigate";

function stamp(value: string | null | undefined, pattern = "PPp"): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format(date, pattern) : "";
}

function size(bytes: number | null): string {
  if (bytes === null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === "" || children === null || children === undefined) {
    return null;
  }
  return (
    <div className="flex gap-3 text-[12px]">
      <dt className="w-24 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-serif text-[20px] font-medium leading-tight tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function htmlText(html: string): string {
  try {
    return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  } catch {
    return "";
  }
}

function MailPreview({ workspaceSlug, hit }: { workspaceSlug: string; hit: MailSearchHitDto }) {
  const scheduled = hit.states?.includes("scheduled");
  const query = useQuery(
    rpc.mail.messages.get.queryOptions({
      input: scheduled
        ? skipToken
        : {
            workspaceSlug,
            mailboxSlug: hit.mailboxSlug ?? ALL_MAILBOXES_SLUG,
            id: hit.mailboxSlug ? bareMailId(hit) : hit.id,
          },
    }),
  );
  const message = query.data;
  const body = scheduled
    ? hit.snippet
    : message
      ? (message.bodyText ?? (message.bodyHtml ? htmlText(message.bodyHtml) : hit.snippet))
      : query.isError
        ? hit.snippet
        : null;

  return (
    <div className="flex flex-col gap-4">
      <Title>{hit.subject || "(no subject)"}</Title>
      <dl className="flex flex-col gap-1.5">
        <Field label="From">{hit.fromName ? `${hit.fromName} <${hit.from}>` : hit.from}</Field>
        <Field label="To">{hit.to.join(", ")}</Field>
        <Field label={scheduled ? "Sends" : "Date"}>{stamp(hit.scheduledFor ?? hit.date)}</Field>
        {hit.wakeAt && <Field label="Snoozed until">{stamp(hit.wakeAt)}</Field>}
        <Field label="Mailbox">{hit.mailboxEmail}</Field>
      </dl>
      {body === null ? (
        <Loader2 className="size-4 animate-spin text-faint" />
      ) : (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
          {body.trim().slice(0, 4000)}
        </p>
      )}
    </div>
  );
}

function EventPreview({ hit }: { hit: EventSearchHitDto }) {
  return (
    <div className="flex flex-col gap-4">
      <Title>{hit.title || "(untitled event)"}</Title>
      <dl className="flex flex-col gap-1.5">
        <Field label="When">
          {hit.allDay ? stamp(hit.start, "PP") : `${stamp(hit.start)} to ${stamp(hit.end, "p")}`}
        </Field>
        <Field label="Where">{hit.location}</Field>
        <Field label="Calendar">
          {[hit.calendarName, hit.accountName ?? hit.accountEmail].filter(Boolean).join(" · ")}
        </Field>
        <Field label="Organizer">{hit.organizer?.name || hit.organizer?.email}</Field>
        <Field label="Guests">
          {(hit.attendees ?? []).map((a) => a.name || a.email).join(", ")}
        </Field>
        <Field label="Your answer">{hit.myResponse}</Field>
        <Field label="Meeting">{hit.meetingUrl}</Field>
      </dl>
      {hit.description && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
          {hit.description.slice(0, 4000)}
        </p>
      )}
    </div>
  );
}

function FilePreview({ hit }: { hit: FileSearchHitDto }) {
  return (
    <div className="flex flex-col gap-4">
      <Title>{hit.name}</Title>
      <dl className="flex flex-col gap-1.5">
        <Field label="Kind">{hit.kind === "folder" ? "Folder" : hit.mimeType}</Field>
        <Field label="Size">{size(hit.size)}</Field>
        <Field label="Changed">{stamp(hit.modifiedAt)}</Field>
        <Field label="Folder">{hit.parentName}</Field>
        <Field label="Drive">{hit.driveSlug}</Field>
        <Field label="Pinned">{hit.pinned ? "Yes" : ""}</Field>
      </dl>
    </div>
  );
}

function ChatPreview({
  workspaceSlug,
  threadId,
  title,
}: {
  workspaceSlug: string;
  threadId: string;
  title: string;
}) {
  const input = { workspaceSlug, threadId };
  const query = useQuery({
    queryKey: [...rpc.assistant.threadMessages.queryKey({ input }), "preview"],
    queryFn: async () => {
      const messages = await parseUIMessages((await orpc.assistant.threadMessages(input)).messages);
      return (messages ?? [])
        .map((m) => ({
          id: m.id,
          role: m.role,
          text: m.parts.flatMap((p) => (p.type === "text" && p.text ? [p.text] : [])).join(" "),
        }))
        .filter((m) => m.text)
        .slice(-6);
    },
  });
  const lines = query.data ?? (query.isError ? [] : null);
  return (
    <div className="flex flex-col gap-4">
      <Title>{title}</Title>
      {lines === null ? (
        <Loader2 className="size-4 animate-spin text-faint" />
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.id} className="text-[13px]">
              <span className="text-[11px] uppercase tracking-[1px] text-faint">
                {line.role === "user" ? "You" : "Assistant"}
              </span>
              <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                {line.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkflowPreview({
  workspaceSlug,
  hit,
}: {
  workspaceSlug: string;
  hit: Extract<LocalSearchHit, { kind: "workflow" }>;
}) {
  const query = useQuery(
    rpc.workflows.runs.queryOptions({
      input: { workspaceSlug, workflowId: hit.workflowId, limit: 1 },
    }),
  );
  const run = query.data?.runs[0];
  const last: string | null | undefined = run
    ? `${run.status} · ${stamp(run.startedAt ?? run.dueAt)}`
    : query.isPending && !query.isError
      ? undefined
      : null;
  return (
    <div className="flex flex-col gap-4">
      <Title>{hit.title}</Title>
      <dl className="flex flex-col gap-1.5">
        <Field label="State">{hit.enabled ? "On" : "Off"}</Field>
        <Field label="Last run">{last === undefined ? "…" : (last ?? "Never run")}</Field>
        <Field label="Changed">{stamp(hit.date)}</Field>
      </dl>
    </div>
  );
}

function LocalPreview({
  workspaceSlug,
  hit,
  onNavigate,
}: {
  workspaceSlug: string;
  hit: LocalSearchHit;
  onNavigate: () => void;
}) {
  switch (hit.kind) {
    case "chat":
      return (
        <ChatPreview workspaceSlug={workspaceSlug} threadId={hit.threadId} title={hit.title} />
      );
    case "member":
      return (
        <MemberDetails
          workspaceSlug={workspaceSlug}
          email={hit.email}
          role={hit.role}
          joinedAt={hit.date}
          invited={hit.invited}
          expiresAt={hit.expiresAt}
          onNavigate={onNavigate}
        >
          <Title>{hit.title}</Title>
        </MemberDetails>
      );
    case "contact": {
      const details = (
        <>
          <Title>{hit.title}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Organization">{hit.organization}</Field>
            <Field label="Phone">{hit.phone}</Field>
            <Field label="Address book">{hit.bookName}</Field>
          </dl>
        </>
      );
      return hit.email ? (
        <MemberDetails workspaceSlug={workspaceSlug} email={hit.email} onNavigate={onNavigate}>
          {details}
        </MemberDetails>
      ) : (
        <div className="flex flex-col gap-4">{details}</div>
      );
    }
    case "workflow":
      return <WorkflowPreview workspaceSlug={workspaceSlug} hit={hit} />;
    case "run":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.workflowName}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Status">{hit.status}</Field>
            <Field label="Started">{stamp(hit.date)}</Field>
            <Field label="Error">{hit.error}</Field>
          </dl>
        </div>
      );
    case "mailbox":
    case "drive":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.title}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Provider">{ACCOUNT_PROVIDER_META[hit.provider].label}</Field>
            {hit.kind === "drive" && <Field label="Server">{hit.server}</Field>}
            <Field label="Slug">{hit.slug}</Field>
            <Field label="AI">{hit.ai ? "On" : "Off"}</Field>
          </dl>
        </div>
      );
    case "calendar":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.title}</Title>
          <dl className="flex flex-col gap-1.5">
            {hit.calendarId ? (
              <>
                <Field label="Color">
                  {hit.color && (
                    <span className="inline-flex items-center gap-1.5">
                      <svg aria-hidden viewBox="0 0 10 10" className="size-2.5" fill={hit.color}>
                        <circle cx="5" cy="5" r="5" />
                      </svg>
                      {hit.color}
                    </span>
                  )}
                </Field>
                <Field label="Account">{hit.subtitle ?? hit.email}</Field>
              </>
            ) : (
              <>
                <Field label="Provider">{ACCOUNT_PROVIDER_META[hit.provider].label}</Field>
                <Field label="Slug">{hit.slug}</Field>
                <Field label="AI">{hit.ai ? "On" : "Off"}</Field>
              </>
            )}
          </dl>
        </div>
      );
    case "addressbook":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.title}</Title>
          <dl className="flex flex-col gap-1.5">
            {hit.bookId ? (
              <Field label="Account">{hit.subtitle ?? hit.email}</Field>
            ) : (
              <>
                <Field label="Provider">{ACCOUNT_PROVIDER_META[hit.provider].label}</Field>
                <Field label="Server">{hit.server}</Field>
                <Field label="Slug">{hit.slug}</Field>
                <Field label="AI">{hit.ai ? "On" : "Off"}</Field>
              </>
            )}
          </dl>
        </div>
      );
    case "mail-folder":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.title}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Mailbox">{hit.mailboxEmail}</Field>
          </dl>
        </div>
      );
    case "label":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.name}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Key">{hit.key}</Field>
            <Field label="Where">{hit.subtitle}</Field>
          </dl>
        </div>
      );
    case "connection":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.email}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Provider">{ACCOUNT_PROVIDER_META[hit.provider].label}</Field>
            <Field label="Server">{hit.server}</Field>
            <Field label="Backs">{hit.resources.join(", ")}</Field>
            <Field label="State">{hit.quarantined ? "Needs reconnecting" : "Connected"}</Field>
          </dl>
        </div>
      );
    case "subscription":
      return (
        <div className="flex flex-col gap-4">
          <Title>{hit.senderName || hit.senderEmail}</Title>
          <dl className="flex flex-col gap-1.5">
            <Field label="Sender">{hit.senderEmail}</Field>
            <Field label="Messages">{String(hit.count)}</Field>
            <Field label="Latest">{hit.latestSubject}</Field>
            <Field label="Received">{stamp(hit.latestDate)}</Field>
            <Field label="Mailbox">{hit.mailboxEmail}</Field>
          </dl>
        </div>
      );
  }
}

export function SearchPreview({
  workspaceSlug,
  item,
  onNavigate,
}: {
  workspaceSlug: string;
  item: SearchItem | null;
  onNavigate: () => void;
}) {
  if (!item) {
    return <p className="text-[12px] text-faint">Pick a result to see it here.</p>;
  }
  switch (item.source) {
    case "mail":
      return <MailPreview workspaceSlug={workspaceSlug} hit={item.hit} />;
    case "event":
      return <EventPreview hit={item.hit} />;
    case "file":
      return <FilePreview hit={item.hit} />;
    case "local":
      return <LocalPreview workspaceSlug={workspaceSlug} hit={item.hit} onNavigate={onNavigate} />;
    case "client":
      return (
        <div className="flex flex-col gap-2">
          <Title>{item.entry.title}</Title>
          <p className="text-[12px] text-faint">Press Enter to run it.</p>
        </div>
      );
    case "recent":
    case "saved":
      return (
        <div className="flex flex-col gap-2">
          <Title>{item.source === "saved" ? item.name : "Recent search"}</Title>
          <p className="font-mono text-[12px] text-muted-foreground">{item.query}</p>
        </div>
      );
    case "suggestion":
      return (
        <div className="flex flex-col gap-2">
          <Title>{item.suggestion.label}</Title>
          {item.suggestion.detail && (
            <p className="text-[12px] text-faint">{item.suggestion.detail}</p>
          )}
          <p className="text-[12px] text-faint">Press Tab or Enter to use it.</p>
        </div>
      );
    case "more":
      return null;
  }
}
