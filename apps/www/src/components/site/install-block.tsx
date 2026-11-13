"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const LINES = [
  {
    cmd: "curl -fsSL https://sh.trymetis.email/bootstrap -o bootstrap.sh",
    note: "Download the installer",
  },
  {
    cmd: "sudo sh bootstrap.sh",
    note: "Install the metis CLI and set up the server",
  },
  {
    cmd: "sudo metis domain mail.example.com",
    note: "Caddy fetches the certificate on the first request",
  },
];

function Line({ cmd, note, n }: { cmd: string; note: string; n: number }) {
  const [done, setDone] = useState(false);
  return (
    <li className="group grid grid-cols-[28px_1fr_auto] items-start gap-x-4 border-b border-white/[0.07] py-5 last:border-b-0">
      <span className="label pt-1 text-bone-2">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="text-[13px] text-bone-2">{note}</p>
        <code className="mt-1.5 block break-all sm:overflow-x-auto sm:whitespace-nowrap font-[family-name:var(--font-mono)] text-[14.5px] text-bone no-scrollbar">
          <span className="text-amber-glow">$ </span>
          {cmd}
        </code>
      </div>
      <button
        type="button"
        aria-label="Copy command"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(cmd);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          } catch {}
        }}
        className="grid size-9 place-items-center rounded-full border border-white/15 text-bone transition-colors hover:border-white/40"
      >
        {done ? (
          <Check className="size-4 text-[#7cc48d]" strokeWidth={2.25} />
        ) : (
          <Copy className="size-4" strokeWidth={1.75} />
        )}
      </button>
    </li>
  );
}

export function InstallBlock() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] pb-10 pt-28 md:pt-36">
      <div className="mx-auto max-w-[1200px]">
        <h2 data-reveal className="display max-w-[16ch] text-[clamp(44px,5vw,80px)]">
          Three lines <em>to your own suite.</em>
        </h2>
        <div data-reveal className="mt-12 rounded-[28px] bg-obsidian px-6 py-3 md:px-10 md:py-5">
          <ol>
            {LINES.map((l, i) => (
              <Line key={l.cmd} cmd={l.cmd} note={l.note} n={i + 1} />
            ))}
          </ol>
        </div>
        <p data-reveal className="mt-5 text-[14px] text-ink-2">
          Runs on a Linux server, and the script installs Docker if it is missing. Without a domain,
          the app listens on localhost only and is reached through an SSH tunnel.
        </p>
      </div>
    </section>
  );
}
