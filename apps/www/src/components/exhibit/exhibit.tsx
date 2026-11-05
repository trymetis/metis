"use client";

import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { scrollToY } from "@/lib/lenis";

import { damp, exhibit, live, ROMAN, useExhibit } from "./engine";
import type { ModelKey, Pose } from "./types";

const Stage = dynamic(() => import("./stage"), { ssr: false });

export type Chip = { label: string; color?: string };

export type PlateDef = {
  label: string;
  title: ReactNode;
  text: ReactNode;
  chips?: Chip[];
  link?: { href: Route; label: string };
};

const STEP = 1.1;

function Chips({ chips }: { chips: Chip[] }) {
  const pick = useExhibit((s) => s.pick);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover reset spans the gaps between chips; each chip button handles focus and blur
    <ul
      className="mt-5 flex flex-wrap justify-center gap-2"
      onMouseLeave={() => exhibit.set({ pick: null })}
    >
      {chips.map((c, i) => (
        <li key={c.label}>
          <button
            type="button"
            onMouseEnter={() => exhibit.set({ pick: i })}
            onFocus={() => exhibit.set({ pick: i })}
            onBlur={() => exhibit.set({ pick: null })}
            onClick={() => exhibit.set({ pick: pick === i ? null : i })}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[14px] transition-colors duration-300 ${
              pick === i
                ? "border-ink bg-ink text-bg"
                : "border-line bg-bg/70 text-ink hover:border-ink/40"
            }`}
          >
            {c.color ? (
              <span className="size-2 rounded-full" style={{ background: c.color }} />
            ) : null}
            {c.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Rail({ plates, onGo }: { plates: PlateDef[]; onGo: (i: number) => void }) {
  const plate = useExhibit((s) => s.plate);
  return (
    <nav
      aria-label="Plates"
      className="absolute right-[var(--gx)] top-1/2 z-[3] hidden -translate-y-1/2 md:block"
    >
      <ol className="flex flex-col items-end gap-1">
        {plates.map((p, i) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => onGo(i)}
              className="group flex h-8 items-center gap-3"
              aria-current={plate === i ? "step" : undefined}
            >
              <span
                className={`label whitespace-nowrap transition-all duration-500 ${
                  plate === i
                    ? "translate-x-0 text-ink opacity-100"
                    : "translate-x-2 text-ink-3 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                }`}
              >
                {p.label}
              </span>
              <span
                className={`h-px transition-all duration-500 ${plate === i ? "w-8 bg-amber" : "w-4 bg-ink-3/60 group-hover:w-6"}`}
              />
              <span
                className={`w-6 text-right font-[family-name:var(--font-display)] text-[17px] italic transition-colors ${plate === i ? "text-amber-text" : "text-ink-3"}`}
              >
                {ROMAN[i]}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function useCaption(plate: number) {
  const [moved, setMoved] = useState(plate !== 0);
  if (plate !== 0 && !moved) setMoved(true);
  return moved ? "caption-in" : "";
}

function Top({
  plates,
  hero,
  band,
}: {
  plates: PlateDef[];
  hero?: ReactNode;
  band: React.RefObject<HTMLDivElement | null>;
}) {
  const plate = useExhibit((s) => s.plate);
  const caption = useCaption(plate);
  const p = plates[plate];
  if (!p) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] px-[var(--gx)] pb-14 pt-[calc(var(--nav)+3.2vh)] text-center [background:linear-gradient(to_bottom,var(--color-bg)_48%,transparent)]">
      <div key={plate} className={`${caption} mx-auto max-w-[980px]`}>
        <div ref={band} aria-hidden="true" className="display text-[clamp(40px,5.1vw,86px)]">
          {plate === 0 && hero ? hero : p.title}
        </div>
      </div>
    </div>
  );
}

function Bottom({
  plates,
  actions,
  band,
}: {
  plates: PlateDef[];
  actions?: ReactNode;
  band: React.RefObject<HTMLDivElement | null>;
}) {
  const plate = useExhibit((s) => s.plate);
  const caption = useCaption(plate);
  const p = plates[plate];
  if (!p) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 z-[3] px-[var(--gx)] pb-[4.5vh] pt-16 text-center [background:linear-gradient(to_top,var(--color-bg)_45%,transparent)]">
      <div ref={band} key={plate} className={`${caption} mx-auto max-w-[620px]`} aria-hidden="true">
        <p className="prose-lede">{p.text}</p>
        {p.chips ? <Chips chips={p.chips} /> : null}
        {plate === 0 && actions ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        ) : null}
        {p.link ? (
          <Link
            href={p.link.href}
            className="group mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-amber-text"
          >
            {p.link.label}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ScrollCue() {
  const plate = useExhibit((s) => s.plate);
  return (
    <div
      className={`pointer-events-none absolute bottom-[3vh] left-[var(--gx)] z-[3] hidden items-center gap-3 text-ink-3 transition-opacity duration-700 md:flex ${
        plate === 0 ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="relative block h-10 w-px overflow-hidden bg-line">
        <span className="absolute inset-x-0 top-0 h-4 animate-[cue_1.8s_ease-in-out_infinite] bg-ink" />
      </span>
      <span className="label">Scroll</span>
    </div>
  );
}

export function Exhibit({
  model,
  headline,
  plates,
  poses,
  hero,
  actions,
}: {
  model: ModelKey;
  headline: string;
  plates: PlateDef[];
  poses: Pose[];
  hero?: ReactNode;
  actions?: ReactNode;
}) {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const above = useRef<HTMLDivElement>(null);
  const below = useRef<HTMLDivElement>(null);
  const n = plates.length;

  useEffect(() => {
    exhibit.reset();
    live.n = n;
    let top = 0;
    let vh = window.innerHeight;
    const layout = () => {
      vh = window.innerHeight;
      const el = track.current;
      if (el) top = el.getBoundingClientRect().top + window.scrollY;
    };
    layout();
    const ro = new ResizeObserver(layout);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", layout);
    const onMove = (e: PointerEvent) => {
      live.px = (e.clientX / window.innerWidth) * 2 - 1;
      live.py = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      const p = Math.min(n - 1, Math.max(0, (window.scrollY - top) / (vh * STEP)));
      live.p = p;
      live.ps = damp(live.ps, p, 6, dt);
      live.sx = damp(live.sx, live.px, 2.5, dt);
      live.sy = damp(live.sy, live.py, 2.5, dt);
      const plate = Math.min(n - 1, Math.round(p));
      if (plate !== exhibit.get().plate) exhibit.set({ plate, pick: null });
      const frame = stage.current?.getBoundingClientRect();
      if (frame && frame.height > 0) {
        const head = above.current?.getBoundingClientRect().bottom ?? frame.top;
        const foot = below.current?.getBoundingClientRect().top ?? frame.bottom;
        live.top = damp(live.top, (head - frame.top) / frame.height, 6, dt);
        live.bottom = damp(live.bottom, (foot - frame.top) / frame.height, 6, dt);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", onMove);
    };
  }, [n]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + i * window.innerHeight * STEP + 2);
  };

  return (
    <section
      ref={track}
      className="relative"
      style={{ height: `${(n - 1) * STEP * 100 + 130}svh` }}
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div ref={stage} className="absolute inset-x-0 -top-[2vh] bottom-[2vh] z-[1]">
          <Stage model={model} poses={poses} />
        </div>
        <Top plates={plates} hero={hero} band={above} />
        <Bottom plates={plates} actions={actions} band={below} />
        <Rail plates={plates} onGo={go} />
        <ScrollCue />
      </div>
      <div className="sr-only">
        <h1>{headline}</h1>
        {plates.map((p) => (
          <div key={p.label}>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
            {p.chips ? <p>{p.chips.map((c) => c.label).join(", ")}</p> : null}
            {p.link ? (
              <Link href={p.link.href} tabIndex={-1}>
                {p.link.label}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
