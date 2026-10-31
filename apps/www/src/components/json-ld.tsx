import type {
  BreadcrumbList,
  FAQPage,
  Graph,
  Offer,
  Organization,
  SoftwareApplication,
  Thing,
  WebPage,
  WebSite,
} from "schema-dts";

import { fullTitle, pageInfo } from "@/content/pages";
import { PLANS } from "@/content/pricing";
import { FAQ_ITEMS } from "@/lib/faq";
import {
  APP_PROFILES,
  absoluteUrl,
  CONTACT_EMAIL,
  DOCS_URL,
  GITHUB_URL,
  LICENSE_URL,
  ORG_LEGAL_NAME,
  ORG_NAME,
  ORG_POSTAL,
  ORG_PROFILES,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#software`;

const organization: Organization = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: ORG_NAME,
  legalName: ORG_LEGAL_NAME,
  alternateName: "AstraQ",
  description: `${ORG_NAME} builds ${SITE_NAME}, an open-source email, calendar and drive client with an AI agent, workflows and MCP.`,
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl("/apple-icon.png"),
    width: "180",
    height: "180",
  },
  email: CONTACT_EMAIL,
  address: {
    "@type": "PostalAddress",
    streetAddress: ORG_POSTAL.street,
    addressLocality: ORG_POSTAL.locality,
    addressRegion: ORG_POSTAL.region,
    postalCode: ORG_POSTAL.postalCode,
    addressCountry: ORG_POSTAL.countryCode,
  },
  sameAs: ORG_PROFILES,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: CONTACT_EMAIL,
    availableLanguage: ["English"],
  },
};

const webSite: WebSite = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
};

const offers: Offer[] = [
  {
    "@type": "Offer",
    name: "Self-host",
    price: 0,
    priceCurrency: "USD",
    description: "The complete suite on your own server, free under AGPL-3.0.",
    url: absoluteUrl("/self-host"),
  },
  ...PLANS.flatMap((plan): Offer[] =>
    plan.cost
      ? [
          {
            "@type": "Offer",
            name: `Metis Cloud ${plan.name}`,
            price: plan.cost.monthly,
            priceCurrency: "USD",
            description: plan.note,
            url: absoluteUrl("/pricing"),
            priceSpecification: [
              {
                "@type": "UnitPriceSpecification",
                price: plan.cost.monthly,
                priceCurrency: "USD",
                billingDuration: "P1M",
                unitText: "instance",
              },
              {
                "@type": "UnitPriceSpecification",
                price: plan.cost.yearly,
                priceCurrency: "USD",
                billingDuration: "P1Y",
                unitText: "instance",
              },
            ],
          },
        ]
      : [],
  ),
];

const softwareApplication: SoftwareApplication = {
  "@type": "SoftwareApplication",
  "@id": APP_ID,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  sameAs: [GITHUB_URL, ...APP_PROFILES],
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Email client",
  operatingSystem: "Web, Windows, macOS, Linux, Android",
  downloadUrl: absoluteUrl("/apps#downloads"),
  softwareHelp: { "@type": "CreativeWork", url: DOCS_URL },
  license: LICENSE_URL,
  screenshot: absoluteUrl("/shots/mail/all-inboxes.webp"),
  featureList: [
    "Mail from Gmail, Outlook, Zoho Mail and IMAP in one list",
    "Google Calendar, Outlook, Zoho Calendar and CalDAV in one week view",
    "Google Drive, OneDrive, S3, WebDAV, FTP and SFTP in one explorer",
    "One AI agent across mail, calendar and drive that asks before it acts",
    "Visual workflows with schedules and run history",
    "An MCP server with the agent's tools for Claude, Cursor and other clients",
    "One search across mail, events, files and people",
    "Thread summaries and smart replies",
    "Required two-factor authentication and encryption at rest",
    "Open source under AGPL-3.0 and self-hostable",
  ],
  author: { "@id": ORG_ID },
  creator: { "@id": ORG_ID },
  publisher: { "@id": ORG_ID },
  isAccessibleForFree: true,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: 0,
    highPrice: Math.max(...PLANS.map((p) => p.cost?.monthly ?? 0)),
    offerCount: offers.length,
    offers,
  },
};

function webPage(path: string): WebPage {
  const page = pageInfo(path);
  const url = absoluteUrl(path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: fullTitle(page),
    description: page.description,
    inLanguage: "en",
    dateModified: page.updated,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    ...(path === "/"
      ? { about: { "@id": APP_ID } }
      : { breadcrumb: { "@id": `${url}#breadcrumb` } }),
  };
}

function breadcrumbs(path: string): BreadcrumbList {
  const parts = path.split("/").filter(Boolean);
  const trail = ["/", ...parts.map((_, i) => `/${parts.slice(0, i + 1).join("/")}`)];
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(path)}#breadcrumb`,
    itemListElement: trail.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p === "/" ? SITE_NAME : pageInfo(p).label,
      item: absoluteUrl(p),
    })),
  };
}

function Script({ data }: { data: Graph | Thing }) {
  return (
    <script
      type="application/ld+json"
      // oxlint-disable-next-line react/no-danger --JSON-LD has to be inlined as text, and "<" is escaped
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function SiteJsonLd() {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@graph": [organization, webSite, softwareApplication, webPage("/")],
      }}
    />
  );
}

export function PageJsonLd({ path }: { path: string }) {
  return (
    <Script
      data={{
        "@context": "https://schema.org",
        "@graph": [webPage(path), breadcrumbs(path)],
      }}
    />
  );
}

export function FaqJsonLd() {
  const faq: FAQPage = {
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return <Script data={{ "@context": "https://schema.org", "@graph": [faq] }} />;
}
