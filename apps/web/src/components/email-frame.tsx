"use client";

import { cn } from "@metis/ui/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildFrameDocument, frameColorScheme } from "@/mail/render/frame";
import { BLOCKED_SRC_ATTR } from "@/mail/render/placeholder";
import type { RemoteImages } from "@/mail/render/types";

const SANDBOX = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";
const MIN_HEIGHT = 24;
const LOADING_HEIGHT = 72;
const MIN_FIT_SCALE = 0.75;

interface Fit {
  scale: number;
  width: number;
}

export interface EmailFrameProps {
  html: string;
  images: RemoteImages;
  proxyEndpoint?: string | null;
  adaptive: boolean;
  title?: string;
  className?: string;
  onHeight?: (height: number) => void;
  onBlockedImages?: (urls: Set<string>) => void;
  onLoadImages?: () => void;
}

function linkStatus(anchor: HTMLAnchorElement | HTMLAreaElement): string | null {
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return null;
  const tracked = anchor.getAttribute("data-tracked");
  if (tracked !== null) {
    return `Tracked by ${tracked || "an unknown service"}, destination unknown`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === "mailto:") return `Writes to ${url.pathname}`;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const rest = `${url.pathname}${url.search}`;
    return `Opens ${url.host}${rest === "/" ? "" : rest}`;
  } catch {
    return null;
  }
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && "nodeType" in target && target.nodeType === Node.ELEMENT_NODE;
}

