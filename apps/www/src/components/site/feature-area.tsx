"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AREAS, type AreaKey, type Feature } from "@/content/features";
import FOCUS from "@/content/shots.json";

const W = 1440;
const H = 900;
const MAX_ZOOM = 2.1;

type Focus = { x: number; y: number; w: number; h: number } | null;

function focusOf(shot: string): Focus {
  const f = (FOCUS as Record<string, number[] | null>)[shot];
  if (f?.length !== 4) return null;
  const [x = 0, y = 0, w = W, h = H] = f;
  return { x: x / W, y: y / H, w: w / W, h: h / H };
}

function zoomFor(f: Focus) {
  if (!f) return { s: 1, tx: 0, ty: 0 };
  const s = Math.min(MAX_ZOOM, Math.max(1, Math.min(0.86 / f.w, 0.86 / f.h)));
  const clamp = (v: number) => Math.min(0, Math.max(1 - s, v));
  return {
    s,
    tx: clamp(0.5 - (f.x + f.w / 2) * s),
    ty: clamp(0.5 - (f.y + f.h / 2) * s),
  };
}

function shotAt(features: Feature[], i: number) {
  for (let k = i; k >= 0; k--) {
    const f = features[k];
    if (f?.shot) return { shot: f.shot, t: f.t };
  }
  const first = features.find((f) => f.shot);
  return { shot: first?.shot ?? "", t: first?.t ?? "" };
}

function Shot({ name, on, alt }: { name: string; on: boolean; alt: string }) {
  const f = focusOf(name);
  const { s, tx, ty } = zoomFor(f);
  return (
    <div
      aria-hidden={!on}
      className={`absolute inset-0 transition-opacity duration-500 ${on ? "opacity-100" : "opacity-0"}`}
    >
      <div
        className="absolute inset-0 origin-top-left transition-transform duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          transform: on ? `translate(${tx * 100}%, ${ty * 100}%) scale(${s})` : "none",
        }}
      >
        <Image
          src={`/shots/${name}.webp`}
          alt={alt}
          width={W}
          height={H}
          loading="eager"
          sizes="(min-width: 1024px) 1200px, 200vw"
          className="h-full w-full object-cover"
        />
        {f ? (
          <div
            className={`absolute rounded-[10px] transition-opacity delay-300 duration-700 ${on ? "opacity-100" : "opacity-0"}`}
            style={{
              left: `${f.x * 100}%`,
              top: `${f.y * 100}%`,
              width: `${f.w * 100}%`,
              height: `${f.h * 100}%`,
              boxShadow: `0 0 0 ${2 / s}px #c8922a, 0 0 0 9999px rgba(17,17,16,0.22)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function FeatureTitle({ feature, size }: { feature: Feature; size: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className={`${size} font-medium tracking-[-0.01em] text-ink`}>{feature.t}</h3>
      {feature.tag ? (
        <span className="label rounded-full bg-amber-soft px-2 py-0.5 !text-[9.5px] text-amber-text">
          {feature.tag}
        </span>
      ) : null}
    </div>
  );
}

export function FeatureArea({
  area,
  heading = "h2",
  flip = false,
  link = true,
}: {
  area: AreaKey;
  heading?: "h1" | "h2";
  flip?: boolean;
  link?: boolean;
}) {
  const a = AREAS[area];
  const H2 = heading;
  const shots = useMemo(
    () => [...new Set(a.features.flatMap((f) => (f.shot ? [f.shot] : [])))],
    [a.features],
  );
  const hasShots = shots.length > 0;
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasShots) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    const measure = () => {
      raf = 0;
      const items = list.current?.children;
      if (!items) return;
      const vh = window.innerHeight;
      const below = frame.current?.getBoundingClientRect().bottom ?? 0;
      const line = wide.matches ? vh * 0.5 : below + (vh - below) * 0.3;
      let pick = 0;
      for (const [i, item] of [...items].entries()) {
        if (item.getBoundingClientRect().top <= line) pick = i;
      }
      setActive(pick);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [hasShots]);

  const current = shotAt(a.features, active);

  return (
    <section
      id={area}
      className="relative z-[6] scroll-mt-[var(--nav)] border-t border-line bg-bg px-[var(--gx)] py-24 md:py-32"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <H2 data-reveal className="display max-w-[18ch] text-[clamp(40px,4.6vw,72px)]">
              {a.title[0]} <em>{a.title[1]}</em>
            </H2>
            <p data-reveal className="prose-lede mt-5 max-w-[40rem]">
              {a.lede}
            </p>
          </div>
          {a.href && link ? (
            <Link
              data-reveal
              href={a.href}
              className="group inline-flex shrink-0 items-center gap-1.5 text-[15px] font-medium text-amber-text"
            >
              See how {a.kicker} works
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
          ) : null}
        </div>

        {hasShots ? (
          <div
            className={`mt-12 grid items-start gap-8 lg:gap-14 ${flip ? "lg:grid-cols-[1fr_1.5fr]" : "lg:grid-cols-[1.5fr_1fr]"}`}
          >
            <div
              ref={frame}
              className={`sticky top-[var(--nav)] z-[2] -mx-[var(--gx)] bg-bg px-[var(--gx)] pb-4 pt-3 lg:top-[max(calc(var(--nav)+24px),calc(50svh-min(19vw,260px)))] lg:mx-0 lg:bg-transparent lg:p-0 ${flip ? "lg:order-2" : ""}`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[18px] bg-panel shadow-[0_50px_90px_-50px_rgba(42,38,32,0.45)] ring-1 ring-black/10">
                {shots.map((s) => (
                  <Shot
                    key={s}
                    name={s}
                    on={s === current.shot}
                    alt={a.features.find((f) => f.shot === s)?.t ?? `${a.kicker} screenshot`}
                  />
                ))}
              </div>
              <p className="mt-3 text-[13px] text-ink-3">
                <span key={current.t} className="caption-in inline-block">
                  {current.t}
                </span>
              </p>
            </div>
            <ul ref={list} className="border-t border-line lg:pb-[30svh]">
              {a.features.map((f, i) => (
                <li
                  key={f.t}
                  className={`relative flex gap-4 border-b border-line py-6 transition-opacity duration-500 ${
                    active === i ? "opacity-100" : "opacity-45"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -left-4 top-6 bottom-6 w-[2px] origin-top rounded-full bg-amber transition-transform duration-500 ${
                      active === i ? "scale-y-100" : "scale-y-0"
                    }`}
                  />
                  <f.icon className="mt-0.5 size-5 shrink-0 text-amber-text" strokeWidth={1.6} />
                  <div>
                    <FeatureTitle feature={f} size="text-[17px]" />
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{f.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="mt-12 grid border-t border-line sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
            {a.features.map((f) => (
              <li key={f.t} className="flex gap-4 border-b border-line py-5">
                <f.icon className="mt-0.5 size-5 shrink-0 text-amber-text" strokeWidth={1.6} />
                <div>
                  <FeatureTitle feature={f} size="text-[16.5px]" />
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{f.d}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
