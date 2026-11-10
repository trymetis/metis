import {
  BookUser,
  CalendarDays,
  EyeOff,
  HardDrive,
  History,
  Inbox,
  Link2,
  Mail,
  Plug,
  ShieldCheck,
  Signature,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

import type { WorkspaceSettingsPage } from "@/workspace/settings-pages";

interface SettingsNavEntry {
  label: string;
  icon: LucideIcon;
  keywords: readonly string[];
}

export const WORKSPACE_SETTINGS_NAV = [
  {
    slug: "general",
    label: "General",
    icon: SlidersHorizontal,
    keywords: ["appearance", "policy"],
  },
  { slug: "members", label: "Members", icon: Users, keywords: ["people", "invite"] },
  { slug: "mailboxes", label: "Mailboxes", icon: Inbox, keywords: [] },
  { slug: "signatures", label: "Signatures", icon: Signature, keywords: ["footer"] },
  { slug: "calendars", label: "Calendars", icon: CalendarDays, keywords: [] },
  { slug: "drives", label: "Drives", icon: HardDrive, keywords: [] },
  { slug: "contacts", label: "Contacts", icon: BookUser, keywords: ["address books"] },
  {
    slug: "activity",
    label: "Activity",
    icon: History,
    keywords: ["audit", "log", "history"],
    adminOnly: true,
  },
] as const satisfies readonly (SettingsNavEntry & {
  slug: WorkspaceSettingsPage;
  adminOnly?: true;
})[];

type NavSlug = (typeof WORKSPACE_SETTINGS_NAV)[number]["slug"];
export const NAV_COVERS_EVERY_PAGE: [WorkspaceSettingsPage] extends [NavSlug] ? true : false = true;

export const ACCOUNT_SETTINGS_NAV = [
  { href: "/settings/account", label: "Account", icon: UserRound, keywords: ["profile", "name"] },
  { href: "/settings/privacy", label: "Privacy", icon: EyeOff, keywords: ["images", "tracking"] },
  { href: "/settings/workspaces", label: "Workspaces", icon: Users, keywords: [] },
  { href: "/settings/connections", label: "Connections", icon: Link2, keywords: ["accounts"] },
  { href: "/settings/mailboxes", label: "Mailboxes", icon: Mail, keywords: ["accounts"] },
  {
    href: "/settings/calendars",
    label: "Calendars",
    icon: CalendarDays,
    keywords: ["accounts"],
  },
  { href: "/settings/drives", label: "Drives", icon: HardDrive, keywords: ["storage"] },
  {
    href: "/settings/address-books",
    label: "Address books",
    icon: BookUser,
    keywords: ["contacts", "accounts"],
  },
  { href: "/settings/mcp", label: "MCP clients", icon: Plug, keywords: ["mcp", "ai"], ai: true },
  {
    href: "/settings/security",
    label: "Security",
    icon: ShieldCheck,
    keywords: ["2fa", "password"],
  },
] as const satisfies readonly (SettingsNavEntry & { href: Route; ai?: true })[];

export function workspaceSettingsNav(opts: { isAdmin: boolean }) {
  return WORKSPACE_SETTINGS_NAV.filter((item) => opts.isAdmin || !("adminOnly" in item));
}

export function accountSettingsNav(opts: { ai: boolean }) {
  return ACCOUNT_SETTINGS_NAV.filter((item) => opts.ai || !("ai" in item));
}
