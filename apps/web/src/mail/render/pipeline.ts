import { sanitizeEmailHtml } from "@/lib/sanitize-html";

import { rewriteDeclarations, rewriteStylesheet, rewriteValue, type StyleFacts } from "./css";
import {
  clickTracker,
  declaresLargeSize,
  hasOpenPath,
  isHiddenOrTiny,
  isSpacer,
  matchVendor,
  type TrackerRules,
} from "./detect";
import { cleanLink, type LinkRules } from "./links";
import { BLOCKED_SRC_ATTR, declaredSize, placeholderImage } from "./placeholder";
import type { RemoteImages, TrackerHit, TrackerKind } from "./types";
import { absoluteRemote, isInlineUrl, parseSrcset, serializeSrcset, type UrlMapper } from "./urls";

export interface RenderOptions {
  purpose: "view" | "quote";
  images?: RemoteImages;
  theme?: "light" | "dark";
  trackers: TrackerRules | null;
  links: LinkRules | null;
  proxyUrl?: ((url: string) => string) | null;
  ownOrigin?: string | null;
}

export interface RenderedEmail {
  html: string;
  trackers: TrackerHit[];
  remoteImages: number;
  adaptive: boolean;
}

type Classified = { kind: "keep" } | { kind: "drop" } | { kind: "remote"; url: string };

const META_TAG = /<meta\b[^>]*>/gi;
const COLOR_ATTRIBUTES = ["bgcolor", "color", "text", "link", "vlink", "alink", "background"];
const SVG_URL_ATTRIBUTES = [
  "fill",
  "stroke",
  "filter",
  "mask",
  "clip-path",
  "marker-start",
  "marker-mid",
  "marker-end",
  "cursor",
];

const SVG_RESOURCE = new Set(["image", "feimage", "use"]);

function metaDeclaresDark(raw: string): boolean {
  return (raw.match(META_TAG) ?? []).some(
    (tag) => /(?:supported-)?color-scheme/i.test(tag) && /\bdark\b/i.test(tag),
  );
}

function pictureOf(el: Element): Element | null {
  const parent = el.parentElement;
  return parent?.localName.toLowerCase() === "picture" ? parent : null;
}

function inPictureWithSources(el: Element): boolean {
  return pictureOf(el)?.querySelector(":scope > source") != null;
}

function hasEarlierSource(el: Element): boolean {
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.localName.toLowerCase() === "source") return true;
    sibling = sibling.previousElementSibling;
  }
  return false;
}

function placeholderFor(el: Element, original: string) {
  const { width, height } = declaredSize(el);
  el.setAttribute(BLOCKED_SRC_ATTR, original);
  return placeholderImage(width, height);
}

