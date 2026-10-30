export const DOMAIN = "demo.trymetis.email";
export const STUDIO = "Fernhill Studio";

export interface Person {
  name: string;
  email: string;
}

function person(name: string, email: string): Person {
  return { name, email };
}

export function address(p: Person): string {
  return `${p.name} <${p.email}>`;
}

export function domainOf(email: string): string {
  return email.slice(email.indexOf("@") + 1);
}

export const PEOPLE = {
  ana: person("Ana Silva", `ana@${DOMAIN}`),
  cy: person("Cy Reyes", `cy@${DOMAIN}`),
  raj: person("Raj Mehta", `raj@${DOMAIN}`),
  tomas: person("Tomás Ortega", `tomas@${DOMAIN}`),
  priya: person("Priya Nair", `priya@${DOMAIN}`),
  sam: person("Sam Okafor", `sam@${DOMAIN}`),
  lena: person("Lena Hoffmann", "lena@kaltwasser-gmbh.de"),
  kenji: person("Kenji Watanabe", "kenji@aozora-ceramics.jp"),
  layla: person("Layla Haddad", "layla@saffronandsage.ae"),
  mira: person("Mira Costa", "mira@harbourhallvenues.com"),
} as const;

export const SENDERS = {
  kestrel: person("Kestrel Supply Co.", "news@kestrelsupply.com"),
  konkan: person("Konkan Bank", "alerts@konkanbank.in"),
  brightloom: person("Brightloom", "orders@brightloom.com"),
  swiftpost: person("Swiftpost", "tracking@swiftpost.com"),
  codeyard: person("Codeyard", "noreply@codeyard.dev"),
  northbeam: person("Northbeam Air", "bookings@northbeamair.com"),
  alfama: person("Hotel Alfama", "reservas@hotelalfama.pt"),
  tavola: person("Tavola", "reservations@tavola.app"),
  ledgerline: person("Ledgerline", "billing@ledgerline.io"),
  voltaro: person("Voltaro Energy", "billing@voltaro.co.uk"),
  paperstack: person("Paperstack", "share@paperstack.app"),
  linkroom: person("Linkroom", "no-reply@linkroom.app"),
} as const;

export const CLIENTS = {
  aozora: "Aozora Ceramics",
  kaltwasser: "Kaltwasser GmbH",
  saffron: "Saffron & Sage",
} as const;

export const TEAM_LIST = person("Fernhill Team", `team@${DOMAIN}`);

export const SUBJECTS = {
  kickoff: "Rebrand kickoff",
  review: "Invitation: Rebrand review @ Thu Oct 8, 2026 15:00 UTC",
  otp: "[Codeyard] Your sign-in verification code",
  shipment: "Your order A-42 has shipped",
  bank: "INR 1,250.00 debited from a/c **4821",
  newsletter: "This week at the shop",
  lateArrival: "Please sign the venue contract by Friday",
} as const;

export const CLIENTS_FOLDER = "Clients/";
export const REBRAND_FOLDER = `${CLIENTS_FOLDER}${CLIENTS.aozora}/Rebrand/`;
export const BRIEF = `${REBRAND_FOLDER}brief.md`;
export const APPROVED_FOLDER = "Final artwork";

export const MCP_CLIENT_HOSTS = {
  public: "mcp.quillmate.app",
  private: "mcp-private.quillmate.app",
} as const;

export function messageId(local: string, domain: string): string {
  return `<${local}@${domain}>`;
}
