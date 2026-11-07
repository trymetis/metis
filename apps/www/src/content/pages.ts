import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

import { COMPETITORS } from "./compare";
import { ENTRY_PLAN, usd } from "./pricing";

export type PageInfo = {
  label: string;
  title: string;
  description: string;
  updated: string;
  absolute?: boolean;
  og?: string;
};

const FIXED: Record<string, PageInfo> = {
  "/": {
    label: "Home",
    title: "Metis Suite: Open-Source AI Email, Calendar, Drive & Contacts Client",
    absolute: true,
    og: "Every account, one suite.",
    description: SITE_DESCRIPTION,
    updated: "2026-11-06",
  },
  "/mail": {
    label: "Mail",
    title: "AI Email Client for Gmail, Outlook, Zoho & IMAP",
    og: "Every inbox, one list.",
    description:
      "Gmail, Outlook, Zoho Mail and IMAP in one inbox, with thread summaries, eight smart labels, tracker blocking and AI you switch on per mailbox.",
    updated: "2026-11-06",
  },
  "/calendar": {
    label: "Calendar",
    title: "Unified Calendar for Google, Outlook, Zoho & CalDAV",
    og: "Every calendar, one week.",
    description:
      "Google Calendar, Outlook, Zoho Calendar and CalDAV side by side in one week, with real editing, RSVPs and an AI agent that finds the free hour.",
    updated: "2026-10-21",
  },
  "/drive": {
    label: "Drive",
    title: "File Explorer for Google Drive, OneDrive, S3 & SFTP",
    og: "Every drive, one explorer.",
    description:
      "Google Drive, OneDrive, S3, WebDAV, FTP and SFTP in one explorer, with previews in the browser and email attachments saved straight to a drive.",
    updated: "2026-10-21",
  },
  "/contacts": {
    label: "Contacts",
    title: "Contacts for Google, Outlook, Zoho & CardDAV",
    og: "Every address book, one list.",
    description:
      "Google Contacts, Outlook, Zoho Contacts and CardDAV address books in one list, with contacts saved from any email and an AI agent that asks first.",
    updated: "2026-11-06",
  },
  "/agent": {
    label: "Agent",
    title: "AI Email & Calendar Agent That Asks First",
    og: "One agent across all of it.",
    description:
      "One AI agent across your mail, calendars, drives and contacts. It searches, drafts and schedules in one chat, and waits for approval before it sends or deletes.",
    updated: "2026-11-06",
  },
  "/workflows": {
    label: "Workflows",
    title: "Email Automation Workflows with AI",
    og: "Rules that run on their own.",
    description:
      "Automation across mail, calendars, drives and contacts: on new mail, event changes, new files, webhooks or a schedule. Waits, approvals, AI steps and a run history.",
    updated: "2026-11-06",
  },
  "/mcp": {
    label: "MCP",
    title: "MCP Server for Gmail, Outlook, Calendar & Drive",
    og: "The suite, in your other tools.",
    description:
      "Connect Claude, Cursor, Codex, VS Code or any MCP client to your mail, calendars, drives and contacts, limited to the workspaces and tools you approve.",
    updated: "2026-11-06",
  },
  "/security": {
    label: "Security",
    title: "Email Client Security: 2FA, Encryption, Privacy",
    og: "Locked before you ask.",
    description:
      "Required two-factor sign-in, encrypted provider tokens, sandboxed email, tracker blocking and AI switches you control, across every tool in Metis Suite.",
    updated: "2026-11-06",
  },
  "/self-host": {
    label: "Self-host",
    title: "Self-Hosted Email Client with Docker Compose",
    og: "Your server, the whole suite.",
    description:
      "Run Metis Suite on your own Linux server with Docker Compose and one install script. Free under AGPL-3.0, with every tool and your own AI model.",
    updated: "2026-11-06",
  },
  "/pricing": {
    label: "Pricing",
    title: `Pricing: Free to Self-Host, Cloud from ${usd(ENTRY_PLAN.cost.yearly / 12)}/mo`,
    og: "Free on yours. Fair on ours.",
    description: `Self-host Metis Suite free under AGPL-3.0, or let us run your own instance on Metis Cloud from ${usd(ENTRY_PLAN.cost.yearly / 12)} a month billed yearly, with monthly AI included.`,
    updated: "2026-11-06",
  },
  "/apps": {
    label: "Apps",
    title: "Desktop and Android Apps",
    og: "On every screen.",
    description:
      "Metis Suite apps for macOS, Windows, Linux and Android. Every app works with any Metis Suite server, and every download is free.",
    updated: "2026-11-06",
  },
  "/compare": {
    label: "Compare",
    title: "Compare Email Clients: Metis Suite vs Alternatives",
    og: "How Metis compares.",
    description: `How Metis Suite compares with ${COMPETITORS.map((c) => c.name).join(", ")}: licensing, self-hosting, AI, MCP and price.`,
    updated: "2026-11-06",
  },
  "/about": {
    label: "About",
    title: "About Metis Suite and AstraQ Cyber Defence",
    og: "Who builds Metis.",
    description:
      "Metis Suite is an open-source email, calendar, drive and contacts client built by AstraQ Cyber Defence in Akola, India, and licensed under AGPL-3.0-or-later.",
    updated: "2026-11-06",
  },
  "/privacy-policy": {
    label: "Privacy Policy",
    title: "Privacy Policy",
    description:
      "How Metis Suite collects, uses, stores and protects your data, including Google user data, with two-factor authentication required on every account.",
    updated: "2026-11-06",
  },
  "/terms-of-service": {
    label: "Terms of Service",
    title: "Terms of Service",
    description:
      "The terms that govern your use of Metis Suite, the suite for mail, calendars, drives and contacts operated by AstraQ Cyber Defence.",
    updated: "2026-11-06",
  },
};

export const PAGES: Record<string, PageInfo> = {
  ...FIXED,
  ...Object.fromEntries(
    COMPETITORS.map((c) => [
      `/compare/${c.slug}`,
      {
        label: c.name,
        title: `Metis Suite vs ${c.name}: Open-Source Alternative`,
        absolute: true,
        og: `Metis Suite vs ${c.name}`,
        description: c.description,
        updated: c.checked,
      },
    ]),
  ),
};

export function pageInfo(path: string): PageInfo {
  const page = PAGES[path];
  if (!page) throw new Error(`[www] no page entry for ${path}`);
  return page;
}

export function fullTitle(page: PageInfo) {
  return page.absolute ? page.title : `${page.title} | ${SITE_NAME}`;
}

export function ogPath(path: string) {
  return path === "/" ? "/og/home" : `/og${path}`;
}
