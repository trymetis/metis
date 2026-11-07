import { declaredValues } from "./css";
import { requiredLiteral } from "./literal-hint";
import type { TrackerVendor } from "./types";

export interface CompiledVendor {
  vendor: string;
  hints: readonly string[] | null;
  re: RegExp;
}

export interface TrackerRules {
  vendors: readonly CompiledVendor[];
}

const SPACER =
  /cid:|spacer|transparent\.gif|attachments\.office\.net\/owa\/|fedex_collective_logo_|apple_logo_web|sidebar-gradient/i;

const OPEN_PATH =
  /\/(?:open|track\/open|e\/o|wf\/open)(?:[/.?]|$)|\/o\/[A-Za-z0-9_-]{16,}(?:[/?]|$)/i;

const TINY = /^\s*[0-2](?:\.0+)?\s*(?:px)?\s*$/i;

const GENERIC_CLICK: readonly { re: RegExp; vendor: string | null }[] = [
  { re: /list-manage\.com\/track\/click/i, vendor: "Mailchimp" },
  { re: /\/ls\/click\?/i, vendor: "SendGrid" },
  { re: /\/track\/click/i, vendor: null },
  {
    re: /^https?:\/\/(?:click|links?)\.[^/?#]+[/?][^#]*?(?:[A-Za-z0-9_-]{20,}|=[A-Za-z0-9_%.-]{20,})/i,
    vendor: null,
  },
];

function vendorHints(patterns: readonly string[]): readonly string[] | null {
  const hints = patterns.map(requiredLiteral);
  return hints.every((h): h is string => h !== null) ? hints : null;
}

export function compileTrackers(vendors: readonly TrackerVendor[]): TrackerRules {
  return {
    vendors: vendors.map(({ vendor, patterns }) => ({
      vendor,
      hints: vendorHints(patterns),
      re: new RegExp(patterns.map((p) => `(?:${p})`).join("|"), "i"),
    })),
  };
}

export function matchVendor(url: string, rules: TrackerRules): string | null {
  const lower = url.toLowerCase();
  for (const { vendor, hints, re } of rules.vendors) {
    if (hints && !hints.some((h) => lower.includes(h))) continue;
    if (re.test(url)) return vendor;
  }
  return null;
}

export function isSpacer(url: string): boolean {
  return SPACER.test(url);
}

export function hasOpenPath(url: URL): boolean {
  return OPEN_PATH.test(url.pathname);
}

export function isHiddenOrTiny(el: Element): boolean {
  const style = declaredValues(el.getAttribute("style") ?? "");
  const sizes = [
    el.getAttribute("width"),
    el.getAttribute("height"),
    style.get("width") ?? null,
    style.get("height") ?? null,
    style.get("max-width") ?? null,
    style.get("max-height") ?? null,
  ];
  if (sizes.some((s) => s !== null && TINY.test(s))) return true;
  if (/^none$/i.test(style.get("display") ?? "")) return true;
  if (/^hidden$/i.test(style.get("visibility") ?? "")) return true;
  const opacity = style.get("opacity") ?? null;
  return opacity !== null && Number.parseFloat(opacity) === 0;
}

export function declaresLargeSize(el: Element): boolean {
  return ["width", "height"].some((attr) => {
    const v = Number.parseFloat(el.getAttribute(attr) ?? "");
    return Number.isFinite(v) && v > 2;
  });
}

export function clickTracker(
  url: string,
  rules: TrackerRules | null,
): { vendor: string | null } | null {
  const vendor = rules ? matchVendor(url, rules) : null;
  if (vendor) return { vendor };
  const generic = GENERIC_CLICK.find((g) => g.re.test(url));
  return generic ? { vendor: generic.vendor } : null;
}
