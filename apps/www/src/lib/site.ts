function normalizeUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (raw == null || raw === "") return fallback;
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_SITE_URL,
  "https://www.trymetis.email",
);

export const SITE_NAME = "Metis Suite";

export const SITE_DESCRIPTION =
  "Open-source email, calendar and drive client for Gmail, Outlook, Zoho and IMAP, with an AI agent, workflows and MCP. Self-host free or use Metis Cloud.";

export const ORG_NAME = "AstraQ Cyber Defence";

export const ORG_LEGAL_NAME = "AstraQ Cyber Defence Pvt. Ltd.";

export const GITHUB_URL = "https://github.com/trymetis/metis";

export const CONSOLE_URL = "https://console.trymetis.email";

export const DOCS_URL = "https://docs.trymetis.email";

export const CHANGELOG_URL = `${DOCS_URL}/changelog`;

export const CONTACT_EMAIL = "contact@astraqcyberdefence.com";

export const ORG_X_HANDLE = "@astraqcd";

export const ORG_PROFILES = [
  "https://x.com/astraqcd",
  "https://www.linkedin.com/company/astraqcd/",
];

export const APP_PROFILES = ["https://www.instagram.com/metis_mail/"];

export const ORG_POSTAL = {
  street: "Engineers Colony, Mothi Umari, Jatherpeth",
  locality: "Akola",
  region: "Maharashtra",
  country: "India",
  countryCode: "IN",
  postalCode: "444005",
};

export const ORG_ADDRESS = `${ORG_POSTAL.street}, ${ORG_POSTAL.locality}, ${ORG_POSTAL.region}, ${ORG_POSTAL.country} ${ORG_POSTAL.postalCode}`;

export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
