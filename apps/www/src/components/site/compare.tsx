import { ENTRY_PLAN } from "@/content/pricing";
import { CONSOLE_URL } from "@/lib/site";

import { Button } from "./button";

const ROWS: [string, string, string][] = [
  [
    "Who runs the server",
    "We do, one isolated instance per customer",
    "You do, on a Linux server you own",
  ],
  ["Updates", "Handled by us", "One click in the owner dashboard, with automatic rollback"],
  [
    "AI model",
    "Included every month, or your own key: OpenAI, Anthropic or any OpenAI-compatible endpoint",
    "Your own key, or a model on your own hardware",
  ],
  ["Domain", "Your domain or a metis-suite.app subdomain", "Your domain, with HTTPS from Caddy"],
  ["Mail at your own domain through Cloudflare Email or Resend", "Not available", "Available"],
  [
    "What Metis keeps",
    "In your instance on our servers in Helsinki, backed up to Cloudflare R2",
    "On your disk",
  ],
  [
    "Price",
    `From $${ENTRY_PLAN.cost.monthly} per instance a month, or $${ENTRY_PLAN.cost.yearly} a year`,
    "Free under AGPL-3.0",
  ],
];

export function Compare() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] pt-28 md:pt-36">
      <div className="mx-auto max-w-[1200px]">
        <h2 data-reveal className="display max-w-[16ch] text-[clamp(44px,5vw,80px)]">
          Metis Cloud <em>or your own server.</em>
        </h2>
        <p data-reveal className="prose-lede mt-6 max-w-[38rem]">
          Both run the same release with every tool in the suite, and your mail stays with your
          providers either way. The difference is who runs the server.
        </p>
        <div data-reveal className="mt-12 overflow-x-auto">
          <table className="w-full border-t border-line text-left md:min-w-[640px]">
            <thead className="max-md:sr-only">
              <tr className="border-b border-line">
                <th scope="col" className="w-[30%] py-5">
                  <span className="sr-only">Compare</span>
                </th>
                <th scope="col" className="display py-5 pr-6 text-[30px]">
                  Metis Cloud
                </th>
                <th scope="col" className="display py-5 text-[30px]">
                  Self-host
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, cloud, self]) => (
                <tr
                  key={label}
                  className="grid grid-cols-2 gap-x-4 border-b border-line py-5 align-top md:table-row md:py-0"
                >
                  <th
                    scope="row"
                    className="col-span-2 pb-3 text-[15px] font-medium text-ink md:table-cell md:py-5 md:pr-6"
                  >
                    {label}
                  </th>
                  <td className="text-[15px] text-ink-2 md:table-cell md:py-5 md:pr-6">
                    <span className="label mb-1.5 block text-ink-3 md:hidden">Metis Cloud</span>
                    {cloud}
                  </td>
                  <td className="text-[15px] text-ink-2 md:table-cell md:py-5">
                    <span className="label mb-1.5 block text-ink-3 md:hidden">Self-host</span>
                    {self}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-reveal className="mt-8 max-w-[44rem] text-[15.5px] text-ink-2">
          Choose Metis Cloud if you want the suite without running a server. Choose self-hosting if
          you want everything Metis keeps on hardware you control.
        </p>
        <div data-reveal className="mt-8 flex flex-wrap gap-3">
          <Button href={CONSOLE_URL} kind="external">
            Get started
          </Button>
          <Button href="#install" tone="ghost" kind="internal">
            Install it
          </Button>
        </div>
      </div>
    </section>
  );
}
