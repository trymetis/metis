import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { RepoCard } from "../ui/repo-card";

const FACTS = [
  ["Two-factor", "Required for every account before it reaches any mail."],
  ["Encrypted", "Account tokens and server logins are encrypted at rest."],
  ["AI off", "Every mailbox, calendar, drive and address book starts with AI turned off."],
  ["Private", "The instance owner sees usage and health, never your mail."],
  ["No tracking", "Remote images, tracking pixels and tracking links blocked."],
];

export function Trust() {
  return (
    <section className="relative z-[6] border-t border-line bg-bg px-[var(--gx)] py-28 md:py-40">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] items-start gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <h2 data-reveal className="display text-[clamp(44px,5vw,80px)]">
            Open source. <em>Nothing taken on trust.</em>
          </h2>
          <p data-reveal className="prose-lede mt-6 max-w-[30rem]">
            Metis is AGPL-3.0. Anyone can read exactly what it does with your accounts, and every
            page links to the source version it runs.
          </p>
          <ul data-reveal className="mt-10 border-t border-line">
            {FACTS.map(([label, text]) => (
              <li
                key={label}
                className="flex flex-col gap-1 border-b border-line py-4 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span className="label w-[120px] shrink-0 text-ink">{label}</span>
                <span className="text-[15px] text-ink-2">{text}</span>
              </li>
            ))}
          </ul>
          <Link
            data-reveal
            href="/security"
            className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-amber-text"
          >
            See Security
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
        <div data-reveal className="lg:sticky lg:top-[calc(var(--nav)+48px)]">
          <RepoCard />
        </div>
      </div>
    </section>
  );
}
