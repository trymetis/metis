"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  BookUser,
  CalendarDays,
  CalendarPlus,
  EyeOff,
  FolderPlus,
  HardDrive,
  History,
  LayoutDashboard,
  Link2,
  Mail,
  MailPlus,
  Moon,
  PenSquare,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import type { Route } from "next";

import type { ParserAst } from "@/search/ast";
import type { SearchKind } from "@/search/fields";
import { pruneFor } from "@/search/kinds";
import { matcherFor } from "@/search/match";
import {
  assistantPath,
  calendarRootPath,
  contactsRootPath,
  driveRootPath,
  mailRootPath,
  workflowPath,
  workspaceSettingsPath,
} from "@/workspace/path";

export type ClientKind = "command" | "setting" | "workspace";

export type ClientRun =
  | { type: "href"; href: Route }
  | { type: "compose" }
  | { type: "new-event" }
  | { type: "upload" }
  | { type: "new-folder" }
  | { type: "theme" }
  | { type: "query"; query: string }
  | { type: "switch"; href: Route };

export interface ClientEntry {
  id: string;
  kind: ClientKind;
  title: string;
  subtitle?: string;
  keywords: string[];
  icon: LucideIcon;
  run: ClientRun;
}

export interface EntryContext {
  workspaceSlug: string;
  ai: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  dark: boolean;
  workspaces: { name: string; slug: string; href: Route; current: boolean }[];
  saved: { id: string; name: string; query: string }[];
}

