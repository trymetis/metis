import "server-only";
import PostalMime, { type Address, type Email as ParsedEmail } from "postal-mime";

import { sanitizeError } from "@/lib/errors/sanitize-error";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";

import { readRawMessage } from "../raw";
import { getMailSession } from "../session";
import { errorPage } from "./page-document";

const MAIL_RATE = { scope: "mail-session", limit: 300, windowSec: 60 };

export function parseRaw(raw: string): Promise<ParsedEmail> {
  return PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
}

function mailbox(name: string, address: string): string {
  return name ? `${name} <${address}>` : address;
}

export function formatAddresses(addresses: Address[] | Address | undefined): string {
  const list = addresses === undefined ? [] : Array.isArray(addresses) ? addresses : [addresses];
  return list
    .flatMap((entry) =>
      entry.group
        ? entry.group.map((member) => mailbox(member.name, member.address))
        : [mailbox(entry.name, entry.address)],
    )
    .join(", ");
}

export function headerValue(email: ParsedEmail, key: string): string | undefined {
  return email.headers.find((header) => header.key === key)?.value;
}

export async function readPageSource(
  headers: Headers,
  workspaceSlug: string,
  mailboxSlug: string,
  id: string | null,
): Promise<string | Response> {
  if (!id) return errorPage(400, "Message not found", "The link does not name a message.");
  const mail = await getMailSession(headers, workspaceSlug, mailboxSlug);
  if (!mail) return errorPage(404, "Message not found", "This mailbox is not available to you.");
  const limited = await rateLimit(mail.userId, MAIL_RATE);
  if (!limited.ok) return tooManyRequests(limited);
  try {
    return await readRawMessage(mail.adapter, id);
  } catch (err) {
    console.error("[mail/raw]", err);
    return errorPage(502, "Could not load the message", sanitizeError(err));
  }
}