export function renderEmailHtml(raw: string, options: RenderOptions): RenderedEmail {
  const hits = new Map<string, TrackerHit>();
  const remote = new Set<string>();
  const quote = options.purpose === "quote";
  const images: RemoteImages = quote ? "load" : (options.images ?? "load");
  const proxy = images === "proxy" ? options.proxyUrl : null;
  const blocked = images === "block";

  const classify = (value: string, kind: TrackerKind, element?: Element): Classified => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("#") || isInlineUrl(trimmed)) {
      return { kind: "keep" };
    }
    const url = absoluteRemote(trimmed);
    if (!url) return { kind: "drop" };
    if (options.ownOrigin && url.origin === options.ownOrigin) {
      return { kind: "drop" };
    }
    const vendor = options.trackers ? matchVendor(url.href, options.trackers) : null;
    const pixel =
      !vendor &&
      element !== undefined &&
      !isSpacer(url.href) &&
      (isHiddenOrTiny(element) || (hasOpenPath(url) && !declaresLargeSize(element)));
    if (vendor || pixel) {
      if (!hits.has(url.href)) {
        hits.set(url.href, { vendor, kind: pixel ? "pixel" : kind });
      }
      return { kind: "drop" };
    }
    return { kind: "remote", url: url.href };
  };

  const loadable = (url: string, counted = true): string => {
    if (counted) remote.add(url);
    return proxy ? proxy(url) : url;
  };

  const facts: StyleFacts = { declaresDark: false, setsColors: false };
  const mapCssUrl: UrlMapper = (u) => {
    const c = classify(u, "css");
    if (c.kind === "keep") return u;
    if (c.kind === "drop") return null;
    if (blocked) {
      remote.add(c.url);
      return null;
    }
    return loadable(c.url);
  };

  const visit = (el: Element) => {
    const tag = el.localName.toLowerCase();
    el.removeAttribute(BLOCKED_SRC_ATTR);

    if (tag === "style") {
      if (quote) {
        el.remove();
        return;
      }
      el.textContent = rewriteStylesheet(el.textContent ?? "", {
        map: mapCssUrl,
        theme: options.theme,
        facts,
      });
      return;
    }

    const style = el.getAttribute("style");
    if (style !== null) {
      const rewritten = rewriteDeclarations(style, { map: mapCssUrl, facts });
      if (rewritten) el.setAttribute("style", rewritten);
      else el.removeAttribute("style");
    }
    for (const name of SVG_URL_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value !== null) el.setAttribute(name, rewriteValue(value, mapCssUrl));
    }
    if (COLOR_ATTRIBUTES.some((name) => el.hasAttribute(name))) facts.setsColors = true;

    const counted =
      !(tag === "img" && inPictureWithSources(el)) && !(tag === "source" && hasEarlierSource(el));

    const srcset = el.getAttribute("srcset");
    const blockedSet: { url: string | null } = { url: null };
    if (srcset !== null) {
      let first = true;
      const kept = parseSrcset(srcset).flatMap((candidate) => {
        const c = classify(candidate.url, "image");
        if (c.kind === "drop") return [];
        if (c.kind === "keep") return [candidate];
        const count = counted && first;
        first = false;
        if (blocked) {
          if (count) remote.add(c.url);
          blockedSet.url ??= c.url;
          const picture = tag === "source" ? pictureOf(el) : null;
          if (picture && !picture.hasAttribute(BLOCKED_SRC_ATTR)) {
            picture.setAttribute(BLOCKED_SRC_ATTR, c.url);
          }
          return [];
        }
        return [{ ...candidate, url: loadable(c.url, count) }];
      });
      if (kept.length === 0) el.removeAttribute("srcset");
      else el.setAttribute("srcset", serializeSrcset(kept));
    }

    if (tag === "img") {
      const src = el.getAttribute("src");
      if (src !== null) {
        const c = classify(src, "pixel", el);
        if (c.kind === "drop") {
          if (absoluteRemote(src)) {
            el.remove();
            return;
          }
          el.removeAttribute("src");
        } else if (c.kind === "remote") {
          if (blocked) {
            if (counted) remote.add(c.url);
            el.setAttribute("src", placeholderFor(el, c.url));
          } else {
            el.setAttribute("src", loadable(c.url, counted));
          }
        }
      }
      const pictureBlocked = pictureOf(el)?.getAttribute(BLOCKED_SRC_ATTR);
      const fallback = blockedSet.url ?? pictureBlocked;
      if (blocked && fallback && !el.hasAttribute(BLOCKED_SRC_ATTR)) {
        el.setAttribute("src", placeholderFor(el, fallback));
      }
    }

    if (tag === "source") {
      const src = el.getAttribute("src");
      if (src !== null) {
        const c = classify(src, "image");
        if (c.kind === "drop" || (c.kind === "remote" && blocked)) {
          el.removeAttribute("src");
        } else if (c.kind === "remote") {
          el.setAttribute("src", loadable(c.url, counted));
        }
      }
    }

    const background = el.getAttribute("background");
    if (background !== null) {
      const c = classify(background, "image");
      if (c.kind === "drop") el.removeAttribute("background");
      else if (c.kind === "remote") {
        if (blocked) {
          remote.add(c.url);
          el.removeAttribute("background");
        } else {
          el.setAttribute("background", loadable(c.url));
        }
      }
    }

    if (SVG_RESOURCE.has(tag)) {
      for (const name of ["href", "xlink:href"]) {
        const value = el.getAttribute(name);
        if (value === null) continue;
        if (tag === "use" && !value.startsWith("#")) {
          el.removeAttribute(name);
          continue;
        }
        const c = classify(value, "image");
        if (c.kind === "drop") el.removeAttribute(name);
        else if (c.kind === "remote") {
          if (blocked) {
            remote.add(c.url);
            el.setAttribute(name, placeholderFor(el, c.url));
          } else {
            el.setAttribute(name, loadable(c.url));
          }
        }
      }
    }

    if (tag === "a" || tag === "area") {
      el.removeAttribute("data-tracked");
      const href = el.getAttribute("href");
      if (href === null) return;
      const trimmed = href.trim();
      if (trimmed.startsWith("#")) {
        el.removeAttribute("target");
        return;
      }
      if (/^(?:mailto|tel):/i.test(trimmed)) {
        el.setAttribute("target", "_blank");
        return;
      }
      const url = absoluteRemote(trimmed);
      if (!url) {
        el.removeAttribute("href");
        return;
      }
      const cleaned = options.links ? cleanLink(url.href, options.links) : null;
      const final = cleaned?.changed ? cleaned.href : trimmed;
      if (final !== href) el.setAttribute("href", final);
      const tracked = cleaned?.wrappedBy
        ? { vendor: cleaned.wrappedBy }
        : clickTracker(final, options.trackers);
      if (tracked) el.setAttribute("data-tracked", tracked.vendor ?? "");
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  };

  const html = sanitizeEmailHtml(raw, visit);
  return {
    html,
    trackers: [...hits.values()],
    remoteImages: remote.size,
    adaptive: facts.declaresDark || metaDeclaresDark(raw) || !facts.setsColors,
  };
}

export function cleanUrl(url: string, links: LinkRules | null): string {
  if (!links) return url;
  const cleaned = cleanLink(url, links);
  return cleaned.changed ? cleaned.href : url;
}
