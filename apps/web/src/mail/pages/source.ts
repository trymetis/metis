import "server-only";
import PostalMime, { type Address, type Email as ParsedEmail } from "postal-mime";

import { sanitizeError } from "@/lib/errors/sanitize-error";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import { readRawMessage } from "../raw";
import { getMailSession } from "../session";
import { errorPage } from "./page-document";

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
  const limited = await rateLimit(mail.userId, RATE_LIMITS.mailSession);
  if (!limited.ok) {
    const { message, retryAfterSec } = new RateLimitedError(limited);
    const page = await errorPage(429, "Too many requests", message);
    page.headers.set("Retry-After", String(retryAfterSec));
    return page;
  }
  try {
    return await readRawMessage(mail.adapter, id);
  } catch (err) {
    console.error("[mail/raw]", err);
    return errorPage(502, "Could not load the message", sanitizeError(err));
  }
}
