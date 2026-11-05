"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAV_LINKS, TOOLS } from "@/content/nav";
import { CHANGELOG_URL, CONSOLE_URL, DOCS_URL, GITHUB_URL } from "@/lib/site";

import { GithubMark } from "../ui/github-mark";
import { GithubStars } from "../ui/github-stars";
import { MetisMark } from "../ui/metis-mark";
import { Button } from "./button";

function linkTone(current: boolean, night: boolean) {
  if (night) return current ? "bg-white/10 text-bone" : "text-bone-2 hover:text-bone";
  return current ? "bg-panel text-ink" : "text-ink-2 hover:text-ink";
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overNight, setOverNight] = useState(false);
  const pathname = usePathname();
  const product = useRef<HTMLLIElement>(null);
  const header = useRef<HTMLElement>(null);
  const night = overNight && !open;
  const inProduct = TOOLS.some((t) => t.href === pathname);
  const [shownPath, setShownPath] = useState(pathname);

  if (pathname !== shownPath) {
    setShownPath(pathname);
    if (pathname) {
      setOpen(false);
      setMenu(false);
    }
  }

  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 8);
      const bottom = header.current?.offsetHeight ?? 0;
      setOverNight(
        [...document.querySelectorAll("[data-night]")].some((el) => {
          const r = el.getBoundingClientRect();
          return r.top < bottom && r.bottom > 0;
        }),
      );
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node && product.current?.contains(e.target))) {
        setMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);

  return (
    <header
      ref={header}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,color] duration-500 ${
        night
          ? "border-b border-white/10 bg-obsidian/85 text-bone backdrop-blur-xl"
          : scrolled || open
            ? "border-b border-line bg-bg/85 backdrop-blur-xl"
            : "border-b border-transparent"
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-full focus:bg-ink focus:px-4 focus:py-1.5 focus:text-sm focus:text-bg"
      >
        Skip to content
      </a>
      <nav className="flex h-[var(--nav)] items-center justify-between gap-6 px-[var(--gx)]">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Metis Suite home">
          <MetisMark className="size-8" tone={night ? "bone" : "ink"} />
          <span className="font-[family-name:var(--font-display)] text-[25px] font-semibold leading-none tracking-[-0.01em]">
            Metis
          </span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover keeps the menu open across the button and its panel; the button toggles it by keyboard */}
          <li
            ref={product}
            className="relative"
            onMouseEnter={() => setMenu(true)}
            onMouseLeave={() => setMenu(false)}
          >
            <button
              type="button"
              aria-expanded={menu}
              aria-controls="product-menu"
              onClick={() => setMenu((v) => !v)}
              className={`relative inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] transition-colors ${linkTone(inProduct, night)}`}
            >
              Suite
              <ChevronDown
                className={`size-3.5 transition-transform duration-300 ${menu ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </button>
            <div id="product-menu" hidden={!menu} className="absolute left-0 top-full pt-2">
              <ul className="grid w-[580px] grid-cols-2 gap-1 rounded-[22px] border border-line bg-bg p-2 shadow-[0_50px_90px_-50px_rgba(42,38,32,0.45)]">
                {TOOLS.map((t) => (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      aria-current={pathname === t.href ? "page" : undefined}
                      className="flex gap-3 rounded-[16px] p-3 transition-colors hover:bg-panel"
                    >
                      <t.icon
                        className="mt-0.5 size-5 shrink-0 text-amber-text"
                        strokeWidth={1.6}
                      />
                      <span>
                        <span className="block text-[14.5px] font-medium text-ink">{t.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
                          {t.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          {NAV_LINKS.map((l) => {
            const on = pathname === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative inline-flex h-9 items-center rounded-full px-3.5 text-[14px] transition-colors ${linkTone(on, night)}`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`relative inline-flex h-9 items-center rounded-full px-3.5 text-[14px] transition-colors ${linkTone(false, night)}`}
            >
              Docs
            </a>
          </li>
          <li>
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`relative inline-flex h-9 items-center rounded-full px-3.5 text-[14px] transition-colors ${linkTone(false, night)}`}
            >
              Changelog
            </a>
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex">
            <GithubStars tone={night ? "night" : "paper"} />
          </span>
          <span className="hidden sm:inline-flex">
            <Button
              href={CONSOLE_URL}
              kind="external"
              className="!h-9 whitespace-nowrap !px-4 !text-[14px]"
            >
              Get started
            </Button>
          </span>
          <button
            type="button"
            className={`grid size-9 place-items-center rounded-full border lg:hidden ${night ? "border-white/15" : "border-line"}`}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X className="size-4" strokeWidth={1.75} />
            ) : (
              <Menu className="size-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        hidden={!open}
        className="h-[calc(100svh-var(--nav))] overflow-y-auto bg-bg px-[var(--gx)] pb-10 pt-4 lg:hidden"
      >
        <p className="label pt-2 text-ink-3">Suite</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 border-b border-line pb-4">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={() => setOpen(false)}
                className="display block py-2 text-[30px]"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul>
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="display block border-b border-line py-4 text-[34px]"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="display block border-b border-line py-4 text-[34px]"
            >
              Docs
            </a>
          </li>
          <li>
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="display block border-b border-line py-4 text-[34px]"
            >
              Changelog
            </a>
          </li>
          <li>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="display flex items-center gap-3 border-b border-line py-4 text-[34px]"
            >
              <GithubMark className="size-6" />
              GitHub
            </a>
          </li>
        </ul>
        <Button href={CONSOLE_URL} kind="external" className="mt-8">
          Get started
        </Button>
      </div>
    </header>
  );
}
