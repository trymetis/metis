import "server-only";
import type { UIMessage } from "ai";
import type { z } from "zod";

import { TURN_PART_TYPE, turnEnvelopeSchema } from "@/ai/turn";
import { truncate } from "@/lib/utils";

type ParsedEnvelope = z.infer<typeof turnEnvelopeSchema>;

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attrs(pairs: Record<string, string | number | boolean | undefined>) {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("");
}

function el(name: string, value: string | undefined) {
  return value ? [`<${name}>${esc(value)}</${name}>`] : [];
}

function renderMail(envelope: Extract<ParsedEnvelope, { kind: "mail" }>) {
  const lines = [
    `<turn${attrs({
      "sent-at": envelope.sentAt,
      "time-zone": envelope.timeZone,
      folder: envelope.folder,
    })}>`,
  ];

  if (envelope.emails.length === 0) {
    lines.push('<attached-emails count="0" />');
  } else {
    lines.push(`<attached-emails count="${envelope.emails.length}">`);
    for (const email of envelope.emails) {
      lines.push(
        `<email${attrs({
          id: email.id,
          date: email.date,
          folder: email.folder,
          mailbox: email.mailboxEmail,
          read: email.isRead,
          starred: email.isStarred,
        })}>`,
      );
      lines.push(
        ...el("from", email.fromEmail ? `${email.from} <${email.fromEmail}>` : email.from),
      );
      if (email.to?.length) lines.push(...el("to", email.to.join(", ")));
      lines.push(...el("subject", email.subject));
      lines.push(...el("snippet", truncate(email.snippet, 240)));
      lines.push("</email>");
    }
    lines.push("</attached-emails>");
  }

  lines.push("</turn>");
  return lines.join("\n");
}

function renderCalendar(envelope: Extract<ParsedEnvelope, { kind: "calendar" }>) {
  const lines = [
    `<turn${attrs({
      "sent-at": envelope.sentAt,
      "time-zone": envelope.timeZone,
      view: envelope.view,
      "range-start": envelope.visibleRange?.start,
      "range-end": envelope.visibleRange?.end,
    })}>`,
  ];

  if (envelope.events.length === 0) {
    lines.push('<attached-events count="0" />');
  } else {
    lines.push(`<attached-events count="${envelope.events.length}">`);
    for (const event of envelope.events) {
      lines.push(
        `<event${attrs({
          id: event.id,
          "calendar-id": event.calendarId,
          "account-id": event.accountId,
          start: event.start,
          end: event.end,
          "all-day": event.allDay,
        })}>`,
      );
      lines.push(...el("title", event.title));
      lines.push(...el("location", event.location));
      lines.push(...el("calendar", event.calendarName));
      lines.push("</event>");
    }
    lines.push("</attached-events>");
  }

  lines.push("</turn>");
  return lines.join("\n");
}

function renderDrive(envelope: Extract<ParsedEnvelope, { kind: "drive" }>) {
  const lines = [
    `<turn${attrs({
      "sent-at": envelope.sentAt,
      "time-zone": envelope.timeZone,
      "folder-id": envelope.folderId,
      "folder-path": envelope.folderPath?.join(" / "),
    })}>`,
  ];

  if (envelope.files.length === 0) {
    lines.push('<attached-files count="0" />');
  } else {
    lines.push(`<attached-files count="${envelope.files.length}">`);
    for (const file of envelope.files) {
      lines.push(
        `<file${attrs({
          id: file.id,
          kind: file.kind,
          "mime-type": file.mimeType,
          size: file.size,
          modified: file.modifiedAt,
          drive: file.driveSlug,
        })}>`,
      );
      lines.push(...el("name", file.name));
      lines.push("</file>");
    }
    lines.push("</attached-files>");
  }

  lines.push("</turn>");
  return lines.join("\n");
}

function renderContacts(envelope: Extract<ParsedEnvelope, { kind: "contacts" }>) {
  const lines = [`<turn${attrs({ "sent-at": envelope.sentAt, "time-zone": envelope.timeZone })}>`];
  if (envelope.contacts.length === 0) {
    lines.push('<attached-contacts count="0" />');
  } else {
    lines.push(`<attached-contacts count="${envelope.contacts.length}">`);
    for (const contact of envelope.contacts) {
      lines.push(
        `<contact${attrs({
          "address-book-id": contact.addressBookId,
          "book-id": contact.bookId,
          "contact-id": contact.contactId,
          book: contact.bookName,
        })}>`,
      );
      lines.push(...el("name", contact.name));
      lines.push(...el("email", contact.email));
      lines.push("</contact>");
    }
    lines.push("</attached-contacts>");
  }
  lines.push("</turn>");
  return lines.join("\n");
}

function renderWorkspace(envelope: Extract<ParsedEnvelope, { kind: "workspace" }>) {
  return `<turn${attrs({
    "sent-at": envelope.sentAt,
    "time-zone": envelope.timeZone,
  })} />`;
}

function renderEnvelope(envelope: ParsedEnvelope) {
  if (envelope.kind === "mail") return renderMail(envelope);
  if (envelope.kind === "calendar") return renderCalendar(envelope);
  if (envelope.kind === "drive") return renderDrive(envelope);
  if (envelope.kind === "contacts") return renderContacts(envelope);
  return renderWorkspace(envelope);
}

export function applyTurnEnvelopes(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;

    const parts = [];
    let rendered: string | null = null;

    for (const part of message.parts) {
      if (part.type !== TURN_PART_TYPE) {
        parts.push(part);
        continue;
      }
      const parsed = turnEnvelopeSchema.safeParse(part.data);
      if (parsed.success) rendered = renderEnvelope(parsed.data);
    }

    if (!rendered) return message;
    return {
      ...message,
      parts: [{ type: "text" as const, text: rendered }, ...parts],
    };
  });
}