export function clientEntries(ctx: EntryContext): ClientEntry[] {
  const ws = ctx.workspaceSlug;
  const commands: ClientEntry[] = [
    {
      id: "command:compose",
      kind: "command",
      title: "Compose mail",
      keywords: ["write", "new mail", "email", "send"],
      icon: PenSquare,
      run: { type: "compose" },
    },
    {
      id: "command:new-event",
      kind: "command",
      title: "New event",
      keywords: ["calendar", "meeting", "schedule"],
      icon: CalendarPlus,
      run: { type: "new-event" },
    },
    {
      id: "command:new-folder",
      kind: "command",
      title: "New folder",
      keywords: ["drive", "create folder"],
      icon: FolderPlus,
      run: { type: "new-folder" },
    },
    {
      id: "command:upload",
      kind: "command",
      title: "Upload files",
      keywords: ["drive", "upload"],
      icon: Upload,
      run: { type: "upload" },
    },
    ...(ctx.ai
      ? [
          {
            id: "command:new-chat",
            kind: "command" as const,
            title: "New chat",
            keywords: ["assistant", "ai", "ask"],
            icon: Sparkles,
            run: { type: "href" as const, href: assistantPath(ws) },
          },
        ]
      : []),
    {
      id: "command:new-workflow",
      kind: "command",
      title: "New workflow",
      keywords: ["automation", "rule"],
      icon: Workflow,
      run: { type: "href", href: workflowPath(ws) },
    },
    {
      id: "command:theme",
      kind: "command",
      title: ctx.dark ? "Switch to light mode" : "Switch to dark mode",
      keywords: ["theme", "dark", "light", "appearance"],
      icon: Moon,
      run: { type: "theme" },
    },
    {
      id: "command:inbox",
      kind: "command",
      title: "Go to mail",
      keywords: ["inbox"],
      icon: Mail,
      run: { type: "href", href: mailRootPath(ws) },
    },
    {
      id: "command:calendar",
      kind: "command",
      title: "Go to calendar",
      keywords: ["events"],
      icon: CalendarDays,
      run: { type: "href", href: calendarRootPath(ws) },
    },
    {
      id: "command:drive",
      kind: "command",
      title: "Go to drive",
      keywords: ["files"],
      icon: HardDrive,
      run: { type: "href", href: driveRootPath(ws) },
    },
    {
      id: "command:contacts",
      kind: "command",
      title: "Go to contacts",
      keywords: ["address book", "people"],
      icon: BookUser,
      run: { type: "href", href: contactsRootPath(ws) },
    },
    {
      id: "command:members",
      kind: "command",
      title: "Go to members",
      keywords: ["people", "team"],
      icon: Users,
      run: { type: "href", href: workspaceSettingsPath(ws, "members") },
    },
  ];

  const settings: [string, Route, LucideIcon, string[]][] = [
    ["Account", "/settings/account", UserRound, ["profile", "name"]],
    ["Privacy", "/settings/privacy", EyeOff, ["images", "tracking"]],
    ["Workspaces", "/settings/workspaces", Users, []],
    ["Connections", "/settings/connections", Link2, ["accounts"]],
    ["Mailboxes", "/settings/mailboxes", Mail, ["accounts"]],
    ["Calendars", "/settings/calendars", CalendarDays, ["accounts"]],
    ["Drives", "/settings/drives", HardDrive, ["storage"]],
    ["Address books", "/settings/address-books", BookUser, ["contacts", "accounts"]],
    ...(ctx.ai
      ? ([["MCP clients", "/settings/mcp", Plug, ["mcp", "ai"]]] as [
          string,
          Route,
          LucideIcon,
          string[],
        ][])
      : []),
    ["Invites", "/settings/invites", MailPlus, ["signup"]],
    ["Security", "/settings/security", ShieldCheck, ["2fa", "password"]],
    [
      "Workspace settings: General",
      workspaceSettingsPath(ws, "general"),
      Settings,
      ["appearance", "policy"],
    ],
    [
      "Workspace settings: Members",
      workspaceSettingsPath(ws, "members"),
      Users,
      ["people", "invite"],
    ],
    ["Workspace settings: Mailboxes", workspaceSettingsPath(ws, "mailboxes"), Mail, []],
    ["Workspace settings: Calendars", workspaceSettingsPath(ws, "calendars"), CalendarDays, []],
    ["Workspace settings: Drives", workspaceSettingsPath(ws, "drives"), HardDrive, []],
    [
      "Workspace settings: Contacts",
      workspaceSettingsPath(ws, "contacts"),
      BookUser,
      ["address books"],
    ],
    ...(ctx.isAdmin
      ? ([
          [
            "Workspace settings: Activity",
            workspaceSettingsPath(ws, "activity"),
            History,
            ["audit", "log", "history"],
          ],
        ] as [string, Route, LucideIcon, string[]][])
      : []),
    ...(ctx.isOwner
      ? ([["Dashboard", "/dashboard", LayoutDashboard, ["owner"]]] as [
          string,
          Route,
          LucideIcon,
          string[],
        ][])
      : []),
  ];

  return [
    ...commands,
    ...ctx.saved.map((s): ClientEntry => ({
      id: `command:saved:${s.id}`,
      kind: "command",
      title: `Saved search: ${s.name}`,
      subtitle: s.query,
      keywords: ["saved search", s.query],
      icon: Bookmark,
      run: { type: "query", query: s.query },
    })),
    ...settings.map(([title, href, icon, keywords]): ClientEntry => ({
      id: `setting:${href}`,
      kind: "setting",
      title,
      keywords: ["settings", ...keywords],
      icon,
      run: { type: "href", href },
    })),
    ...ctx.workspaces
      .filter((w) => !w.current)
      .map((w): ClientEntry => ({
        id: `workspace:${w.slug}`,
        kind: "workspace",
        title: `Switch to ${w.name}`,
        keywords: ["workspace", w.slug],
        icon: Users,
        run: { type: "switch", href: w.href },
      })),
  ];
}

export function filterEntries(
  entries: ClientEntry[],
  ast: ParserAst | null,
  kinds: readonly SearchKind[],
  timeZone: string,
): ClientEntry[] {
  if (!ast) return [];
  return entries.filter((entry) => {
    if (!kinds.includes(entry.kind)) return false;
    const pruned = pruneFor(ast, entry.kind);
    if (pruned === false) return false;
    const matcher = matcherFor(pruned === true ? null : pruned, timeZone);
    return matcher.matches({
      type: entry.kind,
      text: [entry.title, entry.subtitle ?? "", ...entry.keywords],
    });
  });
}
