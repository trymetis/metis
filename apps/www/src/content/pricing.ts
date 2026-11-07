import { CONSOLE_URL } from "@/lib/site";

export type Plan = {
  id: string;
  name: string;
  audience: string;
  price: string;
  unit: string;
  billing?: string;
  cost?: { monthly: number; yearly: number };
  note: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

export function usd(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function paid(monthly: number, yearly: number) {
  return {
    price: usd(yearly / 12),
    unit: "per instance a month, billed yearly",
    billing: `$${yearly} billed yearly, two months free. Or $${monthly} billed monthly.`,
    cost: { monthly, yearly },
  };
}

export const PLANS: Plan[] = [
  {
    id: "personal",
    name: "Personal",
    audience: "For individuals",
    ...paid(15, 150),
    note: "Your own instance of the suite, run by us.",
    features: [
      "Mail, Calendar, Drive, Contacts, Agent, Workflows and MCP",
      "AI included every month, for the AI model and the decision model",
      "Or your own AI key: OpenAI, Anthropic or any compatible endpoint",
      "Your domain, or a metis-suite.app subdomain",
      "Shared mailboxes, calendars, drives and address books",
      "Workspaces with their own branding",
    ],
    cta: { label: "Get started", href: CONSOLE_URL },
  },
  {
    id: "team",
    name: "Team",
    audience: "For small teams",
    ...paid(30, 300),
    note: "One instance for the whole team, run by us.",
    features: [
      "Everything in Personal, with the same monthly AI",
      "About 3x the server resources of Personal",
      "Shared mailboxes, calendars, drives and address books",
      "Workspaces with their own branding",
      "Priority support",
    ],
    cta: { label: "Get started", href: CONSOLE_URL },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "On-prem, SLAs and commercial licensing",
    price: "Custom",
    unit: "talk to us",
    note: "For organizations that need guarantees behind the code.",
    features: [
      "Run on your own hardware, on-prem",
      "Support with agreed response times",
      "A commercial license if AGPL-3.0 does not fit",
      "A direct line to the team building Metis",
    ],
    cta: {
      label: "Talk to us",
      href: "mailto:contact@astraqcyberdefence.com?subject=Metis%20Enterprise",
    },
  },
];

function entryPlan() {
  for (const plan of PLANS) {
    const { cost } = plan;
    if (cost) return { ...plan, cost };
  }
  throw new Error("no plan has a price");
}

export const ENTRY_PLAN = entryPlan();
