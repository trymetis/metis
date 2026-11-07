import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PageJsonLd } from "@/components/json-ld";
import { PageHead } from "@/components/site/page-head";
import { StartActions } from "@/components/site/start-actions";
import { COMPETITORS } from "@/content/compare";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/compare");

export default function ComparePage() {
  return (
    <>
      <PageJsonLd path="/compare" />
      <PageHead
        kicker="Compare"
        title={
          <>
            Metis, <em>side by side.</em>
          </>
        }
        text="Metis Suite is an open-source email, calendar, drive and contacts client you can self-host, with an AI agent on the model you choose and a built-in MCP server. Here is how it compares with the clients and AI assistants people weigh it against, with every fact sourced from the vendor's own pages."
      >
        <StartActions />
      </PageHead>
      <section className="px-[var(--gx)] pb-28">
        <ul className="mx-auto grid max-w-[1280px] gap-px overflow-hidden rounded-[22px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {COMPETITORS.map((c) => (
            <li key={c.slug} className="bg-bg">
              <Link
                href={`/compare/${c.slug}`}
                className="group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-panel sm:p-8"
              >
                <h2 className="display text-[30px]">
                  Metis <em>vs {c.name}</em>
                </h2>
                <p className="text-[15px] leading-relaxed text-ink-2">{c.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[15px] font-medium text-amber-text">
                  See the comparison
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
