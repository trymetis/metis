import {
  BookUser,
  Bot,
  CalendarDays,
  HardDrive,
  type LucideIcon,
  Mail,
  Plug,
  Workflow,
} from "lucide-react";
import type { Route } from "next";

export type Tool = {
  href: Route;
  label: string;
  text: string;
  icon: LucideIcon;
};

export const TOOLS: Tool[] = [
  {
    href: "/mail",
    label: "Mail",
    text: "Gmail, Outlook, Zoho Mail and IMAP in one list",
    icon: Mail,
  },
  {
    href: "/calendar",
    label: "Calendar",
    text: "Every calendar in one week",
    icon: CalendarDays,
  },
  {
    href: "/drive",
    label: "Drive",
    text: "Cloud drives and file servers in one explorer",
    icon: HardDrive,
  },
  {
    href: "/contacts",
    label: "Contacts",
    text: "Every address book in one list, saved from mail",
    icon: BookUser,
  },
  {
    href: "/agent",
    label: "Agent",
    text: "Works across all of it, asks before it acts",
    icon: Bot,
  },
  {
    href: "/workflows",
    label: "Workflows",
    text: "Rules for your mail that run on their own",
    icon: Workflow,
  },
  {
    href: "/mcp",
    label: "MCP",
    text: "The suite's tools in Claude, Cursor and more",
    icon: Plug,
  },
];

export const NAV_LINKS = [
  { href: "/security", label: "Security" },
  { href: "/self-host", label: "Self-host" },
  { href: "/apps", label: "Apps" },
  { href: "/pricing", label: "Pricing" },
] as const;
