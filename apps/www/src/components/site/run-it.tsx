import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { CONSOLE_URL, DOCS_URL } from "@/lib/site";

import { Button } from "./button";

export function RunIt() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] pb-28 md:pb-40">
      <div className="mx-auto max-w-[1200px] border-t border-line pt-20">
        <h2 data-reveal className="display max-w-[16ch] text-[clamp(44px,5vw,80px)]">
          Run by us, <em>or by you.</em>
        </h2>
        <p data-reveal className="prose-lede mt-6 max-w-[36rem]">
          Both run the same release with every tool in the suite. The only difference is who runs
          the server.
        </p>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <article data-reveal className="flex flex-col rounded-[28px] bg-panel p-8 md:p-10">
            <p className="label text-ink-2">Run by us</p>
            <h3 className="display mt-5 text-[40px]">Metis Cloud</h3>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
              Your own instance of Metis, run by us, on your domain or a metis-suite.app subdomain,
              with your own AI key.
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
              <Button href={CONSOLE_URL} kind="external">
                Get started
              </Button>
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-1 px-2 text-[16px] font-medium text-amber-text"
              >
                See pricing
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </Link>
            </div>
          </article>
          <article data-reveal className="flex flex-col rounded-[28px] bg-panel p-8 md:p-10">
            <p className="label text-ink-2">Run by you</p>
            <h3 className="display mt-5 text-[40px]">Self-host</h3>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
              The whole suite on a Linux server you own, installed with one script. Free under
              AGPL-3.0, with your own AI model.
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
              <Button href="/self-host" tone="ghost" kind="internal">
                Self-host it
              </Button>
              <a
                href={`${DOCS_URL}/self-hosting`}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1 px-2 text-[16px] font-medium text-amber-text"
              >
                Read the docs
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
