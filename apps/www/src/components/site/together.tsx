import { ArrowUpRight, AtSign, Building2, KeyRound, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

const POINTS: {
  icon: typeof Search;
  title: string;
  text: string;
  link?: { href: Route; label: string };
}[] = [
  {
    icon: KeyRound,
    title: "Bring the accounts you have",
    text: "Google, Microsoft and Zoho accounts, plus IMAP, CalDAV, CardDAV, S3, WebDAV, FTP and SFTP servers. Nothing moves, and your mail stays with your provider.",
  },
  {
    icon: Search,
    title: "One search for everything",
    text: "⌘K or Ctrl+K searches mail, events, files, contacts and people at once, with filters like from:, after: and type:file, and searches you can save.",
  },
  {
    icon: AtSign,
    title: "One agent with the whole picture",
    text: "Ask about a thread, a meeting, a file and a contact in the same conversation, or point at any of them with @.",
    link: { href: "/agent", label: "See the agent" },
  },
  {
    icon: Building2,
    title: "One workspace for the team",
    text: "Share a mailbox, calendar, drive or address book with a workspace and keep the rest private. Roles, invites and branding cover all four.",
    link: { href: "/security#teams", label: "See workspaces" },
  },
];

export function Together() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] py-28 md:py-40">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <h2 data-reveal className="display max-w-[16ch] text-[clamp(44px,5.4vw,88px)]">
            Your accounts stay put. <em>The suite joins them.</em>
          </h2>
          <p data-reveal className="prose-lede max-w-[28rem]">
            Metis does not ask you to move anything. It connects to the providers you already use
            and puts what they hold behind one search, one agent and one set of workspaces.
          </p>
        </div>
        <ul className="mt-16 grid gap-4 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li
              key={p.title}
              data-reveal
              className="flex h-full flex-col rounded-[28px] bg-panel p-7 md:p-9"
            >
              <p.icon className="size-6 text-amber-text" strokeWidth={1.6} />
              <h3 className="display mt-6 text-[34px]">{p.title}</h3>
              <p className="mt-3 max-w-[34rem] text-[15.5px] leading-relaxed text-ink-2">
                {p.text}
              </p>
              {p.link ? (
                <Link
                  href={p.link.href}
                  className="group mt-auto inline-flex items-center gap-1 pt-6 text-[15px] font-medium text-amber-text"
                >
                  {p.link.label}
                  <ArrowUpRight
                    className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
