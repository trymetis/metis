import "server-only";
import { CLEARURLS_PROVIDERS } from "../render/clearurls";
import { proxiedImageUrl } from "../render/frame";
import { renderEmailHtml } from "../render/pipeline";
import { compilePrivacyRules, type PrivacyRules } from "../render/rules";
import { TRACKER_VENDORS } from "../render/trackers";
import type { RemoteImages } from "../render/types";
import { textToHtml } from "../text";
import { formatAddresses, parseRaw } from "./source";

export interface PrintOptions {
  images: RemoteImages;
  cleanLinks: boolean;
  origin: string;
  timeZone: string | null;
}

export interface PrintableMessage {
  subject: string;
  from: string;
  to: string;
  date: string;
  bodyHtml: string;
}

let rules: PrivacyRules | null = null;

function privacyRules(): PrivacyRules {
  rules ??= compilePrivacyRules(TRACKER_VENDORS, CLEARURLS_PROVIDERS);
  return rules;
}

function formatDate(value: string | undefined, timeZone: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const format = (zone: string) =>
    date.toLocaleString("en-US", { timeZone: zone, timeZoneName: "short" });
  try {
    return format(timeZone ?? "UTC");
  } catch {
    return format("UTC");
  }
}

export async function printableMessage(
  raw: string,
  options: PrintOptions,
): Promise<PrintableMessage> {
  const email = await parseRaw(raw);
  const { trackers, links } = privacyRules();
  const bodyHtml = email.html
    ? renderEmailHtml(email.html, {
        purpose: "view",
        images: options.images,
        theme: "light",
        trackers,
        links: options.cleanLinks ? links : null,
        proxyUrl: options.images === "proxy" ? (url) => proxiedImageUrl(options.origin, url) : null,
        ownOrigin: options.origin,
      }).html
    : email.text
      ? textToHtml(email.text)
      : "";
  return {
    subject: email.subject || "(no subject)",
    from: formatAddresses(email.from),
    to: formatAddresses(email.to),
    date: formatDate(email.date, options.timeZone),
    bodyHtml,
  };
}