function isEditable(target: EventTarget | null): boolean {
  if (!isElement(target)) return false;
  return (
    ("isContentEditable" in target && target.isContentEditable === true) ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function onKeyDown(e: KeyboardEvent) {
  if (isEditable(e.target)) return;
  const forwarded = new KeyboardEvent("keydown", {
    key: e.key,
    code: e.code,
    location: e.location,
    repeat: e.repeat,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(forwarded);
  if (forwarded.defaultPrevented) e.preventDefault();
}

function anchorOf(target: EventTarget | null) {
  return isElement(target) ? target.closest<HTMLAnchorElement>("a[href], area[href]") : null;
}

export function EmailFrame({
  html,
  images,
  proxyEndpoint,
  adaptive,
  title,
  className,
  onHeight,
  onBlockedImages,
  onLoadImages,
}: EmailFrameProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const onHeightRef = useRef(onHeight);
  const onBlockedRef = useRef(onBlockedImages);
  const onLoadImagesRef = useRef(onLoadImages);
  const [textColor, setTextColor] = useState<string | null>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [fit, setFit] = useState<Fit | null>(null);
  const [measured, setMeasured] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    onHeightRef.current = onHeight;
    onBlockedRef.current = onBlockedImages;
    onLoadImagesRef.current = onLoadImages;
  });

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (el) setTextColor(getComputedStyle(el).color);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the wrapper's inherited colour changes with the theme.
  }, [theme]);

  const srcDoc = useMemo(
    () =>
      textColor === null
        ? null
        : buildFrameDocument(html, {
            images,
            proxyEndpoint,
            adaptive,
            theme,
            textColor,
            title,
          }),
    [html, images, proxyEndpoint, adaptive, theme, textColor, title],
  );

  useEffect(() => () => detachRef.current?.(), []);

  const onOver = (e: Event) => {
    const anchor = anchorOf(e.target);
    setStatus(anchor ? linkStatus(anchor) : null);
  };
  const onLeave = () => setStatus(null);

  function attach() {
    detachRef.current?.();
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if (!frame || !win || !doc?.body) {
      setMeasured(true);
      return;
    }

    const blocked = new Set<string>();
    let lastHeight = -1;
    let lastFit: Fit | null = null;

    const fitWidth = () => {
      const avail = wrapperRef.current?.clientWidth ?? 0;
      const natural = doc.documentElement.scrollWidth;
      if (avail <= 0 || natural <= avail + 1) return null;
      const scale = Math.max(MIN_FIT_SCALE, avail / natural);
      return { scale, width: Math.ceil(avail / scale) };
    };

    const measure = () => {
      const body = doc.body;
      if (!body) return;
      const root = doc.documentElement;
      const rect = body.getBoundingClientRect();
      const bodyStyle = win.getComputedStyle(body);
      const rootStyle = win.getComputedStyle(root);
      const scrollbar = Math.max(0, win.innerHeight - root.clientHeight);
      const next = Math.max(
        MIN_HEIGHT,
        Math.ceil(
          Math.max(rect.bottom, rect.top + body.scrollHeight) +
            Number.parseFloat(bodyStyle.marginBottom || "0") +
            Number.parseFloat(rootStyle.paddingBottom || "0") +
            scrollbar,
        ),
      );
      const nextFit = fitWidth();
      if (nextFit?.scale !== lastFit?.scale || nextFit?.width !== lastFit?.width) {
        lastFit = nextFit;
        setFit(nextFit);
      }
      if (next === lastHeight) return;
      lastHeight = next;
      setHeight(next);
      setMeasured(true);
      onHeightRef.current?.(next);
    };

    const Observer =
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the iframe's window carries its own realm's ResizeObserver, which lib.dom declares only on the top-level globalThis
      (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ??
      ResizeObserver;
    const inner = new Observer(measure);
    inner.observe(doc.documentElement);
    inner.observe(doc.body);
    const outer = new ResizeObserver(measure);
    outer.observe(frame);
    if (wrapperRef.current) outer.observe(wrapperRef.current);
    doc.fonts?.ready.then(measure, () => {});

    const onResourceLoad = () => measure();

    const onViolation = (e: SecurityPolicyViolationEvent) => {
      if (process.env.NODE_ENV !== "production") {
        let host = e.blockedURI;
        try {
          host = new URL(e.blockedURI).host;
        } catch {}
        console.debug("[email-frame] blocked", e.effectiveDirective, host);
      }
      if (e.effectiveDirective !== "img-src" || !e.blockedURI) return;
      if (blocked.has(e.blockedURI)) return;
      blocked.add(e.blockedURI);
      onBlockedRef.current?.(new Set(blocked));
    };

    const onClick = (e: MouseEvent) => {
      if (
        isElement(e.target) &&
        e.target.closest(`[${BLOCKED_SRC_ATTR}]`) &&
        !anchorOf(e.target) &&
        onLoadImagesRef.current
      ) {
        e.preventDefault();
        onLoadImagesRef.current();
        return;
      }
      const anchor = anchorOf(e.target);
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("#")) return;
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target = (id && doc.getElementById(id)) || (id && doc.getElementsByName(id)[0]) || null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    doc.addEventListener("load", onResourceLoad, true);
    doc.addEventListener("error", onResourceLoad, true);
    doc.addEventListener("securitypolicyviolation", onViolation);
    doc.addEventListener("click", onClick);
    doc.addEventListener("mouseover", onOver);
    doc.addEventListener("focusin", onOver);
    doc.documentElement.addEventListener("mouseleave", onLeave);
    win.addEventListener("keydown", onKeyDown);
    measure();

    detachRef.current = () => {
      inner.disconnect();
      outer.disconnect();
      doc.removeEventListener("load", onResourceLoad, true);
      doc.removeEventListener("error", onResourceLoad, true);
      doc.removeEventListener("securitypolicyviolation", onViolation);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("mouseover", onOver);
      doc.removeEventListener("focusin", onOver);
      doc.documentElement.removeEventListener("mouseleave", onLeave);
      win.removeEventListener("keydown", onKeyDown);
      detachRef.current = null;
    };
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative overflow-hidden rounded-lg text-muted-foreground", className)}
      style={
        !measured
          ? { minHeight: LOADING_HEIGHT }
          : fit
            ? { height: Math.ceil(height * fit.scale) }
            : undefined
      }
    >
      {srcDoc !== null && (
        <iframe
          ref={frameRef}
          title={title ?? "Email content"}
          sandbox={SANDBOX}
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          onLoad={attach}
          className={cn("block w-full border-0", !measured && "pointer-events-none opacity-0")}
          style={{
            height,
            colorScheme: frameColorScheme({ adaptive, theme }),
            ...(fit && {
              width: fit.width,
              transform: `scale(${fit.scale})`,
              transformOrigin: "0 0",
            }),
          }}
        />
      )}
      {!measured && (
        <div className="absolute inset-0 space-y-3" aria-hidden>
          {[90, 75, 82].map((w) => (
            <div
              key={w}
              className="h-4 animate-pulse rounded bg-hover"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      )}
      {status && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50 max-w-[min(36rem,calc(100vw-1.5rem))] truncate rounded-md border border-border bg-panel px-2 py-0.5 font-mono text-[11px] text-muted-foreground shadow-sm">
          {status}
        </div>
      )}
    </div>
  );
}
