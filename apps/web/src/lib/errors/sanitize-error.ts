import "server-only";
import { isRecord } from "@/lib/guards";

import { NotVisibleError } from "./not-visible";
import { ProviderError, statusOf } from "./provider-error";

const OPERATIONS: Record<string, string> = {
  "mail.messages.send": "send your email",
  "mail.messages.list": "load your mail",
  "mail.messages.get": "open that email",
  "mail.messages.search": "run that search",
  "mail.messages.delete": "delete that email",
  "mail.messages.bulkDelete": "delete those emails",
  "mail.messages.archive": "archive that email",
  "mail.messages.restore": "restore that email",
  "mail.messages.snooze": "snooze that email",
  "mail.messages.star": "update that email",
  "mail.messages.markRead": "update that email",
  "mail.messages.getRaw": "load the original message",
  "mail.drafts.save": "save your draft",
  "mail.drafts.delete": "delete that draft",
  "mail.signatures.list": "load the signatures",
  "mail.signatures.save": "save that signature",
  "mail.signatures.delete": "delete that signature",
  "mail.signatures.forCompose": "load your signatures",
  "workspaceSignatures.list": "load the workspace signatures",
  "workspaceSignatures.save": "save that signature",
  "workspaceSignatures.delete": "delete that signature",
  "workspaceSignatures.setFooter": "save the mail footer",
  "mail.thread.get": "load that conversation",
  "mail.attachments.list": "load the attachments",
  "mail.attachments.download": "download that attachment",
  "mail.subscriptions.list": "scan your subscriptions",
  "mail.subscriptions.unsubscribe": "unsubscribe you",
  "mail.scheduledSend.create": "schedule that email",
  "calendarEvents.list": "load your events",
  "calendarEvents.get": "open that event",
  "calendarEvents.create": "create that event",
  "calendarEvents.update": "update that event",
  "calendarEvents.delete": "delete that event",
  "calendarEvents.respond": "send your reply",
  "contacts.books": "load your address books",
  "contacts.list": "load your contacts",
  "contacts.get": "open that contact",
  "contacts.create": "save that contact",
  "contacts.update": "update that contact",
  "contacts.delete": "delete that contact",
  "ai.analyzePhishing": "check that email",
  "ai.threadSummary": "summarize that conversation",
  "signup.first": "create your account",
  "signup.invitePreview": "check that invite",
  "signup.invite": "create your account",
  "drive.list": "load this folder",
  "drive.search": "search this drive",
  "drive.get": "open that file",
  "drive.createFolder": "create that folder",
  "drive.rename": "rename that item",
  "drive.move": "move that item",
  "drive.delete": "delete that item",
  "drive.pin": "pin that item",
  "drive.unpin": "unpin that item",
  "drive.beginUpload": "start that upload",
};

const PERMISSION_REASONS = new Set([
  "forbidden",
  "insufficientpermissions",
  "insufficientfilepermissions",
  "appnotauthorizedtofile",
  "domainpolicy",
]);

const RATE_LIMIT_REASONS = new Set([
  "ratelimitexceeded",
  "userratelimitexceeded",
  "quotaexceeded",
  "dailylimitexceeded",
]);

function reasonsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.reason === "string" ? [entry.reason.toLowerCase()] : [],
  );
}

function reasonsFromBody(body: unknown): string[] {
  let data = body;
  if (typeof body === "string") {
    try {
      data = JSON.parse(body);
    } catch {
      return [];
    }
  }
  return isRecord(data) && isRecord(data.error) ? reasonsIn(data.error.errors) : [];
}

function reasonsOf(err: unknown): string[] {
  if (err instanceof ProviderError) return reasonsFromBody(err.body);
  if (!isRecord(err)) return [];
  const direct = reasonsIn(err.errors);
  if (direct.length) return direct;
  return isRecord(err.response) ? reasonsFromBody(err.response.data) : [];
}

function operationFor(path?: readonly string[]): string | undefined {
  if (!path?.length) return undefined;
  return OPERATIONS[path.join(".")];
}

function lead(what: string | undefined, fallback: string): string {
  return what ? `Couldn't ${what}` : fallback;
}

function fromStatus(
  status: number,
  what: string | undefined,
  reasons: string[],
): string | undefined {
  if (status === 401) {
    return "This account needs to be reconnected.";
  }
  if (status === 403 && reasons.some((reason) => RATE_LIMIT_REASONS.has(reason))) {
    return `${lead(what, "That didn't go through")} — too many requests just now. Wait a moment and try again.`;
  }
  if (status === 403 && reasons.length > 0 && !reasons.some((r) => PERMISSION_REASONS.has(r))) {
    return `${lead(what, "That didn't go through")}. Try again.`;
  }
  if (status === 403) {
    return what ? `You don't have permission to ${what}.` : "You don't have permission to do that.";
  }
  if (status === 404 || status === 410) {
    return what
      ? `${lead(what, "We couldn't find that")} — it may have been moved or deleted.`
      : "We couldn't find that.";
  }
  if (status === 429) {
    return `${lead(what, "That didn't go through")} — too many requests just now. Wait a moment and try again.`;
  }
  if (status === 408 || status === 504) {
    return `${lead(what, "That didn't go through")} — the request timed out. Try again.`;
  }
  if (status === 413) {
    return `${lead(what, "That didn't go through")} — it's too large.`;
  }
  if (status >= 500) {
    return `${lead(what, "That didn't go through")} — something went wrong on the other end. Try again shortly.`;
  }
  if (status >= 400) {
    return `${lead(what, "That didn't go through")}. Try again.`;
  }
  return undefined;
}

function fromText(raw: string, what: string | undefined): string {
  if (
    raw.includes("unauthorized") ||
    raw.includes("invalid_grant") ||
    raw.includes("invalid credentials") ||
    raw.includes("could not authenticate") ||
    raw.includes("token expired")
  ) {
    return "This account needs to be reconnected.";
  }
  if (
    raw.includes("forbidden") ||
    raw.includes("insufficient permission") ||
    raw.includes("insufficient authentication") ||
    raw.includes("permission denied") ||
    raw.includes("access denied")
  ) {
    return what ? `You don't have permission to ${what}.` : "You don't have permission to do that.";
  }
  if (raw.includes("not found")) {
    return what
      ? `${lead(what, "We couldn't find that")} — it may have been moved or deleted.`
      : "We couldn't find that.";
  }
  if (raw.includes("rate limit") || raw.includes("too many requests")) {
    return `${lead(what, "That didn't go through")} — too many requests just now. Wait a moment and try again.`;
  }
  if (
    raw.includes("fetch failed") ||
    raw.includes("econnrefused") ||
    raw.includes("enotfound") ||
    raw.includes("etimedout") ||
    raw.includes("socket") ||
    raw.includes("network")
  ) {
    return `${lead(what, "That didn't go through")} — check your connection and try again.`;
  }
  return `${lead(what, "That didn't go through")}. Try again.`;
}

export function sanitizeError(err: unknown, path?: readonly string[]): string {
  if (err instanceof NotVisibleError) return err.clientMessage;
  const what = operationFor(path);

  const status = statusOf(err);
  if (status !== undefined) {
    const byStatus = fromStatus(status, what, reasonsOf(err));
    if (byStatus) return byStatus;
  }

  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return fromText(raw, what);
}
