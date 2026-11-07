import { PageJsonLd } from "@/components/json-ld";
import { Button } from "@/components/site/button";
import { PageHead } from "@/components/site/page-head";
import { pageMetadata } from "@/lib/metadata";
import {
  CONTACT_EMAIL,
  DOCS_URL,
  GITHUB_URL,
  LICENSE_URL,
  ORG_ADDRESS,
  ORG_LEGAL_NAME,
  SITE_NAME,
} from "@/lib/site";

export const metadata = pageMetadata("/about");

const FACTS: [string, React.ReactNode][] = [
  ["Product", `${SITE_NAME}: an email, calendar, drive and contacts client`],
  ["Built by", ORG_LEGAL_NAME],
  ["Registered office", ORG_ADDRESS],
  [
    "License",
    <a key="license" href={LICENSE_URL}>
      AGPL-3.0-or-later
    </a>,
  ],
  [
    "Source code",
    <a key="source" href={GITHUB_URL}>
      {GITHUB_URL.replace("https://", "")}
    </a>,
  ],
  ["Metis Cloud hosting", "Hetzner servers in Helsinki, Finland"],
  [
    "Contact",
    <a key="contact" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>,
  ],
];

export default function AboutPage() {
  return (
    <>
      <PageJsonLd path="/about" />
      <PageHead
        kicker="About"
        title={
          <>
            Built in the open, <em>by AstraQ.</em>
          </>
        }
        text={`${SITE_NAME} is an open-source client for the mail, calendars, drives and contacts you already have at Google, Microsoft, Zoho and your own servers, with an AI agent, workflows and MCP across all of them. ${ORG_LEGAL_NAME} builds it in Akola, India, and publishes every line under AGPL-3.0-or-later.`}
      />
      <section className="px-[var(--gx)] pb-28">
        <div className="mx-auto grid max-w-[1280px] gap-16 border-t border-line pt-14 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-10 text-[16px] leading-[1.75] text-ink-2">
            <div>
              <h2 className="display text-[34px] text-ink">
                A client, <em>not a mail host.</em>
              </h2>
              <p className="mt-3">
                Metis does not host your mail. It connects to the accounts you already use through
                each provider&apos;s API or standard protocols, so your messages, events and files
                stay where they are. It keeps only what it needs to work: encrypted access tokens
                and server logins, the messages you open, and the summaries and labels it makes.
              </p>
            </div>
            <div>
              <h2 className="display text-[34px] text-ink">
                Open source, <em>run it anywhere.</em>
              </h2>
              <p className="mt-3">
                Anyone can read, run, change and share the code under the GNU Affero General Public
                License, version 3 or later. You can self-host it free on your own Linux server, or
                let us run an isolated instance for you on Metis Cloud. Organizations that cannot
                meet the AGPL&apos;s terms can ask for a commercial license. &ldquo;Metis
                Suite&rdquo; and &ldquo;AstraQ&rdquo; are trademarks of {ORG_LEGAL_NAME} and are not
                covered by the AGPL.
              </p>
            </div>
            <div>
              <h2 className="display text-[34px] text-ink">
                Security <em>first.</em>
              </h2>
              <p className="mt-3">
                AstraQ builds email-security software, and the defaults follow from that: two-factor
                sign-in is required on every account, AI stays off until you turn it on, and the
                agent asks before it sends or deletes anything. AstraQ also builds the
                phishing-detection service that Metis can connect to, which is a separate product
                from the open-source suite. Report vulnerabilities as described in the
                repository&apos;s{" "}
                <a
                  href={`${GITHUB_URL}/blob/main/SECURITY.md`}
                  className="text-amber-text underline"
                >
                  security policy
                </a>
                .
              </p>
            </div>
          </div>
          <div>
            <dl className="border-t border-line">
              {FACTS.map(([term, value]) => (
                <div
                  key={term}
                  className="grid gap-1 border-b border-line py-5 sm:grid-cols-[12rem_1fr]"
                >
                  <dt className="label text-ink-3">{term}</dt>
                  <dd className="text-[15.5px] text-ink [&_a]:text-amber-text [&_a]:underline">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button href={DOCS_URL} kind="external">
                Read the docs
              </Button>
              <Button href="/compare" tone="ghost" kind="internal">
                Compare Metis
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
