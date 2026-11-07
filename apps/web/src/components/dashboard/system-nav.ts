import type { BrandMark } from "@metis/ui/components/brand-marks";
import {
  Bot,
  CircleArrowUp,
  Database,
  HardDrive,
  History,
  type LucideIcon,
  Mail,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import type { Route } from "next";

import { ACCOUNT_PROVIDER_META } from "@/components/provider-meta";
import { CONNECTION_PROVIDERS, type ConnectionProvider } from "@/connections/types";
import { keysOf } from "@/lib/guards";
import { route } from "@/lib/route";
import type { SystemDriver } from "@/server/schema";

export const SAVE_BAR_SLOT_ID = "dashboard-save-bar";
export const SYSTEM_ROOT = "/dashboard/system";
export const SYSTEM_INSTANCE_HREF: Route = `${SYSTEM_ROOT}/instance`;
export const SYSTEM_HISTORY_HREF: Route = `${SYSTEM_ROOT}/history`;
export const SYSTEM_PREFLIGHT_HREF: Route = `${SYSTEM_ROOT}/preflight`;
export const SYSTEM_UPDATES_HREF: Route = `${SYSTEM_ROOT}/updates`;

export interface SystemDriverNav {
  driver: SystemDriver;
  href: Route;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface SystemProviderNav {
  provider: ConnectionProvider;
  href: Route;
  label: string;
  description: string;
  Mark: BrandMark;
}

export const SYSTEM_HISTORY_NAV = {
  href: SYSTEM_HISTORY_HREF,
  label: "History",
  description:
    "Every stored version of the configuration: who changed what, a diff between any two, and restoring one.",
  icon: History,
};

export const SYSTEM_PREFLIGHT_NAV = {
  href: SYSTEM_PREFLIGHT_HREF,
  label: "Deploy checks",
  description:
    "What the last preflight run warned about: environment values that differ from the stored configuration, servers that failed their probe, LLM and decision-model problems and quarantined connections.",
  icon: TriangleAlert,
};

export const SYSTEM_UPDATES_NAV = {
  href: SYSTEM_UPDATES_HREF,
  label: "Updates",
  description: "The running release, the releases published after it, and moving between them.",
  icon: CircleArrowUp,
};

export const SYSTEM_INSTANCE_NAV = {
  href: SYSTEM_INSTANCE_HREF,
  label: "Instance",
  description:
    "App URL, sign-up, the owner, legal consent, drive relay limits, the mail image proxy, how long message bodies are kept and trusted proxies.",
  icon: SlidersHorizontal,
};

const DRIVER_COPY: Record<SystemDriver, { label: string; description: string; icon: LucideIcon }> =
  {
    llm: {
      label: "LLM",
      description: "The model API every agent and AI feature calls.",
      icon: Bot,
    },
    phishing: {
      label: "Phishing detection",
      description: "Where raw messages are sent for a verdict.",
      icon: ShieldAlert,
    },
    mail: {
      label: "Mail",
      description: "How the instance sends its own mail, not users' mail.",
      icon: Mail,
    },
    cache: {
      label: "Cache",
      description: "Secondary session storage and rate-limit counters.",
      icon: HardDrive,
    },
    runner: {
      label: "Workflow runner",
      description: "What wakes the background engine, and how much it does.",
      icon: Workflow,
    },
    database: {
      label: "Database",
      description: "The app database and Mastra's separate store.",
      icon: Database,
    },
  };

export const SYSTEM_DRIVERS_NAV: SystemDriverNav[] = keysOf(DRIVER_COPY).map((driver) => ({
  driver,
  href: route(`${SYSTEM_ROOT}/drivers/${driver}`),
  ...DRIVER_COPY[driver],
}));

const PROVIDER_COPY: Record<ConnectionProvider, { label: string; description: string }> = {
  google: {
    label: "Google",
    description: "Gmail, Google Calendar, Google Drive and Google Contacts over one OAuth client.",
  },
  microsoft: {
    label: "Microsoft",
    description: "Outlook, Outlook Calendar, OneDrive and Outlook Contacts over one OAuth client.",
  },
  zoho: {
    label: "Zoho",
    description: "Zoho Mail, Zoho Calendar and Zoho Contacts over one OAuth client.",
  },
  imap: {
    label: "IMAP",
    description: "Mailboxes over IMAP, sending over SMTP.",
  },
  caldav: { label: "CalDAV", description: "Calendar accounts." },
  carddav: { label: "CardDAV", description: "Address books." },
  cloudflare: {
    label: "Cloudflare Email",
    description: "Gateway Workers, one per domain.",
  },
  resend: { label: "Resend", description: "Resend gateways, one per domain." },
  s3: {
    label: "S3",
    description: "Buckets on operator-held keys. Users pick only a bucket and prefix.",
  },
  webdav: {
    label: "WebDAV",
    description: "Drives relayed through the server.",
  },
  ftp: {
    label: "FTP",
    description: "Drives relayed through the server, over a pool shared by every user of an entry.",
  },
  sftp: {
    label: "SFTP",
    description: "Drives relayed through the server, with a pinned host key.",
  },
};

export const SYSTEM_PROVIDERS_NAV: SystemProviderNav[] = CONNECTION_PROVIDERS.map((provider) => ({
  provider,
  href: route(`${SYSTEM_ROOT}/providers/${provider}`),
  Mark: ACCOUNT_PROVIDER_META[provider].Mark,
  ...PROVIDER_COPY[provider],
}));

export function systemDriverNav(driver: string): SystemDriverNav | undefined {
  return SYSTEM_DRIVERS_NAV.find((entry) => entry.driver === driver);
}

export function systemProviderNav(provider: string): SystemProviderNav | undefined {
  return SYSTEM_PROVIDERS_NAV.find((entry) => entry.provider === provider);
}
