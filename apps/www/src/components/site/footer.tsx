import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { NAV_LINKS, TOOLS } from "@/content/nav";
import {
  CHANGELOG_URL,
  CONTACT_EMAIL,
  DOCS_URL,
  GITHUB_URL,
  LICENSE_URL,
  ORG_NAME,
} from "@/lib/site";

import { MetisMark } from "../ui/metis-mark";
import { StartActions } from "./start-actions";

const MORE = [...NAV_LINKS, { href: "/compare", label: "Compare" }] as const;

const YEAR = new Date().getFullYear();

const OPEN = [
  { href: DOCS_URL, label: "Documentation" },
  { href: CHANGELOG_URL, label: "Changelog" },
  { href: GITHUB_URL, label: "Source code" },
  { href: LICENSE_URL, label: "AGPL-3.0 license" },
  { href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`, label: "Contributing" },
  {
    href: `${GITHUB_URL}/blob/main/SECURITY.md`,
    label: "Report a vulnerability",
  },
];

export function Footer() {
  return (
    <footer data-night className="relative z-10 bg-obsidian text-bone">
      <div className="px-[var(--gx)] pb-20 pt-28 md:pt-36">
        <div className="mx-auto max-w-[1200px]">
          <h2
            data-reveal
            className="display max-w-[14ch] text-[clamp(52px,7.6vw,128px)] text-bone [&_em]:text-amber-glow"
          >
            Bring your accounts. <em>Keep your keys.</em>
          </h2>
          <div data-reveal className="mt-10 flex flex-wrap items-center gap-3">
            <StartActions night />
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.08] px-[var(--gx)] py-14">
        <div className="mx-auto grid max-w-[1200px] gap-12 sm:grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="Metis Suite home">
              <MetisMark tone="bone" className="size-8" />
              <span className="font-[family-name:var(--font-display)] text-[25px] font-semibold leading-none">
                Metis
              </span>
            </Link>
            <p className="mt-5 max-w-[30ch] text-[14px] leading-relaxed text-bone-2">
              One suite over the accounts you already have: mail, calendars, drives, an agent,
              workflows and MCP.
            </p>
          </div>
          <FooterCol title="Suite">
            {TOOLS.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="hover:text-bone">
                  {t.label}
                </Link>
              </li>
            ))}
          </FooterCol>
          <FooterCol title="Metis">
            {MORE.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-bone">
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterCol>
          <FooterCol title="Open source">
            {OPEN.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-bone"
                >
                  {l.label}
                  <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                </a>
              </li>
            ))}
          </FooterCol>
          <FooterCol title="Company">
            <li>
              <Link href="/about" className="hover:text-bone">
                About {ORG_NAME}
              </Link>
            </li>
            <li>Akola, Maharashtra, India</li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-bone">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <Link href="/privacy-policy" className="hover:text-bone">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms-of-service" className="hover:text-bone">
                Terms of Service
              </Link>
            </li>
          </FooterCol>
        </div>
        <div className="mx-auto mt-14 flex max-w-[1200px] flex-col gap-3 border-t border-white/[0.08] pt-6 text-[12.5px] text-bone-2 md:flex-row md:justify-between">
          <p>
            © {YEAR} {ORG_NAME}. Gmail, Outlook and Zoho are trademarks of their respective
            companies.
          </p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 300"
          className="mx-auto mt-16 block w-full max-w-[1200px] select-none"
        >
          <text
            x="0"
            y="286"
            textLength="1200"
            lengthAdjust="spacingAndGlyphs"
            fill="#ffffff"
            fillOpacity="0.09"
            style={{
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: 390,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            METIS
          </text>
        </svg>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label text-bone-2">{title}</p>
      <ul className="mt-4 space-y-2.5 text-[14px] text-bone/80">{children}</ul>
    </div>
  );
}
